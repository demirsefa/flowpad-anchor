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
// NO_COLOR keeps the output plain so assertions can match text, not escape codes.
// Every GIT_* variable is dropped: when the suite runs inside a commit hook, git has
// exported the hooked repository's location, and a test's `git -C <tmp>` would act on it.
const ENV = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')),
  ),
  FLOWPAD_NO_NETWORK: '1',
  NO_COLOR: '1',
};

function repo(manifests = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  execFileSync('git', ['init', '-q', dir], { env: ENV });
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
      out: execFileSync(process.execPath, [CLI, ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...ENV, ...(opts['env'] || {}) },
      }),
    };
  } catch (err) {
    // A non-zero exit is a result here, not a crash: `check` exits 1 by design.
    if (opts.mustPass) throw err;
    return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
  }
}

const line = (out, name) =>
  out
    .split('\n')
    .find((l) =>
      new RegExp(`^\\s+(PASS|WARN|FAIL|INFO)\\s+${name}\\b`).test(l),
    ) || '';

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
  const dir = repo({
    'package.json': { name: 'app', dependencies: { react: '^19.0.0' } },
  });
  run(dir, ['init', '--agent=claude']);
  run(dir, ['guide', 'add', 'react']);
  assert.match(line(run(dir, ['check']).out, 'guides'), /PASS/);
});

test('a guide verified against another major is flagged even when freshly reviewed', () => {
  const dir = repo({
    'package.json': { name: 'app', dependencies: { react: '^30.0.0' } },
  });
  run(dir, ['init', '--agent=claude', '--guides']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'guides'), /WARN/);
  assert.match(line(out, 'guides'), /react verified against 18-19.*uses 30/);
});

test('the summary is not green while anything is still amber', () => {
  const dir = repo({
    'package.json': { name: 'app', dependencies: { react: '^18.0.0' } },
  });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(out, /warning\(s\).*setup is incomplete/);
  assert.doesNotMatch(out, /All checks passed/);
});

