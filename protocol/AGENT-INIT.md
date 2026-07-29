# AGENT-INIT — how work is done in this repository

```
version: 1
kind:    working protocol (advice, not law)
scope:   agent-neutral — Claude Code, Codex, Cursor, Gemini, …
install: installed by `npx flowpad init` into dev/flowpad/; edit freely, `update` will ask before overwriting
```

> This is the first thing an agent should read in a session. It is **advice**, not law —
> but most of the advice was paid for. Project-specific **law** lives in
> `contracts/` (§3).
>
> Nothing here is specific to one project. Everything that is belongs in §12.

---

## 0. Digest — the part worth memorising

*If an agent is asked to commit this protocol to memory, this section is the part. The
rest is reference, opened when relevant.*

1. **Start a session by orienting, not by coding.** Scan the contract index, open the
   contract covering what you are about to touch, look at open work, then tell the
   human where things stand and what you are about to do. (§2)
2. **A rule is anchored + enforced, or it is not a rule.** If a check goes red, do not
   fix the check — read the contract first. (§3)
3. **Reversible development work does not need permission.** Deployment, destruction,
   money, and scope changes do. Batch questions to the end. (§4)
4. **A task must stand alone.** An investigation task delivers a report, not code. (§5)
5. **One working branch.** Promotion is a fast-forward. **Pushing triggers deployment;
   agents do not.** (§6)
6. **Never bypass the commit gate.** Fix the error the hook found. (§6)
7. **Report, don't narrate.** State what broke, why, and what changed. (§7)
8. **End a session on purpose:** loose ends → tasks → commit → verify understanding. (§8)
9. **Don't claim what you didn't verify.** If a test failed, show it. If a step was
   skipped, say so. (§7)
10. **Universal coding principles are not repeated here** — they belong in the agent's
    global instructions. (§11)

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
2. **Look at the open work** for this project (§5, §12) — what is in flight, where the
   last session stopped.
3. **Confirm you are on the working branch** (§6). If not, switch first.
4. **Tell the human where things stand** — three to five lines: current state, what this
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

Assumes a single developer: no pull-request review, no parallel authors.

- **One long-lived working branch.** Do not carve a branch per task — it produces
  scattered work and buys nothing here. An agent never opens a branch or worktree on
  its own initiative.
- If a session starts on the wrong branch, **switch first**, then work.
- **Documentation-only repositories are the exception** — a repo nothing deploys from
  has no use for a promotion chain; work directly on its main branch (§12).

**Promotion is deployment:**

- Advance only by **fast-forward merge**; downstream branches stay ancestors of the
  working branch. Once they diverge, converge them first — then fast-forward is clean
  again.
- **Pushing triggers deployment. The agent does not.** Promotion happens on explicit
  human approval (§4).
- Deployment carries code, **not server configuration**. If a release needs a new
  environment variable, that is a separate manual step — forget it and the deploy is
  quietly half-applied.

**The commit gate:**

- Every repository should run a lint/type gate at commit time. If it blocks, **do not
  bypass it** — fix what it found. A gate that gets skipped stops being a gate.
- Keep commit messages short: a title and at most a line or two.
- Group logically; do not pile unrelated changes into one commit.

---

## 7. Reporting

Answer in the language the question was asked in.

**Task report:** Summary (one or two lines) · Still worth doing? · Priority and why ·
Status (done / not done / partial, and what remains).

**Bug report:** What was broken (one line) · Explanation (root cause: what happens and
why) · Then either **Proposed fix** (not yet applied — propose, wait) or **Fix**
(applied — what changed).

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
| This file's version drift (§1) | ✅ `flowpad check` |
| Scaffold integrity — anchor line, contract index, filled-in slots | ✅ `flowpad check` |
| Session-opening orientation (§2) | ⚠️ none — intent only |
| End-of-session ritual (§8) | ⚠️ partial — a session-stop hook, where the agent supports one |
| Spike lock (§5) | ⚠️ none — intent only |
| Report formats (§7) | ⚠️ none — intent only |
| Boundaries (§4) | ⚠️ partial — the agent's permission settings |

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

**Step 2 — keep the anchor clean.** The instruction file should hold only
project-specific things: architecture warnings, local commands, deployment specifics.
Do not copy protocol rules into it. Copy them and you have two sources; two sources
drift. One question, one answer: protocol → this file; project → the instruction file.

**Step 3 — reflexes, where available.** If your agent supports them, some of the
"intent only" rows in §9 become mechanical: a session-stop hook for §8, a callable
command for the commit flow and the health check, permission settings for §4. Without
them the protocol still works — it just runs on judgement instead of reflex.

**Step 4 — scaffolding.** `init` writes `contracts/` (index + template) if it is
missing, and never touches it if it already exists. Then fill in §12.

---

## 11. Deliberately not here

Repeated rules drift, so these live elsewhere on purpose:

- **Universal coding principles** — never swallow errors, fix the class rather than the
  instance, comment the *why*, no dead code, prefer early returns → the agent's
  **global** instructions.
- **Language and framework guides** → separate guide files, opened when relevant.
- **Security and operations rules** (never put secrets on a command line, …) → global
  instructions.
- **Project law** — architecture invariants, engine rules, domain constraints →
  `contracts/`.
- **Project commands** — test runner, deployment tool, local setup → §12.

---

## 12. This project

*Everything above is the same everywhere. This section is the only part that differs.
`flowpad init` fills in what it can detect and leaves the rest as `<TODO>`;
`flowpad check` warns while any remain.*

| Slot | This project |
|---|---|
| Contract index | `<TODO>` |
| Task surface (§5) | `<TODO>` |
| Working branch (§6) | `<TODO>` |
| Promotion chain (§6) | `<TODO>` |
| Health check (§9) | `<TODO>` |
| Test command | `<TODO>` |
| Where wins are recorded (§8) | `<TODO>` |
| Additional project rules | `<TODO>` |

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
