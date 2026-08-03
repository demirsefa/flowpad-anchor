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

### A rule an agent skips is a placement bug, not a prose bug

An agent read the whole protocol and still never installed a stack guide, never
suggested one, and never mentioned §10's reflexes. The reason was placement: §2 is a
numbered list of actions and is the only section an agent converts into work. Guides
appeared only under "Installing" (read as the installer's job, not the reader's) and
"Deliberately not here" (read as "not your problem"). The fix was a numbered step in
§2, a clause in the digest, and a heading that no longer contradicts its contents —
not more prose.

### Missing is a worse failure than stale, and it was the invisible one

`check` reported green in a repository with zero guides. It only aged the guides that
were installed, and when the folder did not exist it emitted no row at all — so
"nothing is installed" and "nothing to report" looked identical. Guides were anchored
but not enforced, in a document whose central claim is that the pair is what binds.
`check` now detects the stack from every `package.json` in the tree and goes amber for
a guide that is missing, not merely old.

Related: a summary line reading "All checks passed" above amber rows was doing the same
damage in miniature. Green now means nothing is outstanding.

### Universal principles ship with the package

They used to be delegated to the agent's global instructions — correct for avoiding a
second copy, wrong for portability: global instructions do not travel with an npm
package, so handing someone the package delivered half the standard. They now install
as `PRINCIPLES.md` next to the protocol: same treatment as a stack guide (versioned,
dated, warned about when stale), and still not embedded in the protocol body.

The condition attached to this: the principles must be *deleted* from the global
instructions rather than mirrored there. A copy in both places is Failure 1's disease
with no guardian, which is why the tempting middle option — ship a minimal core, keep
the long form global — was rejected outright.

### `check` asks the registry, because a pinned consumer cannot see past itself

Everything `check` knows about the current protocol comes from the copy inside the
installed package. A repository pinned to an old release therefore compares old with old
and is told it is current — and caret ranges are minor-locked below 1.0, so `^0.9.0`
never picks up `0.10.0` on its own. The failure is silent and self-reinforcing: the more
faithfully a repository pinned the tool, the longer it stays behind.

The alternatives were worse. Loosening the published range abuses semver to paper over a
detection gap. Dropping the pin so the hook always fetches `@latest` trades a permanent
network dependency at every commit for a problem that appears a few times a year.

So the probe asks `npm view`, and every constraint of a commit hook is respected instead
of ignored: the answer is cached machine-wide for a week (it is not repository-specific),
the call is capped at two seconds, failures are cached for a day so an offline laptop
does not pay the timeout on every commit, and every error path is silent. `CI` and
`FLOWPAD_NO_NETWORK` skip it outright. A missing network must never block a commit.

### `check` will not inspect the agent's own configuration

§9 gained a row for whether the §10 step 4 reflexes were ever wired, marked `⚠️ none`.
Making it mechanical would mean reading `.claude/settings.json`, a hook registry, or
whatever the equivalent is per agent — and that was rejected, deliberately, so the row
stays amber rather than quietly disappearing.

Two reasons. It is outside this tool's scope, which is what we installed and not how you
work. And absence is not evidence here: someone can satisfy §8 with a wrapper script, a
shell alias, or their own memory, so a missing settings file would produce a warning that
is simply wrong — the fastest way to teach people to ignore the check.

The honest position is a debt row that stays visible. §9 is a list that should get
shorter, not a scoreboard that must read clean.

### Publishing is a delivery, not a development loop

Twelve releases went out in a single session because publishing was used to propagate
changes to consumers. Local execution does that during development; publishing happens
once the work has settled. Version numbers are permanent, and rapid releases caused
real confusion through npx caching.

### A guide's `verified-against` range is compared with the version in use

*Recorded late: this shipped alongside the registry probe and was the one decision of
that release nobody wrote down, which is how it came back as "did we decide this?" a
day later.*

A guide carries `last-reviewed`, but a date cannot see a major-version jump. A guide
reviewed against React 18, applied to a React 30 codebase, is as confidently wrong as a
stale one and looks perfectly fresh. So each guide declares what it was verified against
and the check compares that with the major actually in `package.json`.

Deliberately crude, because the alternative is crying wolf: an unparsable range produces
silence rather than a guess, only installed guides are compared, and the result is amber,
never red. It reads the *guide's own claim*, not the stack — this is not a version
policy, and the tool has no opinion on which TypeScript you should be running.

### Guides carry judgement; enforcement belongs to the repository being built

The recurring temptation is to let the CLI grade practice — "you are not using this
pattern", "that rule is violated here". Rejected, because it collapses two boundaries
this package depends on.

Scope: `check` verifies **integrity** — is the protocol installed, current, anchored,
indexed, and does each document's own claim still match the repository. It does not
verify **practice**. Practice is what lint, types, and tests already do, and a second
opinionated tool drifts from the first — Failure 2 with extra steps.

Portability: the moment the CLI knows what good React looks like, it needs to know what
good C++, Elixir, and whatever-comes-next look like, and it becomes a bad lint engine
instead of a protocol installer. Someone arriving with an unknown stack gets the whole
core today — the check simply reports no known stack and says nothing further. That
silence is the feature.

So a mechanisable rule graduates *out* of the guide and into the repository's own
tooling, where it is versioned with the code it governs. What stays in the guide is what
cannot be mechanised: the judgement, the trap, the reason.

### Pointing at the protocol is not loading it

The anchor line is a hop, and a hop that can be skipped is a hop that will be. Worse, it
is skippable *again every session*, because no session inherits the last one's reading.

