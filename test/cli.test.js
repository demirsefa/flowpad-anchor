'use strict';

// End-to-end tests for the CLI: a real repository in a temp directory, the real binary
// as a child process. No test framework and no mocks on purpose — the failures worth
// catching here were all integration failures (a row that was never printed, a scan that
// only looked at the root, a second managed file that got silently overwritten), and a
// unit test with a stubbed filesystem would have reproduced none of them.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', 'bin', 'flowpad.js');

// The registry probe is the one non-deterministic thing in `check`; every test opts out.
const ENV = { ...process.env, FLOWPAD_NO_NETWORK: '1' };

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

function repo(manifests = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  execFileSync('git', ['init', '-q', dir]);
  for (const [rel, pkg] of Object.entries(manifests)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(pkg));
  }
  return dir;
}

function run(dir, args, opts = {}) {
  try {
    return {
      code: 0,
      out: strip(execFileSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: ENV })),
    };
  } catch (err) {
    // A non-zero exit is a result here, not a crash: `check` exits 1 by design.
    if (opts.mustPass) throw err;
    return { code: err.status, out: strip(`${err.stdout || ''}${err.stderr || ''}`) };
  }
}

const line = (out, name) =>
  out.split('\n').find((l) => new RegExp(`^\\s+(PASS|WARN|FAIL|INFO)\\s+${name}\\b`).test(l)) || '';

test('detects a stack from child repositories when the root has no manifest', () => {
  const dir = repo({
    'app/package.json': { name: 'app', dependencies: { react: '^18.2.0' } },
    'api/package.json': { name: 'api', dependencies: { express: '^4.0.0' } },
  });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'guides'), /WARN/);
  assert.match(line(out, 'guides'), /react \(detected in app\)/);
});

test('a repository with no guides installed reports a guides row at all', () => {
  // The original bug: an absent guides folder emitted no row, so "nothing installed"
  // and "nothing to report" were indistinguishable.
  const dir = repo({ 'package.json': { name: 'plain' } });
  run(dir, ['init', '--agent=claude']);
  assert.notStrictEqual(line(run(dir, ['check']).out, 'guides'), '');
});

test('installing the detected guides clears the warning', () => {
  const dir = repo({ 'package.json': { name: 'app', dependencies: { react: '^19.0.0' } } });
  run(dir, ['init', '--agent=claude']);
  run(dir, ['guide', 'add', 'react']);
  assert.match(line(run(dir, ['check']).out, 'guides'), /PASS/);
});

test('a guide verified against another major is flagged even when freshly reviewed', () => {
  const dir = repo({ 'package.json': { name: 'app', dependencies: { react: '^30.0.0' } } });
  run(dir, ['init', '--agent=claude', '--guides']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'guides'), /WARN/);
  assert.match(line(out, 'guides'), /react verified against 18-19.*uses 30/);
});

test('the summary is not green while anything is still amber', () => {
  const dir = repo({ 'package.json': { name: 'app', dependencies: { react: '^18.0.0' } } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(out, /warning\(s\).*setup is incomplete/);
  assert.doesNotMatch(out, /All checks passed/);
});

test('init installs both managed files and records both in the lock', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude'], { mustPass: true });
  assert.ok(fs.existsSync(path.join(dir, 'dev/flowpad/AGENT-INIT.md')));
  assert.ok(fs.existsSync(path.join(dir, 'dev/flowpad/PRINCIPLES.md')));
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'dev/flowpad/.flowpad-lock.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(lock.files).sort(), [
    'dev/flowpad/AGENT-INIT.md',
    'dev/flowpad/PRINCIPLES.md',
  ]);
});

test('update does not overwrite a locally edited sidecar without consent', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const principles = path.join(dir, 'dev/flowpad/PRINCIPLES.md');
  fs.appendFileSync(principles, '\nLOCAL EDIT\n');
  const { out } = run(dir, ['update']);
  assert.match(out, /local edits/);
  // Non-interactive stdin answers no, which must mean "keep", never "overwrite".
  assert.match(fs.readFileSync(principles, 'utf8'), /LOCAL EDIT/);
});

