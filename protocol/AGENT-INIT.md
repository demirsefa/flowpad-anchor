# AGENT-INIT — how work is done in this repository

```
version: 12
kind:    working protocol (advice, not law)
scope:   agent-neutral — Claude Code, Codex, Cursor, Gemini, …
install: installed by `npx flowpad init` into dev/flowpad/
```

> ## ⛔ AGENTS: THIS FILE IS READ-ONLY
>
> **Do not edit it.** Not to add a rule, not to fix a typo, not to append a section,
> not to "adapt it to this project". It is installed from a package and updating that
> package overwrites it — anything you write here is lost, silently, on the next
> release.
>
> **The one exception:** the values in the **§12 slot table**. Those are the project's,
> and filling them in is expected.
>
> **Everything else you want to write down goes in this project's own instruction
> file** (`CLAUDE.md` / `AGENTS.md` / …), which is exactly what §12's *Additional
> project rules* points at. A rule that belongs to this project and lives here is
> both in the wrong place and on a timer.
>
> If you believe the protocol itself is wrong, say so to the human and stop. Changing
> it is an upstream decision, not a local edit.

This is the first thing an agent should read in a session. It is **advice**, not law —
but most of the advice was paid for. Project-specific **law** lives in `contracts/` (§3).

Nothing here is specific to one project. Everything that is belongs in §12.

---

## 0. Digest — the part worth memorising

*If an agent is asked to commit this protocol to memory, this section is the part. The
rest is reference, opened when relevant.*

1. **Start a session by orienting, not by coding.** Scan the contract index, open the
   contract covering what you are about to touch and the guide for its stack, look at
   open work, then tell the human where things stand and what you are about to do. (§2)
2. **A rule is anchored + enforced, or it is not a rule.** If a check goes red, do not
   fix the check — read the contract first. (§3)
3. **Reversible development work does not need permission.** Deployment, destruction,
   money, and scope changes do. Batch questions to the end. (§4)
4. **A task must stand alone.** An investigation task delivers a report, not code. (§5)
   Any `<TODO>` slot in §12 is a question for the human — never a blank to guess, and
   never asked in this document's vocabulary: assume they have not read it. (§12)
5. **Write a question down the moment you notice it, then ask.** Anything you cannot
   derive goes into the open-questions ledger (§12) as an open line — writing and asking
   are separate moments, and that is what makes a forgotten question visible. Record the
   answer itself, not a tick. (§4)
6. **Branching and release are project settings (§12), not things to infer.** An agent
   never opens a branch on its own, and never ships — it prepares; a human releases. In
   some projects a push is already a deploy. (§6)
7. **Never bypass the commit gate.** Fix the error the hook found. (§6)
8. **Report, don't narrate.** State what broke, why, and what changed. (§7)
9. **End a session on purpose:** loose ends → tasks → commit → verify understanding. (§8)
10. **Don't claim what you didn't verify.** If a test failed, show it. If a step was
   skipped, say so. (§7)
11. **Universal coding principles are not repeated here** — they live in
    `PRINCIPLES.md`, installed next to this file. Read it. (§11)
12. **This file is read-only.** Only the §12 slot values may be filled in; everything
    else you want to write belongs in the project's own instruction file. `update`
    overwrites this file.

---

## 1. Why this exists

AI inverted the bottleneck. Producing code is cheap; the scarce resource is
**comprehension and control** — an agent writes faster than a person can read. Reading
every diff throws the speed away. Trusting blindly ships damage. The way out is not more
prose, it is **structure a human can supervise at a glance**.

Two failure modes drive everything below, and neither is fixed by better prompting.

**Failure 1 — plausible-but-wrong designs get re-derived, forever.**

A layout recalculation was gated on a generic "interaction changed" flag, because
dragging genuinely needs one. But selection sets that same flag. So a plain click ran a
partial layout pass — the one that deliberately exempts nodes being dragged. On a settled
document, a double-click collapsed an element from 620px to 102px while its sibling
absorbed the freed space, marking the document dirty and firing a phantom save. The next
full pass restored it, so it read as the canvas healing itself.

The rule "selection must never trigger layout" had been written down. It was rewritten
three times anyway, each time by a competent author with a reasonable case, because
prose does not argue back. A test does. Once the rule had one, the class of bug stopped.

