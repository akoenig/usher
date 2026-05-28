# Publish Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions release workflow that validates and publishes `@akoenig/usher` to npm.

**Architecture:** Keep release automation in a single GitHub Actions workflow. Use Vite+ setup and commands for install, check, test, and build, then publish with pnpm using an npm token secret and explicit npm registry setup.

**Tech Stack:** GitHub Actions, Vite+, pnpm, npm registry.

---

## File Structure

- Create: `.github/workflows/publish.yml` defines release-triggered validation and publishing.
- Modify: `package.json` removes `private: true` so npm publishing is allowed and adds a package file whitelist.

### Task 1: Package Publish Metadata

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Remove private package marker**

Update `package.json` so the package remains named `@akoenig/usher` and no longer contains `"private": true`.

- [ ] **Step 2: Add package file whitelist**

Update `package.json` with this field so published package contents are limited to the built CLI and README:

```json
"files": [
  "dist",
  "README.md"
]
```

- [ ] **Step 3: Verify package metadata**

Run: inspect `package.json`.
Expected: `name` is `@akoenig/usher`, `private` is absent, and `files` includes only `dist` and `README.md`.

### Task 2: GitHub Actions Publish Workflow

**Files:**

- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Add workflow**

Create `.github/workflows/publish.yml` with this content:

```yaml
name: publish

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Vite+
        uses: voidzero-dev/setup-vp@v1
        with:
          node-version: "24"
          cache: true
          registry-url: "https://registry.npmjs.org"
          scope: "@akoenig"
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Install dependencies
        run: vp install

      - name: Check
        run: vp check

      - name: Test
        run: vp test

      - name: Build
        run: vp run build

      - name: Publish to npm
        run: pnpm publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 2: Verify workflow content**

Inspect `.github/workflows/publish.yml`.
Expected: workflow is named `publish`, triggers on `release.published`, uses `voidzero-dev/setup-vp@v1`, configures `https://registry.npmjs.org` for `@akoenig`, runs `vp install`, `vp check`, `vp test`, `vp run build`, and publishes with `pnpm publish --access public --no-git-checks` using `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`.

### Task 3: Verification

**Files:**

- Verify: `package.json`
- Verify: `.github/workflows/publish.yml`

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: command exits successfully.

- [ ] **Step 2: Check working tree**

Run: `git status --short`
Expected: only intended files for this work are changed, plus any pre-existing user changes remain untouched.

## Self-Review

- Spec coverage: package metadata, Vite+ CI setup, release trigger, validation, and npm publish are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: commands and file paths match the approved design.
