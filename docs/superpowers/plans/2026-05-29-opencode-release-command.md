# OpenCode Release Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-level OpenCode `/release` slash command that calculates the next semver release from conventional commits, updates `package.json`, asks for confirmation, and creates a GitHub Release.

**Architecture:** Use OpenCode's project configuration command support instead of adding application runtime code. Add a root `opencode.json` containing only the schema declaration and `command.release` template. The template encodes the release workflow, safety checks, version rules, and confirmation gate.

**Tech Stack:** OpenCode project config, JSON, Git, GitHub CLI (`gh`), `pnpm`, existing GitHub release publish workflow.

---

## File Structure

- Create: `opencode.json`
  - Owns the project-level OpenCode slash command registration.
  - Contains `$schema` for editor/schema validation.
  - Contains `command.release.description` and `command.release.template`.
- No application source files change.
- No tests are added because this is a prompt-only OpenCode configuration change; verification is schema/config review plus JSON parsing.

## Task 1: Add `/release` OpenCode Command

**Files:**
- Create: `opencode.json`

- [ ] **Step 1: Create the project OpenCode config**

Create `opencode.json` at the repository root with this exact content:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "command": {
    "release": {
      "description": "Calculate and publish the next GitHub Release from main.",
      "template": "Run the project release workflow. Do not create an application CLI command.\n\nRelease rules:\n- Work from the current main state. Fetch remote refs and tags before calculating anything.\n- Verify the current branch is main and that local main matches origin/main after fetching before calculating or committing anything.\n- Use the latest existing semver tag with no prefix, such as 0.2.0, as the last release. Keep the no-prefix format for the new release tag.\n- Compare commits between the last release tag and main.\n- Calculate the bump from conventional commit messages with this precedence: BREAKING CHANGE in a commit message or ! in the conventional commit subject means major; feat means minor; fix means patch; all other commit types are ignored.\n- If there are no breaking, feat, or fix commits since the last release, stop and report that no release is needed.\n\nRequired preflight checks:\n- Run git status and stop if the working tree has changes that would make the release commit unsafe. Do not include unrelated user changes in the release commit.\n- Verify GitHub CLI authentication with gh auth status before attempting to publish.\n- Verify the proposed release tag does not already exist locally or remotely.\n- Verify package.json exists and will be updated to the proposed version.\n\nBefore publishing, show the user: the last release tag, the commits considered, the selected bump type, the proposed next version, and the exact actions you will take. Ask for explicit confirmation before changing package.json, committing, pushing, tagging, or creating a GitHub Release.\n\nAfter explicit confirmation:\n1. Update package.json to the proposed version using pnpm version <version> --no-git-tag-version or an equivalent package-manager-safe operation.\n2. Commit only the release version change with message chore: release <version>.\n3. Push main.\n4. Create the GitHub Release with gh release create <version> --target main --generate-notes.\n5. Verify the release exists with gh release view <version>.\n\nIf any post-confirmation step fails, stop and report the failed command and observed output. Do not run destructive recovery commands such as git reset --hard or git checkout --."
    }
  }
}
```

- [ ] **Step 2: Validate JSON parses**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('opencode.json', 'utf8'))"
```

Expected: command exits with status `0` and prints no output.

- [ ] **Step 3: Validate config schema shape manually**

Inspect `opencode.json` and confirm it has only these top-level fields:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "command": {}
}
```

Confirm `command.release` has exactly:

```json
{
  "description": "Calculate and publish the next GitHub Release from main.",
  "template": "..."
}
```

Expected: no unknown top-level keys and the command is defined under `command.release` with required `template`, matching OpenCode's config schema.

- [ ] **Step 4: Review prompt against the design**

Confirm the prompt explicitly includes these requirements:

```text
latest existing semver tag with no prefix
BREAKING CHANGE
feat means minor
fix means patch
no release is needed
git status
gh auth status
Ask for explicit confirmation
pnpm version <version> --no-git-tag-version
chore: release <version>
gh release create <version> --target main --generate-notes
gh release view <version>
Do not run destructive recovery commands
```

Expected: every required phrase or equivalent instruction appears in `opencode.json`.

- [ ] **Step 5: Check working tree diff**

Run:

```bash
git diff -- opencode.json
```

Expected: the diff adds only the new OpenCode config file and does not modify application code.

- [ ] **Step 6: Commit the command config**

Run:

```bash
git add opencode.json
git commit -m "chore: add release slash command"
```

Expected: commit succeeds and includes only `opencode.json`.

## Task 2: Final Verification And Handoff

**Files:**
- Read: `opencode.json`

- [ ] **Step 1: Confirm command file remains valid JSON after commit**

Run:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('opencode.json', 'utf8'))"
```

Expected: command exits with status `0` and prints no output.

- [ ] **Step 2: Confirm expected command registration is present**

Read `opencode.json` and confirm it contains:

```json
"command": {
  "release": {
    "description": "Calculate and publish the next GitHub Release from main.",
    "template": "Run the project release workflow. Do not create an application CLI command."
  }
}
```

Expected: `command.release` exists. The `template` value may continue beyond the first sentence shown above.

- [ ] **Step 3: Check repository status**

Run:

```bash
git status --short
```

Expected: no tracked changes from this implementation remain. Unrelated pre-existing untracked files may still appear and must not be modified.

- [ ] **Step 4: Tell the user to restart OpenCode**

Report this exact operational note:

```text
Restart OpenCode before using /release because project configuration is loaded at startup.
```

## Self-Review

Spec coverage:

- Project-level OpenCode command: Task 1 creates root `opencode.json` with `command.release`.
- Template-only, not app CLI: Task 1 template says not to create an application CLI command, and no app files are listed.
- No-prefix semver tag style: Task 1 template includes the latest no-prefix semver tag rule.
- Version calculation: Task 1 template includes breaking, `feat`, `fix`, ignore-other rules, and no-release behavior.
- `package.json` version update: Task 1 template includes `pnpm version <version> --no-git-tag-version`.
- Confirmation before publishing: Task 1 template includes explicit confirmation before changes, commits, pushes, tags, or GitHub Release creation.
- GitHub Release creation: Task 1 template includes `gh release create <version> --target main --generate-notes` and verification with `gh release view <version>`.
- Safety checks: Task 1 template includes `git status`, `gh auth status`, existing tag checks, unsafe working-tree stop behavior, and no destructive recovery commands.
- Verification: Task 1 and Task 2 validate JSON and review command contents without running a real release.

Placeholder scan: no placeholders, TBD markers, or deferred implementation notes remain.

Type consistency: not applicable beyond JSON key names; `command.release.description` and `command.release.template` are used consistently.
