---
kind: code principles
scope: every language, every project
last-reviewed: 2026-07-31
---

# Code principles

> Installed alongside the working protocol (`AGENT-INIT.md` §11). Kept in a separate
> file on purpose: these age on their own clock, and the protocol is about *how work is
> run*, not *how code is written*. Language- and framework-specific rules live in
> `guides/`; project law lives in `contracts/`.

These hold in every session, in every language, without being asked for. They are short
because each one is a rule an agent can be held to, not an essay.

## Hard rules

- **Never swallow errors.** Every `catch` must do something real: handle the error, log
  it, rethrow it, or surface it to the user. An empty `catch {}`, or one that hides what
  happened, is not allowed. Use `try`/`catch` where you actually handle a failure — never
  to mute one.

- **Handle failures, don't hide them.** Validate inputs and check error cases. A crash or
  a bad state must never pass silently.

- **Split by meaning, and find the balance.** Each file or module should be one coherent
  responsibility — a reader should be able to guess its contents from its name. Do not
  shatter code into ten-line files, and do not pile unrelated things into one large one.
  Prefer units that can move as a whole, so renames and splits stay clean. What this buys:
  smaller diffs, fewer merge conflicts, and file names you can navigate by.

- **Best practice versus realistic practice — do not dogmatise.** Every structural
  guideline (file length, splitting, extracting a shared helper, generalising duplicated
  config) is the same trade-off: modelling versus overkill. Generalise repeated logic when
  it removes *real* duplication; do not abstract a one-off — a shared package for five
  lines is overkill. Rough calibration: a file up to a thousand lines is tolerable, but
  aim well below that; move a genuinely reusable helper into a util, while a hundred tiny
  single-use helpers may read better inline. The target is a structure both a human and an
  agent can take in quickly.

- **Fix the architecture, not just the bug.** When a bug exposes a structural hole — a
  *class* of mistake the design permits, rather than a one-off — fix the class: a single
  source of truth, a check that goes red, and then the specific fix made *through* that
  structure. Offer to audit the sibling cases; do not stop at the one that was reported.
  If the human says **"arch > fix"**, they are invoking this explicitly: go
  architecture-first and do not patch the symptom.

- **Comment the why, not the what.** Explain intent, rationale, or the trap that forced
  the design. Never restate what the code already says. Prefer a clear name over a comment
  for the "what" — `checkTokenKeyMatch()` beats three lines of prose. Code is the source
  of truth: if a comment has drifted out of sync, fix it or flag it. Do this unprompted.

- **No dead code.** No unused exports, variables, or branches, and no commented-out blocks
  kept "just in case". Delete them; version control remembers.

- **Prefer early returns** (guard clauses) over deeply nested conditionals.

## Preferences

Judgement, not law — context can justify departing from them.

- **Fail fast on an impossible state.** When code reaches a state it declares cannot
  happen, lean towards throwing rather than limping on with broken data. The sibling of
  *never swallow errors*. Sometimes a safe fallback is the better call, which is why this
  is a preference.

- **Prefer pure functions.** Functions that do not mutate their input and carry no hidden
  side effects are easier to test and to follow.

## Security and operations

- **Never put a secret on a command line.** Writing a value into a `.env` file with
  `echo 'KEY=<secret>' >> .env` lands that secret in shell history — a permanent leak.
  Read it hidden instead, so it is neither echoed to the screen nor stored as a literal:

  ```
  read -rsp "Secret: " V && sed -i "/^KEY=/d" .env && echo "KEY=$V" >> .env && unset V
  ```

  - `read -rs` keeps the value off the screen and out of history; use it for public values
    too, so the habit does not depend on classifying each one.
  - `sed -i` **without a backup suffix**, so no copy of the secret is left behind.
  - Delete-then-append (by key *name*, never by value) keeps it idempotent — no duplicate
    lines on a re-run.
  - It needs an interactive terminal, so run it on the target machine rather than through
    a one-shot remote command.

- **Know which kind of environment variable you are setting.** A build-time variable is
  baked into the bundle at build time, so exporting it in a shell does nothing; a runtime
  variable exported in a shell survives only until the next restart. Either way the value
  belongs in a file the service reads, and a runtime change needs the process restarted
  with the new environment.

- **Deployment carries code, not server configuration.** If a release needs a new
  environment variable, that is a separate manual step — forget it and the deploy is
  quietly half-applied.