**Failure 2 — the same knowledge is taught over and over.**

The same design doctrine was copied into three separate places that all fed agents. They
drifted. Agents then received contradictory instructions depending on which surface they
came through — and nobody noticed, because nothing compared the copies.

Elsewhere, guidance told agents to set a styling field that the write schema silently
rejected. Agents dutifully sent it; it vanished on the way in. The document was right,
the schema was right, and the pair was wrong. Nothing checked the pair.

Both are the same disease: knowledge that lives in more than one place, with nothing
that goes red when the copies disagree.

---

## 2. The first 60 seconds

Before writing code:

1. **Scan the contract index** — `contracts/README.md`. If the area you are about to
   touch has a contract, **open it**. Do not read them all.
2. **Open the guide for the stack you are about to touch** — `guides/`. If there is
   none and the stack matches one on offer, propose installing it; do not install it
   yourself. `PRINCIPLES.md` next to it applies to every session (§11).
3. **Look at the open work** for this project (§5, §12) — what is in flight, where the
   last session stopped.
4. **Run the installation check** if this project has one wired (§10). It answers in
   one shot what you would otherwise have to remember to look for: an unfilled setting,
   a contract missing from the index, a missing stack guide, a protocol that has moved
   on upstream.
5. **Confirm you are on the working branch** (§6). If not, switch first.
6. **Tell the human where things stand** — three to five lines: current state, what this
   session is about, any open question. Then start.

**Why:** the person running you is usually running several sessions and cannot hold all
of them. That summary is context repair for them, and insurance for you against forty
minutes of work on a wrong assumption.

**Do not** open with "ready, what shall we do?", and do not ask what the repository can
already tell you. Asking a question the code answers moves your work onto the human.

---

## 3. Contracts: anchored and enforced

Project-specific rules do not live in this file. They live in `contracts/`, and each one
has two halves. **With only one half, it is not a contract.**

1. **Anchored** — it has a name, it lives in exactly one place, and it can be found.
   Cures *"I know we decided this; I can't remember where it's written."*
2. **Enforced** — a test or check goes **red** when it is broken.
   Cures *"it broke silently and nobody noticed for a month."*

Anchored without enforcement is a wish. Enforced without an anchor is an orphan test
nobody understands. Together they bind.

**Rules for an agent:**

- If an enforcement check goes red, **do not repair the check to restore the old
  behaviour.** Read the contract, understand the reason. If the rule genuinely should
  change, change the contract deliberately and say so.
- **Never fork an existing rule.** A second copy of a rule is precisely the disease this
  folder exists to cure. Index it; do not duplicate it.
- Writing a new contract: rule + **why** + traps (how a future agent will fall in) +
  the check that guards it + a comment at the site in the code.

**Enforcement needs its own verification.** A commit hook was installed in every
repository and looked healthy — the files were there. But the hook path was never
registered, so every commit skipped the gate silently for weeks. An enforcement
mechanism that is not itself checked is decoration. Verify that the guard runs, not
that the guard exists.

*The template lives in `contracts/_TEMPLATE.md`, the index skeleton in
`contracts/README.md` — both installed next to this file.*

---

## 4. Boundaries — what to do, what to ask

**Do without asking** (reversible development work): write and edit code, refactor, add
tests, run things locally, create files, research, draft.

**Ask and wait:**

- deployment, promotion, release (§6)
- destructive operations: deleting data, irreversible migrations, force pushes, deleting branches
- anything that spends money
- **scope changes** — drifting into an unrequested refactor, "while I'm in here" work
- outward-facing actions: sending messages, publishing, acting in third-party accounts

**Batch the questions.** Do not seek approval at every step. Finish everything that does
not depend on an answer, then ask at the end. Blocking with nothing delivered is correct
only when proceeding on a wrong assumption would waste the work entirely.

**A question is not a paragraph in a report.** Attached to the end of a summary it stops
being a question: the reader is in reading mode, reaches the bottom, and answers nothing.
So:

- **Ask it on its own, first line, one sentence.** Context goes after the answer, if it
  is still needed. No table, no options matrix, no section references — a table is for
  comparing things the reader asked to compare, not for dressing up a question.
- **One at a time.** Three questions in one message is a form, and forms get closed. Ask
  the one that blocks the most, act on the answer, then ask the next.
