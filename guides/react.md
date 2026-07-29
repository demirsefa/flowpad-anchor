---
stack: react
verified-against: react@18-19
last-reviewed: 2026-07-28
---

# React — best practices

> A cross-project React guide: read it in a session that touches React, JSX, or hooks.
> Project-neutral — project-specific rules stay in that project's own instruction file.

## Hook dependencies

- **List correct dependencies** in `useEffect`, `useCallback`, and `useMemo`.
  Every value used inside that the effect/callback reads must be in the array.
- **Don't lie to the dependency linter.** Do not disable
  `react-hooks/exhaustive-deps` to make a warning go away.
- If a dependency causes an infinite loop or re-runs too often, **fix the real
  cause** — memoize the value, move logic out, or use a `ref` — instead of
  dropping it from the array.

## State & effects

- **Don't store derived state.** If a value can be computed from existing props or
  state, compute it during render — don't mirror it into `useState` and sync with an
  effect. That sync is a classic bug source.
- **Effects are for external systems only** (data fetch, subscriptions, manual DOM,
  timers). Pure calculation belongs in render, not in `useEffect`.
- **Don't use the array index as `key`** for dynamic lists — it breaks on reorder or
  removal. Use a stable id from the data.

## Keep render pure, memoize sparingly

- **Render must be pure.** No mutation or side effects in the render body — same props
  in, same JSX out. Side effects belong in event handlers or effects.
- **Don't over-memoize.** Reach for `useMemo`/`useCallback` only when you need a stable
  reference (passing to a memoized child or into a dependency array) or for a measured
  cost. Premature memo is noise and a bug source — its own dep array drifts out of sync.
- **Extract shared stateful logic into a custom hook.** Don't copy-paste the same
  effect/state across components.
