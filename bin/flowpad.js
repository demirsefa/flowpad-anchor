#!/usr/bin/env node
'use strict';

// flowpad — installs and verifies the Anchor working protocol in a repository.
// Zero dependencies on purpose: `npx flowpad` should start instantly and be
// auditable in one file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PKG = require('../package.json');
const SRC = path.join(__dirname, '..', 'protocol');

const PROTOCOL_DIR = 'dev/flowpad'; // where upstream files are installed
const CONTRACTS_DIR = 'dev/contracts'; // project-owned; only created when missing
const LOCK = '.flowpad-lock.json';

// The instruction files agents load automatically. Order matters only for the
// "nothing exists yet" fallback — the first entry is what gets created.
const ANCHOR_TARGETS = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'GEMINI.md'];
const ANCHOR_MARK = `${PROTOCOL_DIR}/AGENT-INIT.md`;
const ANCHOR_LINE = `The working protocol for this repository is in \`${ANCHOR_MARK}\` — read it at the start of a session.`;

// ---- small helpers ---------------------------------------------------------

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd(); // not a git repo — still usable
  }
}

function gitBranch(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function protocolVersion(text) {
  const m = text.match(/^version:\s*(\d+)/m);
  return m ? Number(m[1]) : null;
}

function ask(question) {
  // Single-key y/N prompt. Returns false on a non-interactive stdin so that
  // automated runs never destroy a file by accident — that is what --force is for.
  if (!process.stdin.isTTY) return false;
  process.stdout.write(`${question} [y/N] `);
  const buf = Buffer.alloc(1);
  try {
    fs.readSync(0, buf, 0, 1, null);
  } catch {
    return false;
  }
  const answer = buf.toString('utf8').toLowerCase();
  process.stdout.write('\n');
  return answer === 'y';
}

// ---- slot detection --------------------------------------------------------

// Fills what the repository can answer for itself; everything else stays <TODO>
// so that `check` keeps complaining until a human decides.
function detectSlots(root) {
  const slots = {};
  const branch = gitBranch(root);
  if (branch && branch !== 'HEAD') slots['Working branch (§6)'] = `\`${branch}\``;

  if (exists(path.join(root, CONTRACTS_DIR, 'README.md')))
    slots['Contract index'] = `\`${CONTRACTS_DIR}/README.md\``;

  const pkgPath = path.join(root, 'package.json');
  if (exists(pkgPath)) {
    try {
      const scripts = JSON.parse(read(pkgPath)).scripts || {};
      const test = ['full-test', 'test'].find((s) => scripts[s]);
      if (test) slots['Test command'] = `\`npm run ${test}\``;
      const health = ['doctor', 'lint', 'validate'].find((s) => scripts[s]);
      if (health) slots['Health check (§9)'] = `\`npm run ${health}\``;
    } catch {
      // A malformed package.json is the project's problem, not ours — detection
      // is best-effort, and leaving the slot as <TODO> is the correct fallback.
    }
  }
  return slots;
}

function applySlots(text, slots) {
  // A slot row may carry a hint after the placeholder — match on "contains <TODO>",
  // not on an exact cell, or a hinted row silently stays unfilled.
  return text.replace(/^\| ([^|]+?) \|([^|]*<TODO>[^|]*)\|$/gm, (line, slot) => {
    const key = slot.trim();
    return slots[key] ? `| ${key} | ${slots[key]} |` : line;
  });
}

// ---- init ------------------------------------------------------------------

function writeFile(root, rel, content, force, results) {
  const abs = path.join(root, rel);
  if (exists(abs) && !force) {
    const current = read(abs);
    if (current === content) {
      results.push([c.dim('same'), rel]);
      return false;
    }
    if (!ask(`${rel} exists and differs. Overwrite?`)) {
      results.push([c.warn('kept'), rel]);
      return false;
    }
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  results.push([c.ok(exists(abs) ? 'wrote' : 'wrote'), rel]);
  return true;
}

function anchorInto(root, results) {
  const present = ANCHOR_TARGETS.filter((f) => exists(path.join(root, f)));
  const targets = present.length ? present : [ANCHOR_TARGETS[0]];
  for (const file of targets) {
    const abs = path.join(root, file);
    const body = exists(abs) ? read(abs) : '';
    if (body.includes(ANCHOR_MARK)) {
      results.push([c.dim('same'), `${file} (anchor)`]);
      continue;
    }
    const prefix = body && !body.endsWith('\n') ? '\n' : '';
    fs.writeFileSync(abs, `${body}${prefix}${body ? '\n' : ''}> ${ANCHOR_LINE}\n`);
    results.push([c.ok('anchored'), file]);
  }
}

function init(root, force) {
  const results = [];
  const protocolSrc = read(path.join(SRC, 'AGENT-INIT.md'));

  // The contracts folder belongs to the project. Seed it only when absent, and
  // never touch it again — an existing index is knowledge we must not clobber.
  // Seeded first, so slot detection can see the index it just created.
  for (const f of ['README.md', '_TEMPLATE.md']) {
    const rel = `${CONTRACTS_DIR}/${f}`;
    if (exists(path.join(root, rel))) {
      results.push([c.dim('kept'), rel]);
      continue;
    }
    writeFile(root, rel, read(path.join(SRC, 'contracts', f)), force, results);
  }

  const slots = detectSlots(root);
  const installed = applySlots(protocolSrc, slots);
  writeFile(root, `${PROTOCOL_DIR}/AGENT-INIT.md`, installed, force, results);

  anchorInto(root, results);

  // The lock records the *upstream* bytes, not what is on disk. That is what makes
  // "the user edited this" distinguishable from "upstream moved".
  const lock = {
    package: PKG.name,
    packageVersion: PKG.version,
    protocolVersion: protocolVersion(protocolSrc),
    files: {
      [`${PROTOCOL_DIR}/AGENT-INIT.md`]: { installed: sha(installed), upstream: sha(protocolSrc) },
    },
  };
  fs.writeFileSync(
    path.join(root, PROTOCOL_DIR, LOCK),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  results.push([c.ok('wrote'), `${PROTOCOL_DIR}/${LOCK}`]);

  for (const [tag, file] of results) console.log(`  ${tag}  ${file}`);
  const todos = (installed.match(/^\|[^|]+\|[^|]*<TODO>[^|]*\|$/gm) || []).length;
  console.log(
    todos
      ? `\n${c.warn('Next:')} fill the remaining ${todos} \`<TODO>\` slot(s) in §12, then run \`npx flowpad check\`.`
      : `\n${c.ok('Done.')} Run \`npx flowpad check\` to verify.`,
  );
}

// ---- check -----------------------------------------------------------------

function check(root) {
  const rows = [];
  let failed = 0;
  const add = (level, name, detail) => {
    rows.push([level, name, detail]);
    if (level === 'FAIL') failed++;
  };

  const installed = path.join(root, PROTOCOL_DIR, 'AGENT-INIT.md');
  const lockPath = path.join(root, PROTOCOL_DIR, LOCK);

  if (!exists(installed)) {
    add('FAIL', 'protocol', `${PROTOCOL_DIR}/AGENT-INIT.md is missing — run \`npx flowpad init\``);
    report(rows);
    return 1;
  }
  const local = read(installed);
  const upstream = read(path.join(SRC, 'AGENT-INIT.md'));

  // 1. anchor — without it no agent ever reads any of this
  const anchored = ANCHOR_TARGETS.filter(
    (f) => exists(path.join(root, f)) && read(path.join(root, f)).includes(ANCHOR_MARK),
  );
  anchored.length
    ? add('PASS', 'anchor', anchored.join(', '))
    : add('FAIL', 'anchor', `no instruction file points at ${ANCHOR_MARK}`);

  // 2. version drift — is the installed protocol still the current one?
  const lock = exists(lockPath) ? JSON.parse(read(lockPath)) : null;
  const localV = protocolVersion(local);
  const upstreamV = protocolVersion(upstream);
  if (!lock) add('WARN', 'lock', `${LOCK} missing — cannot tell edits from upstream changes`);
  else if (localV !== upstreamV)
    add('WARN', 'version', `installed v${localV}, available v${upstreamV} — run \`npx flowpad update\``);
  else {
    const entry = (lock.files || {})[`${PROTOCOL_DIR}/AGENT-INIT.md`];
    const installedSha = entry && (entry.installed || entry);
    add(
      'PASS',
      'version',
      installedSha === sha(local)
        ? `v${localV}, as installed`
        : `v${localV}, locally edited (fine — §12 is yours)`,
    );
  }

  // 3. unfilled slots
  const todos = (local.match(/`<TODO>`/g) || []).length;
  // one <TODO> lives in the explanatory sentence above the table, not in a slot
  const openSlots = (local.match(/^\|[^|]+\|[^|]*<TODO>[^|]*\|$/gm) || []).length;
  openSlots
    ? add('WARN', 'slots', `${openSlots} slot(s) in §12 still say <TODO>`)
    : add('PASS', 'slots', `filled (${todos} mention(s) in prose)`);

  // 4. contract index — the "anchored" half. Both directions matter: a row with no
  //    file is a dead link, a file with no row is a rule nobody will ever find.
  const cdir = path.join(root, CONTRACTS_DIR);
  const index = path.join(cdir, 'README.md');
  if (!exists(index)) {
    add('WARN', 'contracts', `${CONTRACTS_DIR}/README.md missing — no index to scan`);
  } else {
    const body = read(index);
    // Links are resolved relative to the index. An index may legitimately point
    // outside the folder (a contract that was promoted from an older location);
    // those still count as indexed, they just are not local files.
    const linked = [...body.matchAll(/\]\(([^)]+\.md)\)/g)]
      .map((m) => m[1])
      .filter((href) => !href.includes('<') && !/^https?:/.test(href));
    const linkedLocal = new Set(
      linked.filter((h) => !h.includes('/')).map((h) => path.basename(h)),
    );
    const onDisk = fs
      .readdirSync(cdir)
      .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_'));
    const orphans = onDisk.filter((f) => !linkedLocal.has(f));
    const dead = linked.filter((h) => !exists(path.resolve(cdir, h)));
    if (orphans.length) add('FAIL', 'contracts', `not in the index: ${orphans.join(', ')}`);
    if (dead.length) add('FAIL', 'contracts', `indexed but missing: ${dead.join(', ')}`);
    if (!orphans.length && !dead.length)
      add('PASS', 'contracts', `${onDisk.length} contract(s), index consistent`);
  }

  // 5. commit gate — §3's story: the hook files existed, the hook path did not.
  //    Checking that the guard is registered, not that its files are present.
  let hooksPath = null;
  try {
    hooksPath = execFileSync('git', ['-C', root, 'config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    hooksPath = null;
  }
  const defaultHooks = path.join(root, '.git', 'hooks');
  const hasDefaultHook = exists(path.join(defaultHooks, 'pre-commit'));
  if (hooksPath) add('PASS', 'commit-gate', `core.hooksPath = ${hooksPath}`);
  else if (hasDefaultHook) add('PASS', 'commit-gate', '.git/hooks/pre-commit');
  else add('WARN', 'commit-gate', 'no pre-commit hook registered — §6 is unguarded');

  report(rows);
  return failed ? 1 : 0;
}

function report(rows) {
  const width = Math.max(...rows.map(([, name]) => name.length));
  for (const [level, name, detail] of rows) {
    const tag = level === 'PASS' ? c.ok('PASS') : level === 'WARN' ? c.warn('WARN') : c.bad('FAIL');
    console.log(`  ${tag}  ${name.padEnd(width)}  ${c.dim(detail)}`);
  }
  const fails = rows.filter(([l]) => l === 'FAIL').length;
  const warns = rows.filter(([l]) => l === 'WARN').length;
  console.log(
    fails
      ? `\n${c.bad(`${fails} failure(s)`)}${warns ? `, ${warns} warning(s)` : ''}`
      : `\n${c.ok('All checks passed.')}${warns ? c.warn(`  (${warns} warning(s))`) : ''}`,
  );
}

// ---- update ----------------------------------------------------------------

function update(root, force) {
  const installedPath = path.join(root, PROTOCOL_DIR, 'AGENT-INIT.md');
  if (!exists(installedPath)) {
    console.log(c.bad('Not installed here.'), 'Run `npx flowpad init` first.');
    return 1;
  }
  const local = read(installedPath);
  const upstream = read(path.join(SRC, 'AGENT-INIT.md'));
  const lockPath = path.join(root, PROTOCOL_DIR, LOCK);
  const lock = exists(lockPath) ? JSON.parse(read(lockPath)) : null;
  const entry = lock && lock.files && lock.files[`${PROTOCOL_DIR}/AGENT-INIT.md`];
  const pristine = entry && (entry.installed || entry);

  if (local === upstream) {
    console.log(c.ok('Already current.'), `v${protocolVersion(local)}`);
    return 0;
  }

  // Slots are the project's, the rest is upstream's. Carrying them across is the
  // whole reason this command can be safe to run.
  const slots = {};
  for (const m of local.matchAll(/^\| ([^|]+?) \| (?!`<TODO>`)([^|]+) \|$/gm)) {
    const row = new RegExp(`^\\| ${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|[^|]*<TODO>[^|]*\\|$`, 'm');
    if (row.test(upstream)) slots[m[1].trim()] = m[2].trim();
  }
  const merged = applySlots(upstream, slots);

  const edited = pristine && pristine !== sha(local);
  if (edited && !force) {
    const kept = Object.keys(slots).length;
    console.log(
      `${c.warn('Local edits detected')} in ${PROTOCOL_DIR}/AGENT-INIT.md ` +
        `(v${protocolVersion(local)} → v${protocolVersion(upstream)}).`,
    );
    console.log(`  ${kept} filled §12 slot(s) will be carried over; any other edit will be lost.`);
    if (!ask('  Overwrite?')) {
      console.log(c.dim('  Cancelled. Nothing was written.'));
      return 0;
    }
  }

  fs.writeFileSync(installedPath, merged);
  fs.writeFileSync(
    lockPath,
    `${JSON.stringify(
      {
        package: PKG.name,
        packageVersion: PKG.version,
        protocolVersion: protocolVersion(upstream),
        files: {
          [`${PROTOCOL_DIR}/AGENT-INIT.md`]: { installed: sha(merged), upstream: sha(upstream) },
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(c.ok('Updated.'), `v${protocolVersion(upstream)} — ${Object.keys(slots).length} slot(s) preserved.`);
  return 0;
}

// ---- entry -----------------------------------------------------------------

function help() {
  console.log(`
${c.b('flowpad')} — the Anchor working protocol  ${c.dim(`v${PKG.version}`)}

  ${c.b('npx flowpad init')}     install the protocol and scaffolding into this repository
  ${c.b('npx flowpad check')}    verify it is anchored, filled in, and current  ${c.dim('(exit 1 on failure)')}
  ${c.b('npx flowpad update')}   pull a newer protocol, keeping the §12 project slots

  ${c.dim('--force')}   skip the overwrite prompt
`);
}

const [cmd] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const force = process.argv.includes('--force');
const root = repoRoot();

switch (cmd) {
  case 'init':
    init(root, force);
    break;
  case 'check':
    process.exit(check(root));
    break;
  case 'update':
    process.exit(update(root, force));
    break;
  case undefined:
  case 'help':
    help();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    help();
    process.exit(1);
}
