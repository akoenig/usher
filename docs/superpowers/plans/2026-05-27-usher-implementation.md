# usher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 headless `usher` service from the approved design spec.

**Architecture:** Implement an Effect-first TypeScript service with strict domain/application/infrastructure boundaries. Domain owns credential models and request matching; application owns command DTOs, services, and Context.Tag ports; infrastructure owns SQLite, encryption, OAuth2, HTTP server/client, and filesystem adapters.

**Tech Stack:** TypeScript, Effect, Effect Schema, `@effect/platform`, `@effect/platform-node`, `@effect/sql`, SQLite, `@effect/vitest`, Vite+/`vp`, `pnpm`.

---

## Ground Rules

- Do not edit `repos/effect`; use it only as read-only reference material.
- Do not import from `repos/effect`; import from package dependencies.
- Keep `repos/` out of the repository with a root `.gitignore` entry and never stage vendored reference files.
- Follow `AGENTS.md`: no explicit type casts, no non-null assertions, prefer Effect Schema, use Context.Tag ports, keep tests close as `*.spec.ts`, run `pnpm typecheck` after each implementation turn.
- Use PascalCased directories under `src`.
- Prefer direct `Effect.gen` and small semantic helpers over abstractions.
- Use `@effect/vitest` and `it.effect` for Effect programs.
- Use `vp check` and `vp test` before final completion.

## Files And Responsibilities

- Create `package.json`: package metadata, dependencies, scripts.
- Create `tsconfig.json`: strict TypeScript config.
- Create `src/Domain/Credentials/Credential.ts`: credential schemas, statuses, redacted output schemas.
- Create `src/Domain/Credentials/AllowedRequest.ts`: structured URL matcher schemas and overlap/match functions.
- Create `src/Domain/Errors/UsherErrors.ts`: separate semantic error classes and response schemas.
- Create `src/Application/Ports/CredentialRepository.ts`: Effect service tag for credential persistence.
- Create `src/Application/Ports/SecretVault.ts`: Effect service tag for encryption/decryption.
- Create `src/Application/Ports/OAuth2Client.ts`: Effect service tag for OAuth2 URL and token exchange.
- Create `src/Application/Ports/HttpExecutor.ts`: Effect service tag for upstream HTTP execution.
- Create `src/Application/Ports/AuditLog.ts`: Effect service tag for audit logging.
- Create `src/Application/Services/CredentialService.ts`: create/list/get/delete workflows.
- Create `src/Application/Services/CallService.ts`: request validation, credential resolution, auth injection, execution, audit.
- Create `src/Application/Services/OAuth2Service.ts`: OAuth login state and callback workflows.
- Create `src/Infrastructure/Config/UsherConfig.ts`: runtime config decoding.
- Create `src/Infrastructure/Encryption/KeyFile.ts`: strict key-file loading and permission validation.
- Create `src/Infrastructure/Encryption/NodeSecretVault.ts`: HKDF and authenticated encryption implementation.
- Create `src/Infrastructure/Persistence/Sqlite/Schema.ts`: SQLite table definitions and row schemas.
- Create `src/Infrastructure/Persistence/Sqlite/Migrations.ts`: migrations using `_migrations`.
- Create `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.ts`: repository adapter.
- Create `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts`: audit adapter.
- Create `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`: OAuth2 provider interactions.
- Create `src/Infrastructure/Http/AccessControl.ts`: loopback and call allowlist checks.
- Create `src/Infrastructure/Http/HttpServer.ts`: admin, OAuth, and `/call` routes.
- Create `src/Infrastructure/Http/HttpExecutorLive.ts`: upstream request execution adapter.
- Create `src/Main.ts`: layer composition and process entrypoint.

## Reference Material To Inspect During Implementation

