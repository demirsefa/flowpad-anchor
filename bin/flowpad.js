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
const PRINCIPLES = `${PROTOCOL_DIR}/PRINCIPLES.md`;
const STALE_DAYS = 180; // a guide older than this is suspect, not wrong

// Files this package owns in the consuming repository. Anything listed here is
// installed by `init`, refreshed by `update`, and hashed into the lock so a local
// edit can be told from an upstream change. The list exists because a second
// managed file used to mean a second copy of that logic — and the copy that gets
// forgotten is the one that silently overwrites somebody's work.
const MANAGED = [
  { src: path.join(SRC, 'AGENT-INIT.md'), dest: `${PROTOCOL_DIR}/AGENT-INIT.md`, slots: true },
  { src: path.join(SRC, '..', 'principles', 'CODE-PRINCIPLES.md'), dest: PRINCIPLES },
];
const PROTOCOL_FILE = MANAGED[0].dest;

// How a repository announces which stack it is, read from one package.json. Detection
// only ever *suggests* a guide — installing one is the user's call, like every other
// write here.
const STACK_SIGNS = {
  react: (deps) => deps.react,
  typescript: (deps) => deps.typescript,
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
// The instruction file is the only thing an agent loads without being told to, so the
// anchor names both files rather than relying on the protocol to forward the reader to
// the second one. Principles apply to every session; a hop that can be skipped is a hop
// that will be.
const ANCHOR_LINE = `The working protocol for this repository is in \`${ANCHOR_MARK}\` — read it at the start of a session, together with \`${PRINCIPLES}\` (coding principles that hold in every session).`;

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

// Every package.json worth reading: the root's, plus one level of child directories.
// Both, not either — a workspace root often carries a manifest of its own *and* one
// per sub-repo, and looking at only one of them mis-reads the project. This is the
// single place that rule is written; slot detection and stack detection share it.
function manifests(root) {
  const out = [];
  const load = (dir, rel) => {
    const p = path.join(dir, 'package.json');
    if (!exists(p)) return;
    try {
      out.push({ rel, dir, pkg: JSON.parse(read(p)) });
    } catch {
      // Malformed manifest: skip it rather than guess. Detection is best-effort by
      // design — a wrong answer is worse than an empty one (§12).
    }
  };
  load(root, '.');
  let children = [];
  try {
    children = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
  } catch {
    children = [];
  }
  for (const e of children) load(path.join(root, e.name), e.name);
  return out;
}

const depsOf = (pkg) => ({
  ...(pkg.peerDependencies || {}),
  ...(pkg.devDependencies || {}),
  ...(pkg.dependencies || {}),
});

// { react: [{ where: 'app', range: '^18.2.0' }, …] } — which stacks this repository
// uses, where, and at which version.
function detectStacks(root) {
  const found = {};
  for (const { rel, pkg } of manifests(root)) {
    const deps = depsOf(pkg);
    for (const [stack, sign] of Object.entries(STACK_SIGNS)) {
      const range = sign(deps);
      if (!range) continue;
      (found[stack] = found[stack] || []).push({
        where: rel === '.' ? 'package.json' : rel,
        range,
      });
    }
  }
  return found;
}

const placesOf = (entries) => entries.map((e) => e.where);

// The leading major in a version range: `^18.2.0` → 18, `~5.4` → 5, `>=20 <21` → 20.
// Deliberately crude — this only ever decides whether to print a warning, so a range
// exotic enough to defeat it should produce silence rather than a wrong claim.
function majorOf(range) {
  const m = String(range).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// `verified-against: react@18-19` → { name: 'react', from: 18, to: 19 }
function verifiedAgainst(value) {
  const m = String(value || '').match(/^([@\w./-]+)@(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return null;
  return { name: m[1], from: Number(m[2]), to: m[3] ? Number(m[3]) : Number(m[2]) };
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

// Why a dated advice file should not be trusted, or [] when it is fine. Guides and the
// principles file share this rule: a silently rotting one is worse than none, because
// an agent applies it with full confidence.
function staleReason(file, name) {
  if (!exists(file)) return [];
  const meta = frontMatter(read(file));
  if (!meta['last-reviewed']) return [`${name} (no last-reviewed date)`];
  const age = (Date.now() - Date.parse(meta['last-reviewed'])) / 86400000;
  if (Number.isNaN(age)) return [`${name} (unparsable date)`];
  return age > STALE_DAYS ? [`${name} (${Math.round(age)} days old)`] : [];
}

// Why an installed guide no longer matches the repository, or [] when it does. A guide
// reviewed against React 18 applied to a React 20 codebase is the same danger as a stale
// one — confident, specific, and wrong — but the date cannot see it.
function mismatchReason(file, name, entries) {
  if (!exists(file) || !entries || !entries.length) return [];
  const claim = verifiedAgainst(frontMatter(read(file))['verified-against']);
  if (!claim) return [];
  const out = [];
  for (const { where, range } of entries) {
    const major = majorOf(range);
    // An unparsable range means silence, not a guess: the alternative is crying wolf on
    // every `workspace:*` or git dependency.
    if (major === null || (major >= claim.from && major <= claim.to)) continue;
    const span = claim.from === claim.to ? `${claim.from}` : `${claim.from}-${claim.to}`;
    out.push(`${name} verified against ${span}, ${where} uses ${major}`);
  }
  return out;
}

// The newest published version, or null when we cannot or should not ask.
//
// Why this exists: `check` compares the protocol on disk against the copy inside *this*
// package, so a consumer pinned to an old release compares old-with-old and is told it
// is current. Caret ranges on 0.x are minor-locked, so `^0.9.0` never picks up 0.10.0 —
// the staleness is invisible from inside the repository.
//
// Constraints it has to respect: this runs in a commit hook. So the answer is cached
// machine-wide (the registry's answer is not repository-specific), the call is given a
// short timeout, and every failure path is silent — a missing network must never block
// a commit or print a scary line.
function latestVersion() {
  if (process.env.FLOWPAD_NO_NETWORK || process.env.CI) return null;
  const cacheFile = path.join(require('os').tmpdir(), 'flowpad-latest.json');
  const DAY = 86400000;
  let cache = null;
  try {
    cache = JSON.parse(read(cacheFile));
  } catch {
    cache = null;
  }
  const age = cache && cache.checkedAt ? Date.now() - cache.checkedAt : Infinity;
  if (age < 7 * DAY) return cache.version || null;
  // A failed lookup is cached for a day too, so an offline machine retries occasionally
  // rather than paying the timeout on every single commit.
  if (cache && !cache.version && age < DAY) return null;

  let version = null;
  try {
    version = execFileSync('npm', ['view', PKG.name, 'version'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    version = null;
  }
  try {
    fs.writeFileSync(cacheFile, JSON.stringify({ checkedAt: Date.now(), version }));
  } catch {
    // A read-only temp dir costs us the cache, not the check.
  }
  return version;
}

// Numeric compare of two dotted versions; -1 / 0 / 1. Pre-release tags are ignored,
// which is right here: a pre-release is not something to nag an installed repo about.
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
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

  // Commands: the root's own manifest answers for the whole project when it has one.
  // Otherwise a workspace root carries none while every child repo does, and looking
  // only at the root would report "unknown" for a project that in fact has one command
  // per sub-repo.
  const found = manifests(root);
  const rootScripts = (found.find((m) => m.rel === '.') || {}).pkg;
  if (rootScripts) {
    const scripts = rootScripts.scripts || {};
    const test = ['full-test', 'test'].find((n) => scripts[n]);
    if (test) slots['Test command'] = `\`npm run ${test}\``;
    const health = ['doctor', 'lint', 'validate'].find((n) => scripts[n]);
    if (health) slots['Health check (§9)'] = `\`npm run ${health}\``;
  } else {
    const children = found.filter((m) => m.rel !== '.');
    const shared = (names) =>
      names.find((n) => children.filter((m) => (m.pkg.scripts || {})[n]).length >= 2);
    const health = shared(['validate', 'lint', 'typecheck']);
    const test = shared(['test', 'full-test']);
    if (health) slots['Health check (§9)'] = `per sub-repo: \`npm run ${health}\``;
    if (test) slots['Test command'] = `per sub-repo: \`npm run ${test}\``;
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

// Guides are suggested, never installed uninvited (§4) — but a missing one must not be
// silent either, or it stays missing forever. Interactively this is one keystroke;
// non-interactively (an agent running init from a shell) it prints the command and
// `check` keeps it amber until somebody runs it.
function offerGuides(root, opts = {}) {
  const stacks = detectStacks(root);
  const available = availableGuides();
  const installedDir = path.join(root, GUIDES_DIR);
  const already = exists(installedDir)
    ? new Set(fs.readdirSync(installedDir).map((f) => f.replace(/\.md$/, '')))
    : new Set();
  const missing = Object.keys(stacks).filter((s) => available.includes(s) && !already.has(s));
  if (!missing.length) return;

  const cmd = `npx flowpad guide add ${missing.join(' ')}`;
  if (opts.guides || ask(`\nInstall the ${missing.join(', ')} guide(s) for this repo?`)) {
    guide(root, 'add', missing);
    return;
  }
  console.log(`\n${c.warn('Guides:')} ${missing.join(', ')} detected but not installed — ${c.b(cmd)}`);
}

// §10 step 3: the reflexes that turn "intent only" rows in §9 into something
// mechanical. Nothing checks whether they were wired, so the least this tool can do is
// name them at the moment the agent is looking at its output.
const REFLEXES = {
  claude:
    'a slash command for the commit flow + health check, a Stop hook for §8, and permissions in .claude/settings.json for §4',
  codex: 'a callable command for the commit flow + health check, and whatever end-of-session hook your setup supports',
  cursor: 'a callable command for the commit flow + health check, and whatever end-of-session hook your setup supports',
  gemini: 'a callable command for the commit flow + health check, and whatever end-of-session hook your setup supports',
};

function init(root, force, opts = {}) {
  const results = [];
  const protocolSrc = read(MANAGED[0].src);

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
  writeFile(root, PROTOCOL_FILE, installed, force, results);
  for (const file of MANAGED.slice(1))
    writeFile(root, file.dest, read(file.src), force, results);

  anchorInto(root, results, opts.anchor);
  if (opts.wire) wireInto(root, results);

  // The lock records the *upstream* bytes, not what is on disk. That is what makes
  // "the user edited this" distinguishable from "upstream moved".
  // Record what is actually on disk, not what we would have written — when the file
  // was kept, claiming otherwise would make `update` mis-detect the user's edits.
  fs.writeFileSync(
    path.join(root, PROTOCOL_DIR, LOCK),
    `${JSON.stringify(lockRecord(root), null, 2)}\n`,
  );
  fs.writeFileSync(path.join(root, PROTOCOL_DIR, BASE), protocolSrc);
  results.push([c.ok('wrote'), `${PROTOCOL_DIR}/${LOCK}`]);

  for (const [tag, file] of results) console.log(`  ${tag}  ${file}`);
  offerGuides(root, opts);

  const reflex = REFLEXES[opts.agent];
  if (reflex) console.log(`\n${c.dim(`Reflexes (§10 step 3) — ${opts.agent}: ${reflex}`)}`);

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
    add('FAIL', 'protocol', `${PROTOCOL_FILE} is missing — run \`npx flowpad init\``);
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
    lock.files[PROTOCOL_FILE] &&
    lock.files[PROTOCOL_FILE].upstream &&
    lock.files[PROTOCOL_FILE].upstream !== sha(upstream)
  ) {
    // The declared version is hand-maintained and was, in practice, forgotten while
    // the body changed across several releases. The recorded upstream hash cannot be
    // forgotten, so drift is detected from it and the version is only a label.
    add('WARN', 'version', `v${localV} body has moved on upstream — run \`npx flowpad update\``);
  } else {
    const entry = (lock.files || {})[PROTOCOL_FILE];
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

  // 6. guides — two failure modes, and the first one used to be invisible. A stale
  //    guide is dangerous because an agent applies it with full confidence; a *missing*
  //    one is worse, because nothing in the session ever mentions the stack at all.
  //    This row is emitted unconditionally: an empty guides folder was previously no
  //    row, which read as "nothing to report" when it meant "nothing is installed".
  const gdir = path.join(root, GUIDES_DIR);
  const files = exists(gdir) ? fs.readdirSync(gdir).filter((x) => x.endsWith('.md')) : [];
  const installedGuides = new Set(files.map((f) => f.replace(/\.md$/, '')));
  const available = availableGuides();
  const stacks = detectStacks(root);

  const stale = [];
  for (const f of files) {
    const name = f.replace(/\.md$/, '');
    stale.push(...staleReason(path.join(gdir, f), name));
    stale.push(...mismatchReason(path.join(gdir, f), name, stacks[name]));
  }
  stale.push(...staleReason(path.join(root, PRINCIPLES), 'principles'));
  const missing = Object.entries(stacks)
    .filter(([s]) => available.includes(s) && !installedGuides.has(s))
    .map(([s, entries]) => `${s} (detected in ${placesOf(entries).join(', ')})`);

  if (!exists(path.join(root, PRINCIPLES)))
    add('WARN', 'principles', `${PRINCIPLES} missing — run \`npx flowpad update\``);

  if (missing.length) {
    const names = missing.map((m) => m.split(' ')[0]).join(' ');
    add('WARN', 'guides', `not installed: ${missing.join(', ')} — \`npx flowpad guide add ${names}\``);
  }
  if (stale.length) add('WARN', 'guides', `review needed: ${stale.join(', ')}`);
  if (!missing.length && !stale.length)
    add(
      'PASS',
      'guides',
      files.length ? `${files.length} guide(s), all reviewed recently` : 'no known stack detected',
    );

  // 7. is this package itself stale? Everything above compares the repository against
  //    the copy of the protocol *inside this package*, so a pinned old release reports
  //    "current" forever. Only the registry knows otherwise.
  const latest = latestVersion();
  if (latest && compareVersions(latest, PKG.version) > 0)
    add(
      'WARN',
      'package',
      `${PKG.name} ${PKG.version} installed, ${latest} available — the protocol here cannot be newer than the package; run \`npx ${PKG.name}@latest update\``,
    );

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
  // Green only when there is genuinely nothing left. A summary that reads "all checks
  // passed" while something is missing is the failure this check exists to prevent —
  // the amber rows above it get skimmed past, and the missing thing stays missing.
  if (fails)
    console.log(`\n${c.bad(`${fails} failure(s)`)}${warns ? `, ${warns} warning(s)` : ''}`);
  else if (warns)
    console.log(`\n${c.warn(`${warns} warning(s)`)} ${c.dim('— nothing failed, but the setup is incomplete.')}`);
  else console.log(`\n${c.ok('All checks passed.')}`);
}

// ---- update ----------------------------------------------------------------

// The managed files that carry no §12 slots. They are plain upstream copies, so the
// only question is whether the local one was edited — handled here rather than inside
// `update`'s slot-merge path, which does not apply to them. Runs before that path's
// early returns, so a release that only touches a sidecar still lands.
function syncSidecars(root, force, lock) {
  for (const file of MANAGED.slice(1)) {
    const abs = path.join(root, file.dest);
    const upstream = read(file.src);
    if (!exists(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, upstream);
      console.log(`  ${c.ok('installed')}  ${file.dest}`);
      continue;
    }
    const local = read(abs);
    if (local === upstream) continue;
    const recorded = ((lock && lock.files) || {})[file.dest];
    const edited = recorded ? recorded.installed !== sha(local) : true;
    if (edited && !force) {
      console.log(`  ${c.warn('local edits')}  ${file.dest} — it is upstream's file (§11).`);
      if (!ask('  Overwrite?')) {
        console.log(c.dim('  Kept.'));
        continue;
      }
    }
    fs.writeFileSync(abs, upstream);
    console.log(`  ${c.ok('updated')}  ${file.dest}`);
  }
}

// The lock records both what is on disk and what upstream shipped, per managed file.
// The pair is what makes "the user edited this" distinguishable from "upstream moved".
function lockRecord(root) {
  const files = {};
  for (const file of MANAGED) {
    const abs = path.join(root, file.dest);
    if (exists(abs)) files[file.dest] = { installed: sha(read(abs)), upstream: sha(read(file.src)) };
  }
  const protocol = path.join(root, PROTOCOL_FILE);
  return {
    package: PKG.name,
    packageVersion: PKG.version,
    protocolVersion: exists(protocol) ? protocolVersion(read(protocol)) : null,
    files,
  };
}

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
  const entry = lock && lock.files && lock.files[PROTOCOL_FILE];
  const pristine = entry && (entry.installed || entry);

  syncSidecars(root, force, lock);

  if (local === upstream) {
    fs.writeFileSync(lockPath, `${JSON.stringify(lockRecord(root), null, 2)}\n`);
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
    fs.writeFileSync(lockPath, `${JSON.stringify(lockRecord(root), null, 2)}\n`);
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
      `${c.warn('Local edits detected')} in ${PROTOCOL_FILE} ` +
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
  fs.writeFileSync(lockPath, `${JSON.stringify(lockRecord(root), null, 2)}\n`);
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

  const stacks = detectStacks(root);
  if (!sub || sub === 'list') {
    for (const name of all) {
      const where = stacks[name];
      // Pad before colouring — escape codes have width in a string but not on screen.
      const word = installed.includes(name) ? 'installed' : where ? 'suggested' : 'available';
      const paint = word === 'installed' ? c.ok : word === 'suggested' ? c.warn : c.dim;
      console.log(
        `  ${paint(word.padEnd(10))}  ${name}${where ? c.dim(`  (detected in ${placesOf(where).join(', ')})`) : ''}`,
      );
    }
    const suggest = all.filter((n) => !installed.includes(n) && stacks[n]);
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
  ${c.dim('--guides')}         install the guides for the stacks detected here without asking
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
const guides = process.argv.includes('--guides');
const root = repoRoot();

switch (cmd) {
  case 'init':
    init(root, force, { anchor, agent: agentName, wire, guides });
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
