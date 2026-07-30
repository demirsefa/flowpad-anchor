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
// The pristine bytes as shipped, kept next to the lock. Without a base copy an
// update can only diff old-vs-new and cannot tell an upstream change from the
// user's own edit — which is the one thing it must never get wrong.
const BASE = '.flowpad-upstream.md';
const GUIDES_DIR = `${PROTOCOL_DIR}/guides`;
const STALE_DAYS = 180; // a stack guide older than this is suspect, not wrong

// How a repository announces which stack it is. Detection only ever *suggests* a
// guide — installing one is the user's call, like every other write here.
const STACK_SIGNS = {
  react: (r) => dep(r, 'react'),
  typescript: (r) => dep(r, 'typescript'),
};

// The instruction files agents load automatically. Order matters only for the
// "nothing exists yet" fallback — the first entry is what gets created.
const ANCHOR_TARGETS = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', 'GEMINI.md'];
// Users know which agent they run, not which file it happens to read.
const AGENT_FILES = {
  claude: 'CLAUDE.md',
  codex: 'AGENTS.md',
  cursor: '.cursorrules',
  gemini: 'GEMINI.md',
};
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

// Reads a dependency version from package.json, in any of the three fields.
function dep(root, name) {
  const p = path.join(root, 'package.json');
  if (!exists(p)) return null;
  try {
    const pkg = JSON.parse(read(p));
    return (
      (pkg.dependencies || {})[name] ||
      (pkg.devDependencies || {})[name] ||
      (pkg.peerDependencies || {})[name] ||
      null
    );
  } catch {
    return null;
  }
}

// Minimal LCS line diff. Zero dependencies is a feature here: this runs inside a
// commit hook on machines we do not control.
function diffLines(a, b) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([' ', a[i]]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(['-', a[i++]]);
    } else {
      out.push(['+', b[j++]]);
    }
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);
  return out;
}

const isSlotRow = (line) => /^\|[^|]+\|[^|]*\|$/.test(line);

function frontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  return Object.fromEntries(
    m[1]
      .split('\n')
      .map((l) => l.split(/:\s*/))
      .filter((kv) => kv.length >= 2)
      .map((kv) => [kv[0].trim(), kv.slice(1).join(': ').trim()]),
  );
}

