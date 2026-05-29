# OpenCode Release Command Design

## Goal

Add a project-level OpenCode slash command named `/release` that prepares and publishes a GitHub Release from the current state of `main`.

The command calculates the next package version from conventional commit messages since the last release, updates `package.json`, asks for explicit user confirmation, and then publishes the GitHub Release.

## Context

The project already publishes to npm from `.github/workflows/publish.yml` when a GitHub Release is published. Existing release tags use plain semver names such as `0.2.0`, not `v0.2.0`. `package.json` currently stores the package version and must be updated as part of the release flow.

There is no existing project OpenCode configuration, so the command will be introduced with a project-level `opencode.json`.

## Command Shape

Create `opencode.json` with `$schema: "https://opencode.ai/config.json"` and a `command.release` entry. The command description makes it discoverable as `/release`; the prompt defines the release procedure the agent must follow.

The command is prompt-only. It does not add an application CLI command and does not add a release script.

## Version Calculation

The command compares commits between the latest existing semver release tag and `main`.

Version bump rules:

- Breaking commits increment the major version. This includes conventional commit subjects with `!` and commits whose messages include `BREAKING CHANGE`.
- `feat` commits increment the minor version.
- `fix` commits increment the patch version.
- Other commit types do not affect the release version.

Precedence is breaking over feature over fix. If no breaking, feature, or fix commits exist since the last release tag, the command stops and reports that no release is needed.

New releases keep the repository's existing no-prefix tag format, such as `0.3.0`.

## Release Flow

Before making changes, the command prompt instructs the agent to:

- Fetch remote refs and tags.
- Verify the release is based on the current `main` state.
- Check `git status` and stop if unrelated working-tree changes would be included in the release commit.
- Verify GitHub CLI authentication with `gh auth status`.
- Show the user the last release tag, selected commits, bump type, proposed version, and exact actions.
- Ask for explicit confirmation before committing, tagging, pushing, or creating a GitHub Release.

After confirmation, the agent updates `package.json` to the calculated version with `pnpm version <version> --no-git-tag-version` or an equivalent package-manager-safe operation, commits the version bump with `chore: release <version>`, pushes `main`, creates the GitHub Release with `gh release create <version> --target main --generate-notes`, and verifies it with `gh release view <version>`.

If any post-confirmation step fails, the agent stops and reports the failure. The command must not use destructive recovery commands.

## Error Handling

The command stops before publishing when:

- No prior semver release tag exists.
- No releasable commits exist since the last release.
- The working tree contains changes that would make the release commit unsafe.
- `gh auth status` fails.
- The proposed release tag already exists locally or remotely.
- The user does not explicitly confirm the release.

Failures after confirmation are reported with the failed command and observed output so the user can decide how to recover.

## Testing And Verification

Because this is an OpenCode slash command, verification focuses on configuration validity and prompt review:

- Validate `opencode.json` against the OpenCode config schema where feasible.
- Inspect the command prompt for the required safety gates and release steps.
- Do not run a real release during implementation verification.

After adding the command, the user must restart OpenCode for the project config change to take effect.
