---
kind: document format — the write-up of a finished task
scope: any project, any language, any agent
install: installed next to AGENT-INIT.md by `npx flowpad init`
---

# TASK-DOC — how a finished task is written up

> Installed alongside the working protocol (`AGENT-INIT.md` §7) and read only when a
> task's document is being written or rewritten — not at every session start. Kept
> apart from the protocol on purpose: the protocol is about how work is run, this is
> about how one piece of finished work is recorded so that someone who never saw it
> understands it in two minutes.

The goal is not an archive. It is that a person — or a fresh session — who has never
seen the document can tell in two minutes what happened, what was decided, and what is
still open. Process narrative (who tried what, when) compresses; decisions and findings
do not.

## Language

- **Body: the language this project writes its documents in.** The project's own
  instruction file says which; if nothing says, use the language the request came in.
- **Quoted decision lines stay in the language they were said in**, attributed as
  `Decision: "…"` — never by a person's name. A decision sentence loses its meaning in
  translation; the exact words are the record.
- Plain and short. No literary openings, no abstract preambles ("this is an
  architectural inconsistency") — start with the event.

## Title

The H1 is the task's name. Keep it **under about 50 characters** — most task tools cap
titles near there — and make it a *name*, not a category.

- Good: `Roads decay to what the land can hold`
- Bad: `TASK: ROAD-DECAY`

## Sections, in this order

1. **Status** — what landed, what did not, which commit / test / golden. No claims: a
   test you did not run is not "green".
2. **Dates** — the document's own dates if it has them. If not, derive them from the
   version-control log and *say that you did*: *"no date in the document; first tracked
   2026-07-29 in the bulk import, so finished on or before that."* Unknown is written
   as unknown, never invented.
3. **Contracts / touches** — which contract clauses, which files.
4. **What happened, in plain words** — the heart of the document:
   - **A concrete two-step scenario.** What the user tried → what they met. Act the
     event out; do not describe the rule. *"A village is being watched. No war, no
     disease. It starves anyway."*
   - **One core sentence** — `The core sentence: …` — the dependency, contradiction,
     or loss, in one line.
   - Then one paragraph on what follows from it.
5. **Where you see it** — two lines. *You see it:* which screen, doing what. *You
   don't see it:* where there is no problem. This draws the scope.
6. **Why it mattered** — at most two points.
7. **What landed / the decisions** — numbered, each with its **reason**. A line saying
   *"we did NOT do X, because …"* is worth as much as one that says what was done — it
   stops the next session proposing X again.
8. **Contradictions / corrections** — where the source document disagreed with itself,
   reconcile it under its own heading: which is right, and why. (The same section
   written twice; a heading saying "in progress" over a table saying "DONE"; a plan
   saying "the slider is instant" while the implementation found the opposite…) Show
   the contradiction; do not silently fix it.
9. **Measurements** — numbers in a table, each with the scenario it was measured in.
10. **Open / not verified** — never write an inference as a measurement. Say *"not
    measured; this is inference."*
11. **Technical detail, last** — file names, constants, the alternatives that were
    rejected. Not omitted — moved to the end.

## Verify against the code — mandatory

Grep the document's claims: does every file, function, and constant it names still
exist?

- Alive: *"Verified today: `rules/securityValue.ts` still exists."*
- Dead: put a block at the **top** of the document —
  **⚠ Validity note (checked against the code on <date>)** — saying what is still
  alive, what died, what replaced it, and what is still worth reading. **Do not delete
  the document**: the reasoning and the measurements keep their value after the code
  has moved on.

## Not allowed

- Code blocks, except a formula or a type. The narrative moves in sentences.
- Walking every function one by one.
- Translating an existing document sentence by sentence. This is a **rewrite**: the
  process narrative shrinks, the decisions and findings do not.
- Information that is not in the document or the code. When unsure, write
  *"unverified"*.
- A person's name anywhere in the text.

## Where the rule ends

This is the shape of the document. What a task *is*, where tasks live, and when one is
opened or closed belong to the protocol (`AGENT-INIT.md` §5). How the rewrite is asked
for, and in what words the result is reported back, belong to whatever the agent's own
command layer is — the format is the only part that is the same everywhere.