- **Write it for someone who has read none of this.** The person answering is not
  reviewing your work; they are being asked about their own project, in their own words.
  Anything they have to decode first reads as noise and gets skipped.
- **Mark it so the eye cannot miss it.** A question set in the same prose as everything
  else is read as narration and scrolled past. Give it a marker the reader's eye catches
  — 🔴 or the equivalent in whatever surface this is — and use that marker for nothing
  else. The same goes for anything only the human can do: if you are handing over a step,
  it has to look different from work you are describing.

An unanswered question and an unasked one cost the same. Asking badly is not asking.

**Write the question down before you ask it.** Any question you cannot answer from the
code, the contracts, or this protocol goes into the project's open-questions ledger
(§12) as an open line — *at the moment you notice it*, which is not the moment you ask.
Keeping the two moments apart is the whole mechanism: an agent that forgets to ask still
wrote the line, so the unchecked box makes the forgetting visible. Batching (above) then
happens over a written list rather than over memory.

- Open a line the moment the uncertainty appears, and say what you assumed if you carried
  on without an answer. Adding it afterwards, once the answer is in, defeats the purpose.
- When you do ask and get an answer, **write the answer itself into the line**, not a tick.
  A tick is free to fabricate; an answer is not, and it is what the next session reads.
- A line whose answer is "no" or "not needed" is *closed*, not deleted — that is what
  stops the same question being asked again next week.

This does not detect the question you never noticed; nothing can. It detects the one you
noticed and did not raise, which is the failure that actually recurs.

**Do not spawn other agents** unless asked. The reports flood the context the human is
trying to follow.

**Visual and design judgement belongs to the human.** Produce the output, hand over the
path, stop. Do not enter an aesthetic iteration loop unprompted.

**If a concern is overruled, that is a decision.** Record it in one sentence and do
exactly what was asked.

---

## 5. Tasks

The rules below hold regardless of where tasks are stored; **where** they live is a
project setting (§12).

- **Self-contained.** Someone opening the task must be able to start without reading
  anything else: context, reason, steps, and how it will be verified when done.
- **Split by owner.** Work an agent can finish alone, versus work that requires a human
  (payment, a third-party console, a business decision). Do not split a mixed task in
  two — file it under its main owner and mark the steps inside.
- **An investigation is not an implementation.** If a task is marked as a spike, the
  deliverable is a **report**: findings, then the decision question, then stop. No code,
  no migrations, no config. "While I'm here I may as well apply it" is exactly the
  failure this marker exists to prevent. Only the human removes the marker.
- **Do not archive partial work.** If a task holds several sub-items, it stays open
  until all of them are done; mark the finished ones inside.
- **Work an agent cannot verify live** (needs credentials, a running app, a third party):
  once the code is done and type checks pass, don't leave it open forever — close it
  noting "code complete, live verification pending".
- **The archive is read-only.** Finished work is not reopened.

---

## 6. Branches and delivery

**These hold in every model** — they are what an agent must respect regardless of how
the project branches:

- **An agent never opens a branch or worktree on its own initiative.** If a session
  starts on the wrong branch, say so and switch; do not invent a new one.
- **How changes reach production is a project setting (§12) — read it, do not infer
  it.** Fast-forward promotion, squash-merge, release tags, a pipeline triggered from
  review: all of them are legitimate, and which one is in use is not something to
  deduce from the branch names you happen to see.
- **Releasing is not the agent's move.** Whatever the chain is, your part ends at a
  prepared change; a human decides when it ships (§4). In some projects a push is
  already a deploy — assume that until told otherwise.
- **Deployment carries code, not server configuration.** If a release needs a new
  environment variable, that is a separate manual step — forget it and the deploy is
  quietly half-applied.
- **Never bypass the commit gate.** If the lint/type hook blocks, fix what it found. A
  gate that gets skipped stops being a gate.
- Keep commit messages short — a title and at most a line or two — and group changes
  logically rather than piling unrelated ones together.

**Which branching model this project uses is a slot (§12).** The two common shapes:

- **Solo** — one long-lived working branch; no branch per task. With no review and no
  parallel authors, per-task branches cost attention and buy nothing, and half-finished
  ones get abandoned. Work lands on the working branch directly.
- **Team** — a branch per unit of work, merged through review. The working branch is
  protected, and an agent neither merges nor releases: it prepares the change, and a
  human approves it (§4).

