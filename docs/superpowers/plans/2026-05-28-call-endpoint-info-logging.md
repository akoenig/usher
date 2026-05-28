# Call Endpoint Info Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add INFO logging for accepted `/call` requests with user agent, source IP, method, and target URL in the approved order.

**Architecture:** Keep logging in the existing infrastructure HTTP route because it already owns transport metadata and target URL parsing. Emit exactly one `Effect.logInfo` after access control and target URL validation, before body extraction and `CallService.call`.

**Tech Stack:** TypeScript, Effect, Effect Platform HTTP, `@effect/vitest`, Vite+ via `vp`, `pnpm` scripts.

---

## File Structure

- Modify `src/Infrastructure/Http/HttpServer.ts`: add a small user-agent fallback helper and emit the INFO log in the `/call` handler.
- Modify `src/Infrastructure/Http/HttpServer.spec.ts`: add one focused Effect logger test for successful `/call` logging.
- Reference `docs/superpowers/specs/2026-05-28-call-endpoint-info-logging-design.md`: approved design and scope.
- Preserve `docs/superpowers/plans/2026-05-28-call-endpoint-info-logging.md` in any implementation worktree before changing code.

### Task 1: `/call` INFO Log

**Files:**

- Modify: `src/Infrastructure/Http/HttpServer.spec.ts`
- Modify: `src/Infrastructure/Http/HttpServer.ts`

- [ ] **Step 1: Copy design and plan into the implementation worktree if using one**

Run from the implementation worktree root after creating or entering the worktree:

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /home/opencode-astra/workspaces/usher/docs/superpowers/specs/2026-05-28-call-endpoint-info-logging-design.md docs/superpowers/specs/2026-05-28-call-endpoint-info-logging-design.md
cp /home/opencode-astra/workspaces/usher/docs/superpowers/plans/2026-05-28-call-endpoint-info-logging.md docs/superpowers/plans/2026-05-28-call-endpoint-info-logging.md
```

Expected: both files exist under the implementation worktree and will be included with the code changes.

- [ ] **Step 2: Write the failing log test**

In `src/Infrastructure/Http/HttpServer.spec.ts`, update the import from `effect`:

```ts
import { Effect, Layer, LogLevel, Logger, Option, Ref } from "effect";
```

Add this test after the existing successful `/call` forwarding test:

```ts
it.effect("logs accepted call requests as info with ordered request metadata", () =>
  Effect.gen(function* () {
    const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
    const logs = yield* Ref.make<ReadonlyArray<string>>([]);
    const logger = Logger.make((options) =>
      Ref.update(logs, (existing) => [...existing, String(options.message)]),
    );

    return yield* Effect.gen(function* () {
      yield* HttpServer.serveEffect(
        makeHttpApp({
          allowedCallerIps: ["203.0.113.10"],
          baseUrl: "https://usher.example.com",
          peerAddressProvider: () => "203.0.113.10",
        }),
      );
      const response = yield* HttpClientRequest.post(
        "/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers",
      ).pipe(HttpClientRequest.setHeader("user-agent", "usher-test"), HttpClient.execute);
      const capturedLogs = yield* Ref.get(logs);

      assert.strictEqual(response.status, 202);
      assert.deepStrictEqual(capturedLogs, [
        "usher-test (203.0.113.10) POST https://api.example.com/v1/users",
      ]);
    }).pipe(
      Effect.scoped,
      Effect.provide(makeTestLayer(commands, "success")),
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
      Logger.withMinimumLogLevel(LogLevel.Info),
    );
  }),
);
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
pnpm test src/Infrastructure/Http/HttpServer.spec.ts
```

Expected: FAIL. The new test should fail because no INFO log is emitted, with the captured log array empty instead of containing `usher-test (203.0.113.10) POST https://api.example.com/v1/users`.

- [ ] **Step 4: Add the minimal `/call` log implementation**

In `src/Infrastructure/Http/HttpServer.ts`, keep the existing imports unchanged except the existing `Effect` import already available from `effect`.

Add this line in `call(config)` immediately after the missing-target-url guard and before resolving `CallService`:

```ts
yield *
  Effect.logInfo(`${userAgentFrom(request.headers)} (${sourceIp}) ${request.method} ${targetUrl}`);
```

The block should look like this:

```ts
const targetUrl = targetUrlFrom(request.url);
if (targetUrl === undefined) {
  return yield * errorResponse(MissingUrlError.make(), 400);
}

yield *
  Effect.logInfo(`${userAgentFrom(request.headers)} (${sourceIp}) ${request.method} ${targetUrl}`);

const service = yield * CallService;
```

Add this helper near `targetUrlFrom`:

```ts
function userAgentFrom(headers: Readonly<Record<string, string>>) {
  return headers["user-agent"] ?? "unknown";
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
pnpm test src/Infrastructure/Http/HttpServer.spec.ts
```

Expected: PASS for `src/Infrastructure/Http/HttpServer.spec.ts`.

- [ ] **Step 6: Run required typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. This satisfies the repository instruction to run typecheck after the implementation turn.

- [ ] **Step 7: Run broader validation**

Run:

```bash
vp test
```

Expected: PASS. If Vite+ reports only the same passing test suite with no changed behavior, continue.

- [ ] **Step 8: Review diff for scope and sensitive data**

Run:

```bash
git diff -- src/Infrastructure/Http/HttpServer.ts src/Infrastructure/Http/HttpServer.spec.ts docs/superpowers/specs/2026-05-28-call-endpoint-info-logging-design.md docs/superpowers/plans/2026-05-28-call-endpoint-info-logging.md AGENTS.md
```

Expected: diff contains only the approved logging change, its test, the design and plan docs, and the AGENTS.md worktree-preservation instruction. Confirm it does not log bodies, authorization headers, credential material, upstream status, or semantic error outcomes.

- [ ] **Step 9: Commit only if explicitly requested**

This environment requires explicit user approval before committing. If the user asks for a commit, run:

```bash
git status --short
git diff
git log --oneline -10
git add AGENTS.md docs/superpowers/specs/2026-05-28-call-endpoint-info-logging-design.md docs/superpowers/plans/2026-05-28-call-endpoint-info-logging.md src/Infrastructure/Http/HttpServer.ts src/Infrastructure/Http/HttpServer.spec.ts
git commit -m "feat: log call endpoint requests"
```

Expected: one commit containing only intended files.

## Self-Review

- Spec coverage: the task implements INFO logging for accepted `/call` requests, the exact field order, `unknown` fallback, no request bodies or secrets, and a focused test.
- Placeholder scan: no placeholders remain; all commands, paths, and expected outputs are explicit.
- Type consistency: `CallCommand`, `makeHttpApp`, `Logger`, `LogLevel`, and `Ref` names match existing imports and Effect APIs used in the repository and vendored Effect tests.
