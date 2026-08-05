#!/usr/bin/env node
'use strict';

// Publish gate: nothing that describes the maintainer's machine or a private
// system may reach npm — or GitHub, which is the wider surface of the two.
//
// WHY THERE IS NO WORD LIST HERE. An earlier version of this file carried the
// literal vocabulary it was defending: internal system names, private repo
// names, and fragments of the maintainer's own name. That list was the leak.
// This file is PUBLISHED — a deny list of private terms, published, hands a
// reader the exact inventory it exists to hide, and no scanner can catch it
// because the scanner is the file. So the rule is now structural: this gate
// matches *shapes* (an absolute home path, a loopback port), never *names*,
// and the one name it does look for is read from the running machine and
// never written down.
//
// The project-specific vocabulary lives in the PRIVATE workspace that vendors
// this package; its scan is the stricter of the two and is the documented step
// before any push or publish. Keeping it there is the point, not an oversight.
//
// Surface: the files npm would upload UNION the files git tracks. The npm set
// alone was the old blind spot — a tracked file outside `files` is invisible to
// npm and fully visible on GitHub, which is exactly where the leak above sat.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// The maintainer's OS username, derived from the home directory rather than
// hard-coded — the same reasoning as the block above: a guard against leaking a
// name must not itself write that name down. Empty on machines whose home has
// no basename (CI); callers treat "" as "no name to look for".
const OWNER = (() => {
  const base = (os.homedir() || '').split('/').filter(Boolean).pop();
  return base && base !== 'root' ? base : '';
})();

// One entry per CLASS of disclosure. Narrow on purpose: a false failure is
// cheap to allow-list, a missed leak is permanent.
const PATTERNS = [
  { re: /\/(?:Users|home)\/[A-Za-z0-9._-]+\//, what: 'absolute local home path' },
  { re: /~\/Projects\b/, what: 'maintainer workspace path' },
  { re: /\blocalhost:\d{4,5}\b/, what: 'local service port' },
  { re: /\b\d{1,3}(?:\.\d{1,3}){3}\b/, what: 'bare IP address' },
];

// Matches that are known-safe and must not fail the build. Keep this list tiny and
// specific — a broad exception here would quietly defeat the whole gate.
const ALLOW = [/github\.com\/demirsefa\/flowpad-anchor/i];

function scannedFiles() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
  const packed = (JSON.parse(out)[0].files || []).map((f) => f.path);
  // Tracked-but-unpacked files are invisible to npm and fully public on GitHub.
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  return [...new Set([...packed, ...tracked])];
}

const findings = [];
const files = scannedFiles();
for (const file of files) {
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    continue; // binary or unreadable — nothing to match on
  }
  lines.forEach((line, i) => {
    if (ALLOW.some((re) => re.test(line))) return;
    for (const { re, what } of PATTERNS)
      if (re.test(line))
        findings.push({ file, line: i + 1, term: what, text: line.trim().slice(0, 100) });
    if (OWNER && line.includes(OWNER))
      findings.push({ file, line: i + 1, term: 'maintainer username', text: '(redacted)' });
  });
}

if (!findings.length) {
  console.log(`leak-check: clean (${files.length} files: packed + tracked)`);
  process.exit(0);
}

console.error('\nleak-check FAILED — internal terms would be published:\n');
for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.term}]  ${f.text}`);
console.error(
  '\nThe published package describes the method, not our setup. Move the detail into a\n' +
    'project slot (§12) or the project instruction file, or add a narrow exception to\n' +
    'ALLOW in scripts/leak-check.js if the match is genuinely harmless. Do NOT answer a\n' +
    'failure by adding the offending word to this file — that is how the leak got here.\n',
);
process.exit(1);
