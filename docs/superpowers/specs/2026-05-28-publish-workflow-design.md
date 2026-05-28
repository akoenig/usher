# Publish Workflow Design

## Goal

Publish the npm package when a GitHub release is published.

## Scope

The workflow is named `publish` and runs on `release.published`. It validates the release by installing dependencies, running Vite+ checks, running tests, building the package, and publishing the package to the npm registry.

## Package

The package name remains `@akoenig/usher`. The package must not be marked private because npm refuses to publish packages with `private: true`.

## CI Tooling

The workflow uses `voidzero-dev/setup-vp@v1` with Node.js 24 and dependency caching, matching the Vite+ CI guidance. The validation commands are:

- `vp install`
- `vp check`
- `vp test`
- `vp run build`

## Publishing

Publishing uses `pnpm publish --access public --no-git-checks`. Authentication comes from the GitHub Actions secret `NPM_TOKEN`, passed as `NODE_AUTH_TOKEN`. The Vite+ setup step configures the npm registry for `@akoenig` packages.

The npm package contents are constrained with a `files` whitelist so repository-only files such as CI workflows, design docs, and tests are not published.

## Verification

Local verification runs `pnpm typecheck`. The workflow file and package metadata are inspected to confirm the release trigger, Vite+ commands, npm authentication, package file whitelist, and publish command are present.
