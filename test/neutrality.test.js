'use strict';

// The neutrality guard: this package is project-NEUTRAL, and that is a property of the
// files it ships, not an intention. It is published to npm as `flowpad` and installed by
// repositories that have nothing to do with the product it was extracted from, so a
// product concept that lands in here is noise for every one of them — and it chains this
// package's evolution to that product's decisions.
//
// The failure this exists for: a release added a command that wrote one specific
// product's project id into the consuming repo, plus three `check` rows about that
// product's task surface and its generated task cache. None of it is the protocol's
// subject. It was reverted; this test is what makes the revert stick.
//
// WHY THE FORBIDDEN LIST LIVES IN test/ AND NOT NEXT TO THE CODE IT GUARDS.
// Two separate reasons, and only the second one is the load-bearing one here:
//
//   1. `files` in package.json is `bin`/`protocol`/`principles`/`guides` (+ npm's
//      automatic README/LICENSE/package.json), so nothing under test/ is uploaded to
//      npm. This is the weaker reason: the repo is world-readable on GitHub, so
//      "not packed" is NOT "not public" — that exact confusion is what put a private
//      deny list into the published `scripts/leak-check.js` once (fixed in ffcef52;
//      its lesson is real and this file does not undo it).
//
//   2. The real reason: a list of product terms written into `bin/` or `protocol/`
//      would itself be product vocabulary inside the project-neutral surface — the
//      guard would violate the very rule it enforces. There is no way to state the
//      ban inside the thing being kept clean. So it is stated in the test, which is
//      not part of that surface.
//
// Note what this does NOT claim: these terms are not secrets. Every one of them is
// already documented in a public npm package, so writing them down leaks nothing. The
// secret-shaped problem is `scripts/leak-check.js`'s job and stays structural there.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');

// Concepts that belong to the product this protocol was extracted from, never to the
// protocol. Deliberately concepts and identifiers — not vocabulary a neutral document
// might legitimately reach for. Two omissions are on purpose:
//   - `dev/tasks` — a plain folder convention that many repositories use, and the slot
//     detector is allowed to look for it. What was product-specific was the *relapse
//     alarm* built on top of it, not the path.
//   - the bare product name — the README says which product this was extracted from and
//     the LICENSE carries its copyright. Attribution is not a concept leak.
const FORBIDDEN = [
  'canvas',
  'tasks-cache',
  'sync-cache',
  'project.json',
  'projectId',
  'list_tasks',
  'flowpad-mcp',
];

// The one narrow hole in the wall, and the reason it is narrow.
//
// This package may OFFER a sibling tool — "track this repo's tasks in FlowPad?" during
// install — because an offer is answerable: a repository that has never heard of the
// product says no once and is never asked again. What it may NOT do is COUPLE: a canvas
// project id, an MCP tool name, or a generated cache file is not a question anyone can
// answer, it is this product's implementation reaching into a neutral package, and it
// chains anchor's releases to that product's schema.
//
// So the allowance is per-file and per-term, never global:
//   - `protocol/`, `principles/`, `guides/` — the documents consumers vendor into their
//     own repositories and read as neutral law. NOTHING is allowed here. §5 states the
//     rule ("if the surface is a tool, work through it") without naming any tool, and
//     that is what keeps it true for every consumer.
//   - `bin/`, `README.md` — the install surface and the shop window. Only the two terms
//     the offer itself has to say. Everything else on the list still fails here.
//   - `test/` — a test that the offer prints the right thing has to write down what the
//     right thing is. Same shape as this file's own exemption, and bounded the same way:
//     pitch terms only, so a test can never smuggle in an implementation concept.
const PITCH_FILES = [/^bin\//, /^README\.md$/, /^test\//];
const PITCH_TERMS = new Set(['flowpad-mcp', 'canvas']);
const allowedPitch = (file, term) =>
  PITCH_TERMS.has(term) && PITCH_FILES.some((re) => re.test(file));

// This file has to name what it forbids; nothing else does.
const SELF = path.basename(__filename);

// Everything git tracks — the union of what npm uploads and what a stranger reads on
// GitHub. Scanning the packed set alone would miss the wider of the two surfaces.
function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => path.basename(f) !== SELF);
}

test('no product concept reaches the published, project-neutral surface', () => {
  const findings = [];
  for (const file of trackedFiles()) {
    let lines;
    try {
      lines = fs.readFileSync(path.join(REPO, file), 'utf8').split('\n');
    } catch {
      continue; // binary or unreadable — nothing to match on
    }
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      for (const term of FORBIDDEN)
        if (lower.includes(term.toLowerCase()) && !allowedPitch(file, term))
          findings.push(`${file}:${i + 1}  [${term}]  ${line.trim().slice(0, 90)}`);
    });
  }

  assert.deepStrictEqual(
    findings,
    [],
    'A consuming product\'s concept reached this package. This package provides MECHANISM\n' +
      '(slots, the check skeleton, guide installation); slot VALUES and product-specific\n' +
      'checks belong to the consumer\'s own tooling. Move it there — do NOT answer this\n' +
      'failure by deleting the term from FORBIDDEN.\n\n' +
      findings.join('\n'),
  );
});

test('the pitch allowance stays narrow', () => {
  // The failure this guards: the hole gets widened one term at a time until the wall is
  // gone. Each assertion below is a direction someone will be tempted to widen in.
  assert.ok(!allowedPitch('bin/flowpad.js', 'list_tasks'), 'an implementation term slipped into the pitch allowance');
  assert.ok(!allowedPitch('bin/flowpad.js', 'projectId'), 'an implementation term slipped into the pitch allowance');
  assert.ok(!allowedPitch('protocol/AGENT-INIT.md', 'flowpad-mcp'), 'the protocol must never name a product');
  assert.ok(!allowedPitch('guides/react.md', 'canvas'), 'a guide must never name a product');
  assert.ok(allowedPitch('bin/flowpad.js', 'flowpad-mcp'), 'the offer can no longer say what it offers');
});

test('the forbidden list is actually being applied', () => {
  // Without this, a broken scan (empty file list, a path bug) would report a clean run
  // forever — the failure mode of every guard that only ever passes.
  const files = trackedFiles();
  assert.ok(files.length > 5, `scan found only ${files.length} file(s) — the surface is not being read`);
  assert.ok(files.includes('bin/flowpad.js'), 'the published binary was not in the scanned set');
  assert.ok(!files.includes(`test/${SELF}`), 'the guard is scanning itself');
});
