# Anchor

**A working protocol for building software with AI agents.** This is how FlowPad is
built — extracted, made project-neutral, and kept in one place so it can be applied
to any repository.

> **Status: early.** Published as [`flowpad`](https://www.npmjs.com/package/flowpad)
> and in daily use across two workspaces, but the interface may still change.

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
- `PRINCIPLES.md` — the coding principles that hold in every language and every session:
  never swallow errors, fix the class rather than the instance, comment the *why*, no
  dead code, never put a secret on a command line.
- `contracts/` — the place project-specific laws live, with a template that refuses to
  be filled in without naming what enforces it.
- `guides/` — optional per-stack guides (React, TypeScript, …), installed only for the
  stacks the repository actually uses.
- An **anchor line** in whichever instruction file your agent loads automatically
  (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, …) — without it, no agent
  ever reads any of this.

## The CLI

```
npx flowpad init --agent=claude --wire   # install, anchor, and wire the commit gate
npx flowpad check                        # verify; exits non-zero when something is off
npx flowpad update                       # take a newer protocol, keeping your §12 slots
npx flowpad guide add react              # install a stack guide
```

`check` is the part that matters. It verifies that the anchor line is still there, that
every project slot is filled in, that the contract index and the files on disk still
agree in both directions, that a commit gate is actually registered — not merely present
as a file — and that the repository's own stack has a guide installed and none of them
have gone stale. It reads every `package.json` in the tree, so a workspace whose root
carries no manifest is detected from its child repositories.

`--wire` is what makes that mechanical rather than remembered: it adds `flowpad check`
to the pre-commit hook (and, where there is a `package.json`, pins the dependency). A
protocol that only describes good behaviour decays; one that exits non-zero at commit
time does not. It is opt-in — editing someone's commit hook uninvited is exactly the
behaviour the protocol tells agents not to have.

## Honesty

The protocol ships a table of which of its own rules have a mechanical guardian and
which are **intent only**. That table is meant to shrink over time. A document that
hides its own weak points is harder to trust than one that names them.

## License

MIT
