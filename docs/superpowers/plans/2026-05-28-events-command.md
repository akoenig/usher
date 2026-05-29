# Events Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `usher events` so operators can read and follow audit events through the local admin API with `tail`-like `-n` and `-f` semantics.

**Architecture:** Extend the application-owned `AuditLog` port from write-only to read/write, keep SQLite access inside the daemon, expose `GET /events` as a local admin endpoint, and extend the CLI admin client plus top-level command. Follow mode polls the admin API every second using the last printed sequence cursor.

**Tech Stack:** TypeScript, Effect, Effect Schema, Effect CLI, Effect Platform HTTP, @effect/sql SQLite, @effect/vitest, Vite+ via `pnpm`/`vp`.

---

## File Structure

- Modify `src/Application/Ports/AuditLog.ts`: define event schemas and add `readRecent` / `readAfter` methods to the `AuditLog` service tag.
- Modify `src/Infrastructure/Persistence/Sqlite/Migrations.ts`: add an audit sequence migration for stable tail/follow cursors.
- Modify `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts`: populate `audit_sequence`, read latest events, and read events after a sequence.
- Modify `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts`: cover persistence read ordering and cursor behavior.
- Modify `src/Infrastructure/Http/HttpServer.ts`: add admin-only `GET /events` endpoint and query parsing.
- Modify `src/Infrastructure/Http/HttpServer.spec.ts`: verify events endpoint response and admin access.
- Modify `src/Infrastructure/Cli/AdminApiClient.ts`: add event list decoding and request path helpers.
- Modify `src/Infrastructure/Cli/AdminApiClient.spec.ts`: cover client decoding and path/query construction.
- Create `src/Infrastructure/Cli/EventFormatting.ts`: format audit events as stable human-readable lines.
- Create `src/Infrastructure/Cli/EventFormatting.spec.ts`: cover allowed, denied, and empty formatting.
- Modify `src/Infrastructure/Cli/UsherCli.ts`: add top-level `events` command with `-n` and `-f` options.
- Modify `src/Infrastructure/Cli/UsherCli.spec.ts`: verify the command tree includes `events`.
- Modify `README.md`: add `usher events` to quick reference and document the basic command.

### Task 1: Application Event Contract

**Files:**

- Modify: `src/Application/Ports/AuditLog.ts`

- [ ] **Step 1: Replace the port schema with readable event schemas**

Update `src/Application/Ports/AuditLog.ts` to include `AuditEventName`, `AuditEventSequence`, `AuditEvent`, `AuditEventReadOptions`, and read methods. Preserve the existing `AuditRecord` fields so current writers still compile.

```ts
import { Context, Effect, Schema } from "effect";
import { CredentialId } from "../../Domain/Credentials/Credential.js";

const NonEmptyString = Schema.String.pipe(Schema.nonEmptyString());

export const AuditOutcome = Schema.Literal("allowed", "denied", "error");
export type AuditOutcome = Schema.Schema.Type<typeof AuditOutcome>;

export const AuditEventName = Schema.Literal("OutboundCallCompleted");
export type AuditEventName = Schema.Schema.Type<typeof AuditEventName>;

export const AuditEventSequence = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));
export type AuditEventSequence = Schema.Schema.Type<typeof AuditEventSequence>;

export const AuditRecord = Schema.Struct({
  timestamp: NonEmptyString,
  sourceIp: NonEmptyString,
  userAgent: NonEmptyString,
  method: NonEmptyString,
  targetUrl: NonEmptyString,
  matchedCredentialId: Schema.optional(CredentialId),
  upstreamStatus: Schema.optional(Schema.Number),
  errorCode: Schema.optional(NonEmptyString),
  outcome: AuditOutcome,
});
export type AuditRecord = Schema.Schema.Type<typeof AuditRecord>;

export const AuditEvent = Schema.Struct({
  sequence: AuditEventSequence,
  event: AuditEventName,
  timestamp: NonEmptyString,
  sourceIp: NonEmptyString,
  userAgent: NonEmptyString,
  method: NonEmptyString,
  targetUrl: NonEmptyString,
  matchedCredentialId: Schema.optional(CredentialId),
  upstreamStatus: Schema.optional(Schema.Number),
  errorCode: Schema.optional(NonEmptyString),
  outcome: AuditOutcome,
});
export type AuditEvent = Schema.Schema.Type<typeof AuditEvent>;

export const AuditEventReadOptions = Schema.Struct({
  limit: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});
export type AuditEventReadOptions = Schema.Schema.Type<typeof AuditEventReadOptions>;

export class AuditLog extends Context.Tag("AuditLog")<
  AuditLog,
  {
    readonly record: (record: AuditRecord) => Effect.Effect<void>;
    readonly readRecent: (
      options: AuditEventReadOptions,
    ) => Effect.Effect<ReadonlyArray<AuditEvent>>;
    readonly readAfter: (sequence: AuditEventSequence) => Effect.Effect<ReadonlyArray<AuditEvent>>;
  }
>() {}
```

