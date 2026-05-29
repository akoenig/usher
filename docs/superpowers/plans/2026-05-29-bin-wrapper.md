# Bin Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `bin/usher` as the executable wrapper, remove the application shebang, and make systemd use the install-time Node binary through `USHER_NODE`.

**Architecture:** Keep `dist/Main.mjs` as the Vite+ bundled application entrypoint. Add a shell wrapper responsible only for locating the package root and launching the bundle with `${USHER_NODE:-node}`. Extend the systemd installer to write `Environment=USHER_NODE=<process.execPath>` while still using the current CLI executable for `ExecStart`.

**Tech Stack:** TypeScript, Effect, @effect/vitest, bash, Vite+ packaging, systemd user units.

---

## File Structure

- Create `bin/usher`: shell wrapper that resolves the package root and execs `dist/Main.mjs` with `${USHER_NODE:-node}`.
- Modify `package.json`: publish `bin/usher` as the `usher` binary and include `bin` in package files.
- Modify `src/Main.ts`: remove the shebang.
- Modify `src/Main.spec.ts`: assert `src/Main.ts` has no shebang and package metadata points at `bin/usher`.
- Modify `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`: add `nodeExecutablePath` input and render `Environment=USHER_NODE=...`.
- Modify `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`: cover environment rendering and install wiring.
- Modify `src/Infrastructure/Cli/UsherCli.ts`: pass `process.execPath` into the installer.

### Task 1: Packaging Entrypoint Tests

**Files:**
- Modify: `src/Main.spec.ts`
- Test data: `package.json`

- [ ] **Step 1: Write failing tests for no shebang and package bin wrapper**

Replace `src/Main.spec.ts` with:

```ts
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Schema } from "effect";

const PackageJson = Schema.Struct({
  bin: Schema.Struct({
    usher: Schema.String,
  }),
  files: Schema.Array(Schema.String),
});

describe("Main", () => {
  it.effect("does not include a shebang in the TypeScript application entrypoint", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("src/Main.ts");

      assert.assertFalse(source.startsWith("#!"));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect("publishes the usher binary from bin/usher", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("package.json");
      const packageJson = yield* Schema.decodeUnknown(PackageJson)(JSON.parse(source));

      assert.strictEqual(packageJson.bin.usher, "bin/usher");
      assert.deepStrictEqual(packageJson.files, ["bin", "dist", "README.md"]);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/Main.spec.ts`

Expected: FAIL because `src/Main.ts` still starts with `#!/usr/bin/env node` and `package.json` still maps `bin.usher` to `dist/Main.mjs`.

### Task 2: Wrapper File Test

**Files:**
- Modify: `src/Main.spec.ts`
- Create: `bin/usher`

- [ ] **Step 1: Add failing wrapper content test**

Add this test inside the existing `describe("Main", () => { ... })` block in `src/Main.spec.ts`:

```ts
  it.effect("provides a bash wrapper that honors USHER_NODE and forwards arguments", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("bin/usher");

      assert.assertTrue(source.startsWith("#!/usr/bin/env bash\n"));
      assert.assertTrue(source.includes("set -euo pipefail"));
      assert.assertTrue(source.includes("ROOT=\"$(cd \"$SCRIPT_DIR/..\" && pwd)\""));
      assert.assertTrue(source.includes("exec \"${USHER_NODE:-node}\" \"$ROOT/dist/Main.mjs\" \"$@\""));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/Main.spec.ts`

Expected: FAIL with a missing `bin/usher` file.

### Task 3: Minimal Packaging Implementation

**Files:**
- Create: `bin/usher`
- Modify: `package.json`
- Modify: `src/Main.ts`

- [ ] **Step 1: Add the wrapper script**

Create `bin/usher` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

exec "${USHER_NODE:-node}" "$ROOT/dist/Main.mjs" "$@"
```

- [ ] **Step 2: Update package metadata**

Change `package.json` to:

```json
  "bin": {
    "usher": "bin/usher"
  },
  "files": [
    "bin",
    "dist",
    "README.md"
  ],