test('update restores a deleted sidecar and is idempotent afterwards', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fs.rmSync(path.join(dir, 'dev/flowpad/PRINCIPLES.md'));
  assert.match(run(dir, ['update']).out, /installed.*PRINCIPLES\.md/);
  assert.match(run(dir, ['update']).out, /Already current/);
});

test('update carries the project settings across a protocol change', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  const filled = fs
    .readFileSync(file, 'utf8')
    .replace('| Branching model (§6) | `<TODO>`', '| Branching model (§6) | solo')
    // Rewind the version so `update` treats this as an older install with real content.
    .replace(/^version: \d+/m, 'version: 1');
  fs.writeFileSync(file, filled);
  run(dir, ['update', '--force']);
  assert.match(fs.readFileSync(file, 'utf8'), /\| Branching model \(§6\) \| solo/);
});

test('check fails, not warns, when nothing points at the protocol', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fs.rmSync(path.join(dir, 'CLAUDE.md'));
  const { code, out } = run(dir, ['check']);
  assert.strictEqual(code, 1);
  assert.match(line(out, 'anchor'), /FAIL/);
});

test('the registry probe is skipped when the network is opted out', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  assert.strictEqual(line(run(dir, ['check']).out, 'package'), '');
});

test('stray indentation before the frontmatter does not disable a guide check', () => {
  // Found in a real repository: two spaces in front of `---` silently turned off both
  // the staleness and the version-mismatch check, and the row read "no last-reviewed
  // date" — a guard that stopped guarding, reported as a guide nobody had dated.
  const dir = repo({ 'package.json': { name: 'app', dependencies: { react: '^30.0.0' } } });
  run(dir, ['init', '--agent=claude', '--guides']);
  const guide = path.join(dir, 'dev/flowpad/guides/react.md');
  fs.writeFileSync(guide, `  ${fs.readFileSync(guide, 'utf8')}`);
  assert.match(line(run(dir, ['check']).out, 'guides'), /verified against 18-19.*uses 30/);
});

test('the registered session hook actually prints the digest when run', () => {
  // The one test that cannot be replaced by asserting on our own output: the hook is a
  // shell string handed to somebody else's runner. A wrong awk range or a quoting slip
  // fails silently at session start — printing nothing looks exactly like working.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude', '--wire']);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  const [{ command }] = settings.hooks.SessionStart[0].hooks;
  const out = execFileSync('sh', ['-c', command], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /## 0\. Digest/);
  assert.match(out, /A rule is anchored \+ enforced/);
  // The range must stop at §1, or every session pays for the whole document.
  assert.doesNotMatch(out, /## 1\. Why this exists/);
});

test('wiring keeps the settings a repository already had', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude/settings.json'),
    JSON.stringify({ permissions: { deny: ['Bash(git stash:*)'] } }),
  );
  run(dir, ['wire-session', '--agent=claude']);
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.deepStrictEqual(settings.permissions.deny, ['Bash(git stash:*)']);
  assert.strictEqual(settings.hooks.SessionStart.length, 1);
  // Wiring twice must not stack a second copy of the same hook.
  run(dir, ['wire-session', '--agent=claude']);
  const again = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.strictEqual(again.hooks.SessionStart.length, 1);
});

test('an agent with no session channel gets a marked digest block instead', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=cursor', '--wire']);
  const rules = fs.readFileSync(path.join(dir, '.cursorrules'), 'utf8');
  assert.match(rules, /flowpad:digest start/);
  assert.match(rules, /## 0\. Digest/);
  // The digest says "this file is read-only" about the protocol, not about its host.
  assert.match(rules, /"this file" below means that one/);
  assert.match(line(run(dir, ['check']).out, 'session'), /PASS/);
});