- [ ] **Step 2: Run typecheck to surface implementation gaps**

Run: `pnpm typecheck`

Expected: FAIL because test layers and SQLite `AuditLog` implementations do not yet provide `readRecent` and `readAfter`.

### Task 2: SQLite Audit Event Reads

**Files:**

- Modify: `src/Infrastructure/Persistence/Sqlite/Migrations.ts`
- Modify: `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts`
- Modify: `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts`

- [ ] **Step 1: Add failing persistence tests**

Extend `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts` with tests for recent reads and cursor reads.

```ts
it.scoped("reads the latest events oldest-to-newest within the selected tail", () =>
  Effect.gen(function* () {
    const result = yield* Effect.provide(
      Effect.gen(function* () {
        const auditLog = yield* AuditLog;

        yield* runSqliteMigrations;
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:00.000Z", "https://api.example.com/v1/one"),
        );
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:01.000Z", "https://api.example.com/v1/two"),
        );
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:02.000Z", "https://api.example.com/v1/three"),
        );

        return yield* auditLog.readRecent({ limit: 2 });
      }),
      makeTestLayer,
    );

    assert.deepStrictEqual(
      result.map((event) => event.targetUrl),
      ["https://api.example.com/v1/two", "https://api.example.com/v1/three"],
    );
    assert.strictEqual(result[0]?.event, "OutboundCallCompleted");
    assert.strictEqual(result[0]?.sequence, 2);
    assert.strictEqual(result[1]?.sequence, 3);
  }),
);

it.scoped("reads events after a sequence cursor", () =>
  Effect.gen(function* () {
    const result = yield* Effect.provide(
      Effect.gen(function* () {
        const auditLog = yield* AuditLog;

        yield* runSqliteMigrations;
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:00.000Z", "https://api.example.com/v1/one"),
        );
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:01.000Z", "https://api.example.com/v1/two"),
        );
        yield* auditLog.record(
          auditRecord("2026-05-27T00:00:02.000Z", "https://api.example.com/v1/three"),
        );

        return yield* auditLog.readAfter(1);
      }),
      makeTestLayer,
    );

    assert.deepStrictEqual(
      result.map((event) => event.sequence),
      [2, 3],
    );
  }),
);
```

Add this helper near the bottom of the same spec file:

```ts
function auditRecord(timestamp: string, targetUrl: string) {
  return {
    timestamp,
    sourceIp: "203.0.113.10",
    userAgent: "usher-test/1.0",
    method: "GET",
    targetUrl,
    matchedCredentialId: "cred_0123456789abcdef",
    upstreamStatus: 200,
    outcome: "allowed",
  };
}
```

- [ ] **Step 2: Run persistence tests to verify failure**

Run: `pnpm test src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts`

Expected: FAIL because `readRecent`, `readAfter`, and `audit_sequence` persistence behavior are not implemented.

- [ ] **Step 3: Add the migration**

In `src/Infrastructure/Persistence/Sqlite/Migrations.ts`, add constants after the existing migration constants:

```ts
const auditLogSequenceMigrationId = 20260528130000;
const auditLogSequenceMigrationName = "audit_log_sequence";
```

Append this migration tuple after the OAuth state migration tuple in the loader array:

