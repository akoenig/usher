# CLI Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `usher --version` print the `version` value from the root `package.json`.

**Architecture:** Keep version ownership in `package.json` and import that metadata where the Effect CLI runner is configured. The CLI still uses `Command.run`; only its `version` option changes from a hard-coded string to package metadata.

**Tech Stack:** TypeScript, Effect CLI, Effect Vitest, Vite+ via `vp`, NodeNext modules.

---

## File Structure

- Modify `src/Infrastructure/Cli/UsherCli.spec.ts`: import package metadata and add an Effect CLI test for `--version`.
- Modify `src/Infrastructure/Cli/UsherCli.ts`: import package metadata and pass `packageJson.version` to `Command.run`.
- Modify `tsconfig.json`: enable JSON module imports so TypeScript accepts importing `package.json`.

### Task 1: Add CLI Version Regression Test

**Files:**

- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts:1-20`
- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts:154-160`

- [ ] **Step 1: Import root package metadata in the CLI spec**

Add this import after the existing Effect imports and before local source imports:

```ts
import packageJson from "../../../package.json" with { type: "json" };
```

The top of `src/Infrastructure/Cli/UsherCli.spec.ts` should begin like this:

```ts
import { Command } from "@effect/cli";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigError, Console, Effect, Exit, HashMap, HashSet, Layer, Ref, Schema } from "effect";
import packageJson from "../../../package.json" with { type: "json" };
import type { AuditEvent } from "../../Application/Ports/AuditLog.js";
```

- [ ] **Step 2: Add the failing version test**

Insert this test after the existing `prints root help successfully when invoked with full argv and no command args` test:

```ts
it.effect("prints the package version", () =>
  Effect.gen(function* () {
    const logs = yield* Ref.make<ReadonlyArray<string>>([]);
    const result = yield* Effect.exit(
      runUsherCli(["node", "usher", "--version"]).pipe(Console.withConsole(testConsole(logs))),
    );

    assert.assertTrue(Exit.isSuccess(result));
    assert.deepStrictEqual(yield* Ref.get(logs), [packageJson.version]);
  }),
);
```

- [ ] **Step 3: Enable JSON module imports for the test**

Modify `tsconfig.json` to add `resolveJsonModule` under `compilerOptions`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Run the targeted test and verify it fails for the hard-coded version**

Run:

```bash
pnpm test src/Infrastructure/Cli/UsherCli.spec.ts
```

Expected: FAIL. The new test should report that actual output is `["0.0.0"]` while expected output is `[packageJson.version]` when `package.json` is changed away from `0.0.0`, or it may fail earlier if JSON import support needs adjustment. If `package.json` still has `"version": "0.0.0"`, confirm the test is structurally correct and continue to Task 2 because the implementation still removes the duplicate source of truth.

### Task 2: Use Package Version in CLI Runner

**Files:**

- Modify: `src/Infrastructure/Cli/UsherCli.ts:1-6`
- Modify: `src/Infrastructure/Cli/UsherCli.ts:180-184`

- [ ] **Step 1: Import root package metadata in the CLI implementation**

Add this import after the Effect import and before project imports:

```ts
import packageJson from "../../../package.json" with { type: "json" };
```

The top of `src/Infrastructure/Cli/UsherCli.ts` should begin like this:

```ts
import { Args, Command, Options } from "@effect/cli";
import * as Prompt from "@effect/cli/Prompt";
import { HttpClientError } from "@effect/platform";
import { NodeContext, NodeHttpClient } from "@effect/platform-node";
import { ConfigError, Console, Context, Effect, Layer, Option, Schema } from "effect";
import packageJson from "../../../package.json" with { type: "json" };
import type {
  AuditEvent,
  AuditEventCursor,
  AuditEventSequence,
} from "../../Application/Ports/AuditLog.js";
```

- [ ] **Step 2: Replace the hard-coded CLI version**

Change `runUsherCli` from:

```ts
export function runUsherCli(args: ReadonlyArray<string>): Effect.Effect<void, unknown, never> {
  return Command.run(usherCommand, {
    name: "Usher",
    version: "0.0.0",
  })(args).pipe(
```

to:

```ts
export function runUsherCli(args: ReadonlyArray<string>): Effect.Effect<void, unknown, never> {
  return Command.run(usherCommand, {
    name: "Usher",
    version: packageJson.version,
  })(args).pipe(
```

- [ ] **Step 3: Run the targeted test and verify it passes**

Run:

```bash
pnpm test src/Infrastructure/Cli/UsherCli.spec.ts
```

Expected: PASS for `src/Infrastructure/Cli/UsherCli.spec.ts`, including `prints the package version`.

### Task 3: Verify Type Safety and Build Compatibility

**Files:**

- Verify: `src/Infrastructure/Cli/UsherCli.ts`
- Verify: `src/Infrastructure/Cli/UsherCli.spec.ts`
- Verify: `tsconfig.json`

- [ ] **Step 1: Run the required typecheck feedback loop**

Run:

```bash
pnpm typecheck
```

Expected: PASS. If TypeScript rejects JSON import attributes, adjust imports to the syntax accepted by the configured TypeScript version while still importing `package.json` directly.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run the Vite+ project checks**

Run:

```bash
vp check
```

Expected: PASS.

- [ ] **Step 4: Confirm the built CLI reports the package version**

Run:

```bash
pnpm build
node dist/Main.mjs --version
```

Expected output:

```text
0.0.0
```

The expected output is the current `package.json` version. If `package.json` changes before execution, expect that new value instead.

### Task 4: Review and Commit

**Files:**

- Review: `docs/superpowers/specs/2026-05-29-cli-version-design.md`
- Review: `docs/superpowers/plans/2026-05-29-cli-version.md`
- Review: `src/Infrastructure/Cli/UsherCli.ts`
- Review: `src/Infrastructure/Cli/UsherCli.spec.ts`
- Review: `tsconfig.json`

- [ ] **Step 1: Inspect the final diff**

Run:

```bash
git diff -- docs/superpowers/specs/2026-05-29-cli-version-design.md docs/superpowers/plans/2026-05-29-cli-version.md src/Infrastructure/Cli/UsherCli.ts src/Infrastructure/Cli/UsherCli.spec.ts tsconfig.json
```

Expected: Diff only includes the design, plan, JSON import support, package metadata imports, version replacement, and version regression test.

- [ ] **Step 2: Inspect working tree status**

Run:

```bash
git status --short
```

Expected: Any unrelated files may be present in a dirty worktree, but only the files listed in this task should be staged or committed for this issue.

- [ ] **Step 3: Commit the intended files if explicitly approved**

Run only after explicit commit approval:

```bash
git add docs/superpowers/specs/2026-05-29-cli-version-design.md docs/superpowers/plans/2026-05-29-cli-version.md src/Infrastructure/Cli/UsherCli.ts src/Infrastructure/Cli/UsherCli.spec.ts tsconfig.json
git commit -m "feat: reflect package version in cli"
```

Expected: Commit succeeds with only the intended files staged.

## Self-Review

- Spec coverage: Task 1 adds the package-version regression test; Task 2 imports `package.json` and passes its version to `Command.run`; Task 3 verifies typecheck, tests, checks, build, and runtime output.
- Placeholder scan: No placeholders remain; every code and command step includes concrete content.
- Type consistency: The plan consistently uses `packageJson.version`, `runUsherCli`, `Console.withConsole`, `Ref.Ref<ReadonlyArray<string>>`, and the existing `testConsole` helper.