```

- [ ] **Step 3: Remove the shebang from `src/Main.ts`**

Change the first lines to:

```ts
import { NodeRuntime } from "@effect/platform-node";
import { runUsherCli } from "./Infrastructure/Cli/UsherCli.js";
```

- [ ] **Step 4: Run packaging tests to verify they pass**

Run: `pnpm vitest run src/Main.spec.ts`

Expected: PASS.

### Task 4: Systemd Node Environment Tests

**Files:**
- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

- [ ] **Step 1: Write failing unit rendering and install wiring tests**

In `src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`, change the `usherDaemonServiceUnit` call in `renders an usher daemon user unit` to:

```ts
      usherDaemonServiceUnit({
        executablePath: "/home/alice/My Tools/usher's cli",
        nodeExecutablePath: "/home/alice/.local/share/fnm/node-versions/v24.16.0/installation/bin/node",
      }),
```

Change the expected service lines to include the environment line before `ExecStart`:

```ts
        "[Service]",
        "Environment=USHER_NODE=/home/alice/.local/share/fnm/node-versions/v24.16.0/installation/bin/node",
        "ExecStart='/home/alice/My Tools/usher'\\''s cli' daemon start",
        "Restart=on-failure",
```

In the `installUsherDaemonService` test input, add:

```ts
        nodeExecutablePath: "/usr/local/bin/node",
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: FAIL because `usherDaemonServiceUnit` still accepts a string and does not render `Environment=USHER_NODE=...`.

### Task 5: Systemd Node Environment Implementation

**Files:**
- Modify: `src/Infrastructure/Cli/DaemonSystemdInstaller.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.ts`

- [ ] **Step 1: Update installer inputs and service rendering**

Change `usherDaemonServiceUnit` and `installUsherDaemonService` in `src/Infrastructure/Cli/DaemonSystemdInstaller.ts` to accept `nodeExecutablePath`:

```ts
export function usherDaemonServiceUnit(input: {
  readonly executablePath: string;
  readonly nodeExecutablePath: string;
}) {
  return [
    "[Unit]",
    "Description=Usher daemon",
    "",
    "[Service]",
    `Environment=USHER_NODE=${systemdEscapeExecArg(input.nodeExecutablePath)}`,
    `ExecStart=${systemdEscapeExecArg(input.executablePath)} daemon start`,
    "Restart=on-failure",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export function installUsherDaemonService(input: {
  readonly executablePath: string;
  readonly homeDirectory: string;
  readonly nodeExecutablePath: string;
  readonly username: string;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const unitDirectory = systemdUserUnitDirectory(input.homeDirectory);
    const unitPath = systemdUserUnitPath(input.homeDirectory);

    yield* fs.makeDirectory(unitDirectory, { recursive: true });
    yield* fs.writeFileString(unitPath, usherDaemonServiceUnit(input));
    yield* runCommand("systemctl", "--user", "daemon-reload");
    yield* runCommand("loginctl", "enable-linger", input.username);
    yield* runCommand("systemctl", "--user", "enable", "--now", UsherDaemonServiceName);
  });
}
```

- [ ] **Step 2: Pass `process.execPath` from the CLI**

In `src/Infrastructure/Cli/UsherCli.ts`, update the install call to:

```ts
    yield* installUsherDaemonService({
      executablePath: currentExecutablePath(),
      homeDirectory: currentHomeDirectory(),
      nodeExecutablePath: currentNodeExecutablePath(),
      username: currentUsername(),
    });
```

Add this helper near `currentExecutablePath`:

```ts
function currentNodeExecutablePath() {
  return process.execPath;
}
```

- [ ] **Step 3: Run daemon installer tests to verify they pass**

Run: `pnpm vitest run src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: PASS.

### Task 6: Verification

**Files:**
- Verify changed files only.

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run src/Main.spec.ts src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run required typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run: `git diff -- bin/usher package.json src/Main.ts src/Main.spec.ts src/Infrastructure/Cli/DaemonSystemdInstaller.ts src/Infrastructure/Cli/DaemonSystemdInstaller.spec.ts src/Infrastructure/Cli/UsherCli.ts docs/superpowers/specs/2026-05-29-bin-wrapper-design.md docs/superpowers/plans/2026-05-29-bin-wrapper.md`

Expected: Diff only contains the wrapper packaging, systemd `USHER_NODE` behavior, tests, and docs from this plan.