```ts
    Data.tuple(
      auditLogSequenceMigrationId,
      auditLogSequenceMigrationName,
      Effect.succeed(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;

          yield* sql`ALTER TABLE audit_logs ADD COLUMN audit_sequence INTEGER`;
          yield* sql`UPDATE audit_logs SET audit_sequence = rowid WHERE audit_sequence IS NULL`;
          yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_audit_sequence_idx ON audit_logs (audit_sequence)`;
        }),
      ),
    ),
```

- [ ] **Step 4: Implement SQLite read/write sequence behavior**

Update `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts` to import `AuditEvent` and `AuditEventSequence`, insert `audit_sequence`, and implement read methods.

```ts
import { randomBytes } from "node:crypto";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Schema } from "effect";
import {
  AuditEvent,
  AuditEventSequence,
  AuditLog,
  AuditRecord,
} from "../../../Application/Ports/AuditLog.js";

const AuditEventRow = Schema.Struct({
  sequence: Schema.Number,
  timestamp: Schema.String,
  sourceIp: Schema.String,
  userAgent: Schema.String,
  method: Schema.String,
  targetUrl: Schema.String,
  matchedCredentialId: Schema.NullOr(Schema.String),
  upstreamStatus: Schema.NullOr(Schema.Number),
  errorCode: Schema.NullOr(Schema.String),
  outcome: Schema.String,
});

export const AuditLogSqlite = Layer.effect(
  AuditLog,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      record: (auditRecord: AuditRecord) =>
        Schema.decodeUnknown(AuditRecord)(auditRecord).pipe(
          Effect.flatMap(
            (record) => sql`INSERT INTO audit_logs (
          audit_log_id,
          audit_sequence,
          event_type,
          subject,
          metadata_json,
          source_ip,
          user_agent,
          method,
          target_url,
          matched_credential_id,
          upstream_status,
          error_code,
          outcome,
          created_at
        ) VALUES (
          ${generateAuditLogId()},
          (SELECT COALESCE(MAX(audit_sequence), 0) + 1 FROM audit_logs),
          ${record.outcome},
          ${record.targetUrl},
          ${JSON.stringify({})},
          ${record.sourceIp},
          ${record.userAgent},
          ${record.method},
          ${record.targetUrl},
          ${record.matchedCredentialId},
          ${record.upstreamStatus},
          ${record.errorCode},
          ${record.outcome},
          ${record.timestamp}
        )`,
          ),
          Effect.asVoid,
          Effect.orDie,
        ),
      readRecent: ({ limit }) =>
        sql<unknown>`SELECT * FROM (
          SELECT
            audit_sequence AS sequence,
            created_at AS timestamp,
            source_ip AS sourceIp,
            user_agent AS userAgent,
            method,
            target_url AS targetUrl,
            matched_credential_id AS matchedCredentialId,
            upstream_status AS upstreamStatus,
            error_code AS errorCode,
            outcome
          FROM audit_logs
          WHERE audit_sequence IS NOT NULL
          ORDER BY audit_sequence DESC
          LIMIT ${limit}
        ) ORDER BY sequence ASC`.pipe(Effect.flatMap(decodeRows), Effect.orDie),
      readAfter: (sequence: AuditEventSequence) =>
        sql<unknown>`SELECT
          audit_sequence AS sequence,
          created_at AS timestamp,
          source_ip AS sourceIp,
          user_agent AS userAgent,
          method,
          target_url AS targetUrl,
          matched_credential_id AS matchedCredentialId,
          upstream_status AS upstreamStatus,
          error_code AS errorCode,
          outcome
        FROM audit_logs
        WHERE audit_sequence > ${sequence}
        ORDER BY audit_sequence ASC`.pipe(Effect.flatMap(decodeRows), Effect.orDie),
    };
  }),
);

function decodeRows(rows: ReadonlyArray<unknown>) {
  return Effect.forEach(rows, decodeRow);
}

