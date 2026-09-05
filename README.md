# Anchor

**One developer's working protocol for building software with AI agents, published so
others can take it.** It is how [FlowPad](https://getflowpad.com) is built; the
document was extracted, made project-neutral, and kept in one place so the same rules
apply to every repository the author works in.

The document is the product. The CLI exists so the author's own repositories stay
pinned to one source and go red when they drift — and it is shared for anyone who wants
the same. You do not need the CLI: read [`protocol/AGENT-INIT.md`](protocol/AGENT-INIT.md)
and copy what is useful.

Not a framework. No roadmap. Shaped by the projects it is used on.

> **Status: early.** Published on npm as [`flowpad`](https://www.npmjs.com/package/flowpad),
> in daily use across two workspaces, interface still moving. Source and issues:
> [github.com/demirsefa/flowpad-anchor](https://github.com/demirsefa/flowpad-anchor) —
> if something breaks or reads wrong, open an issue.

## The idea

Producing code is cheap now; the scarce resource is comprehension and control. Two
failures follow: agents re-derive plausible-but-wrong designs, because a rule in prose
gets argued away by the next agent in good faith; and the same rules get taught over and
over, because the knowledge lived in one agent's memory instead of in the repository.

So: a rule is either **anchored** and **enforced**, or it is not a rule.

- **Anchored** — it has a name, it lives in exactly one place, and it can be found.
- **Enforced** — a test or check goes **red** when it is broken.

Anchored without enforcement is a wish. Enforced without an anchor is an orphan test
nobody understands. Together, they are a contract. Prose convinces; only the test binds.

## What it installs

- `AGENT-INIT.md` — the protocol an agent reads at the start of a session: the first
  60 seconds, what to ask and what to just do, how work is reported, how a session ends.
  Its last section is a settings table for the project; everything above it is the same
  everywhere.
- `PRINCIPLES.md` — coding principles that hold in every language and every session:
  never swallow errors, fix the class rather than the instance, comment the *why*, no
  dead code, never put a secret on a command line.
- `contracts/` — where project-specific laws live, with a template that refuses to be
  filled in without naming what enforces it.
- `guides/` — optional per-stack guides (React, TypeScript so far), installed only for
  the stacks the repository actually uses.
- An **anchor line** in whichever instruction file your agent loads automatically
  (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, …) — without it, no agent
  ever reads any of this.

## The CLI

```
npx flowpad init        # install, then answer four questions: guides, commit gate,
                        # session channel, task surface
npx flowpad check       # verify; exits non-zero when something is off
npx flowpad update      # take a newer protocol, keeping the project's settings
npx flowpad guide       # list stack guides; `guide add react` installs one
npx flowpad wire-gate   # run `flowpad check` before every commit
npx flowpad wire-session# load the protocol at every session start
npx flowpad context     # print the session brief on stdout
```

`init` detects what it can from the repository — the agent from the instruction file
already there, the test command from the manifest, the contract index it just seeded —
and asks about the rest. Whatever it cannot answer is left as a question in the
settings table, worded for the person who owns the project rather than in this
document's vocabulary. Flags exist for scripts and agents that cannot answer a prompt:
`--wire` says yes to the commit-gate and session-channel offers, `--guides` and
`--tasks` to theirs, `--agent=<name>` names the agent when the repository has no
instruction file yet.

`check` is the part that matters. It verifies that the anchor line is still there, that
every project setting is filled in, that the contract index and the files on disk agree
in both directions, that a commit gate is actually registered — not merely present as a
file — and that the repository's stack has a guide installed and none of them have gone
stale or were written for a different major. It reads every `package.json` in the tree,
so a workspace whose root carries no manifest is detected from its child repositories.

It also notices when the installed copy of this package is itself behind, which nothing
inside the repository can see on its own. That probe is cached for a week, capped at two
seconds, silent on failure, and skipped under `CI` or `FLOWPAD_NO_NETWORK=1` — a commit
must never wait on the network.

## Pointing at the protocol is not loading it

The anchor line is a hop: the agent has to notice it and choose to open the file. A hop
that can be skipped is a hop that will be — and no session inherits the last one's
reading, because every session starts empty.

So the session channel puts the protocol in front of the agent mechanically, using
whatever the agent offers:

| Agent | Channel |
|---|---|
| Claude Code | a `SessionStart` hook in `.claude/settings.json`, printing the digest at every session start |
| Codex / Cursor / Gemini / other | the digest copied into the instruction file, between tool-managed markers |

The hook reads the installed file rather than calling this package back: no network on
a path that runs at every session start, and it prints the digest of the protocol
*actually on disk*. Because it lives in `.claude/settings.json`, it travels with the
repository. The copied block is the weaker option — a second copy — so it is fenced:
`update` re-stamps it, and `check` goes amber when it stops matching its source.

Every write here is opt-in — offered once, never done uninvited. Editing someone's
commit hook or settings without asking is exactly the behaviour the protocol tells
agents not to have. Declining is legitimate, so `check` reports an unwired channel at
`INFO` and does not colour the summary.

## Honesty

The protocol ships a table of which of its own rules have a mechanical guardian and
which are **intent only**. That table is meant to shrink over time. A document that
hides its own weak points is harder to trust than one that names them.

## License

MIT
