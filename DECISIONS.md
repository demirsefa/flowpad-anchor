# Decisions

Why this package is shaped the way it is. Each entry is a decision that was argued,
not a preference — several reverse an earlier position, and the reason for the reversal
is the useful part. Newest at the bottom.

The intent is that nobody has to reconstruct these from the commit log, and that a
future proposal to "simplify" something can be checked against why it exists.

---

### The document is the product; the CLI installs it

The valuable artefact is `protocol/AGENT-INIT.md`. The CLI exists because a document
with no check decays — §9's guardians would be prose. Everything in the tool serves
installation integrity; nothing in it reviews the consuming project's own work.

### Scope of `check`: what we installed, not how you work

`check` verifies the protocol is present, anchored, current, unedited outside its
settings table, its settings are filled, the contract index is internally consistent,
a commit gate is registered, and guides are not stale.

It deliberately does **not** inspect whether a contract has a real enforcement section,
what a commit hook actually runs, or whether project paths still exist. Two reasons:
noise (every draft contract would go red on day one, and a gate people learn to ignore
is dead), and collision (the consuming project has its own health tooling; two tools
with overlapping opinions drift apart — the exact disease this package exists to fight).

### Detect facts, ask intentions

Installation fills settings the repository can answer: contract index, task folder,
instruction file, health/test scripts — including scripts in child repositories when
the workspace root carries no manifest.

It does **not** infer intentions. This was learned the hard way: "one git author →
solo single-branch model" looked like solid evidence and was wrong on the first real
repository it met, where a single developer works on a topic branch per task. A wrong
setting looks settled and gets obeyed; an empty one keeps warning. Absence of evidence
(no CI config → "nothing deploys here") is an inference too, and was dropped with it.

### Settings live in the protocol file, not the project's instruction file

Moving them to `CLAUDE.md` would make the protocol 100% read-only and delete the
carry-over logic in `update` — conceptually cleaner. Rejected for robustness: the
instruction file is free-form and user-owned, so parsing a table out of it breaks the
first time someone reformats or writes around it. The settings table lives in a file
whose shape we control; the read-only rule carries one explicit exception instead.

### The protocol file is read-only to agents

Agents edit what they read. Anything written into this file is destroyed by the next
`update`, silently. The file says so in a banner, the digest repeats it, and `check`
warns when lines appear outside the settings table — the rule was violated twice on the
day it was written, once by the author, so prose alone was visibly not enough.

### `update` keeps a pristine copy on disk

A hash in the lock file answers "was this edited"; it cannot answer "edited how". With
`.flowpad-upstream.md` as a baseline, `update` prints the exact lines it is about to
drop — including under `--force`, because the point is to be told, not to be asked.

### Drift is detected by hash, not by the version label

The hand-maintained `version:` field was forgotten across three releases while the body
changed underneath it, so installs were told they were current when they were not. The
recorded upstream hash cannot be forgotten. The label stayed as a human-facing marker.

### `--wire` and `guide add` are opt-in

Editing someone's commit hook or manifest uninvited is precisely the behaviour §4 tells
agents not to have. The tool follows the protocol it ships.

### Stack guides are separate from the protocol

A framework guide ages on the framework's clock, not the protocol's. Each carries a
`last-reviewed` date because a silently stale guide is worse than none — an agent
applies it with full confidence.

### The protocol prescribes no branching or promotion model

It once did ("advance only by fast-forward"), which is one team's preference presented
as a general principle. What remains is what an agent must respect regardless: never
open a branch on its own, never release, and read the project's setting rather than
inferring it from the branch names it happens to see.

### Nothing internal is published, and a gate enforces it

The published package describes a method, never our deployment plumbing, private repo
names, hosts or paths. `scripts/leak-check.js` runs on `prepublishOnly`, asks npm which
files it would upload, and fails the publish on a denied term. Manual vigilance had
held so far; the gate replaces it.

### The body of the protocol names no tool

Tool references were scattered through the document, which made it read as a product
manual and made a hand-copied version half-meaningless. They now live in one section.
The package is one way to install the document, not a requirement of it.

### Publishing is a delivery, not a development loop

Twelve releases went out in a single session because publishing was used to propagate
changes to consumers. Local execution does that during development; publishing happens
once the work has settled. Version numbers are permanent, and rapid releases caused
real confusion through npx caching.