test('init installs every managed file and records each in the lock', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude'], { mustPass: true });
  assert.ok(fs.existsSync(path.join(dir, 'dev/flowpad/AGENT-INIT.md')));
  assert.ok(fs.existsSync(path.join(dir, 'dev/flowpad/PRINCIPLES.md')));
  const lock = JSON.parse(
    fs.readFileSync(path.join(dir, 'dev/flowpad/.flowpad-lock.json'), 'utf8'),
  );
  assert.deepStrictEqual(Object.keys(lock.files).sort(), [
    'dev/flowpad/AGENT-INIT.md',
    'dev/flowpad/PRINCIPLES.md',
    'dev/flowpad/TASK-DOC.md',
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
    .replace(
      '| Branching model (§6) | `<TODO>`',
      '| Branching model (§6) | solo',
    )
    // Rewind the version so `update` treats this as an older install with real content.
    .replace(/^version: \d+/m, 'version: 1');
  fs.writeFileSync(file, filled);
  run(dir, ['update', '--force']);
  assert.match(
    fs.readFileSync(file, 'utf8'),
    /\| Branching model \(§6\) \| solo/,
  );
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
  const dir = repo({
    'package.json': { name: 'app', dependencies: { react: '^30.0.0' } },
  });
  run(dir, ['init', '--agent=claude', '--guides']);
  const guide = path.join(dir, 'dev/flowpad/guides/react.md');
  fs.writeFileSync(guide, `  ${fs.readFileSync(guide, 'utf8')}`);
  assert.match(
    line(run(dir, ['check']).out, 'guides'),
    /verified against 18-19.*uses 30/,
  );
});

test('the registered session hook actually prints the digest when run', () => {
  // The one test that cannot be replaced by asserting on our own output: the hook is a
  // shell string handed to somebody else's runner. A wrong awk range or a quoting slip
  // fails silently at session start — printing nothing looks exactly like working.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude', '--wire']);
  const settings = JSON.parse(
    fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'),
  );
  const [{ command }] = settings.hooks.SessionStart[0].hooks;
  const out = execFileSync('sh', ['-c', command], {
    cwd: dir,
    env: ENV,
    encoding: 'utf8',
  });
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
  const settings = JSON.parse(
    fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'),
  );
  assert.deepStrictEqual(settings.permissions.deny, ['Bash(git stash:*)']);
  assert.strictEqual(settings.hooks.SessionStart.length, 1);
  // Wiring twice must not stack a second copy of the same hook.
  run(dir, ['wire-session', '--agent=claude']);
  const again = JSON.parse(
    fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'),
  );
  assert.strictEqual(again.hooks.SessionStart.length, 1);
});

test('bare init offers the commit gate; `wire-gate` installs it where nothing asked', () => {
  // Until the offer existed, the gate was reachable only through `--wire`: a bare init
  // answered three offers and never mentioned the fourth, then `check` warned about it
  // with no route to fix it.
  const dir = repo({ 'package.json': { name: 'app' } });
  const { out } = run(dir, ['init', '--agent=claude']);
  // Not a TTY here, so the offer falls through to the hint — and must not touch hooks.
  assert.match(out, /Commit gate:.*wire-gate/);
  assert.ok(!fs.existsSync(path.join(dir, '.git/hooks/pre-commit')));
  assert.match(line(run(dir, ['check']).out, 'commit-gate'), /WARN.*wire-gate/);

  run(dir, ['wire-gate']);
  assert.match(
    fs.readFileSync(path.join(dir, '.git/hooks/pre-commit'), 'utf8'),
    /flowpad check/,
  );
  assert.match(line(run(dir, ['check']).out, 'commit-gate'), /PASS/);
  // A repository that already guards its commits is not asked again.
  assert.doesNotMatch(run(dir, ['update', '--force']).out, /Commit gate:/);
});

test('the closing questions say which file the answers go into', () => {
  // "write the answers into §12" told a human at a terminal nothing: which file? The
  // agent knows; the person who ran npx does not.
  const dir = repo({ 'package.json': { name: 'app' } });
  const { out } = run(dir, ['init', '--agent=claude']);
  assert.match(
    out,
    /write the answers into the settings table at the end of dev\/flowpad\/AGENT-INIT\.md/,
  );
});

test('the task write-up format ships as a managed document', () => {
  // A format that lived inside one agent's command layer was a second copy of a rule;
  // as a sidecar it is installed, reinstalled when missing, and pointed at — never
  // printed at session start, because it is read only when a task is written up.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const doc = path.join(dir, 'dev/flowpad/TASK-DOC.md');
  assert.ok(fs.existsSync(doc));
  assert.match(fs.readFileSync(doc, 'utf8'), /Verify against the code/);
  assert.match(run(dir, ['context']).out, /TASK-DOC\.md/);
  fs.rmSync(doc);
  assert.match(run(dir, ['update']).out, /installed.*TASK-DOC\.md/);
});

test('a ready-made command is offered, never installed uninvited, and managed once accepted', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  const skill = path.join(dir, '.claude/skills/task-doc/SKILL.md');
  // No terminal: the offer prints a route and touches nothing — and records no answer.
  const { out } = run(dir, ['init', '--agent=claude']);
  assert.match(out, /Skills:.*\/task-doc.*skill add task-doc/);
  assert.ok(!fs.existsSync(skill));
  // update does not sneak an optional file in either.
  run(dir, ['update', '--force']);
  assert.ok(!fs.existsSync(skill));

  // Asked for by name: installed, and from then on a managed file.
  assert.match(
    run(dir, ['skill', 'add', 'task-doc']).out,
    /installed.*task-doc/,
  );
  assert.match(fs.readFileSync(skill, 'utf8'), /TASK-DOC\.md/);
  const lock = JSON.parse(
    fs.readFileSync(path.join(dir, 'dev/flowpad/.flowpad-lock.json'), 'utf8'),
  );
  assert.ok(lock.files['.claude/skills/task-doc/SKILL.md']);
  fs.appendFileSync(skill, '\nLOCAL EDIT\n');
  assert.match(run(dir, ['update']).out, /local edits.*task-doc/);
});

