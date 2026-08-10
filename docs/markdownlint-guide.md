# Markdownlint Guide

This guide documents the current Markdownlint situation in this
repository and the recommended way to use it without relying on
outdated setup details.

## Current repository state

- The repository contains a large amount of Markdown documentation,
  including `README.md`, files under `docs/`, and GitHub templates.
- `package.json` does not currently define `lint:md`
  or `lint:md:fix` scripts.
- No versioned Markdownlint config file is present at the repository
  root (`.markdownlint.json`, `.markdownlint.yaml`,
  or `.markdownlint-cli2.jsonc`).
- The existing automated checks currently cover Jest tests
  through `npm test`.

Because of that, Markdownlint should not be described as part of the
default local workflow or CI until the repository actually adds that
integration.

## Why Markdownlint is still useful

Markdownlint is still useful for:

- keeping headings, lists, and fenced code blocks consistent;
- catching common Markdown syntax issues early;
- reducing formatting regressions during documentation updates.

## Recommended usage

For occasional checks, run Markdownlint with `npx` instead of
documenting npm scripts that do not exist in the repository:

```bash
npx markdownlint-cli2 "**/*.md"
```

To try local auto-fixes:

```bash
npx markdownlint-cli2 --fix "**/*.md"
```

These commands download the tool on demand when needed and keep the
documentation aligned with the current project setup.

## Repository-specific guidance

- Prefer checking the files you changed instead of reformatting the
  entire repository during a small documentation update.
- Review auto-fixes carefully when lists, tables, or inline HTML are
  involved.
- Avoid large formatting-only rewrites unless they provide clear value.

## If permanent integration is added later

If the project adopts Markdownlint officially later, update this guide
at the same time as:

1. adding the dependency to `package.json`;
2. adding npm scripts for linting and auto-fixing;
3. committing a versioned Markdownlint config file;
4. wiring the check into CI if needed.

Until those changes exist in the repository, the documentation should
describe Markdownlint as an optional ad hoc check, not as an existing
built-in workflow.