The obvious fix — paste the protocol into `CLAUDE.md`, which loads automatically — was
rejected: it is one copy per agent file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
`GEMINI.md`) times one per repository, hand-maintained, with nothing comparing them.
That is Failure 2 exactly.

What ships instead is a channel per agent. Claude Code gets a `SessionStart` hook, which
is not a copy at all: it prints §0 from the installed file at session start, and because
it lives in the repository's `.claude/settings.json` it travels to everyone who clones.
The hook reads the file rather than calling this package back — no network on a path
that runs at every session start, it works where the package was never installed, and it
prints the digest of the protocol *actually on disk* rather than one from whatever
version of the tool is resolved. Agents with no such channel get §0 copied between
markers, which `update` re-stamps and `check` ages against its source: a copy with a
guardian is a cache, without one it is drift.

`update` offers the channel rather than only `init`, because `update` is the command
people actually run: bringing an install current has to mean the whole install, not just
its bytes. It asks; it never wires on its own, and with no terminal to ask in it prints
the command and changes nothing.

Absence is reported at `INFO`, not amber. Declining the channel is a complete setup, and
a level that colours the summary has to mean *act on this* or the amber rows that do get
skimmed past.

### An agent's memory gets a pointer, never the rules

Agents with persistent memory invite writing the protocol into it. Rejected for the same
reason as everything above, with one aggravating factor: memory is per-agent,
per-machine, unversioned, and invisible to `check`, so a rule that lands there cannot be
updated, compared, or found. It is the one copy that can never go red.

What belongs in memory is a pointer — the rules live in the repository, read them, do
not re-derive them — plus the standing instruction that on any disagreement the file in
the repository wins.

### A question is written down before it is asked, not after

Batching questions to the end of a session (§4) assumed the agent still remembered them
at the end. It did not. The rule was in the protocol, an end-of-session hook repeated it,
and questions were still quietly answered by assumption.

What was missing was not sterner prose but a second moment. The ledger splits *noticing*
from *asking*: the line is written when the uncertainty appears, and asking is a separate
act on a written list. An agent that forgets to ask has already left an unchecked box, so
the omission is visible to both sides — and `check` can count it.

Two details are load-bearing. The line records **the answer itself, not a tick**: a tick
is free to fabricate and tells the next session nothing, while an answer is evidence and
is what gets read later. And an answer of *"no"* or *"not needed"* **closes** the line
rather than deleting it, which is what stops the same question returning next week.

The honest limit, stated in the protocol rather than glossed: this cannot detect a
question that was never noticed. Nothing can. It detects the noticed-but-unraised one,
which is the failure that actually recurs.

### `check` verifies what §12 declares, never what a project ought to have

Two slots now name things on disk — the ledger file and the project's agent commands —
and `check` follows both. That looks like the agent-configuration audit rejected above,
and the line between them is worth stating because it will be tested again.

Reading `.claude/` to ask *"were the §10 reflexes ever wired?"* stays rejected: absence
is not evidence, since the same job can be done by an alias, a wrapper, or a human's
memory, so a missing file would produce a warning that is simply wrong.

A **filled** slot is the opposite case. The project has claimed `/publish` exists; if
nothing is behind it, that is a dead pointer — the same defect as a contract the index
lists but no file backs, which has always been a failure. An **empty** slot stays a
question and produces no row at all.

So: empty asks, filled verifies. The check never invents an expectation the project did
not state.

### The session summary has a shape, and a project may replace it

§7 prescribed the task and bug reports but left "what did we do?" to improvisation, and
the two blocks that went missing were always the same: *why we got here* — unrecoverable
from a diff, so the next session undoes the change — and *what the user will see*, whose
honest answer for most infrastructure work is "nothing", which is better said than
implied otherwise.

The default shape lives in the protocol and the deviation lives in §12, not the reverse.
Putting the whole format in the settings table would let every repository invent its own
and dissolve the single source this package exists to hold.

### Asking badly is not asking, so the wording ships with the slot

A session ran `update`, saw three fresh `<TODO>` rows, and produced a report: section
numbers, the word "slot" six times, a three-column table of recommendations, and three
questions at the bottom. The human answered *"ee??"* — and the agent then filled the
slots in by guessing, which §12 forbids in its first paragraph.

Every rule needed to prevent that was already written, and two of them were in the
digest. What was missing was not a rule but the wording: an agent holding a slot *label*
composes a question out of the label, and the label is this tool's vocabulary. So each
row now carries the question in the human's words, `check` prints the question rather
than the label, and the protocol says to ask it as written.

§4 gained the shape of a question, too, because the failure was as much delivery as
wording. A question at the bottom of a summary is not a question — the reader is in
reading mode and answers nothing. It goes first, alone, one at a time, marked so the eye
catches it, and written for someone who has read none of this. An unanswered question and
an unasked one cost the same.

### A slot with a default, or an answer on disk, is not a question

Three slots shipped as questions; two of them should never have been asked. The session
summary has a working default, so the only thing an agent gains by asking is the human's
time. And the commands an agent can be told to run are sitting in the agent's own command
folder — asking a human to list them from memory produces a shorter, staler list than
reading the directory would.

That leaves the ledger, whose question was also wrong: *"shall I write things down, or
just ask you?"* offered a choice the mechanism does not have. The point of the ledger is
that both happen — write when you notice, ask afterwards — so a question shaped as
either/or taught the reader the opposite of the rule.

The general form: before a slot becomes a question, it has to fail two tests — is there
a sane default, and can the repository answer it? Only what survives both is worth
interrupting someone for. §12 already said "often nothing is left to ask"; these three
were a reminder that the tool has to keep earning that sentence, not just print it.