test('every offer can be answered yes at once, for a script', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude'], { env: { FLOWPAD_YES: '1' } });
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/task-doc/SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, '.git/hooks/pre-commit')));
  assert.ok(fs.existsSync(path.join(dir, '.claude/settings.json')));
  // Accepted: nothing left to offer next time.
  assert.doesNotMatch(run(dir, ['update', '--force']).out, /Skills:/);
});

test('check offers the update only to a terminal, and only when behind', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  // Current: nothing to offer, even with every offer answered yes.
  const current = run(dir, ['check'], { env: { FLOWPAD_YES: '1' } });
  assert.doesNotMatch(current.out, /Updated\./);
  // Behind: the version row warns; with no terminal that is all that happens.
  const proto = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  fs.writeFileSync(
    proto,
    fs.readFileSync(proto, 'utf8').replace(/^version: \d+$/m, 'version: 1'),
  );
  const silent = run(dir, ['check']);
  assert.match(line(silent.out, 'version'), /WARN/);
  assert.doesNotMatch(silent.out, /Updated\./);
  // A yes at the terminal runs the update right there.
  const asked = run(dir, ['check'], { env: { FLOWPAD_YES: '1' } });
  assert.match(asked.out, /Updated\./);
  assert.match(line(run(dir, ['check']).out, 'version'), /PASS/);
});

test('the commit gate is judged by what it runs, not by whether a file exists', () => {
  // This row used to pass on any pre-commit at all. A green row on a gate that never
  // runs the check ends the inquiry — the open-questions ledger sat green for a month
  // while dead, and this is the same failure one level down.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const hook = path.join(dir, '.git/hooks/pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nnpm test\n');
  fs.chmodSync(hook, 0o755);
  const row = line(run(dir, ['check']).out, 'commit-gate');
  assert.match(row, /WARN/);
  assert.match(row, /does not run flowpad check/);
  // The offer follows the check: a hook that exists is offered the addition, not skipped.
  assert.match(run(dir, ['update', '--force']).out, /Commit gate:.*wire-gate/);

  run(dir, ['wire-gate']);
  assert.match(fs.readFileSync(hook, 'utf8'), /npm test\nnpx flowpad check/);
  assert.match(line(run(dir, ['check']).out, 'commit-gate'), /PASS/);
});

test('the unpinned hook form the tool writes itself is recognised, and never doubled', () => {
  // With no package.json the gate is written as `npx -y flowpad@latest check`. The
  // effect check first shipped matching only the pinned form and warned on a consumer
  // whose hook this tool had written — and re-wiring would have appended a second line.
  const dir = repo();
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# p\n');
  run(dir, ['init']);
  const hook = path.join(dir, '.git/hooks/pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\nnpx -y flowpad@latest check\n');
  fs.chmodSync(hook, 0o755);
  assert.match(line(run(dir, ['check']).out, 'commit-gate'), /PASS/);
  run(dir, ['wire-gate']);
  const body = fs.readFileSync(hook, 'utf8');
  assert.strictEqual(body.match(/flowpad/g).length, 1);
});

test('a session hook that prints nothing is reported, even though it is registered', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude', '--wire']);
  assert.match(line(run(dir, ['check']).out, 'session'), /PASS/);

  // Still registered, still names the protocol file, prints no digest — the shape of a
  // broken awk range or a moved file, which used to look exactly like working.
  const settingsPath = path.join(dir, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.hooks.SessionStart[0].hooks[0].command = 'echo AGENT-INIT.md';
  fs.writeFileSync(settingsPath, JSON.stringify(settings));
  const row = line(run(dir, ['check']).out, 'session');
  assert.match(row, /WARN/);
  assert.match(row, /prints no digest/);
});

test('nothing a human reads at the terminal quotes a section number', () => {
  // The settings table forbids asking in this document's vocabulary; the tool's own
  // output was doing it anyway ("§6 is unguarded", "§12 slot"). Slot labels are data
  // and keep their numbers; everything printed to a person does not.
  const dir = repo({ 'package.json': { name: 'app' } });
  const outputs = [
    run(dir, ['init', '--agent=claude']).out,
    run(dir, ['check']).out,
    run(dir, ['update', '--force']).out,
    run(dir, ['help']).out,
  ];
  for (const out of outputs) assert.doesNotMatch(out, /§\d/);
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
  fs.writeFileSync(
    rules,
    fs.readFileSync(rules, 'utf8').replace('## 0. Digest', '## 0. Stale'),
  );
  assert.match(line(run(dir, ['check']).out, 'session'), /WARN/);
  run(dir, ['update']);
  assert.match(line(run(dir, ['check']).out, 'session'), /PASS/);
});