function availableGuides() {
  const dir = path.join(SRC, '..', 'guides');
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));
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
  const here = (...p) => path.join(root, ...p);
  const branch = gitBranch(root);
  if (branch && branch !== 'HEAD') slots['Working branch (§6)'] = `\`${branch}\``;

  if (exists(here(CONTRACTS_DIR, 'README.md')))
    slots['Contract index'] = `\`${CONTRACTS_DIR}/README.md\``;

  // The instruction file carrying the anchor is, by definition, where project rules
  // belong (§10 step 2) — asking a human where to put them is asking a question the
  // repository already answers.
  const instruction = ANCHOR_TARGETS.filter((f) => exists(here(f)));
  if (instruction.length)
    slots['Additional project rules'] = instruction.map((f) => `\`${f}\``).join(' · ');

  // Task surface: a conventional folder or file, if one is there.
  const taskHome = ['dev/tasks', 'tasks', 'TASKS.md', 'docs/tasks'].find((f) => exists(here(f)));
  if (taskHome) slots['Task surface (§5)'] = `\`${taskHome}\``;

  // Where wins are recorded — a file that exists, or an honest "not yet".
  const wins = ['dev/BRAG.md', 'dev/WINS.md', 'BRAG.md', 'WINS.md', 'dev/HIGHLIGHTS.md'].find(
    (f) => exists(here(f)),
  );
  slots['Where wins are recorded (§8)'] = wins ? `\`${wins}\`` : 'none yet';

  // Deployment: look for the machinery. Absence is a real answer, not a gap — many
  // repositories legitimately deploy nothing.
  const deploySigns = [
    '.github/workflows',
    '.gitlab-ci.yml',
    'Dockerfile',
    'fly.toml',
    'vercel.json',
    'netlify.toml',
    'Procfile',
    'render.yaml',
  ].filter((f) => exists(here(f)));
  if (!deploySigns.length) slots['How a change reaches production (§6)'] = 'none — nothing deploys from this repo';

  // Branching model is deliberately NOT inferred. The obvious signal — a single
  // author — does not indicate the model: a solo developer may still work on topic
  // branches, and this exact guess was wrong on the first real repository it met.
  // Guessing is worse than leaving it empty (§12).

  const scriptsIn = (dir) => {
    try {
      return JSON.parse(read(path.join(dir, 'package.json'))).scripts || {};
    } catch {
      // Missing or malformed manifest: best-effort detection, leave the slot empty.
      return {};
    }
  };

  const rootScripts = exists(here('package.json')) ? scriptsIn(root) : null;
  if (rootScripts) {
    const test = ['full-test', 'test'].find((n) => rootScripts[n]);
    if (test) slots['Test command'] = `\`npm run ${test}\``;
    const health = ['doctor', 'lint', 'validate'].find((n) => rootScripts[n]);
    if (health) slots['Health check (§9)'] = `\`npm run ${health}\``;
  } else {
    // A workspace root often carries no manifest of its own while every child repo
    // does. Looking only at the root would report "unknown" for a project that in
    // fact has one command per sub-repo.
    let children = [];
    try {
      children = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => here(e.name))
        .filter((d) => exists(path.join(d, 'package.json')));
    } catch {
      children = [];
    }
    if (children.length) {
      const shared = (names) =>
        names.find((n) => children.filter((d) => scriptsIn(d)[n]).length >= 2);
      const health = shared(['validate', 'lint', 'typecheck']);
      const test = shared(['test', 'full-test']);
      if (health) slots['Health check (§9)'] = `per sub-repo: \`npm run ${health}\``;
      if (test) slots['Test command'] = `per sub-repo: \`npm run ${test}\``;
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

function anchorInto(root, results, preferred) {
  const present = ANCHOR_TARGETS.filter((f) => exists(path.join(root, f)));
  // When the repo has no instruction file yet, which one to create is the user's
  // call — it depends on the agent they actually run, and we cannot detect that.
  const targets = present.length ? present : [preferred || ANCHOR_TARGETS[0]];
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

// Wiring is opt-in on purpose. Editing somebody's commit hook or manifest without
// being asked is exactly the behaviour this protocol tells agents not to have (§4).
function wireInto(root, results) {
  const HOOK_MARK = 'flowpad check';
  const pkgPath = path.join(root, 'package.json');
  let viaDependency = false;

  if (exists(pkgPath)) {
    try {
      const pkg = JSON.parse(read(pkgPath));
      pkg.devDependencies = pkg.devDependencies || {};
      if (!pkg.devDependencies[PKG.name]) {
        pkg.devDependencies[PKG.name] = `^${PKG.version}`;
        results.push([c.ok('added'), `package.json devDependency ${PKG.name}@^${PKG.version}`]);
      } else {
        results.push([c.dim('same'), `package.json devDependency ${PKG.name}`]);
      }
      pkg.scripts = pkg.scripts || {};
      if (!pkg.scripts.anchor) {
        pkg.scripts.anchor = 'flowpad check';
        results.push([c.ok('added'), 'package.json script "anchor"']);
      }
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
      viaDependency = true;
    } catch (err) {
      // Refuse to guess at a manifest we cannot parse — silently rewriting it would
      // be worse than not wiring at all.
      results.push([c.warn('skipped'), `package.json is not valid JSON (${err.message})`]);
    }
  }

  // A pinned devDependency resolves locally and starts fast; without one the hook has
  // to fetch, so it pins @latest rather than silently running whatever npx cached.
  const cmd = viaDependency ? 'npx flowpad check' : 'npx -y flowpad@latest check';
  let hooksPath = null;
  try {
    hooksPath = execFileSync('git', ['-C', root, 'config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    hooksPath = null;
  }
  // husky v9 keeps its runner in .husky/_ but the hooks themselves one level up.
  const hookDir = hooksPath
    ? path.resolve(root, hooksPath.replace(/\/_$/, ''))
    : path.join(root, '.git', 'hooks');
  if (!exists(hookDir)) {
    results.push([c.warn('skipped'), `no hook directory at ${path.relative(root, hookDir)}`]);
    return;
  }
  const hook = path.join(hookDir, 'pre-commit');
  const body = exists(hook) ? read(hook) : '';
  if (body.includes(HOOK_MARK)) {
    results.push([c.dim('same'), `${path.relative(root, hook)} (already wired)`]);
    return;
  }
  const content = body
    ? `${body}${body.endsWith('\n') ? '' : '\n'}${cmd}\n`
    : `#!/bin/sh\n${cmd}\n`;
  fs.writeFileSync(hook, content);
  fs.chmodSync(hook, 0o755);
  results.push([c.ok(body ? 'wired' : 'created'), `${path.relative(root, hook)} → ${cmd}`]);
}

function init(root, force, opts = {}) {
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

  anchorInto(root, results, opts.anchor);
  if (opts.wire) wireInto(root, results);

  // The lock records the *upstream* bytes, not what is on disk. That is what makes
  // "the user edited this" distinguishable from "upstream moved".
  // Record what is actually on disk, not what we would have written — when the file
  // was kept, claiming otherwise would make `update` mis-detect the user's edits.
  const onDisk = read(path.join(root, `${PROTOCOL_DIR}/AGENT-INIT.md`));
  const lock = {
    package: PKG.name,
    packageVersion: PKG.version,
    protocolVersion: protocolVersion(onDisk),
    files: {
      [`${PROTOCOL_DIR}/AGENT-INIT.md`]: { installed: sha(onDisk), upstream: sha(protocolSrc) },
    },
  };
  fs.writeFileSync(
    path.join(root, PROTOCOL_DIR, LOCK),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, PROTOCOL_DIR, BASE), protocolSrc);
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
  else if (!exists(path.join(root, PROTOCOL_DIR, BASE)))
    add('WARN', 'baseline', `${BASE} missing — \`update\` cannot show what it would drop`);
  else if (localV !== upstreamV)
    add('WARN', 'version', `installed v${localV}, available v${upstreamV} — run \`npx flowpad update\``);
  else if (
    lock.files &&
    lock.files[`${PROTOCOL_DIR}/AGENT-INIT.md`] &&
    lock.files[`${PROTOCOL_DIR}/AGENT-INIT.md`].upstream &&
    lock.files[`${PROTOCOL_DIR}/AGENT-INIT.md`].upstream !== sha(upstream)
  ) {
    // The declared version is hand-maintained and was, in practice, forgotten while
    // the body changed across several releases. The recorded upstream hash cannot be
    // forgotten, so drift is detected from it and the version is only a label.
    add('WARN', 'version', `v${localV} body has moved on upstream — run \`npx flowpad update\``);
  } else {
    const entry = (lock.files || {})[`${PROTOCOL_DIR}/AGENT-INIT.md`];
    const installedSha = entry && (entry.installed || entry);
    if (installedSha === sha(local)) {
      add('PASS', 'version', `v${localV}, as installed`);
    } else {
      // The file is read-only apart from the slot table. Edits outside it are not a
      // style problem: `update` deletes them without asking, so they are told about.
      const basePath = path.join(root, PROTOCOL_DIR, BASE);
      const stray = exists(basePath)
        ? diffLines(read(basePath).split('\n'), local.split('\n')).filter(
            ([t, line]) => t === '+' && !isSlotRow(line) && line.trim(),
          ).length
        : null;
      if (stray) {
        add(
          'WARN',
          'read-only',
          `${stray} line(s) added outside the §12 slot table — \`update\` will drop them; move them to the project instruction file`,
        );
      }
      add('PASS', 'version', `v${localV}, slots filled (expected)`);
    }
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

  // 6. guides — the danger is not a wrong guide, it is a stale one applied confidently
  const gdir = path.join(root, GUIDES_DIR);
  if (exists(gdir)) {
    const stale = [];
    for (const f of fs.readdirSync(gdir).filter((x) => x.endsWith('.md'))) {
      const meta = frontMatter(read(path.join(gdir, f)));
      const name = f.replace(/\.md$/, '');
      if (!meta['last-reviewed']) {
        stale.push(`${name} (no last-reviewed date)`);
        continue;
      }
      const age = (Date.now() - Date.parse(meta['last-reviewed'])) / 86400000;
      if (Number.isNaN(age)) stale.push(`${name} (unparsable date)`);
      else if (age > STALE_DAYS) stale.push(`${name} (${Math.round(age)} days old)`);
    }
    stale.length
      ? add('WARN', 'guides', `review needed: ${stale.join(', ')}`)
      : add('PASS', 'guides', `${fs.readdirSync(gdir).length} guide(s), all reviewed recently`);
  }

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
  // Detection improves between releases; an install made before it did should benefit
  // too. Anything the human already filled wins over what we can infer.
  const merged = applySlots(upstream, { ...detectSlots(root), ...slots });
  // Slots make the installed file differ from upstream by design; "current" means
  // it already equals what this version would write, not that it equals upstream.
  const basePath = path.join(root, PROTOCOL_DIR, BASE);
  if (local === merged) {
    // An install from before baselines existed has nothing to diff against later.
    // Seeding it here is safe precisely because the file is already current.
    if (!exists(basePath)) {
      fs.writeFileSync(basePath, upstream);
      console.log(c.ok('Already current.'), `v${protocolVersion(local)} — baseline copy added.`);
    } else {
      console.log(c.ok('Already current.'), `v${protocolVersion(local)}`);
    }
    return 0;
  }

  const base = exists(basePath) ? read(basePath) : null;
  const edited = pristine ? pristine !== sha(local) : base && base !== local;

  if (edited) {
    // Slot rows are carried over by design, so they are not "losses" — everything
    // else the user wrote is, and it gets printed whether or not --force was passed.
    const lost = base
      ? diffLines(base.split('\n'), local.split('\n'))
          .filter(([t, line]) => t === '+' && !isSlotRow(line) && line.trim())
          .map(([, line]) => line)
      : null;
    console.log(
      `${c.warn('Local edits detected')} in ${PROTOCOL_DIR}/AGENT-INIT.md ` +
        `(v${protocolVersion(local)} → v${protocolVersion(upstream)}).`,
    );
    console.log(`  ${c.ok(`${Object.keys(slots).length} §12 slot(s)`)} will be carried over.`);
    if (lost === null) {
      console.log(
        `  ${c.warn('No baseline copy')} (${BASE} is missing) — cannot show what else changed.`,
      );
    } else if (!lost.length) {
      console.log(`  ${c.dim('Nothing else was changed locally.')}`);
    } else {
      console.log(`  ${c.bad(`${lost.length} line(s) you added will be lost:`)}`);
      for (const line of lost.slice(0, 20)) console.log(c.bad(`    - ${line}`));
      if (lost.length > 20) console.log(c.dim(`    … and ${lost.length - 20} more`));
      console.log(c.dim('    (project-specific text belongs in §12 or your instruction file)'));
    }
    if (!force && !ask('  Overwrite?')) {
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
  fs.writeFileSync(path.join(root, PROTOCOL_DIR, BASE), upstream);
  console.log(c.ok('Updated.'), `v${protocolVersion(upstream)} — ${Object.keys(slots).length} slot(s) preserved.`);
  return 0;
}

// ---- guides ----------------------------------------------------------------

function guide(root, sub, names) {
  const all = availableGuides();
  const installedDir = path.join(root, GUIDES_DIR);
  const installed = exists(installedDir)
    ? fs.readdirSync(installedDir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
    : [];

  if (!sub || sub === 'list') {
    for (const name of all) {
      const sign = STACK_SIGNS[name] && STACK_SIGNS[name](root);
      // Pad before colouring — escape codes have width in a string but not on screen.
      const word = installed.includes(name) ? 'installed' : sign ? 'suggested' : 'available';
      const paint = word === 'installed' ? c.ok : word === 'suggested' ? c.warn : c.dim;
      console.log(
        `  ${paint(word.padEnd(10))}  ${name}${sign ? c.dim(`  (${name} ${sign} in package.json)`) : ''}`,
      );
    }
    const suggest = all.filter((n) => !installed.includes(n) && STACK_SIGNS[n] && STACK_SIGNS[n](root));
    if (suggest.length)
      console.log(`\n  ${c.dim(`npx flowpad guide add ${suggest.join(' ')}`)}`);
    return 0;
  }

  if (sub !== 'add') {
    console.error(`Unknown guide command: ${sub}. Use "list" or "add <name>".`);
    return 1;
  }
  if (!names.length) {
    console.error(`Which guide? Available: ${all.join(', ')}`);
    return 1;
  }
  for (const name of names) {
    if (!all.includes(name)) {
      console.error(`No such guide: ${name}. Available: ${all.join(', ')}`);
      return 1;
    }
    const rel = `${GUIDES_DIR}/${name}.md`;
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, read(path.join(SRC, '..', 'guides', `${name}.md`)));
    console.log(`  ${c.ok('wrote')}  ${rel}`);
  }
  console.log(
    `\n  ${c.dim('Point your instruction file at them, or let §2 find them — they are advice, not law.')}`,
  );
  return 0;
}

// ---- entry -----------------------------------------------------------------

function help() {
  console.log(`
${c.b('flowpad')} — the Anchor working protocol  ${c.dim(`v${PKG.version}`)}

  ${c.b('npx flowpad init')}     install the protocol and scaffolding into this repository
  ${c.b('npx flowpad check')}    verify it is anchored, filled in, and current  ${c.dim('(exit 1 on failure)')}
  ${c.b('npx flowpad update')}   pull a newer protocol, keeping the §12 project slots
  ${c.b('npx flowpad guide')}    ${c.dim('list')} what stack guides exist and which fit this repo,
                       ${c.dim('add <name>')} to install one

  ${c.dim('--agent=<name>')}   which agent to anchor for when the repo has no instruction
                   file yet ${c.dim(`(${Object.keys(AGENT_FILES).join(', ')})`)}
  ${c.dim('--wire')}           also wire \`flowpad check\` into the commit gate, so drift
                   goes red mechanically instead of relying on memory
  ${c.dim('--force')}          skip the overwrite prompt
`);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const [cmd, ...rest] = positional;
const force = process.argv.includes('--force');
const agentArg = process.argv.find((a) => a.startsWith('--agent='));
const agentName = agentArg ? agentArg.slice('--agent='.length).toLowerCase() : undefined;
if (agentName && !AGENT_FILES[agentName]) {
  console.error(`Unknown agent: ${agentName}. Known: ${Object.keys(AGENT_FILES).join(', ')}`);
  process.exit(1);
}
const anchor = agentName ? AGENT_FILES[agentName] : undefined;
const wire = process.argv.includes('--wire');
const root = repoRoot();

switch (cmd) {
  case 'init':
    init(root, force, { anchor, wire });
    break;
  case 'check':
    process.exit(check(root));
    break;
  case 'update':
    process.exit(update(root, force));
    break;
  case 'guide':
    process.exit(guide(root, rest[0], rest.slice(1)));
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