If the slot is empty, ask (§12) — do not infer the model from the branch names you
happen to see.

## 7. Reporting

Answer in the language the question was asked in.

**Task report:** Summary (one or two lines) · Still worth doing? · Priority and why ·
Status (done / not done / partial, and what remains).

**Bug report:** What was broken (one line) · Explanation (root cause: what happens and
why) · Then either **Proposed fix** (not yet applied — propose, wait) or **Fix**
(applied — what changed).

**Session summary** — when asked *"what did we do?"*, and at the end of any session that
produced real work. Four blocks, not a narrative:

| Block | What goes in it |
|---|---|
| **What we did** | one line per change |
| **Why we got here** | the trigger · how it was before · why that was not enough |
| **What the user will see** | the behavioural difference, or plainly *"invisible — internal"* · and the class: feature / fix / chore / refactor / ops |
| **What happens next** | next step · ⚠️ exceptions and edge cases · 🔴 what is on the human · one closing question |

Two of these are dropped the most and both cost the next session real time. **"Why we got
here"** is not recoverable from the diff — a change whose reason is unrecorded gets undone
by whoever meets it next. **"What the user will see"** is honest about scope: most
infrastructure work is invisible, and writing that is better than implying a value the
work does not have.

A project may replace this shape with its own (§12); the default is this one.

**Label findings.** When reporting several at once, mark each one:

- **structural** — touches architecture or a rule; the human should read the full entry.
- **mechanical** — local and self-contained; can be delegated.

The criterion is *architectural significance*, not difficulty. The human skims every
one-line summary and reads only the structural bodies.

**Honesty.** If a test still fails, say so with its output. If a step was skipped, say
so. If part of the scope was blocked, finish everything else and state plainly what was
left out — narrowing the work is the human's call, not yours. And when something is
done and verified, say it plainly, without hedging.

**No flattery.** If an idea is weak, say why. Approving preambles waste the context
the human is paying to read.

---

## 8. Ending a session

When a session reaches its purpose — work finished, question answered, or the human
signals a wrap-up — before ending:

1. **Loose ends** — anything actionable discussed but not captured? List them briefly
   and ask whether to open tasks.
2. **Update tasks** touched this session; archive what is genuinely finished (§5).
3. **Record the win** — if real engineering happened, write one durable, quantitative
   sentence into wherever the project keeps them. Skip for trivial sessions.
4. **Commit** — ask whether to commit the changes (§6).
5. **Check understanding** — if the session was structural, ask the human one or two
   pointed questions about what changed. Skip for mechanical sessions.

Ask all of it **at once**, not step by step.

**On "continue":** if there is concrete unfinished work, continue it. If the work is
essentially done, **do not invent more** — summarise briefly and stop. When in doubt,
wrap up.

---

## 9. What actually goes red

Not every rule above has a mechanical guardian. Knowing which is which is the point of
this table.

| Rule | Guardian |
|---|---|
| Contract enforcement (§3) | ✅ the project's enforcement tests |
| Commit-time lint/type gate (§6) | ✅ commit hook |
| Working branch / fast-forward promotion (§6) | ✅ health check (§12) |
| This file's version drift (§1) | ✅ installation check |
| Scaffold integrity — anchor line, contract index, filled-in settings | ✅ installation check |
| Noticing a newer protocol exists | ✅ installation check, mechanically once wired into the commit gate — including when the installed tooling is itself the stale part |
| The protocol reaches a session at all (§10) | ✅ installation check — a session hook, or a digest block checked against its source |
| Session-opening orientation (§2) | ⚠️ partial — §10 step 2 puts §0 in front of the agent; acting on it is still intent |
| End-of-session ritual (§8) | ⚠️ partial — a session-stop hook, where the agent supports one |
| Spike lock (§5) | ⚠️ none — intent only |
| Report formats (§7) | ⚠️ none — intent only |
| An open question was written down before it was asked (§4) | ⚠️ partial — the check counts unanswered lines in the declared ledger; whether a question ever reached it is intent |
| The commands §12 declares actually exist (§10) | ✅ installation check — a declared command with nothing behind it is a dead pointer |
| Boundaries (§4) | ⚠️ partial — the agent's permission settings |
| Stack guides and `PRINCIPLES.md` — missing, stale, or written for another major | ✅ installation check (detected stack, `last-reviewed` age, `verified-against` range) |
| The §10 step 4 reflexes are actually wired | ⚠️ none — intent only |
| Edits to this read-only file outside §12 | ✅ installation check |