test('a digest block that drifts from the protocol goes amber, and update repairs it', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=cursor', '--wire']);
  const rules = path.join(dir, '.cursorrules');
  fs.writeFileSync(rules, fs.readFileSync(rules, 'utf8').replace('## 0. Digest', '## 0. Stale'));
  assert.match(line(run(dir, ['check']).out, 'session'), /WARN/);
  run(dir, ['update']);
  assert.match(line(run(dir, ['check']).out, 'session'), /PASS/);
});

test('update never grows a digest block in a repository that declined one', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  run(dir, ['update']);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /flowpad:digest/);
});

test('update tells the reader to re-read what it just replaced', () => {
  // The session channel fires at session start only. An agent that updates mid-session
  // is holding the version from when the session opened, and nothing else would say so.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fs.rmSync(path.join(dir, 'dev/flowpad/PRINCIPLES.md'));
  assert.match(run(dir, ['update']).out, /Re-read.*PRINCIPLES\.md/);
  // Nothing changed this time, so there is nothing to re-read.
  assert.doesNotMatch(run(dir, ['update']).out, /Re-read/);
});

test('update offers the session channel, and prints the command when it cannot ask', () => {
  // An install made before the channel existed would otherwise stay unwired forever.
  // Non-interactive stdin must mean "offer, do not act" — never a silent config edit.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['update'], { mustPass: true });
  assert.match(out, /wire-session/);
  assert.ok(!fs.existsSync(path.join(dir, '.claude/settings.json')));
});

test('update stops offering once the channel is wired', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude', '--wire']);
  assert.doesNotMatch(run(dir, ['update'], { mustPass: true }).out, /wire-session/);
});

test('an unwired session channel is reported, but is not a warning', () => {
  // Opting out is a complete setup, not an incomplete one — so this row must not colour
  // the summary. It still has to appear: silence is how "not installed" became invisible.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'session'), /INFO/);
  assert.match(out, /wire-session/);
});

const lockOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'dev/flowpad/.flowpad-lock.json'), 'utf8'));
const slotRow = (dir) =>
  fs
    .readFileSync(path.join(dir, 'dev/flowpad/AGENT-INIT.md'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('| Task surface')) || '';

test('the task-surface offer is printed but not spent when nobody is there to answer', () => {
  // Same rule as the session channel: non-interactive means "offer, do not act". The
  // extra stake here is the memory — recording a decline nobody made would burn a
  // one-time question on a scripted install and it would never be asked again.
  const dir = repo({ 'package.json': { name: 'app' } });
  const { out } = run(dir, ['init', '--agent=claude'], { mustPass: true });
  assert.match(out, /flowpad-mcp/);
  assert.strictEqual(lockOf(dir).offers, undefined);
  assert.match(slotRow(dir), /<TODO>/);
});

test('accepting the task-surface offer fills the slot and is never asked again', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude', '--tasks'], { mustPass: true });
  assert.match(slotRow(dir), /FlowPad/);
  assert.strictEqual(lockOf(dir).offers.taskSurface, 'accepted');
  // The lock must still describe the file that is now on disk. Filling a slot rewrites
  // the protocol, and a stale hash would make `update` defend an edit nobody made.
  assert.doesNotMatch(run(dir, ['update'], { mustPass: true }).out, /edited|Overwrite/i);
});

test('a declined task surface closes the question for good', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude'], { mustPass: true });
  const lockPath = path.join(dir, 'dev/flowpad/.flowpad-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify({ ...lockOf(dir), offers: { taskSurface: 'declined' } }));
  const { out } = run(dir, ['update'], { mustPass: true });
  assert.doesNotMatch(out, /flowpad-mcp/);
  // A refusal is not a project setting: it says nothing about where tasks actually live,
  // so the slot stays a question the human answers, and `check` keeps asking it.
  assert.match(slotRow(dir), /<TODO>/);
  assert.strictEqual(lockOf(dir).offers.taskSurface, 'declined');
});