function decodeRow(row: unknown) {
  return Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknown(AuditEventRow)(row);

    return yield* Schema.decodeUnknown(AuditEvent)({
      sequence: decoded.sequence,
      event: "OutboundCallCompleted",
      timestamp: decoded.timestamp,
      sourceIp: decoded.sourceIp,
      userAgent: decoded.userAgent,
      method: decoded.method,
      targetUrl: decoded.targetUrl,
      ...(decoded.matchedCredentialId === null
        ? {}
        : { matchedCredentialId: decoded.matchedCredentialId }),
      ...(decoded.upstreamStatus === null ? {} : { upstreamStatus: decoded.upstreamStatus }),
      ...(decoded.errorCode === null ? {} : { errorCode: decoded.errorCode }),
      outcome: decoded.outcome,
    });
  });
}

function generateAuditLogId() {
  return `audit_${randomBytes(18).toString("base64url")}`;
}
```

- [ ] **Step 5: Run persistence tests**

Run: `pnpm test src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit persistence work**

Run:

```sh
git add src/Application/Ports/AuditLog.ts src/Infrastructure/Persistence/Sqlite/Migrations.ts src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.spec.ts
git commit -m "feat: read audit events from sqlite"
```

Expected: commit succeeds.

### Task 3: Admin Events API

**Files:**

- Modify: `src/Infrastructure/Http/HttpServer.ts`
- Modify: `src/Infrastructure/Http/HttpServer.spec.ts`
- Modify test support layers that provide `AuditLog` if typecheck identifies them.

- [ ] **Step 1: Add failing HTTP tests**

In `src/Infrastructure/Http/HttpServer.spec.ts`, add tests that provide an `AuditLog` test service and call `GET /events`.

```ts
it.effect("serves audit events through the admin API", () =>
  Effect.gen(function* () {
    const events = [
      {
        sequence: 1,
        event: "OutboundCallCompleted",
        timestamp: "2026-05-28T12:10:03.120Z",
        outcome: "allowed",
        method: "GET",
        targetUrl: "https://api.example.com/v1/users",
        upstreamStatus: 200,
        matchedCredentialId: "cred_0123456789abcdef",
        sourceIp: "127.0.0.1",
        userAgent: "curl/8.0",
      },
    ];

    const response = yield* executeTestRequest(
      HttpClientRequest.get("/events?limit=10"),
      testLayerWithAuditLog({
        record: () => Effect.void,
        readRecent: () => Effect.succeed(events),
        readAfter: () => Effect.succeed([]),
      }),
    );
    const body = yield* response.json;

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(body, events);
  }),
);

it.effect("serves audit events after a sequence cursor", () =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<number>>([]);
    const response = yield* executeTestRequest(
      HttpClientRequest.get("/events?after=3"),
      testLayerWithAuditLog({
        record: () => Effect.void,
        readRecent: () => Effect.succeed([]),
        readAfter: (sequence) =>
          Ref.update(seen, (values) => [...values, sequence]).pipe(Effect.as([])),
      }),
    );
    const sequences = yield* Ref.get(seen);

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(sequences, [3]);
  }),
);
```

Adapt the helper names to the existing `HttpServer.spec.ts` helpers. The important assertion is that `limit` calls `readRecent` and `after` calls `readAfter`.

- [ ] **Step 2: Run HTTP tests to verify failure**

Run: `pnpm test src/Infrastructure/Http/HttpServer.spec.ts`

Expected: FAIL because `/events` is not routed.

- [ ] **Step 3: Implement `GET /events` route**

In `src/Infrastructure/Http/HttpServer.ts`, import `AuditLog` and add the route inside `makeHttpApp`:

```ts
import { AuditLog } from "../../Application/Ports/AuditLog.js";
```

```ts
    HttpRouter.get("/events", admin(config, listEvents)),
```

Update the `admin` handler environment union to include `AuditLog`.

Add this handler near the credential handlers:

```ts
function listEvents() {
  return Effect.gen(function* () {
    const params = yield* HttpServerRequest.schemaSearchParams(
      Schema.Struct({
        limit: Schema.optional(
          Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
        ),
        after: Schema.optional(
          Schema.NumberFromString.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
        ),
      }),
    );
    const auditLog = yield* AuditLog;
    const events =
      params.after === undefined
        ? yield* auditLog.readRecent({ limit: params.limit ?? 10 })
        : yield* auditLog.readAfter(params.after);

    return yield* HttpServerResponse.json(events);
  });
}
```

