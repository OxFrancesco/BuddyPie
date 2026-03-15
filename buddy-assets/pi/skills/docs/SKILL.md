---
name: docs
description: BuddyPie documentation workflow for README, changelog, API docs, and technical writing tasks. Use when the task is documentation-heavy or when code changes need accurate written explanation.
---

# Docs

Write documentation that reflects the current repository, not an idealized future state.

## Workflow

1. Read the relevant code paths before drafting docs.
2. Prefer concise sections, explicit setup steps, and concrete commands.
3. Call out assumptions and prerequisites when they matter.
4. If the repo already has docs conventions, reuse them.
5. Avoid marketing filler; optimize for developer usefulness.
6. Make docs repository-specific by referencing real file paths, functions, flags, or commands when they matter.
7. Avoid placeholder markdown, thin stubs, or generic headings that are not backed by code you inspected.

## Deliverables

- README sections should be runnable.
- Changelogs should state what changed and why it matters.
- API docs should prefer inputs, outputs, and examples over prose.