test('a repository that already tracks tasks somewhere is never offered another surface', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  fs.mkdirSync(path.join(dir, 'dev/tasks'), { recursive: true });
  const { out } = run(dir, ['init', '--agent=claude'], { mustPass: true });
  assert.doesNotMatch(out, /flowpad-mcp/);
  assert.match(slotRow(dir), /dev\/tasks/);
});

test('context is silent and succeeds where nothing is installed', () => {
  // It runs at session start; a tool that prints an error there gets removed.
  const dir = repo({ 'package.json': { name: 'app' } });
  const { code, out } = run(dir, ['context'], { mustPass: true });
  assert.strictEqual(code, 0);
  assert.strictEqual(out.trim(), '');
});

test('context names the guides and the contract index it can see', () => {
  const dir = repo({ 'package.json': { name: 'app', dependencies: { react: '^19.0.0' } } });
  run(dir, ['init', '--agent=claude', '--guides']);
  const { out } = run(dir, ['context'], { mustPass: true });
  assert.match(out, /dev\/flowpad\/guides\/react\.md/);
  assert.match(out, /dev\/contracts\/README\.md/);
  assert.match(out, /## 0\. Digest/);
});

// --- §12 declares, `check` verifies -----------------------------------------
// The line these three defend: an EMPTY slot is only a question for the human, but a
// FILLED one is a promise, and a promise with nothing behind it is a dead pointer. That
// is why this is not the agent-configuration audit DECISIONS.md rules out.

const fillSlot = (dir, label, value) => {
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  const body = fs.readFileSync(file, 'utf8');
  const next = body.replace(new RegExp(`^\\| ${label}[^|]*\\|[^|]*<TODO>[^|]*\\|$`, 'm'), `| ${label} | ${value} |`);
  assert.notStrictEqual(next, body, `slot not found: ${label}`);
  fs.writeFileSync(file, next);
};

test('check prints the question to ask, not the slot label', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'slots'), /WARN/);
  // The human-language wording, quoted and ready to use...
  assert.match(line(out, 'slots'), /"Which branch do you commit to day to day\?"/);
  // ...and not this tool's vocabulary, which is what §12 forbids quoting at a human.
  assert.doesNotMatch(line(out, 'slots'), /Working branch \(§6\)/);
});

test('a declared open-questions ledger is read; unasked lines warn, none passes', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Open questions ledger \\(§4\\)', '`dev/OPEN-QUESTIONS.md`');

  // Declared but absent — a dead pointer, same class as an indexed contract with no file.
  assert.match(line(run(dir, ['check']).out, 'questions'), /FAIL/);

  const ledger = path.join(dir, 'dev/OPEN-QUESTIONS.md');
  fs.writeFileSync(ledger, '- [ ] never asked\n- [~] asked, waiting\n- [x] answered: yes\n');
  const open = line(run(dir, ['check']).out, 'questions');
  assert.match(open, /WARN/);
  assert.match(open, /1 question\(s\) written down but never asked/);
  assert.match(open, /1 awaiting an answer/);

  fs.writeFileSync(ledger, '- [x] answered: yes\n');
  assert.match(line(run(dir, ['check']).out, 'questions'), /PASS/);
});

test('check prints the wording of the open questions, not only how many there are', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Open questions ledger \\(§4\\)', '`dev/OPEN-QUESTIONS.md`');
  fs.writeFileSync(
    path.join(dir, 'dev/OPEN-QUESTIONS.md'),
    '- [ ] should the cache be per user or per workspace?\n- [x] ship on friday? — no\n',
  );
  const { out } = run(dir, ['check']);
  assert.match(out, /Open questions/);
  assert.match(out, /should the cache be per user or per workspace\?/);
  // A closed line is history, not something to put in front of anyone again.
  assert.doesNotMatch(out, /ship on friday/);
});