- [ ] **Step 4: Run HTTP tests**

Run: `pnpm test src/Infrastructure/Http/HttpServer.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck and fix test layers**

Run: `pnpm typecheck`

Expected: FAIL only where test `AuditLog` services still lack read methods. Add these methods to each test service:

```ts
readRecent: () => Effect.succeed([]),
readAfter: () => Effect.succeed([]),
```

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit admin API work**

Run:

```sh
git add src/Infrastructure/Http/HttpServer.ts src/Infrastructure/Http/HttpServer.spec.ts src/Application src/Infrastructure
git commit -m "feat: expose audit events admin endpoint"
```

Expected: commit succeeds with only intended files staged.

### Task 4: Admin API Client Event Reads

**Files:**

- Modify: `src/Infrastructure/Cli/AdminApiClient.ts`
- Modify: `src/Infrastructure/Cli/AdminApiClient.spec.ts`

- [ ] **Step 1: Add failing client tests**

In `src/Infrastructure/Cli/AdminApiClient.spec.ts`, add path helper tests and a decode test.

```ts
it("builds event paths", () => {
  assert.strictEqual(adminEventsPath({ limit: 10 }), "/events?limit=10");
  assert.strictEqual(adminEventsPath({ after: 3 }), "/events?after=3");
});

it.effect("listEvents decodes a JSON array from GET /events", () =>
  Effect.gen(function* () {
    const client = makeAdminApiClient(
      "http://admin.example.test",
      () =>
        Effect.succeed({
          status: 200,
          json: Effect.succeed([auditEvent]),
        }),
      () => Effect.die("unused"),
    );

    const events = yield* Effect.gen(function* () {
      const adminApiClient = yield* AdminApiClient;

      return yield* adminApiClient.listEvents({ limit: 10 });
    }).pipe(Effect.provideService(AdminApiClient, client));

    assert.deepStrictEqual(events, [auditEvent]);
  }),
);
```

Add fixture:

```ts
const auditEvent = {
  sequence: 1,
  event: "OutboundCallCompleted",
  timestamp: "2026-05-28T12:10:03.120Z",
  outcome: "allowed",
  method: "GET",
  targetUrl: "https://api.example.com/v1/users",
  upstreamStatus: 200,
  matchedCredentialId: "cred_0123456789abcdef",
  sourceIp: "127.0.0.1",
  userAgent: "curl/8.0",
};
```

- [ ] **Step 2: Run client tests to verify failure**

Run: `pnpm test src/Infrastructure/Cli/AdminApiClient.spec.ts`

Expected: FAIL because `adminEventsPath` and `listEvents` do not exist.

- [ ] **Step 3: Implement client schema and method**

In `src/Infrastructure/Cli/AdminApiClient.ts`, import `AuditEvent` and `AuditEventSequence`:

```ts
import { AuditEvent, AuditEventSequence } from "../../Application/Ports/AuditLog.js";
```

Add schema and request option schema:

```ts
const AuditEvents = Schema.Array(AuditEvent);

export const AdminEventsRequest = Schema.Union(
  Schema.Struct({ limit: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)) }),
  Schema.Struct({ after: AuditEventSequence }),
);
export type AdminEventsRequest = Schema.Schema.Type<typeof AdminEventsRequest>;
```

Extend the `AdminApiClient` service:

```ts
    readonly listEvents: (
      input: AdminEventsRequest,
    ) => Effect.Effect<ReadonlyArray<AuditEvent>, AdminApiClientError>;
```

Add method in `makeAdminApiClient`:

```ts
    listEvents: (input) =>
      executeJson(
        executeJsonRequest,
        request(HttpClientRequest.get(adminEventsPath(input)), baseUrl),
        AuditEvents,
      ),
```

Add exported path helper:

```ts
export function adminEventsPath(input: AdminEventsRequest) {
  if ("after" in input) {
    return `/events?after=${input.after}`;
  }

  return `/events?limit=${input.limit}`;
}
```

- [ ] **Step 4: Run client tests**

Run: `pnpm test src/Infrastructure/Cli/AdminApiClient.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit client work**

