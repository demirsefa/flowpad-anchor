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
npx flowpad init --agent=claude --wire   # install, anchor, and wire both gates
npx flowpad check                        # verify; exits non-zero when something is off
npx flowpad update                       # take a newer protocol, keeping your §12 slots
npx flowpad guide add react              # install a stack guide
npx flowpad wire-session                 # make the protocol load at every session start
npx flowpad questions                    # answer the open questions the agent wrote down
npx flowpad context                      # print the session brief on stdout
npx flowpad link <projectId>             # point the repo at the project its work is tracked in
```

`check` is the part that matters. It verifies that the anchor line is still there, that
every project slot is filled in, that the contract index and the files on disk still
agree in both directions, that a commit gate is actually registered — not merely present
as a file — and that the repository's own stack has a guide installed and none of them
have gone stale or were written for a different major. It reads every `package.json` in
the tree, so a workspace whose root carries no manifest is detected from its child
repositories.

It also notices when the installed copy of this package is itself behind, which nothing
inside the repository can see on its own. That probe is cached for a week, capped at two
seconds, silent on failure, and skipped entirely under `CI` or `FLOWPAD_NO_NETWORK=1` —
a commit must never wait on the network.

`--wire` is what makes that mechanical rather than remembered: it adds `flowpad check`
to the pre-commit hook (and, where there is a `package.json`, pins the dependency). A
protocol that only describes good behaviour decays; one that exits non-zero at commit
time does not. It is opt-in — editing someone's commit hook uninvited is exactly the
behaviour the protocol tells agents not to have.

## Pointing at the protocol is not loading it

The anchor line is a hop: the agent has to notice it and choose to open the file. A hop
that can be skipped is a hop that will be — and no session inherits the last one's
reading, because every session starts empty.

So `--wire` also installs a **session channel**, using whatever the agent offers:

| Agent | Channel |
|---|---|
| Claude Code | a `SessionStart` hook in `.claude/settings.json`, printing §0 at every session start |
| Codex / Cursor / Gemini / other | §0 copied into the instruction file, between tool-managed markers |

The hook reads the installed file rather than calling this package back: no network on
a path that runs at every session start, works where the package was never installed,
and it prints the digest of the protocol *actually on disk* instead of whatever version
the tool happens to be. Because it lives in `.claude/settings.json`, it travels with the
repository — anyone who clones it gets the same behaviour without setting anything up.

The copied block is the weaker option — it is a second copy, which is Failure 2 above —
so it is fenced: `update` re-stamps it, and `check` goes amber when it stops matching
its source. A copy with a guardian is a cache; without one it is drift.

`update` offers the channel to an install that predates it — one keystroke, or the
command printed when there is no terminal to ask in. An install that never hears about
a new channel stays unwired forever, which is the same self-reinforcing silence the
registry probe exists to break.

Not wiring it is a legitimate choice, so `check` reports its absence at `INFO` and does
not colour the summary. Levels that colour a summary have to mean *act on this*, or the
amber rows that do get skimmed past.

## Linking a repository to the project its work lives in

When the tasks are not markdown files in the repository, the repository still has to
know where they are. `npx flowpad link <projectId>` writes that address into
`dev/flowpad/project.json` — tracked by git, because the point is that every session on
the checkout resolves it without asking anyone, and because an id is not a secret. It is
its own file rather than a key in the install lock: a lock is an installation record
that `update` overwrites, and an address a refresh can drop is an address nobody relies
on.

A linked repository may also carry `dev/flowpad/tasks-cache.md` — a **generated,
read-only** summary of that work, so grep and plain reading keep working. It has exactly
one writer, the tool that holds the credentials, and it carries a header naming the
project, the revision it was taken at and when.

`check` then verifies three things, and the boundary matters more than the rows: it has
**no credentials and no network**, so everything it says is structural — the pointer
parses, the cache still carries its generated header, the header names the project this
repository is linked to, and no markdown tasks have reappeared in the folder the project
replaced. It deliberately does **not** claim the cache is current: only something that
can ask the project knows that, and a green row misread as "fresh" would be worse than
no row at all, so the row says so in words.

Both amber cases are about a **declared** address, never an assumed one: an unlinked
repository gets `INFO`, and the folder-relapse alarm only exists once a project has been
linked.

## Honesty

The protocol ships a table of which of its own rules have a mechanical guardian and
which are **intent only**. That table is meant to shrink over time. A document that
hides its own weak points is harder to trust than one that names them.

## License

MIT
