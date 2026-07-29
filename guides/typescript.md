---
stack: typescript
verified-against: typescript@5
last-reviewed: 2026-07-28
---

# TypeScript — best practices


> Proje-bağımsız; proje-özgü kurallar ilgili projenin CLAUDE.md'sinde kalır.

## Don't silence the tools

- **No `@ts-ignore`, `@ts-nocheck`, or `@ts-expect-error`** to mute the compiler.
  Fix the real type error instead.
- **No `eslint-disable` / `// eslint-disable-next-line`** to hide a lint error.
  Fix the real problem instead.

## Leave the build green

- `tsc` and `eslint` must pass with **no errors** before a change is done. Fix real
  errors — never silence them (see above).
- Formatting is the formatter's job (prettier, auto-applied on commit). Don't
  hand-format or fight the formatter.

## Type the inside, validate the boundary

- **Inside the app, trust the type system.** Internal code is protected by static
  types — no runtime re-checking needed.
- **At every external boundary, types are a lie until checked at runtime.** HTTP
  request/response bodies, env vars, JSON from disk or network, third-party data,
  user input — validate these with a runtime schema (**zod**), don't `as`-cast.
- **Parse, don't assume.** Turn `unknown` input into a typed value with a schema at
  the edge; from there on the rest of the code relies on the inferred type. A bad
  payload should fail loudly at the boundary, not corrupt state three layers in.

## Keep types honest

- **Avoid `any`.** Use a real type. `any` turns off type checking and hides bugs.
- If a value is genuinely not known at compile time, use **`unknown`** and narrow
  it (type guard) before use — never `any`.
- Use `any`, `unknown`, and `never` **as little as possible, ideally never**. If
  one is truly unavoidable, add a short comment saying *why*.

## Clear, stable shapes

- **Annotate return types on public/exported functions.** Don't rely on inference
  for the API surface — an explicit return type keeps callers stable and catches
  mistakes at the source.
- **Prefer a string union (`'a' | 'b'`) over `enum`.** Lighter, tree-shake friendly,
  and more portable (no runtime object).
- **Default to immutability.** Mark props/state/config `readonly` (and arrays
  `readonly T[]`); don't mutate inputs.
