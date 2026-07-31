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
  out.split('\n').find((l) => new RegExp(`^\\s+(PASS|WARN|FAIL)\\s+${name}\\b`).test(l)) || '';

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
