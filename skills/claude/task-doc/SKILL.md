---
name: task-doc
description: >-
  Rewrite a finished task's document into the shape the working protocol prescribes
  (dev/flowpad/TASK-DOC.md). Use when the user asks to rewrite, tidy up, or make
  readable a finished task document or write-up, or to make a task understandable to
  someone who never saw it. Rewrites the one document it was asked about — never a
  sweep. Installed, opt-in, by `npx flowpad init` / `npx flowpad skill add task-doc`.
---

# /task-doc — rewrite a finished task's document

The format is not in this file. It is in **`dev/flowpad/TASK-DOC.md`**, installed next
to the working protocol; this command only points at it, so there is one copy to
drift. If that file is missing, the repository is not anchored: run `npx flowpad init`.

## Steps

1. **Open `dev/flowpad/TASK-DOC.md`** and apply it as written — the section order, the
   title limit, the language rule, the verification step, the prohibitions.
2. **Read the source document and the code it names.** Grep every file, function, and
   constant the document mentions. What still exists is stated as verified; what died
   goes into a validity note at the top. The document is not deleted for having aged.
3. **Write the new document** in the language this project writes its documents in.
   Quote decisions in the words they were said, as `Decision: "…"`, never by a
   person's name. Process narrative shrinks; decisions, findings, and measurements
   do not.
4. **Report back** in the language the request came in: what changed, which claims
   failed verification, what stays open. The report is a chat message; it is not part
   of the document.

## Scope

- One document per request — the one named. Other documents are not touched, and
  there is no rule that existing write-ups must be brought into this shape.
- No code changes. If verification finds the code is wrong rather than the document,
  say so in the report and stop.
