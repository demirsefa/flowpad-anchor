# Open questions — this package's own ledger

> Rules and line format live in `protocol/AGENT-INIT.md` §4 — not restated here. This is
> the ledger for the package itself: questions about the protocol, the guides or the CLI,
> which would otherwise be asked (and answered) inside a consuming workspace and never
> reach this repo.
>
> `dev/` is outside `package.json` › `files`, so nothing here ships to npm — but it is
> public on GitHub. Keep consumer-internal names out of it.

## Open

- [ ] Is `guides/typescript.md` actually going to be re-read against TS 6, or does the
      `verified-against` warning stay as deliberate debt? A consumer is on `6.0.2` and
      another on `4`, so both go yellow today. Widening the range without reading the
      guide would be lying to the check that exists to catch exactly this.
      — assumption: the warning stays; guide content is human work
- [~] The unfinished anchor work itself (`ANCHOR-PROTOCOL-FOLLOWUPS.md`: swift/kotlin
      guides, the TS6 re-read, npm scope reservation) is still tracked as a task inside a
      consuming workspace. Same argument as this ledger — should it move here too?
      — asked 2026-08-04; assumption meanwhile: it stays there, only the ledger moved
- [~] Protocol v13 and the task-surface offer are committed but unreleased, so no
      consumer sees either until a publish. Is this the release, or does it wait for
      more? The offer is the first thing here that names a sibling tool, and a version
      number is permanent.
      — asked 2026-08-06; assumption meanwhile: it waits; nothing is published from a
        session that only wrote the code
