# CONTRACT: <NAME>

**Status:** draft | active  ·  **Enforced by:** `<path/to/check>` | _judgment (see audit prompt)_

## Scope

Which repositories / files / boundary this governs. Be concrete — a reader, human or
agent, should know from this line alone whether a given file is in scope.

## The agreement

The rules, numbered. One per line; each must be **checkable**.

1. …
2. …

## Why

The specific failure this prevents — the pain that forced it into existence. Without
this section the rule decays into "something someone added once".

## Traps

The concrete ways this gets violated, so a reviewer knows what to look for. These
usually come straight from the bugs that motivated the rule.

- …

## Enforcement

- **Test:** `<path>` — what it asserts, and what going red means.
- _or_ **Judgment:** no automated check is possible; verified only by the audit prompt
  below. (Prefer a test. Use judgment only when the rule genuinely cannot be expressed
  as one.)

## Audit prompt (paste into a fresh agent session)

> Here is the **<NAME>** contract: `<link>`. Read these files: `<paths>`.
> For each numbered rule, decide whether it is currently honoured. Report every
> suspected violation with `file:line` and the rule number. When unsure, report it
> rather than staying silent — a false alarm is cheaper than a silent breach.