The "intent only" rows erode over a long session. The fix is not to make this document
longer or sterner; it is to turn the rule into something executable. **If a rule is
chronically forgotten, repair the environment, not the agent.**

This table is a debt list. It should get shorter.

---

## 10. Installing

**No agent reads this file on its own.** It is only ever reached because something
points at it. Step 1 is mandatory; the rest is optional.

**Step 1 — the anchor.** Add one line to the instruction file your agent loads
automatically:

> The working protocol for this repository is in `dev/flowpad/AGENT-INIT.md` — read it
> at the start of a session.

| Agent | Anchor goes in |
|---|---|
| Claude Code | `CLAUDE.md` at the repository root |
| Codex / generic | `AGENTS.md` at the repository root |
| Cursor | `.cursorrules` (or `.cursor/rules/`) |
| Gemini | `GEMINI.md` |
| An agent with persistent memory | write §0 Digest into memory, plus a pointer to this file |

**Step 2 — make it load itself.** The anchor is a *hop*: the agent has to notice the
line and choose to open the file. A hop that can be skipped is a hop that will be — and
no session inherits the last one's reading, because every session starts empty. Where
the agent offers a mechanical channel, put the protocol in front of it instead:

| Agent | Channel | What is installed |
|---|---|---|
| Claude Code | a `SessionStart` hook in `.claude/settings.json` | a command that prints §0 from the installed file at every session start |
| Codex / Cursor / Gemini / other | none available | §0 is copied into the instruction file, between markers |

Both are installed by `npx flowpad wire-session` (or `init --wire`), and `update` offers
the channel to an install that predates it — asking once rather than editing anything on
its own, opt-in like every other write here. The hook reads the file on disk rather than calling the package, so
it costs no network, works where the package is not installed, and prints the digest of
the protocol *actually installed* rather than whatever version the tool happens to be.

The copied block is the weaker of the two — it is a second copy, which is Failure 2 —
so it is fenced: `update` re-stamps it and the installation check goes amber when it no
longer matches its source. A copy with a guardian is a cache; without one it is drift.

**Step 3 — keep the anchor clean.** The instruction file should hold only
project-specific things: architecture warnings, local commands, deployment specifics.
Do not copy protocol rules into it. Copy them and you have two sources; two sources
drift. One question, one answer: protocol → this file; project → the instruction file.

**Step 4 — reflexes.** Several "intent only" rows in §9 become mechanical if the agent
supports them. **An agent reading this should offer to wire them, not wait to be asked** —
and then stop at the offer, because these are edits to the human's own configuration (§4).
Nothing checks whether they exist, which is exactly why the offer has to be made out loud.

| Agent | What to offer |
|---|---|
| Claude Code | a slash command for the commit flow and the health check · a `Stop` hook for §8 · permissions in `.claude/settings.json` for §4 |
| Codex / Cursor / Gemini / other | the same three, in whatever form that agent has: a callable command, an end-of-session hook, a permission list |

Without them the protocol still works — it just runs on judgement instead of reflex.

**Step 5 — scaffolding.** Installation writes `contracts/` (index + template) if it is
missing, and never touches it if it already exists. It also installs `PRINCIPLES.md`
(§11) next to this file. Then fill in §12.

**How this copy was installed.** This document is distributed as an npm package and
put in place by it:

```
npx flowpad init --agent=<claude|codex|cursor|gemini> --wire   # install + anchor + gate
npx flowpad check                                              # the installation check
npx flowpad update                                             # take a newer protocol
npx flowpad guide list | guide add <stack>                     # language/framework guides
```

The package is one way to install this document, not a requirement of it: everything
above works if the files are copied by hand. What the tooling buys is the check —
without something that goes red, §9's guardians are prose.

---

## 11. Deliberately not here

Repeated rules drift, so these live elsewhere on purpose:

- **Universal coding principles** — never swallow errors, fix the class rather than the
  instance, comment the *why*, no dead code, prefer early returns — and **security and
  operations rules**, such as never putting a secret on a command line → `PRINCIPLES.md`,
  installed alongside this one (§10). They apply to every session without being asked
  for, so unlike a stack guide there is no "open it when relevant": read it once, early.