Run:

```sh
git add src/Infrastructure/Cli/AdminApiClient.ts src/Infrastructure/Cli/AdminApiClient.spec.ts
git commit -m "feat: add admin client events reader"
```

Expected: commit succeeds.

### Task 5: CLI Formatting

**Files:**

- Create: `src/Infrastructure/Cli/EventFormatting.ts`
- Create: `src/Infrastructure/Cli/EventFormatting.spec.ts`

- [ ] **Step 1: Add formatter tests**

Create `src/Infrastructure/Cli/EventFormatting.spec.ts`:

```ts
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { formatEvent, formatEvents } from "./EventFormatting.js";

describe("EventFormatting", () => {
  it("formats an allowed outbound call event", () => {
    assert.strictEqual(
      formatEvent({
        sequence: 1,
        event: "OutboundCallCompleted",
        timestamp: "2026-05-28T12:10:03.120Z",
        outcome: "allowed",
        method: "GET",
        targetUrl: "https://api.example.com/v1/users",
        upstreamStatus: 200,
        matchedCredentialId: "cred_0123456789abcdef",
        sourceIp: "127.0.0.1",
        userAgent: "curl/8.0",
      }),
      "OutboundCallCompleted 2026-05-28T12:10:03.120Z allowed GET https://api.example.com/v1/users 200 - cred_0123456789abcdef 127.0.0.1 curl/8.0",
    );
  });

  it("formats a denied outbound call event", () => {
    assert.strictEqual(
      formatEvent({
        sequence: 2,
        event: "OutboundCallCompleted",
        timestamp: "2026-05-28T12:11:44.812Z",
        outcome: "denied",
        method: "POST",
        targetUrl: "https://api.example.com/v1/admin",
        errorCode: "NoMatchingCredentialError",
        sourceIp: "127.0.0.1",
        userAgent: "curl/8.0",
      }),
      "OutboundCallCompleted 2026-05-28T12:11:44.812Z denied POST https://api.example.com/v1/admin - NoMatchingCredentialError - 127.0.0.1 curl/8.0",
    );
  });

  it("formats an empty event list as an empty string", () => {
    assert.strictEqual(formatEvents([]), "");
  });
});
```

- [ ] **Step 2: Run formatter tests to verify failure**

Run: `pnpm test src/Infrastructure/Cli/EventFormatting.spec.ts`

Expected: FAIL because `EventFormatting.ts` does not exist.

- [ ] **Step 3: Implement formatter**

Create `src/Infrastructure/Cli/EventFormatting.ts`:

```ts
import type { AuditEvent } from "../../Application/Ports/AuditLog.js";

export function formatEvents(events: ReadonlyArray<AuditEvent>) {
  return events.map(formatEvent).join("\n");
}

export function formatEvent(event: AuditEvent) {
  return [
    event.event,
    event.timestamp,
    event.outcome,
    event.method,
    event.targetUrl,
    event.upstreamStatus?.toString() ?? "-",
    event.errorCode ?? "-",
    event.matchedCredentialId ?? "-",
    event.sourceIp,
    event.userAgent,
  ].join(" ");
}
```

- [ ] **Step 4: Run formatter tests**

Run: `pnpm test src/Infrastructure/Cli/EventFormatting.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit formatter work**

Run:

```sh
git add src/Infrastructure/Cli/EventFormatting.ts src/Infrastructure/Cli/EventFormatting.spec.ts
git commit -m "feat: format audit events for cli"
```

Expected: commit succeeds.

### Task 6: `usher events` Command

**Files:**

- Modify: `src/Infrastructure/Cli/UsherCli.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts`

- [ ] **Step 1: Add command tree test**

Update `src/Infrastructure/Cli/UsherCli.spec.ts` command tree test to assert top-level `events` exists:

```ts
assert.assertTrue(HashMap.has(usherSubcommands, "events"));
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run: `pnpm test src/Infrastructure/Cli/UsherCli.spec.ts`

Expected: FAIL because `events` is not registered.

- [ ] **Step 3: Add command options and implementation**