- `repos/effect/packages/platform-node/examples/http-router.ts` for `HttpRouter`, `HttpServer`, and `NodeRuntime` style.
- `repos/effect/packages/platform/test/HttpApiBuilder.test.ts` for Schema usage in platform tests.
- `repos/effect/packages/sql-sqlite-node/src/SqliteClient.ts` and nearby tests for SQLite adapter patterns.
- `repos/effect/packages/vitest/test/index.test.ts` for `@effect/vitest` patterns.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/Main.ts`
- Test: no behavior tests yet

- [ ] **Step 1: Create package metadata and scripts**

Create `package.json` with these scripts and dependencies. Keep versions compatible with the installed lockfile once `vp install` resolves them.

```json
{
  "name": "@akoenig/usher",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "dev": "tsx src/Main.ts",
    "start": "node dist/Main.js",
    "build": "tsdown src/Main.ts --format esm --platform node"
  },
  "dependencies": {
    "@effect/platform": "latest",
    "@effect/platform-node": "latest",
    "@effect/sql": "latest",
    "@effect/sql-sqlite-node": "latest",
    "effect": "latest"
  },
  "devDependencies": {
    "@effect/vitest": "latest",
    "tsx": "latest",
    "tsdown": "latest",
    "typescript": "latest",
    "vite-plus": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create strict TypeScript config**

Create `tsconfig.json`:

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
    "types": ["node", "vitest"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create minimal Effect entrypoint**

Create `src/Main.ts`:

```ts
import { Effect } from "effect"

export const main = Effect.log("usher boot placeholder")
```

- [ ] **Step 4: Install dependencies**

Run: `vp install`

Expected: dependencies install successfully and a lockfile is created or updated.

- [ ] **Step 5: Verify scaffold**

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json src/Main.ts pnpm-lock.yaml
git commit -m "Scaffold Effect service"
```

If Vite+ creates a lockfile or config file during install, include only files generated by the scaffold and install step.

## Task 2: Domain Credential Schemas

**Files:**
- Create: `src/Domain/Credentials/Credential.ts`
- Test: `src/Domain/Credentials/Credential.spec.ts`

- [ ] **Step 1: Write schema tests**

Create `src/Domain/Credentials/Credential.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import { assert } from "@effect/vitest/utils"
import { Schema } from "effect"
import { Credential, CreateCredentialInput } from "./Credential.js"

describe("Credential", () => {
  it("decodes OAuth2 create input", () => {
    const decoded = Schema.decodeUnknownSync(CreateCredentialInput)({
      type: "OAuth2",
      label: "Google Calendar",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } }
      ],
      oauth2: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      }
    })

    assert.strictEqual(decoded.type, "OAuth2")
  })

  it("decodes BearerToken create input", () => {
    const decoded = Schema.decodeUnknownSync(CreateCredentialInput)({
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [
        { url: { origin: "https://api.internal.example.com", pathPrefix: "/" } }
      ],
      bearerToken: { token: "secret-token" }
    })

    assert.strictEqual(decoded.type, "BearerToken")
  })

  it("decodes stored credential status", () => {
    const decoded = Schema.decodeUnknownSync(Credential)({
      credentialId: "cred_0123456789abcdef",
      type: "BearerToken",
      label: "Internal API",
      status: "active",
      allowedRequests: [
        { url: { origin: "https://api.internal.example.com", pathPrefix: "/" } }
      ],
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      bearerToken: { encryptedToken: "encrypted" }
    })

    assert.strictEqual(decoded.status, "active")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Domain/Credentials/Credential.spec.ts`

Expected: FAIL because `Credential.ts` does not exist.

- [ ] **Step 3: Implement credential schemas**

Create `src/Domain/Credentials/Credential.ts`:

```ts
import { Data, Schema } from "effect"

export const CredentialId = Schema.String.pipe(Schema.pattern(/^cred_[A-Za-z0-9_-]{16,}$/))
export const CredentialStatus = Schema.Literal("pending", "active", "error")
export const CredentialType = Schema.Literal("OAuth2", "BearerToken")

export const AllowedRequest = Schema.Struct({
  url: Schema.Struct({
    origin: Schema.String,
    pathPrefix: Schema.String
  })
})

export const OAuth2CreateConfig = Schema.Struct({
  clientId: Schema.String.pipe(Schema.nonEmptyString()),
  clientSecret: Schema.String.pipe(Schema.nonEmptyString()),
  authorizationUrl: Schema.String.pipe(Schema.nonEmptyString()),
  tokenUrl: Schema.String.pipe(Schema.nonEmptyString()),
  scopes: Schema.Array(Schema.String.pipe(Schema.nonEmptyString()))
})

export const BearerTokenCreateConfig = Schema.Struct({
  token: Schema.String.pipe(Schema.nonEmptyString())
})

export const CreateOAuth2CredentialInput = Schema.Struct({
  type: Schema.Literal("OAuth2"),
  label: Schema.String.pipe(Schema.nonEmptyString()),
  allowedRequests: Schema.NonEmptyArray(AllowedRequest),
  oauth2: OAuth2CreateConfig
})

export const CreateBearerTokenCredentialInput = Schema.Struct({
  type: Schema.Literal("BearerToken"),
  label: Schema.String.pipe(Schema.nonEmptyString()),
  allowedRequests: Schema.NonEmptyArray(AllowedRequest),
  bearerToken: BearerTokenCreateConfig
})

export const CreateCredentialInput = Schema.Union(
  CreateOAuth2CredentialInput,
  CreateBearerTokenCredentialInput
)

export const StoredOAuth2Config = Schema.Struct({
  clientId: Schema.String,
  encryptedClientSecret: Schema.String,
  authorizationUrl: Schema.String,
  tokenUrl: Schema.String,
  scopes: Schema.Array(Schema.String),
  grantedScopes: Schema.Array(Schema.String),
  encryptedRefreshToken: Schema.optional(Schema.String)
})

export const StoredBearerTokenConfig = Schema.Struct({
  encryptedToken: Schema.String
})

export const Credential = Schema.Union(
  Schema.Struct({
    credentialId: CredentialId,
    type: Schema.Literal("OAuth2"),
    label: Schema.String,
    status: CredentialStatus,
    allowedRequests: Schema.NonEmptyArray(AllowedRequest),
    createdAt: Schema.String,
    updatedAt: Schema.String,
    oauth2: StoredOAuth2Config
  }),
  Schema.Struct({
    credentialId: CredentialId,
    type: Schema.Literal("BearerToken"),
    label: Schema.String,
    status: CredentialStatus,
    allowedRequests: Schema.NonEmptyArray(AllowedRequest),
    createdAt: Schema.String,
    updatedAt: Schema.String,
    bearerToken: StoredBearerTokenConfig
  })
)

export type CreateCredentialInput = Schema.Schema.Type<typeof CreateCredentialInput>
export type Credential = Schema.Schema.Type<typeof Credential>

export function credentialArray(values: ReadonlyArray<Credential>) {
  return Data.array(values)
}
```

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm test src/Domain/Credentials/Credential.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/Credentials/Credential.ts src/Domain/Credentials/Credential.spec.ts
git commit -m "Add credential domain schemas"
```

## Task 3: Allowed Request Matching

**Files:**
- Create: `src/Domain/Credentials/AllowedRequest.ts`
- Test: `src/Domain/Credentials/AllowedRequest.spec.ts`
- Modify: `src/Domain/Credentials/Credential.ts`

- [ ] **Step 1: Write matching and overlap tests**

Create `src/Domain/Credentials/AllowedRequest.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import { assert } from "@effect/vitest/utils"
import {
  allowedRequestMatches,
  allowedRequestsOverlap,
  normalizeAllowedRequest
} from "./AllowedRequest.js"

describe("AllowedRequest", () => {
  it("matches origin and path prefix", () => {
    const matcher = normalizeAllowedRequest({
      url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" }
    })

    assert.strictEqual(
      allowedRequestMatches(matcher, new URL("https://www.googleapis.com/calendar/v3/users/me")),
      true
    )
  })

  it("does not match sibling path prefixes", () => {
    const matcher = normalizeAllowedRequest({
      url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" }
    })

    assert.strictEqual(
      allowedRequestMatches(matcher, new URL("https://www.googleapis.com/calendar2/v3")),
      false
    )
  })

  it("detects overlapping path prefixes for the same origin", () => {
    const broad = normalizeAllowedRequest({
      url: { origin: "https://www.googleapis.com", pathPrefix: "/" }
    })
    const narrow = normalizeAllowedRequest({
      url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" }
    })

    assert.strictEqual(allowedRequestsOverlap(broad, narrow), true)
  })

  it("does not overlap different origins", () => {
    const calendar = normalizeAllowedRequest({
      url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" }
    })
    const gmail = normalizeAllowedRequest({
      url: { origin: "https://gmail.googleapis.com", pathPrefix: "/" }
    })

    assert.strictEqual(allowedRequestsOverlap(calendar, gmail), false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Domain/Credentials/AllowedRequest.spec.ts`

Expected: FAIL because `AllowedRequest.ts` does not exist.

- [ ] **Step 3: Implement URL matcher functions**

Create `src/Domain/Credentials/AllowedRequest.ts`:

```ts
import * as Predicate from "effect/Predicate"
import { Schema } from "effect"
import { InvalidTargetUrlError } from "../Errors/UsherErrors.js"
import { AllowedRequest } from "./Credential.js"

export type AllowedRequest = Schema.Schema.Type<typeof AllowedRequest>

export function normalizeAllowedRequest(value: AllowedRequest): AllowedRequest {
  const originUrl = new URL(value.url.origin)
  const origin = originUrl.origin
  const pathPrefix = value.url.pathPrefix

  if (originUrl.protocol !== "https:") {
    throw new InvalidTargetUrlError({
      code: "InvalidTargetUrlError",
      message: "Allowed request origin must use https."
    })
  }

  if (!Predicate.startsWith(pathPrefix, "/") || !Predicate.endsWith(pathPrefix, "/")) {
    throw new InvalidTargetUrlError({
      code: "InvalidTargetUrlError",
      message: "Allowed request pathPrefix must start and end with /."
    })
  }

  return { url: { origin, pathPrefix } }
}

export function allowedRequestMatches(matcher: AllowedRequest, targetUrl: URL): boolean {
  return matcher.url.origin === targetUrl.origin && targetUrl.pathname.startsWith(matcher.url.pathPrefix)
}

export function allowedRequestsOverlap(left: AllowedRequest, right: AllowedRequest): boolean {
  if (left.url.origin !== right.url.origin) {
    return false
  }

  return left.url.pathPrefix.startsWith(right.url.pathPrefix) ||
    right.url.pathPrefix.startsWith(left.url.pathPrefix)
}
```

- [ ] **Step 4: Replace duplicated schema export if needed**

If implementation creates schema duplication, keep `AllowedRequest` schema in `Credential.ts` for now and export functions from `AllowedRequest.ts`. Do not introduce a cross-layer dependency.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm test src/Domain/Credentials/AllowedRequest.spec.ts src/Domain/Credentials/Credential.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/Domain/Credentials/AllowedRequest.ts src/Domain/Credentials/AllowedRequest.spec.ts src/Domain/Credentials/Credential.ts
git commit -m "Add allowed request matching"
```

## Task 4: Semantic Error Model

**Files:**
- Create: `src/Domain/Errors/UsherErrors.ts`
- Test: `src/Domain/Errors/UsherErrors.spec.ts`

- [ ] **Step 1: Write semantic error tests**

Create `src/Domain/Errors/UsherErrors.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import { assert } from "@effect/vitest/utils"
import { Schema } from "effect"
import { MissingUserAgentError, NoMatchingCredentialError, toErrorBody, UsherErrorBody } from "./UsherErrors.js"

describe("UsherErrors", () => {
  it("creates PascalCased error bodies with Error suffix", () => {
    const body = toErrorBody(NoMatchingCredentialError.make())
    const decoded = Schema.decodeUnknownSync(UsherErrorBody)(body)

    assert.strictEqual(decoded.error.code, "NoMatchingCredentialError")
  })

  it("keeps errors semantic", () => {
    const error = MissingUserAgentError.make()

    assert.strictEqual(error.code, "MissingUserAgentError")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Domain/Errors/UsherErrors.spec.ts`

Expected: FAIL because file does not exist.

- [ ] **Step 3: Implement semantic error classes**

Create `src/Domain/Errors/UsherErrors.ts`:

```ts
import { Schema } from "effect"

export class NoMatchingCredentialError extends Schema.TaggedError<NoMatchingCredentialError>()("NoMatchingCredentialError", {
  code: Schema.Literal("NoMatchingCredentialError"),
  message: Schema.String
}) {
  static make() {
    return new NoMatchingCredentialError({
      code: "NoMatchingCredentialError",
      message: "No credential allows requests to this URL."
    })
  }
}

export class MissingUserAgentError extends Schema.TaggedError<MissingUserAgentError>()("MissingUserAgentError", {
  code: Schema.Literal("MissingUserAgentError"),
  message: Schema.String
}) {
  static make() {
    return new MissingUserAgentError({
      code: "MissingUserAgentError",
      message: "The User-Agent header is required for authenticated calls."
    })
  }
}

export const UsherErrorBody = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String.pipe(Schema.pattern(/Error$/)),
    message: Schema.String
  })
})

export type UsherErrorBody = Schema.Schema.Type<typeof UsherErrorBody>

export function toErrorBody(error: { code: string; message: string }): UsherErrorBody {
  return { error: { code: error.code, message: error.message } }
}
```

Add the remaining semantic error classes in this same file using the same pattern: `CallerIpNotAllowedError`, `MissingUrlError`, `InvalidTargetUrlError`, `ReservedHeaderError`, `OverlappingAllowedRequestError`, `CredentialNotFoundError`, `InvalidCredentialTypeError`, `InvalidCredentialStatusError`, `OAuthStateInvalidError`, `OAuthTokenExchangeFailedError`, `EncryptionKeyFileMissingError`, `EncryptionKeyFileNotOwnedByProcessUserError`, `EncryptionKeyFileTooPermissiveError`, and `EncryptionKeyInvalidFormatError`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm test src/Domain/Errors/UsherErrors.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/Domain/Errors/UsherErrors.ts src/Domain/Errors/UsherErrors.spec.ts
git commit -m "Add usher semantic errors"
```

## Task 5: Application Ports And Credential Service

**Files:**
- Create: `src/Application/Ports/CredentialRepository.ts`
- Create: `src/Application/Ports/SecretVault.ts`
- Create: `src/Application/Services/CredentialService.ts`
- Test: `src/Application/Services/CredentialService.spec.ts`

- [ ] **Step 1: Write credential service tests with in-memory ports**

Create `src/Application/Services/CredentialService.spec.ts` with tests that create an OAuth2 credential, create a BearerToken credential, reject overlapping `allowedRequests`, and delete credentials. Use `it.effect` and provide test layers for `CredentialRepository` and `SecretVault`.

Use this shape for assertions:

```ts
import { describe, it } from "@effect/vitest"
import { assert } from "@effect/vitest/utils"
import { Context, Effect, Layer, Ref } from "effect"
import { CredentialRepository } from "../Ports/CredentialRepository.js"
import { SecretVault } from "../Ports/SecretVault.js"
import { CredentialService } from "./CredentialService.js"

describe("CredentialService", () => {
  it.effect("creates a bearer token credential with encrypted token", () =>
    Effect.gen(function*() {
      const service = yield* CredentialService
      const created = yield* service.create({
        type: "BearerToken",
        label: "Internal API",
        allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/" } }],
        bearerToken: { token: "secret-token" }
      })

      assert.strictEqual(created.type, "BearerToken")
      assert.strictEqual(created.status, "active")
    }).pipe(Effect.provide(TestLive)))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Application/Services/CredentialService.spec.ts`

Expected: FAIL because ports and service do not exist.

- [ ] **Step 3: Implement Context.Tag ports**

Create `CredentialRepository` with methods: `insert`, `list`, `getById`, `deleteById`, `findAllNonDeleted`.

Create `SecretVault` with methods: `encrypt`, `decrypt` accepting `{ credentialId, purpose, plaintext }` and `{ credentialId, purpose, ciphertext }`.

Use `Context.Tag` services, not TypeScript interfaces.

- [ ] **Step 4: Implement CredentialService**

Service behavior:

- Generate opaque IDs with prefix `cred_`.
- Normalize matchers.
- Reject overlap with existing non-deleted credentials using `allowedRequestsOverlap`.
- For `OAuth2`, encrypt `clientSecret`, set status `pending`, set `grantedScopes` to `[]`, and return `loginUrl`.
- For `BearerToken`, encrypt token and set status `active`.
- Never return raw secrets.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm test src/Application/Services/CredentialService.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/Application/Ports/CredentialRepository.ts src/Application/Ports/SecretVault.ts src/Application/Services/CredentialService.ts src/Application/Services/CredentialService.spec.ts
git commit -m "Add credential service"
```

## Task 6: Key File And Secret Vault

**Files:**
- Create: `src/Infrastructure/Encryption/KeyFile.ts`
- Create: `src/Infrastructure/Encryption/NodeSecretVault.ts`
- Test: `src/Infrastructure/Encryption/KeyFile.spec.ts`
- Test: `src/Infrastructure/Encryption/NodeSecretVault.spec.ts`

- [ ] **Step 1: Write key-file validation tests**

Test these cases with temporary files:

- missing file returns `EncryptionKeyFileMissingError`
- file not owned by process user returns `EncryptionKeyFileNotOwnedByProcessUserError` when ownership can be safely simulated, otherwise document OS limitation in test name
- mode `0644` returns `EncryptionKeyFileTooPermissiveError`
- invalid prefix or decoded length returns `EncryptionKeyInvalidFormatError`
- mode `0400` or `0600` with `base64url:<32 bytes>` succeeds

- [ ] **Step 2: Write encryption round-trip tests**

Test that encrypt/decrypt round-trips and that changing `credentialId` or `purpose` fails decryption.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/Infrastructure/Encryption/KeyFile.spec.ts src/Infrastructure/Encryption/NodeSecretVault.spec.ts`

Expected: FAIL because files do not exist.

- [ ] **Step 4: Implement key-file loader**

Use Node filesystem APIs through Effect. Validate ownership, mode, prefix, and decoded length. Do not support raw environment keys or dev fallback.

- [ ] **Step 5: Implement NodeSecretVault**

Use Node `crypto.hkdf`, a fresh random nonce, and authenticated encryption. Store ciphertext as a JSON string containing `version`, `algorithm`, `nonce`, and `ciphertext`. Include associated data: `usher:v1:credential:<credentialId>:<purpose>`.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm test src/Infrastructure/Encryption/KeyFile.spec.ts src/Infrastructure/Encryption/NodeSecretVault.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/Infrastructure/Encryption/KeyFile.ts src/Infrastructure/Encryption/NodeSecretVault.ts src/Infrastructure/Encryption/KeyFile.spec.ts src/Infrastructure/Encryption/NodeSecretVault.spec.ts
git commit -m "Add secret encryption infrastructure"
```

## Task 7: SQLite Persistence

**Files:**
- Create: `src/Infrastructure/Persistence/Sqlite/Schema.ts`
- Create: `src/Infrastructure/Persistence/Sqlite/Migrations.ts`
- Create: `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.ts`
- Create: `src/Infrastructure/Persistence/Sqlite/AuditLogSqlite.ts`
- Test: `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.spec.ts`

- [ ] **Step 1: Write repository integration tests**

Use a temporary SQLite database. Test migrations, insert/list/get/delete, and that deleted credentials are not returned by non-deleted queries.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.spec.ts`

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement migrations**

Create `_migrations`, `credentials`, `oauth_states`, and `audit_logs` tables. Store type-specific credential config as JSON text to keep v1 small and schema-flexible.

- [ ] **Step 4: Implement repository adapter**

Use `@effect/sql` and the SQLite node package. Decode rows with Effect Schema before returning domain values.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm test src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/Infrastructure/Persistence/Sqlite
git commit -m "Add SQLite persistence adapters"
```

## Task 8: OAuth2 Service

**Files:**
- Create: `src/Application/Ports/OAuth2Client.ts`
- Create: `src/Application/Services/OAuth2Service.ts`
- Create: `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`
- Test: `src/Application/Services/OAuth2Service.spec.ts`

- [ ] **Step 1: Write OAuth2 service tests**

Test login URL generation creates one-time state, callback rejects invalid state, callback exchanges code and activates credential, and tokens are encrypted.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Application/Services/OAuth2Service.spec.ts`

Expected: FAIL because service and port do not exist.

- [ ] **Step 3: Implement OAuth2Client port**

Methods:

- `buildAuthorizationUrl`
- `exchangeAuthorizationCode`
- `refreshAccessToken`

- [ ] **Step 4: Implement OAuth2Service**

Use repository and vault ports. Store state in SQLite through repository methods or a dedicated state repository if needed. Keep state short-lived and one-time-use.

- [ ] **Step 5: Implement HTTP OAuth2 adapter**

Use `@effect/platform` HTTP client patterns from `repos/effect`. Decode token responses with Schema. Do not persist access tokens.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm test src/Application/Services/OAuth2Service.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/Application/Ports/OAuth2Client.ts src/Application/Services/OAuth2Service.ts src/Application/Services/OAuth2Service.spec.ts src/Infrastructure/OAuth2/OAuth2HttpClient.ts
git commit -m "Add OAuth2 authorization flow"
```

## Task 9: Call Service

**Files:**
- Create: `src/Application/Ports/HttpExecutor.ts`
- Create: `src/Application/Ports/AuditLog.ts`
- Create: `src/Application/Services/CallService.ts`
- Test: `src/Application/Services/CallService.spec.ts`

- [ ] **Step 1: Write call service tests**

Test no matching credential, missing `User-Agent`, reserved `Authorization`, BearerToken auth injection, OAuth2 refresh and auth injection, and audit log records.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/Application/Services/CallService.spec.ts`

Expected: FAIL because service and ports do not exist.

- [ ] **Step 3: Implement ports**

`HttpExecutor` executes a fully prepared outbound request and returns upstream status, headers, and body stream/bytes. `AuditLog` records call attempts and outcomes.

- [ ] **Step 4: Implement CallService**

Behavior:

- Validate target URL is absolute `https://` and has no fragment.
- Require non-empty `User-Agent`.
- Reject caller-supplied `Authorization`.
- Strip hop-by-hop headers.
- Resolve exactly one active credential by URL.
- Inject `Authorization: Bearer ...`.
- Audit every outcome.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `pnpm test src/Application/Services/CallService.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/Application/Ports/HttpExecutor.ts src/Application/Ports/AuditLog.ts src/Application/Services/CallService.ts src/Application/Services/CallService.spec.ts
git commit -m "Add authenticated call service"
```

## Task 10: HTTP Server And Access Control

**Files:**
- Create: `src/Infrastructure/Config/UsherConfig.ts`
- Create: `src/Infrastructure/Http/AccessControl.ts`
- Create: `src/Infrastructure/Http/HttpServer.ts`
- Create: `src/Infrastructure/Http/HttpExecutorLive.ts`
- Modify: `src/Main.ts`
- Test: `src/Infrastructure/Http/AccessControl.spec.ts`
- Test: `src/Infrastructure/Http/HttpServer.spec.ts`

- [ ] **Step 1: Write access-control tests**

Test loopback allowed for admin and `/call`, non-loopback denied for admin, allowlisted IP accepted for `/call`, and non-allowlisted IP denied.

- [ ] **Step 2: Write HTTP behavior tests**

Use a fake upstream server and test `/call` forwards method/body/headers, preserves upstream status/body, and marks `usher` errors with `x-usher-error` and `x-usher-error-code`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test src/Infrastructure/Http/AccessControl.spec.ts src/Infrastructure/Http/HttpServer.spec.ts`

Expected: FAIL because HTTP files do not exist.

- [ ] **Step 4: Implement config decoding**

Decode:

- `USHER_DATABASE_PATH`
- `USHER_ENCRYPTION_KEY_FILE`
- `USHER_BASE_URL`
- `USHER_ALLOWED_CALLER_IPS`
- `USHER_PORT`

Use Effect Config or Schema-decoded environment access. Do not add dev fallbacks for encryption key.

- [ ] **Step 5: Implement HTTP routes**

Use `HttpRouter` and `HttpServer` patterns from `repos/effect/packages/platform-node/examples/http-router.ts`.

Routes:

- `GET /credentials`
- `POST /credentials`
- `GET /credentials/:credentialId`
- `DELETE /credentials/:credentialId`
- `GET /credentials/:credentialId/oauth2/login`
- `GET /oauth2/callback`
- all methods `/call`

- [ ] **Step 6: Implement upstream executor**

Forward request using Effect platform HTTP client. Return upstream status, headers, and body without JSON envelope. Strip hop-by-hop response headers.

- [ ] **Step 7: Compose layers in `Main.ts`**

Launch the HTTP server with config, key-file vault, SQLite adapters, OAuth2 adapter, and HTTP executor.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `pnpm test src/Infrastructure/Http/AccessControl.spec.ts src/Infrastructure/Http/HttpServer.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/Infrastructure/Config src/Infrastructure/Http src/Main.ts
git commit -m "Add HTTP server"
```

## Task 11: End-To-End Validation

**Files:**
- Create: `src/Infrastructure/Http/UsherE2E.spec.ts`
- Modify: docs only if setup commands need clarification

- [ ] **Step 1: Write BearerToken E2E test**

Start fake upstream, create BearerToken credential through admin endpoint from loopback, call `/call`, assert upstream receives `Authorization: Bearer <token>` and response is returned as-is.

- [ ] **Step 2: Write OAuth2 E2E test**

Start fake OAuth2 token endpoint and fake upstream, create OAuth2 credential, simulate callback, call `/call`, assert access token injection and direct response behavior.

- [ ] **Step 3: Run E2E tests to verify they fail before final wiring fixes**

Run: `pnpm test src/Infrastructure/Http/UsherE2E.spec.ts`

Expected: FAIL until final wiring issues are fixed.

- [ ] **Step 4: Fix wiring only**

Fix only layer composition, request body forwarding, header filtering, and test setup issues surfaced by E2E tests. Do not change public API shape without updating the spec.

- [ ] **Step 5: Run E2E tests and typecheck**

Run: `pnpm test src/Infrastructure/Http/UsherE2E.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/Infrastructure/Http/UsherE2E.spec.ts src
git commit -m "Add usher end-to-end coverage"
```

## Task 12: Final Verification

**Files:**
- Modify: `README.md` when final verification shows the setup commands need operator-facing documentation

- [ ] **Step 1: Run Vite+ checks**

Run: `vp check`

Expected: format, lint, and type checks pass.

- [ ] **Step 2: Run Vite+ tests**

Run: `vp test`

Expected: all tests pass.

- [ ] **Step 3: Run project typecheck explicitly**

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 4: Review git diff**

Run: `git status --short`

Expected: only intended files are modified or untracked.

Run: `git diff --stat`

Expected: changes are limited to implementation, tests, docs, and package/tooling files.

- [ ] **Step 5: Commit final docs or cleanup if needed**

```bash
git add README.md package.json pnpm-lock.yaml tsconfig.json src docs
git commit -m "Document usher usage"
```

Skip this commit if there are no final documentation or cleanup changes.

## Self-Review

- Spec coverage: credential model, `OAuth2`, `BearerToken`, `/call`, URL matching, IP allowlisting, key-file encryption, SQLite persistence, OAuth browser flow, audit logs, and tests are all mapped to tasks.
- Placeholder scan: no task relies on incomplete placeholder work as an endpoint; each task defines concrete files, behavior, commands, and expected outcomes.
- Type consistency: public names match the spec: `OAuth2`, `BearerToken`, `credentialId`, `allowedRequests`, `origin`, `pathPrefix`, `/call`, `User-Agent`, and PascalCased error codes ending in `Error`.
