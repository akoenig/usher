# CLI Version Design

## Context

GitHub issue 12 requires `usher --version` to print the correct Usher version. The CLI currently passes a hard-coded `"0.0.0"` version to `Command.run` in `src/Infrastructure/Cli/UsherCli.ts`.

## Decision

The CLI version will come directly from the root `package.json` `version` field. `UsherCli.ts` will import the package metadata and pass `packageJson.version` to `Command.run` instead of a separate source constant.

## Scope

This change only affects top-level CLI version reporting. It does not change daemon startup, command behavior, config loading, packaging scripts, or release automation.

## Testing

Add or update a CLI spec that runs the top-level CLI with `--version` and verifies the printed version matches `package.json`. Existing type checking remains the primary safety check for JSON import compatibility.

## Error Handling

No new runtime error path is expected. If `package.json` is invalid or missing, the package build or module load should fail rather than silently reporting an incorrect version.
