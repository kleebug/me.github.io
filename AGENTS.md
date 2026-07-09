# AGENTS.md

This repository is a zero-dependency static Markdown site for Mebug daily notes.

## Project Structure

- `content/articles/`: published Markdown articles. Files here are public after `npm run publish`.
- `content/drafts/`: private local drafts. This folder is ignored except `.gitkeep`.
- `public/`: public static assets copied into `docs/`.
- `src/styles/site.css`: source CSS and design tokens.
- `scripts/build-site.mjs`: static site generator.
- `scripts/preview.mjs`: local preview server for `docs/`.
- `docs/`: generated GitHub Pages output. Do not hand-edit unless debugging generated HTML.
- `design-system/`: design and maintenance guidelines.

## Common Commands

- Build/publish static output: `npm run publish`
- Preview generated site: `npm run preview`
- Syntax check generator: `node -c scripts/build-site.mjs`

When changing articles, assets, generator code, or CSS, run `npm run publish` before finishing.

## Content Workflow

Published article files go in `content/articles/`.

Recommended Markdown frontmatter:

```markdown
---
title: "文章标题"
date: 2026-07-09 18:30
tags: ["日常"]
summary: "首页卡片摘要。"
cover: "/images/example.jpg"
---
```

Drafts go in `content/drafts/` and should not be committed.

Images that should appear online must be copied to `public/images/` or another folder under `public/`, then referenced as `/images/name.jpg` in Markdown.

## Generated HTML Rules

The generator currently supports:

- Frontmatter fields: `title`, `date`, `tags`, `summary`, `cover`, `draft`, `status`, `slug`
- Markdown headings: `#` through `#####`
- Lists using `-`, `*`, or ordered markers such as `1.`
- Indented list items up to three levels
- Blockquotes using `>`
- Fenced code blocks
- Inline bold, italic, code, links, and images
- Full-width Chinese image marker `！[alt](url)`
- Single-quoted inline code such as `'example'`
- Consecutive standalone images grouped as `.photo-grid`
- Standalone bold paragraphs converted to `h4` section labels
- Home page post cards grouped by year

Keep changes to Markdown parsing conservative. This is intentionally small and dependency-free.

## Visual Design Rules

Follow `design-system/visual-guidelines.md`.

Key constraints:

- Warm botanical palette: cream, peach, sage, wood, cocoa.
- Text colors must use semantic `--text-*` tokens from `src/styles/site.css`.
- Avoid long stretches of a single text color; use heading, body, muted, accent, and warm tokens.
- Article detail page width is `1080px`.
- Article body uses sans-serif fonts.
- Header height should stay compact around `56px`.
- Cards use `8px` radius or less.
- Do not add decorative gradient blobs, orbs, or unrelated visual noise.

## GitHub Pages

This site is intended to publish from the `docs/` folder on the `main` branch.

Before pushing:

1. Run `npm run publish`.
2. Confirm no drafts or `.DS_Store` files are staged.
3. Commit both source changes and regenerated `docs/`.

## Safety Notes

- Never delete or rewrite user articles unless explicitly asked.
- Do not move files out of `content/articles/` unless the user asks to unpublish them.
- Do not force-push or reset Git history without explicit approval.
- Do not commit `content/drafts/*` files.