test('update never grows a digest block in a repository that declined one', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  run(dir, ['update']);
  assert.doesNotMatch(
    fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'),
    /flowpad:digest/,
  );
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
  assert.doesNotMatch(
    run(dir, ['update'], { mustPass: true }).out,
    /wire-session/,
  );
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

const lockOf = (dir) =>
  JSON.parse(
    fs.readFileSync(path.join(dir, 'dev/flowpad/.flowpad-lock.json'), 'utf8'),
  );
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
  assert.doesNotMatch(
    run(dir, ['update'], { mustPass: true }).out,
    /edited|Overwrite/i,
  );
});

test('a declined task surface closes the question for good', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude'], { mustPass: true });
  const lockPath = path.join(dir, 'dev/flowpad/.flowpad-lock.json');
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ ...lockOf(dir), offers: { taskSurface: 'declined' } }),
  );
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
  const dir = repo({
    'package.json': { name: 'app', dependencies: { react: '^19.0.0' } },
  });
  run(dir, ['init', '--agent=claude', '--guides']);
  const { out } = run(dir, ['context'], { mustPass: true });
  assert.match(out, /dev\/flowpad\/guides\/react\.md/);
  assert.match(out, /dev\/contracts\/README\.md/);
  assert.match(out, /## 0\. Digest/);
});

// --- §12 declares, `check` verifies -----------------------------------------
// The line the tests below defend: an EMPTY slot is only a question for the human, but a
// FILLED one is a promise, and a promise with nothing behind it is a dead pointer. That
// is why this is not the agent-configuration audit DECISIONS.md rules out.

const fillSlot = (dir, label, value) => {
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  const body = fs.readFileSync(file, 'utf8');
  const next = body.replace(
    new RegExp(`^\\| ${label}[^|]*\\|[^|]*<TODO>[^|]*\\|$`, 'm'),
    `| ${label} | ${value} |`,
  );
  assert.notStrictEqual(next, body, `slot not found: ${label}`);
  fs.writeFileSync(file, next);
};

test('check prints the question to ask, not the slot label', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.match(line(out, 'slots'), /WARN/);
  // The human-language wording, quoted and ready to use...
  assert.match(line(out, 'slots'), /"Which branch does finished work land on/);
  // ...and not this tool's vocabulary, which is what §12 forbids quoting at a human.
  assert.doesNotMatch(line(out, 'slots'), /Base branch \(§6\)/);
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

test('an unfilled command slot is a question, not a failure', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const { out } = run(dir, ['check']);
  assert.strictEqual(line(out, 'commands'), '');
});

test("no wins file means the question is asked, never answered on the human's behalf", () => {
  // The regression this locks: install used to write `none yet` here, which is neither a
  // question (nothing asks it again) nor a promise (nothing verifies it) — so §8's third
  // step quietly did nothing in every repository that had not already started a file.
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const settings = fs.readFileSync(
    path.join(dir, 'dev/flowpad/AGENT-INIT.md'),
    'utf8',
  );
  assert.doesNotMatch(settings, /none yet/);
  assert.match(
    line(run(dir, ['check']).out, 'slots'),
    /Do you keep a record of what got shipped\?/,
  );
});

test('a wins folder answers the slot before a lone file does', () => {
  // §8 records one session per file, so the folder is the current shape; a repository
  // carrying both is one that grew out of the single file and kept it as the archive.
  const dir = repo({ 'package.json': { name: 'app' } });
  fs.mkdirSync(path.join(dir, 'dev/brag'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dev/brag/BRAG.md'), '# Wins\n');
  fs.writeFileSync(path.join(dir, 'dev/BRAG.md'), '# Wins\n');
  run(dir, ['init', '--agent=claude']);
  const settings = fs.readFileSync(
    path.join(dir, 'dev/flowpad/AGENT-INIT.md'),
    'utf8',
  );
  assert.match(
    settings,
    /\| Where wins are recorded \(§8\) \| `dev\/brag\/` \|/,
  );
});

test('a wins file §12 names must exist', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  fillSlot(dir, 'Where wins are recorded \\(§8\\)', '`dev/BRAG.md`');

  const missing = line(run(dir, ['check']).out, 'wins');
  assert.match(missing, /FAIL/);
  assert.match(missing, /dev\/BRAG\.md/);

  fs.mkdirSync(path.join(dir, 'dev'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dev/BRAG.md'), '# Wins\n');
  assert.match(line(run(dir, ['check']).out, 'wins'), /PASS/);
});

test('update drops the retired `none yet` placeholder and asks instead', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        /\| Where wins are recorded \(§8\) \|[^|]*\|/,
        '| Where wins are recorded (§8) | none yet |',
      )
      // Rewind the version so `update` treats this as an older install.
      .replace(/^version: \d+/m, 'version: 1'),
  );
  run(dir, ['update', '--force']);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /none yet/);
  assert.match(
    line(run(dir, ['check']).out, 'slots'),
    /Do you keep a record of what got shipped\?/,
  );
});

