# Vite+ Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the project toolchain structure to Vite+ so scripts route through Vite+, Vite+ config lives in `vite.config.ts`, and obsolete direct tool dependencies are removed.

**Architecture:** Keep application code unchanged. Consolidate test and pack configuration into `vite.config.ts`, make `package.json` scripts delegate to Vite+, and remove direct dev dependencies that Vite+ now owns. Preserve `@effect/vitest` because tests use Effect-specific Vitest helpers.

**Tech Stack:** Vite+, Vitest through Vite+, tsdown through Vite+ pack, Oxlint/Oxfmt through Vite+ check, Effect, pnpm.

---

## File Structure

- Create: `vite.config.ts` as the central Vite+ config for `test`, `pack`, and `lint`.
- Delete: `vitest.config.ts` because Vite+ docs recommend test config in `vite.config.ts`.
- Modify: `package.json` scripts and dev dependencies.
- Modify: `pnpm-lock.yaml` after dependency removal.
- Modify: `README.md` only if command examples need to reflect Vite+ script usage.

## Task 1: Add Central Vite+ Config

**Files:**

- Create: `vite.config.ts`
- Delete: `vitest.config.ts`

- [ ] **Step 1: Create `vite.config.ts`**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["repos/**", "node_modules/**", "dist/**"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  pack: {
    entry: ["src/Main.ts"],
    format: ["esm"],
    platform: "node",
  },
});
```

- [ ] **Step 2: Delete old Vitest config**

Delete `vitest.config.ts` after confirming the same `include` and `exclude` rules are present in `vite.config.ts`.

- [ ] **Step 3: Verify Vite+ sees the config**

Run:

```sh
pnpm exec vp check
```

Expected: PASS with formatting and lint clean.

## Task 2: Route Package Scripts Through Vite+

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Update scripts**

Change `package.json` scripts to:

```json
{
  "scripts": {
    "typecheck": "vp check --no-fmt --no-lint",
    "test": "vp test",
    "dev": "vp exec tsx src/Main.ts",
    "start": "node dist/Main.mjs",
    "build": "vp pack"
  }
}
```

Keep `start` as `node dist/Main.mjs` because it runs the already-built artifact rather than invoking a toolchain step.

- [ ] **Step 2: Verify script behavior**

Run:

```sh
pnpm run build
```

Expected: Vite+ runs `vp pack` and writes `dist/Main.mjs`.

Run:

```sh
pnpm run typecheck
```

Expected: Vite+ static type check path runs successfully.

## Task 3: Remove Obsolete Tool Dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove direct tools replaced by Vite+**

Run:

```sh
pnpm remove vitest tsdown
```

Expected: `vitest` and `tsdown` are removed from direct `devDependencies`; lockfile updates.

- [ ] **Step 2: Decide whether `tsx` remains necessary**

Run:

```sh
pnpm exec vp exec tsx --version
```

Expected: If this succeeds without `tsx` as a direct dev dependency, remove `tsx` too:

```sh
pnpm remove tsx
```

If it fails because `tsx` is not supplied by Vite+, keep `tsx` as a direct dev dependency because `dev` still needs it.

- [ ] **Step 3: Keep required dependencies**

Do not remove:

```text
vite-plus
typescript
@effect/vitest
```

`vite-plus` is the local project package required by Vite+. `typescript` is still part of project type tooling. `@effect/vitest` is still used by tests.

## Task 4: Validate Vite+ Commands And Known Test Issue

**Files:**

- Modify: `package.json` only if scripts need adjustment after validation

- [ ] **Step 1: Run check**

Run:

```sh
pnpm exec vp check
```

Expected: PASS.

- [ ] **Step 2: Run package scripts**

Run:

```sh
pnpm run typecheck
pnpm run build
```

Expected: Both pass through Vite+.

- [ ] **Step 3: Run Vite+ tests**

Run:

```sh
pnpm exec vp test
```

Expected: If the current known `@effect/vitest` / Vite+ `describe.config` failure still occurs, document it in the final summary and keep `pnpm test` behavior aligned with Vite+ anyway. If Vite+ now works after global install/config migration, it should pass.

- [ ] **Step 4: Run fallback project tests if `vp test` still fails**

Run:

```sh
pnpm exec vitest run
```

Expected: If `vitest` is no longer directly installed, use `pnpm exec vp exec vitest run` only if available. Otherwise report that Vite+ test is the authoritative script and the known Vite+ test issue remains unresolved.

## Task 5: Update README If Needed

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Ensure setup commands mention Vite+**

If README still says `pnpm install`, change setup to:

````md
Install dependencies:

```sh
vp install
```
````

````

- [ ] **Step 2: Keep daemon examples script-compatible**

Keep:

```sh
pnpm dev -- daemon
````

or change to Vite+ native form if validated:

```sh
vp run dev -- daemon
```

Use whichever command actually works after script migration.

## Task 6: Final Verification

**Files:**

- All changed files

- [ ] **Step 1: Run final checks**

Run:

```sh
pnpm exec vp check
pnpm run typecheck
pnpm run build
node dist/Main.mjs --help
```

Expected: all pass.

- [ ] **Step 2: Run tests and record status**

Run:

```sh
pnpm run test
```

Expected: If Vite+ test now passes, report pass. If it still fails with the known `describe.config` issue, report that exact failure and whether it also reproduces on `main`.