test('a question wrapped over several lines is one question, and a fenced example is none', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Open questions ledger \\(§4\\)', '`dev/OPEN-QUESTIONS.md`');
  fs.writeFileSync(
    path.join(dir, 'dev/OPEN-QUESTIONS.md'),
    [
      'Line format:',
      '',
      '```',
      '- [ ] <question> — assumption: <what I did without asking>',
      '```',
      '',
      '- [ ] should the retry budget be per request',
      '      or per session? — assumption: per request',
      '',
    ].join('\n'),
  );
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'questions'), /1 question\(s\)/);
  assert.match(out, /should the retry budget be per request or per session\?/);
  assert.doesNotMatch(out, /<question>/);
});

test('`questions` prints what is open and changes nothing when it cannot ask', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Open questions ledger \\(§4\\)', '`dev/OPEN-QUESTIONS.md`');
  const ledger = path.join(dir, 'dev/OPEN-QUESTIONS.md');
  const before = '- [ ] per user or per workspace?\n';
  fs.writeFileSync(ledger, before);

  const { code, out } = run(dir, ['questions']);
  assert.strictEqual(code, 0);
  assert.match(out, /1 open question\(s\)/);
  assert.match(out, /per user or per workspace\?/);
  // Not a TTY here, so it may only report — writing an answer nobody typed is the one
  // thing this command must never do.
  assert.strictEqual(fs.readFileSync(ledger, 'utf8'), before);
});

test('`questions` is quiet where the ledger is empty, absent or undeclared', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  assert.match(run(dir, ['questions']).out, /declares no open-questions ledger/);

  fillSlot(dir, 'Open questions ledger \\(§4\\)', '`dev/OPEN-QUESTIONS.md`');
  assert.strictEqual(run(dir, ['questions']).code, 1); // declared, missing — a dead pointer

  fs.writeFileSync(path.join(dir, 'dev/OPEN-QUESTIONS.md'), '- [x] answered: yes\n');
  const { code, out } = run(dir, ['questions']);
  assert.strictEqual(code, 0);
  assert.match(out, /Nothing open/);
});

test('a command §12 declares must exist; `none` is a real answer', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Agent commands \\(§10\\)', '`/publish` · `/doctor`');

  const missing = line(run(dir, ['check']).out, 'commands');
  assert.match(missing, /FAIL/);
  assert.match(missing, /\/publish/);

  fs.mkdirSync(path.join(dir, '.claude/skills/publish'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude/commands'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/commands/doctor.md'), '# doctor\n');
  assert.match(line(run(dir, ['check']).out, 'commands'), /PASS/);
});

test('an unfilled ledger or command slot is a question, not a failure', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.strictEqual(line(out, 'questions'), '');
  assert.strictEqual(line(out, 'commands'), '');
});

test('a slot with a default or a detectable answer is never a question', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  fs.mkdirSync(path.join(dir, '.claude/skills/publish'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude/commands'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/commands/doctor.md'), '# doctor\n');
  run(dir, ['init', '--agent=claude']);

  const body = fs.readFileSync(path.join(dir, 'dev/flowpad/AGENT-INIT.md'), 'utf8');
  assert.match(body, /\| Session summary format \(§7\) \| `default`/);
  assert.match(body, /\| Agent commands \(§10\) \| `\/doctor` · `\/publish` \|/);

  // ...and neither shows up in the questions the check tells the agent to ask.
  const slots = line(run(dir, ['check']).out, 'slots');
  assert.doesNotMatch(slots, /what did we do/i);
  assert.doesNotMatch(slots, /commands do you type/i);
});

test('every unanswered slot yields a question, even one that is normally detected', () => {
  // A detected slot still falls back to being a question when detection finds nothing,
  // and that fallback is where the tool's own vocabulary leaked into what an agent was
  // told to ask — the exact defect this wording exists to prevent.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  // Only the message, not the row's own name — "slots" is the check's label for it.
  const asked = line(run(dir, ['check']).out, 'slots').replace(/^\s*WARN\s+slots\s+/, '');
  assert.doesNotMatch(asked, /§\d/, `a section reference leaked into: ${asked}`);
  assert.doesNotMatch(asked, /\bslot\b/i, `this tool's vocabulary leaked into: ${asked}`);
});