test('init closes by handing the agent the questions, not an order to fill slots', () => {
  // init is the one moment the protocol's own text has not reached the session: the
  // SessionStart hook it just wired fires next session, so this closing line is the whole
  // instruction. Told to "fill", agents either guessed the answers or handed the human a
  // command to run — both of which §12 exists to prevent.
  const dir = repo({ 'package.json': { name: 'app' } });
  const { out } = run(dir, ['init', '--agent=claude']);
  const tail = out.slice(out.indexOf('Next:'));
  assert.match(tail, /question\(s\) for the human/);
  assert.match(tail, /Which branch does finished work land on/);
  assert.doesNotMatch(
    tail,
    /\bfill\b/i,
    `an order to fill leaked into: ${tail}`,
  );
  assert.doesNotMatch(
    tail,
    /<TODO>|\bslot\(s\)/i,
    `this tool's vocabulary leaked into: ${tail}`,
  );
});

test('a slot with a default or a detectable answer is never a question', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  fs.mkdirSync(path.join(dir, '.claude/skills/publish'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.claude/commands'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude/commands/doctor.md'), '# doctor\n');
  run(dir, ['init', '--agent=claude']);

  const body = fs.readFileSync(
    path.join(dir, 'dev/flowpad/AGENT-INIT.md'),
    'utf8',
  );
  assert.match(body, /\| Session summary format \(§7\) \| `default`/);
  assert.match(
    body,
    /\| Agent commands \(§10\) \| `\/doctor` · `\/publish` \|/,
  );

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
  const asked = line(run(dir, ['check']).out, 'slots').replace(
    /^\s*WARN\s+slots\s+/,
    '',
  );
  assert.doesNotMatch(
    asked,
    /§\d/,
    `a section reference leaked into: ${asked}`,
  );
  assert.doesNotMatch(
    asked,
    /\bslot\b/i,
    `this tool's vocabulary leaked into: ${asked}`,
  );
});

// --- branching models ---------------------------------------------------------
// The `pr` model is only real if a commit on the base branch is refused and a local base
// drifting from its remote is visible — the two models were once mixed in one workspace
// and the local base silently fell dozens of commits behind while gaining its own.

const GIT_ENV = {
  ...ENV,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};
const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { env: GIT_ENV, encoding: 'utf8' });
const commit = (dir, name) => {
  fs.writeFileSync(path.join(dir, name), name);
  git(dir, 'add', name);
  git(dir, 'commit', '-q', '-m', name);
};

const setModel = (dir, model) => {
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        /^\| Branching model.*$/m,
        `| Branching model (§6) | ${model} |`,
      ),
  );
};

// A repository on `dev` with one commit, the protocol installed, and the model set.
function branchRepo(model) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  git(dir, 'init', '-q', '-b', 'dev');
  commit(dir, 'a');
  run(dir, ['init', '--agent=claude']);
  if (model) setModel(dir, model);
  return dir;
}

