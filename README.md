# Anchor

**A working protocol for building software with AI agents.** This is how FlowPad is
built — extracted, made project-neutral, and kept in one place so it can be applied
to any repository.

> **Status: early.** The protocol document is being finalised; the CLI described
> below is not published yet. Nothing here is stable.

## The problem

AI inverted the bottleneck. Producing code is cheap now; the scarce resource is
**comprehension and control** — an agent writes faster than a person can read.

Two failures follow, and both are structural rather than a matter of prompting:

1. **Agents re-derive plausible-but-wrong designs.** A rule written in prose gets
   argued away by the next agent, in good faith, with a reasonable-sounding case.
2. **The same rules get taught over and over.** Every new project, every new agent,
   the same corrections — because the knowledge lived in one agent's memory instead
   of in the repository.

## The idea

A rule is either **anchored** and **enforced**, or it is not a rule.

- **Anchored** — it has a name, it lives in exactly one place, and it can be found.
  Cures *"I know we decided this, I can't remember where it's written."*
- **Enforced** — a test or check goes **red** when it is broken.
  Cures *"it broke silently and nobody noticed for a month."*

Anchored without enforcement is a wish. Enforced without an anchor is an orphan test
nobody understands. Together, they are a contract.

Prose convinces. Only the test binds. This protocol is the practice of keeping both.

## What it installs

- `AGENT-INIT.md` — the protocol an agent reads at the start of a session: the first
  60 seconds, what to ask and what to just do, how work is reported, how a session ends.
- `contracts/` — the place project-specific laws live, with a template that refuses to
  be filled in without naming what enforces it.
- An **anchor line** in whichever instruction file your agent loads automatically
  (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, …) — without it, no agent
  ever reads any of this.

## Planned CLI

```
npx flowpad init     # install the protocol and scaffolding into this repo
npx flowpad check    # verify it is still anchored, enforced, and current
```

`check` is the part that matters. A protocol that only describes good behaviour
decays; one that exits non-zero in a pre-commit hook does not.

## Honesty

The protocol ships a table of which of its own rules have a mechanical guardian and
which are **intent only**. That table is meant to shrink over time. A document that
hides its own weak points is harder to trust than one that names them.

## License

MIT
