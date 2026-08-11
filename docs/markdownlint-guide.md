# Markdownlint Guide

This repository uses [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
for documentation quality checks.

## Scripts

```bash
npm run lint:md        # check
npm run lint:md:fix   # apply safe auto-fixes
```

Config lives in `.markdownlint-cli2.jsonc` at the repository root.

## CI

Pull requests run `npm run lint:md` as part of `.github/workflows/lint.yml`
(self-hosted runners, same Node/npm setup as the unit-test workflow).

## Config highlights

Several rules are disabled because they do not fit this corpus:

- **MD013** — line length (long URLs / tables)
- **MD024** — duplicate headings across independent docs
- **MD029** — ordered-list prefix style
- **MD033** — inline HTML in docs
- **MD034** — bare URLs (e.g. emails in `SECURITY.md`)
- **MD040** — fenced-code language (some diagrams are plain fences)
- **MD041** — first-line heading
- **MD060** — table column style

`AGENTS.md`, `CLAUDE.md`, and local agent memory (`.remember/`) are ignored.

## When to run locally

Run `npm run lint:md` before opening a documentation PR, or rely on CI after push.