test('the base branch is detected and the branch name ships with a default', () => {
  const body = fs.readFileSync(
    path.join(branchRepo(), 'dev/flowpad/AGENT-INIT.md'),
    'utf8',
  );
  assert.match(body, /\| Base branch \(§6\) \| `dev` — inferred/);
  assert.match(body, /\| Branch name \(§6\) \| `chat\/YYYY-MM-DD-<slug>`/);
});

test('guard-branch refuses a commit on the base under `pr`, and only there', () => {
  const pr = branchRepo('pr');
  const refused = run(pr, ['guard-branch']);
  assert.strictEqual(refused.code, 1);
  assert.match(refused.out, /no commits on `dev`/);
  git(pr, 'checkout', '-q', '-b', 'main');
  assert.strictEqual(run(pr, ['guard-branch']).code, 1);
  git(pr, 'checkout', '-q', '-b', 'chat/2026-10-11-x');
  assert.strictEqual(run(pr, ['guard-branch']).code, 0);

  assert.strictEqual(run(branchRepo('solo'), ['guard-branch']).code, 0);
});

test('guard-branch in a child repository reads the protocol above it', () => {
  const root = branchRepo('pr');
  const child = path.join(root, 'api');
  fs.mkdirSync(child);
  git(child, 'init', '-q', '-b', 'dev');
  commit(child, 'a');
  assert.strictEqual(run(child, ['guard-branch']).code, 1);
});

test('under `pr`, check names every repository whose hook does not run the guard', () => {
  const root = branchRepo('pr');
  const child = path.join(root, 'api');
  fs.mkdirSync(child);
  git(child, 'init', '-q', '-b', 'dev');
  const hook = (dir) => path.join(dir, '.git/hooks/pre-commit');
  fs.writeFileSync(hook(root), '#!/bin/sh\nnpx flowpad guard-branch\n');

  const warned = line(run(root, ['check']).out, 'branch-guard');
  assert.match(warned, /WARN/);
  assert.match(warned, /\bapi\b/);
  assert.doesNotMatch(warned, new RegExp(path.basename(root)));

  fs.writeFileSync(hook(child), '#!/bin/sh\nnpx flowpad guard-branch\n');
  assert.match(line(run(root, ['check']).out, 'branch-guard'), /PASS/);
  assert.strictEqual(
    line(run(branchRepo('solo'), ['check']).out, 'branch-guard'),
    '',
  );
});

test('check shows a local base that drifted from origin', () => {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-remote-'));
  git(remote, 'init', '-q', '--bare');
  const dir = branchRepo('solo');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', 'dev');
  git(dir, 'fetch', '-q', 'origin');
  assert.match(line(run(dir, ['check']).out, 'base-sync'), /PASS.*level/);

  // Ahead only: under `solo` that is a commit not pushed yet, under `pr` it skipped review.
  commit(dir, 'b');
  assert.match(line(run(dir, ['check']).out, 'base-sync'), /PASS.*1 ahead/);
  setModel(dir, 'pr');
  assert.match(line(run(dir, ['check']).out, 'base-sync'), /WARN.*1 ahead/);

  // Behind: a merged pull request the local base never received.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-clone-'));
  git(other, 'clone', '-q', '-b', 'dev', remote, '.');
  commit(other, 'c');
  git(other, 'push', '-q', 'origin', 'dev');
  git(dir, 'fetch', '-q', 'origin');
  assert.match(
    line(run(dir, ['check']).out, 'base-sync'),
    /WARN.*1 ahead, 1 behind/,
  );
});

test('update carries the old working-branch answer into the base-branch row', () => {
  const dir = repo({ 'package.json': { name: 'app' } });
  run(dir, ['init', '--agent=claude']);
  const file = path.join(dir, 'dev/flowpad/AGENT-INIT.md');
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        /^\| Base branch \(§6\) \|.*$/m,
        '| Working branch (§6) | `trunk` |',
      )
      .replace(/^version: \d+/m, 'version: 1'),
  );
  run(dir, ['update', '--force']);
  const body = fs.readFileSync(file, 'utf8');
  assert.match(body, /\| Base branch \(§6\) \| `trunk` \|/);
  assert.doesNotMatch(body, /Working branch/);
});

