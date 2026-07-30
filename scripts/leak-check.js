#!/usr/bin/env node
'use strict';

// Publish gate: nothing internal may reach npm.
//
// The protocol is deliberately generic — it describes the *method*, never our
// deployment plumbing, repo names, hosts or paths. That rule held so far because
// someone remembered it. This makes it fail a publish instead: `prepublishOnly`
// runs it, so a leaked term stops the release rather than shipping in it.
//
// It scans exactly the files npm would upload (asked of npm itself, not guessed),
// so adding a file to `files` cannot sneak past the scan.

const { execFileSync } = require('child_process');
const fs = require('fs');

// Internal vocabulary: infrastructure, private repo names, hosts, third parties,
// absolute paths. Kept lowercase; matching is case-insensitive.
const DENY = [
  'nano-ci',
  'nano_ci',
  'env-sync',
  'flowpad-cli',
  'flowpad-be',
  'flowpad-mcp',
  'flowpad-panel',
  'flowpad-landing',
  'flowpad-workspace',
  'conquest-',
  'getflowpad',
  'shutterstock',
  'trufflehog',
  'wait-deploy',
  'projects.json',
  '/users/',
  'localhost:',
  'hasbi',
  'sefa',
];

// Matches that are known-safe and must not fail the build. Keep this list tiny and
// specific — a broad exception here would quietly defeat the whole gate.
const ALLOW = [/github\.com\/demirsefa\/flowpad-anchor/i];

function publishedFiles() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
  const meta = JSON.parse(out);
  return (meta[0].files || []).map((f) => f.path);
}

const findings = [];
for (const file of publishedFiles()) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    continue; // binary or unreadable — nothing to match on
  }
  lines.forEach((line, i) => {
    if (ALLOW.some((re) => re.test(line))) return;
    const hit = DENY.find((term) => line.toLowerCase().includes(term));
    if (hit) findings.push({ file, line: i + 1, term: hit, text: line.trim().slice(0, 100) });
  });
}

if (!findings.length) {
  console.log(`leak-check: clean (${publishedFiles().length} published files)`);
  process.exit(0);
}

console.error('\nleak-check FAILED — internal terms would be published:\n');
for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.term}]  ${f.text}`);
console.error(
  '\nThe published package describes the method, not our setup. Move the detail into a\n' +
    'project slot (§12) or the project instruction file, or add a narrow exception to\n' +
    'ALLOW in scripts/leak-check.js if the match is genuinely harmless.\n',
);
process.exit(1);