In `src/Infrastructure/Cli/UsherCli.ts`, update imports:

```ts
import { Args, Command, Options } from "@effect/cli";
import { Effect, Layer, Option, Schema } from "effect";
import { formatEvents } from "./EventFormatting.js";
```

Add options near `credentialIdArg`:

```ts
const eventLimitOption = Options.integer("n").pipe(Options.withDefault(10));
const eventFollowOption = Options.boolean("f", { ifPresent: true });
```

Add helpers near `withLocalAdminClient`:

```ts
const eventsCommand = Command.make(
  "events",
  { limit: eventLimitOption, follow: eventFollowOption },
  ({ limit, follow }) =>
    withLocalAdminClient(
      Effect.gen(function* () {
        const client = yield* AdminApiClient;
        const initialEvents = yield* client.listEvents({ limit });

        yield* printEvents(initialEvents);

        if (!follow) {
          return;
        }

        yield* followEvents(lastSequence(initialEvents));
      }),
    ),
);

function printEvents(
  events: ReadonlyArray<import("../../Application/Ports/AuditLog.js").AuditEvent>,
) {
  const output = formatEvents(events);

  if (output === "") {
    return Effect.void;
  }

  return Console.log(output);
}

function followEvents(initialSequence: Option.Option<number>) {
  return Effect.gen(function* () {
    const client = yield* AdminApiClient;
    let cursor = initialSequence;

    while (true) {
      yield* Effect.sleep("1 second");

      if (Option.isNone(cursor)) {
        const events = yield* client.listEvents({ limit: 10 });
        yield* printEvents(events);
        cursor = lastSequence(events);
        continue;
      }

      const events = yield* client.listEvents({ after: cursor.value });
      yield* printEvents(events);
      const nextCursor = lastSequence(events);

      if (Option.isSome(nextCursor)) {
        cursor = nextCursor;
      }
    }
  });
}

function lastSequence(
  events: ReadonlyArray<import("../../Application/Ports/AuditLog.js").AuditEvent>,
) {
  const last = events[events.length - 1];

  if (last === undefined) {
    return Option.none<number>();
  }

  return Option.some(last.sequence);
}
```

Register the command:

```ts
export const usherCommand = Command.make("usher").pipe(
  Command.withSubcommands([daemonCommand, credentialsCommand, eventsCommand]),
);
```

- [ ] **Step 4: Replace inline import types with normal imports if typecheck requires it**

If the inline `import("...").AuditEvent` type makes the file harder to read or fails linting, add a normal type import at the top:

```ts
import type { AuditEvent } from "../../Application/Ports/AuditLog.js";
```

Then change helper signatures to:

```ts
function printEvents(events: ReadonlyArray<AuditEvent>) {
```

```ts
function lastSequence(events: ReadonlyArray<AuditEvent>) {
```

- [ ] **Step 5: Run CLI tests and typecheck**

Run: `pnpm test src/Infrastructure/Cli/UsherCli.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit command work**

Run:

```sh
git add src/Infrastructure/Cli/UsherCli.ts src/Infrastructure/Cli/UsherCli.spec.ts
git commit -m "feat: add events cli command"
```

Expected: commit succeeds.

### Task 7: README Documentation

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README command sections**

Add this paragraph after the credential management command list around lines 102-108:

````md
Read recent audit events:

```sh
usher events
usher events -n 50
usher events -f
```
````

Add `usher events` to the Quick Reference command block:

```sh
usher events
usher events -n 50 -f
```

Add endpoint reference:

```http
GET    /events
```

- [ ] **Step 2: Run README-focused checks**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Commit README work**

Run:

```sh
git add README.md
git commit -m "docs: document events command"
```

Expected: commit succeeds.

### Task 8: Full Verification

**Files:**

- No source edits unless verification finds a real issue.

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run Vite+ check if time permits**

Run: `vp check`

Expected: PASS.

- [ ] **Step 4: Inspect final git status**

Run: `git status --short`

Expected: clean working tree.

- [ ] **Step 5: Push implementation commits when approved**

Run:

```sh
git push origin main
```

Expected: push succeeds.