// --- base-branch detection ---------------------------------------------------------
// `init` once recorded whatever was checked out as the base, so installing from a chat
// branch made the chat branch the base. The checked-out branch is the last resort now,
// and a branch matching the branch-name pattern is never a base.

const baseRow = (dir) =>
  fs
    .readFileSync(path.join(dir, 'dev/flowpad/AGENT-INIT.md'), 'utf8')
    .match(/^\| Base branch \(§6\) \|(.*)\|$/m)[1];

// A bare origin whose default branch is `trunk` — neither `main` nor what is checked out.
function originRepo() {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-remote-'));
  git(remote, 'init', '-q', '--bare', '-b', 'trunk');
  const seed = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-seed-'));
  git(seed, 'init', '-q', '-b', 'trunk');
  commit(seed, 'a');
  git(seed, 'push', '-q', remote, 'trunk');
  return remote;
}

test("init takes the base from origin's recorded default, not the checked-out chat branch", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  git(dir, 'clone', '-q', originRepo(), '.');
  git(dir, 'checkout', '-q', '-b', 'chat/2026-10-15-iskelet');
  run(dir, ['init', '--agent=claude']);
  assert.match(baseRow(dir), /^ `trunk` — origin's default branch $/);
});

test('init asks origin for its default when the clone never recorded one', () => {
  // `git remote add` + fetch leaves no origin/HEAD — the repository this bug was found in.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  git(dir, 'init', '-q', '-b', 'chat/2026-10-15-iskelet');
  git(dir, 'remote', 'add', 'origin', originRepo());
  git(dir, 'fetch', '-q', 'origin');
  run(dir, ['init', '--agent=claude'], { env: { FLOWPAD_NO_NETWORK: '' } });
  assert.match(baseRow(dir), /`trunk` — origin's default branch/);
});

test('without an origin, a local `main` wins over the checked-out chat branch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  git(dir, 'init', '-q', '-b', 'main');
  commit(dir, 'a');
  git(dir, 'checkout', '-q', '-b', 'chat/2026-10-15-iskelet');
  run(dir, ['init', '--agent=claude']);
  assert.match(baseRow(dir), /`main` — inferred/);
});

test('a chat branch is never recorded as the base, even when it is the only branch', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowpad-test-'));
  git(dir, 'init', '-q', '-b', 'chat/2026-10-15-iskelet');
  commit(dir, 'a');
  run(dir, ['init', '--agent=claude']);
  assert.match(baseRow(dir), /<TODO>/);
  assert.doesNotMatch(baseRow(dir), /chat\//);
});

// --- options -----------------------------------------------------------------------
// `init --help` once ran a full install into the current directory: options were
// filtered out and whatever was not recognised was dropped without a word.

const SUBCOMMANDS = [
  'init',
  'check',
  'update',
  'guide',
  'wire-session',
  'wire-gate',
  'skill',
  'context',
  'guard-branch',
];

test('--help and -h on any command print its usage and write nothing', () => {
  for (const cmd of SUBCOMMANDS) {
    for (const flag of ['--help', '-h']) {
      const dir = repo();
      const { code, out } = run(dir, [cmd, flag]);
      assert.strictEqual(code, 0, `${cmd} ${flag}`);
      assert.match(out, new RegExp(`npx flowpad ${cmd}`), `${cmd} ${flag}`);
      assert.deepStrictEqual(fs.readdirSync(dir), ['.git'], `${cmd} ${flag}`);
    }
  }
});

test('an option a command does not take is an error, and nothing is written', () => {
  const dir = repo();
  const bogus = run(dir, ['init', '--bogus']);
  assert.strictEqual(bogus.code, 1);
  assert.match(bogus.out, /Unknown option for `flowpad init`: --bogus/);
  assert.strictEqual(run(dir, ['wire-gate', '--force']).code, 1);
  assert.strictEqual(run(dir, ['--bogus']).code, 1);
  assert.deepStrictEqual(fs.readdirSync(dir), ['.git']);
});