- **Language and framework guides** → separate files, installed per repository
  alongside this one (§10), and **opening them is the agent's job (§2)**. They are kept
  apart from this document on purpose: a framework guide ages on the framework's clock,
  not the protocol's, and each carries a `last-reviewed` date that the installation check
  warns about once it goes stale. A guide that quietly rots is worse than no guide — an
  agent will apply it with full confidence.
- **Project law** — architecture invariants, engine rules, domain constraints →
  `contracts/`.
- **Project commands** — test runner, deployment tool, local setup → §12.

---

## 12. This project

*Everything above is the same everywhere. This section is the only part that differs.
installation fills in what the repository can answer and leaves the rest as `<TODO>`;
the check warns while any remain.*

**A `<TODO>` slot is a question for the human, not a gap to fill in with a guess.**
Guessing is worse than leaving it empty: an empty slot keeps `check` complaining, a
wrong one looks settled and gets obeyed.

Installation answers what the repository can answer — including answering `none`,
which is a real answer and not a gap: plenty of repositories deploy nothing and keep no
wins file. Anything it filled by inference says so in the cell, so a human can correct
it at a glance. **Often nothing is left to ask.**

**Assume the human has never read this file.** Someone installed the protocol; that
does not mean anyone read it, and it is not their job to. So if something genuinely is
left to ask:

- **Never quote this document at them.** No section numbers, no "slot", no
  "promotion chain", none of this document's vocabulary. Ask in the words their
  project already uses: *"which branch do you commit to day to day?"* — not *"what
  goes in the Working branch slot in §12?"*
- **Confirm rather than interrogate.** Work the answer out from the repository first,
  then put it up for a yes/no: *"looks like you work on `dev`, and deploying is just
  a push — right?"* One correction costs them less than one open question.
- **Ask only what this session actually needs.** About to commit? The branch and the
  health check matter; the rest can stay empty and keep warning. Do not open with a
  questionnaire — a wall of questions before any work is done is the same failure as
  asking for approval at every step (§4).
- **Keep it to a handful.** If more than a few are genuinely blocking, say so in one
  line and let the human decide whether to settle them now or later.

Each slot below carries the question in plain words. **Ask it as written** rather than
composing your own from the slot's label — the label is the tool's vocabulary, the
question is theirs. Then write the answers in as they arrive, and carry on.

| Slot | This project |
|---|---|
| Contract index | `<TODO>` — ask: *Where are this project’s rules written down?* |
| Task surface (§5) | `<TODO>` — ask: *Where do you keep what still needs doing?* |
| Branching model (§6) | `<TODO>` — ask: *Do you work on one branch, or a branch per piece of work?* |
| Working branch (§6) | `<TODO>` — ask: *Which branch do you commit to day to day?* |
| How a change reaches production (§6) | `<TODO>` — ask: *How does a change get live from here — or does nothing deploy?* |
| Health check (§9) | `<TODO>` — ask: *Is there one command that tells you the project is healthy?* |
| Test command | `<TODO>` — ask: *How do you run the tests?* |
| Open questions ledger (§4) | `<TODO>` — ask: *Shall I keep a file of my questions and your answers, so nothing gets lost between sessions?* |
| Session summary format (§7) | `default` — filled in; a project wanting another shape replaces this |
| Agent commands (§10) | `<TODO>` — ask: *Are there commands you type to get me to do things here?* (detected from the agent's command folder when there are any) |
| Where wins are recorded (§8) | `<TODO>` — ask: *Do you keep a file of what got shipped?* |
| Additional project rules | `<TODO>` — ask: *Anything else about this project I should know up front?* |

---

## Appendix — where the scaffolding lives

This protocol does not embed the contract template or the index skeleton. They are real
files, installed alongside this one:

- `contracts/_TEMPLATE.md` — the shape every contract takes; its **Enforcement**
  section is what makes §3 concrete. A contract that leaves it blank is not one.
- `contracts/README.md` — the index. It is the "anchored" half: the single entry point
  an agent scans in §2.

They are not reproduced here on purpose. A rule that exists in two places drifts — that
is Failure 2 in §1, and this document is not going to demonstrate it.
