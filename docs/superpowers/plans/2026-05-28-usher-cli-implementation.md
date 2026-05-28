# Usher CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive `usher` CLI where `usher daemon` starts the HTTP server and `usher credentials ...` administers credentials through the local loopback admin API.

**Architecture:** The CLI is an infrastructure adapter. It uses `@effect/cli` for command dispatch and prompts, small pure modules for OAuth templates and formatting, and an HTTP client module that calls the existing admin API at `http://127.0.0.1:<USHER_PORT>`. The daemon path reuses the existing server composition.

**Tech Stack:** TypeScript, Effect, `@effect/cli`, `@effect/platform` `HttpClient`, `@effect/platform-node` `NodeHttpClient` / `NodeTerminal`, `@effect/vitest`, Vite+ / pnpm.

---

## Effect CLI Analysis

The vendored Effect checkout references `@effect/cli` in `repos/effect/tsconfig.base.json`, but this workspace's vendored `repos/effect/packages` directory does not include `packages/cli`. The current project also does not install `@effect/cli`.

The published package `@effect/cli@0.75.1` matches the installed Effect stack: it peers on `effect@^3.21.1`, `@effect/platform@^0.96.0`, `@effect/printer@^0.49.0`, and `@effect/printer-ansi@^0.49.0`. It should be added with its peer packages.

Relevant API from the inspected package:

- `Command.make(name, config, handler)` defines commands.
- `Command.withSubcommands(parent, [child])` builds command trees.
- `Command.run(command, { name, version, executable, summary })(args)` runs the CLI app.
- `Args.text({ name })` defines positional arguments such as `<credential-id>`.
- `Prompt.text`, `Prompt.password`, `Prompt.select`, `Prompt.multiSelect`, `Prompt.confirm`, and `Prompt.all` cover the required interactive flows.
- `Prompt.password` returns `Redacted`, so extract secrets with `Redacted.value` only at request-construction time.
- `Prompt.multiSelect` supports `min`, `max`, and default selections through `SelectChoice.selected`.
- `CliApp.Environment` requires `FileSystem | Path | Terminal`; `@effect/platform-node` provides these through node layers.

The vendored `@effect/platform` and `@effect/platform-node` code confirms prompt/runtime support:

- `repos/effect/packages/platform/src/Terminal.ts` exposes `Terminal.readLine`, `Terminal.readInput`, `Terminal.display`, and `Terminal.isTTY`.
- `repos/effect/packages/platform-node/src/NodeTerminal.ts` exports `NodeTerminal.layer`.
- `repos/effect/packages/platform-node/examples/terminal.ts` shows `Terminal.Terminal` provided by `NodeTerminal.layer`.
- `repos/effect/packages/platform-node/examples/http-client.ts` shows `NodeHttpClient.layer` with `HttpClient` and `HttpClientRequest`.

## File Structure

- Modify `package.json`: add CLI dependencies, add `bin`, and keep the existing build entrypoint.
- Create `src/Infrastructure/Daemon/UsherDaemon.ts`: move existing server startup composition out of `Main.ts` into `runUsherDaemon`.
- Modify `src/Main.ts`: run the CLI dispatcher with `process.argv.slice(2)` instead of always starting the server.
- Create `src/Infrastructure/Cli/UsherCli.ts`: define the `usher` command tree with `@effect/cli`.
- Create `src/Infrastructure/Cli/CliConfig.ts`: load the local admin port from `USHER_PORT` only.
- Create `src/Infrastructure/Cli/AdminApiClient.ts`: call the loopback admin API and decode success/error responses.
- Create `src/Infrastructure/Cli/CredentialPrompts.ts`: build interactive bearer token and OAuth2 prompts.
- Create `src/Infrastructure/Cli/OAuthTemplates.ts`: define Google provider defaults, Google scope choices, and scope de-duplication.
- Create `src/Infrastructure/Cli/CredentialFormatting.ts`: render credential lists, details, creation results, and deletion messages.
- Add colocated `*.spec.ts` files under `src/Infrastructure/Cli/` for pure helpers and HTTP client behavior.

## Task 1: Add CLI Dependencies And Binary Metadata

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install dependencies**

Run:

```sh
pnpm add @effect/cli @effect/printer @effect/printer-ansi
```

Expected: `package.json` contains these new dependencies and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add the binary field**

Edit `package.json` so the top-level metadata includes `bin`:

```json
{
  "name": "@akoenig/usher",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "usher": "dist/Main.mjs"
  }
}
```

Keep the existing scripts. Do not remove `dev`, `start`, `build`, `test`, or `typecheck`.

- [ ] **Step 3: Verify dependency types resolve**

Run:

```sh
pnpm typecheck
```

Expected: PASS with no TypeScript errors.

## Task 2: Extract The Daemon Entrypoint

**Files:**
- Create: `src/Infrastructure/Daemon/UsherDaemon.ts`
- Modify: `src/Main.ts`

- [ ] **Step 1: Create the daemon module**

Create `src/Infrastructure/Daemon/UsherDaemon.ts` with the current server composition from `Main.ts`:

```ts
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { CallServiceLive } from "../../Application/Services/CallService.js"
import { CredentialServiceLive } from "../../Application/Services/CredentialService.js"
import { OAuth2ServiceLive } from "../../Application/Services/OAuth2Service.js"
import { loadUsherConfig } from "../Config/UsherConfig.js"
import { NodeSecretVaultLive } from "../Encryption/NodeSecretVault.js"
import { HttpExecutorLive } from "../Http/HttpExecutorLive.js"
import { HttpServerLive } from "../Http/HttpServer.js"
import { OAuth2HttpClient } from "../OAuth2/OAuth2HttpClient.js"
import { AuditLogSqlite } from "../Persistence/Sqlite/AuditLogSqlite.js"
import { CredentialRepositorySqlite } from "../Persistence/Sqlite/CredentialRepositorySqlite.js"
import { runSqliteMigrations } from "../Persistence/Sqlite/Migrations.js"

export const runUsherDaemon = Effect.gen(function*() {
  const config = yield* loadUsherConfig
  const sqlite = SqliteClient.layer({ filename: config.databasePath })
  const repositories = Layer.provide(
    Layer.mergeAll(CredentialRepositorySqlite, AuditLogSqlite),
    sqlite
  )
  const services = Layer.mergeAll(
    CredentialServiceLive({ baseUrl: config.baseUrl }),
    OAuth2ServiceLive({ stateTtlMillis: 10 * 60 * 1000 }),
    CallServiceLive
  )
  const adapters = Layer.mergeAll(
    repositories,
    NodeSecretVaultLive(config.encryptionKeyFile),
    OAuth2HttpClient,
    HttpExecutorLive
  )
  const serviceLayer = Layer.provide(services, adapters)
  const serverLayer = Layer.provide(
    HttpServerLive({
      allowedCallerIps: config.allowedCallerIps,
      baseUrl: config.baseUrl,
      port: config.port
    }),
    serviceLayer
  )

  yield* runSqliteMigrations.pipe(Effect.provide(sqlite))
  yield* Effect.never.pipe(Effect.provide(serverLayer))
})
```

- [ ] **Step 2: Temporarily keep `Main.ts` behavior unchanged**

Replace `src/Main.ts` with:

```ts
import { NodeRuntime } from "@effect/platform-node"
import { runUsherDaemon } from "./Infrastructure/Daemon/UsherDaemon.js"

NodeRuntime.runMain(runUsherDaemon)
```

- [ ] **Step 3: Verify the extraction**

Run:

```sh
pnpm typecheck
```

Expected: PASS. The application still starts the daemon by default until the CLI dispatcher is introduced in Task 8.

## Task 3: Add Local CLI Config

**Files:**
- Create: `src/Infrastructure/Cli/CliConfig.ts`
- Create: `src/Infrastructure/Cli/CliConfig.spec.ts`

- [ ] **Step 1: Write the failing config tests**

Create `src/Infrastructure/Cli/CliConfig.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { localAdminBaseUrl } from "./CliConfig.js"

describe("CliConfig", () => {
  it("builds a loopback admin base URL from the configured port", () => {
    assert.strictEqual(localAdminBaseUrl(3000), "http://127.0.0.1:3000")
  })
})
```

- [ ] **Step 2: Run the test and see it fail**

Run:

```sh
pnpm test src/Infrastructure/Cli/CliConfig.spec.ts
```

Expected: FAIL because `CliConfig.ts` does not exist.

- [ ] **Step 3: Implement local CLI config**

Create `src/Infrastructure/Cli/CliConfig.ts`:

```ts
import { Config, Effect, Schema } from "effect"

export const UsherCliConfig = Schema.Struct({
  port: Schema.Number
})
export type UsherCliConfig = Schema.Schema.Type<typeof UsherCliConfig>

export const loadUsherCliConfig = Config.all({
  port: Config.port("USHER_PORT")
}).pipe(
  Effect.flatMap(Schema.decodeUnknown(UsherCliConfig))
)

export function localAdminBaseUrl(port: number) {
  return `http://127.0.0.1:${port}`
}
```

- [ ] **Step 4: Verify config tests pass**

Run:

```sh
pnpm test src/Infrastructure/Cli/CliConfig.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 4: Add OAuth Templates And Scope Handling

**Files:**
- Create: `src/Infrastructure/Cli/OAuthTemplates.ts`
- Create: `src/Infrastructure/Cli/OAuthTemplates.spec.ts`

- [ ] **Step 1: Write failing OAuth template tests**

Create `src/Infrastructure/Cli/OAuthTemplates.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { googleOAuth2Template, googleScopesFromSelections } from "./OAuthTemplates.js"

describe("OAuthTemplates", () => {
  it("provides Google OAuth2 endpoint defaults", () => {
    assert.deepStrictEqual(googleOAuth2Template, {
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token"
    })
  })

  it("maps selected Google presets and custom scopes to de-duplicated scope strings", () => {
    const scopes = googleScopesFromSelections(
      ["Google Calendar readonly", "Google Drive readonly", "Custom"],
      [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly"
      ]
    )

    assert.deepStrictEqual(scopes, [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/gmail.readonly"
    ])
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run:

```sh
pnpm test src/Infrastructure/Cli/OAuthTemplates.spec.ts
```

Expected: FAIL because `OAuthTemplates.ts` does not exist.

- [ ] **Step 3: Implement OAuth templates**

Create `src/Infrastructure/Cli/OAuthTemplates.ts`:

```ts
import type * as Prompt from "@effect/cli/Prompt"
import { Schema } from "effect"

export const OAuthProvider = Schema.Literal("Google", "Custom")
export type OAuthProvider = Schema.Schema.Type<typeof OAuthProvider>

export const GoogleScopeSelection = Schema.Literal(
  "Google Calendar readonly",
  "Google Calendar read/write",
  "Google Drive readonly",
  "Google Drive file-level access",
  "Gmail readonly",
  "Custom"
)
export type GoogleScopeSelection = Schema.Schema.Type<typeof GoogleScopeSelection>

export const googleOAuth2Template = {
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token"
}

export const providerChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<OAuthProvider>> = [
  { title: "Google", value: "Google" },
  { title: "Custom", value: "Custom" }
]

export const googleScopeChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<GoogleScopeSelection>> = [
  { title: "Google Calendar readonly", value: "Google Calendar readonly" },
  { title: "Google Calendar read/write", value: "Google Calendar read/write" },
  { title: "Google Drive readonly", value: "Google Drive readonly" },
  { title: "Google Drive file-level access", value: "Google Drive file-level access" },
  { title: "Gmail readonly", value: "Gmail readonly" },
  { title: "Custom", value: "Custom" }
]

export function googleScopesFromSelections(
  selections: ReadonlyArray<GoogleScopeSelection>,
  customScopes: ReadonlyArray<string>
) {
  const scopes = selections.flatMap((selection) => scopeStringsForGoogleSelection(selection))
  return Array.from(new Set([...scopes, ...customScopes.map((scope) => scope.trim()).filter((scope) => scope !== "")]))
}

function scopeStringsForGoogleSelection(selection: GoogleScopeSelection) {
  if (selection === "Google Calendar readonly") {
    return ["https://www.googleapis.com/auth/calendar.readonly"]
  }
  if (selection === "Google Calendar read/write") {
    return ["https://www.googleapis.com/auth/calendar"]
  }
  if (selection === "Google Drive readonly") {
    return ["https://www.googleapis.com/auth/drive.readonly"]
  }
  if (selection === "Google Drive file-level access") {
    return ["https://www.googleapis.com/auth/drive.file"]
  }
  if (selection === "Gmail readonly") {
    return ["https://www.googleapis.com/auth/gmail.readonly"]
  }

  return []
}

export function hasRedundantGoogleScopeSelection(selections: ReadonlyArray<GoogleScopeSelection>) {
  return selections.includes("Google Calendar readonly") && selections.includes("Google Calendar read/write")
}
```

- [ ] **Step 4: Verify OAuth template tests pass**

Run:

```sh
pnpm test src/Infrastructure/Cli/OAuthTemplates.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 5: Add Credential Formatting

**Files:**
- Create: `src/Infrastructure/Cli/CredentialFormatting.ts`
- Create: `src/Infrastructure/Cli/CredentialFormatting.spec.ts`

- [ ] **Step 1: Write failing formatting tests**

Create `src/Infrastructure/Cli/CredentialFormatting.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { formatCredentialDetail, formatCredentialList } from "./CredentialFormatting.js"

describe("CredentialFormatting", () => {
  it("formats an empty credential list", () => {
    assert.strictEqual(formatCredentialList([]), "No credentials found.")
  })

  it("formats credential list rows without exposing secrets", () => {
    assert.strictEqual(formatCredentialList([{
      credentialId: "cred_0123456789abcdef",
      type: "BearerToken",
      label: "Internal API",
      status: "active",
      allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1/" } }],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      tokenPreview: "********"
    }]), "cred_0123456789abcdef  BearerToken  active  Internal API")
  })

  it("formats OAuth2 detail with login URL", () => {
    const text = formatCredentialDetail({
      credentialId: "cred_0123456789abcdef",
      type: "OAuth2",
      label: "Google Calendar",
      status: "pending",
      allowedRequests: [{ url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } }],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      clientId: "client-id",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      grantedScopes: [],
      clientSecretPreview: "********",
      loginUrl: "https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login"
    })

    assert.assertTrue(text.includes("Login URL: https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login"))
    assert.assertFalse(text.includes("client-secret"))
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run:

```sh
pnpm test src/Infrastructure/Cli/CredentialFormatting.spec.ts
```

Expected: FAIL because `CredentialFormatting.ts` does not exist.

- [ ] **Step 3: Implement formatting**

Create `src/Infrastructure/Cli/CredentialFormatting.ts`:

```ts
import type { RedactedCredential } from "../../Application/Services/CredentialService.js"

export function formatCredentialList(credentials: ReadonlyArray<RedactedCredential>) {
  if (credentials.length === 0) {
    return "No credentials found."
  }

  return credentials.map((credential) =>
    `${credential.credentialId}  ${credential.type}  ${credential.status}  ${credential.label}`
  ).join("\n")
}

export function formatCredentialDetail(credential: RedactedCredential) {
  const lines = [
    `ID: ${credential.credentialId}`,
    `Type: ${credential.type}`,
    `Label: ${credential.label}`,
    `Status: ${credential.status}`,
    "Allowed Requests:",
    ...credential.allowedRequests.map((request) => `- ${request.url.origin}${request.url.pathPrefix}`)
  ]

  if (credential.type === "OAuth2") {
    return [
      ...lines,
      `Client ID: ${credential.clientId}`,
      `Authorization URL: ${credential.authorizationUrl}`,
      `Token URL: ${credential.tokenUrl}`,
      `Scopes: ${credential.scopes.join(", ")}`,
      `Granted Scopes: ${credential.grantedScopes.join(", ")}`,
      `Login URL: ${credential.loginUrl}`
    ].join("\n")
  }

  return lines.join("\n")
}

export function formatCredentialCreated(credential: RedactedCredential) {
  if (credential.type === "OAuth2") {
    return `${formatCredentialDetail(credential)}\n\nOpen this URL to authorize the credential:\n${credential.loginUrl}`
  }

  return formatCredentialDetail(credential)
}

export function formatCredentialDeleted(credentialId: string) {
  return `Deleted credential ${credentialId}`
}
```

- [ ] **Step 4: Verify formatting tests pass**

Run:

```sh
pnpm test src/Infrastructure/Cli/CredentialFormatting.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 6: Add Admin API Client

**Files:**
- Create: `src/Infrastructure/Cli/AdminApiClient.ts`
- Create: `src/Infrastructure/Cli/AdminApiClient.spec.ts`

- [ ] **Step 1: Write failing admin client tests**

Create `src/Infrastructure/Cli/AdminApiClient.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { adminCredentialPath, adminCredentialsPath } from "./AdminApiClient.js"

describe("AdminApiClient", () => {
  it("builds credential collection paths", () => {
    assert.strictEqual(adminCredentialsPath(), "/credentials")
  })

  it("builds credential member paths", () => {
    assert.strictEqual(adminCredentialPath("cred_0123456789abcdef"), "/credentials/cred_0123456789abcdef")
  })
})
```

- [ ] **Step 2: Run the test and see it fail**

Run:

```sh
pnpm test src/Infrastructure/Cli/AdminApiClient.spec.ts
```

Expected: FAIL because `AdminApiClient.ts` does not exist.

- [ ] **Step 3: Implement the admin client**

Create `src/Infrastructure/Cli/AdminApiClient.ts`:

```ts
import { HttpBody, HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "@effect/platform"
import { Context, Effect, Layer, Schema } from "effect"
import type * as ParseResult from "effect/ParseResult"
import { RedactedCredential } from "../../Application/Services/CredentialService.js"
import { CreateCredentialInput, CredentialId } from "../../Domain/Credentials/Credential.js"

export class AdminApiError extends Schema.TaggedError<AdminApiError>("AdminApiError")(
  "AdminApiError",
  {
    code: Schema.String,
    message: Schema.String
  }
) {}

const ErrorResponseBody = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String
  })
})

const RedactedCredentialArray = Schema.Array(RedactedCredential)

export class AdminApiClient extends Context.Tag("AdminApiClient")<
  AdminApiClient,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<RedactedCredential>, AdminApiError | HttpClientError.HttpClientError | HttpBody.HttpBodyError | ParseResult.ParseError>
    readonly get: (credentialId: CredentialId) => Effect.Effect<RedactedCredential, AdminApiError | HttpClientError.HttpClientError | HttpBody.HttpBodyError | ParseResult.ParseError>
    readonly create: (input: CreateCredentialInput) => Effect.Effect<RedactedCredential, AdminApiError | HttpClientError.HttpClientError | HttpBody.HttpBodyError | ParseResult.ParseError>
    readonly deleteById: (credentialId: CredentialId) => Effect.Effect<void, AdminApiError | HttpClientError.HttpClientError | HttpBody.HttpBodyError | ParseResult.ParseError>
  }
>() {}

export function AdminApiClientLive(baseUrl: string) {
  return Layer.effect(
    AdminApiClient,
    Effect.gen(function*() {
      const httpClient = yield* HttpClient.HttpClient
      const client = httpClient.pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl)))
      const encodeCreateBody = HttpClientRequest.schemaBodyJson(CreateCredentialInput)

      return AdminApiClient.of({
        list: () => HttpClientRequest.get(adminCredentialsPath()).pipe(
          client.execute,
          Effect.flatMap(expectOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(RedactedCredentialArray)),
          Effect.scoped
        ),
        get: (credentialId) => HttpClientRequest.get(adminCredentialPath(credentialId)).pipe(
          client.execute,
          Effect.flatMap(expectOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(RedactedCredential)),
          Effect.scoped
        ),
        create: (input) => encodeCreateBody(HttpClientRequest.post(adminCredentialsPath()), input).pipe(
          Effect.flatMap(client.execute),
          Effect.flatMap(expectOk),
          Effect.flatMap(HttpClientResponse.schemaBodyJson(RedactedCredential)),
          Effect.scoped
        ),
        deleteById: (credentialId) => HttpClientRequest.del(adminCredentialPath(credentialId)).pipe(
          client.execute,
          Effect.flatMap(expectOk),
          Effect.asVoid,
          Effect.scoped
        )
      })
    })
  )
}

export function adminCredentialsPath() {
  return "/credentials"
}

export function adminCredentialPath(credentialId: CredentialId) {
  return `/credentials/${credentialId}`
}

function expectOk(response: HttpClientResponse.HttpClientResponse) {
  if (response.status >= 200 && response.status < 300) {
    return Effect.succeed(response)
  }

  return response.json.pipe(
    Effect.flatMap(Schema.decodeUnknown(ErrorResponseBody)),
    Effect.flatMap((body) => Effect.fail(AdminApiError.make({
      code: body.error.code,
      message: body.error.message
    })))
  )
}
```

- [ ] **Step 4: Verify admin client tests pass**

Run:

```sh
pnpm test src/Infrastructure/Cli/AdminApiClient.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 7: Add Credential Prompts And Request Construction

**Files:**
- Create: `src/Infrastructure/Cli/CredentialPrompts.ts`
- Create: `src/Infrastructure/Cli/CredentialPrompts.spec.ts`

- [ ] **Step 1: Write failing request-construction tests**

Create `src/Infrastructure/Cli/CredentialPrompts.spec.ts`:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { buildBearerTokenCredentialInput, buildOAuth2CredentialInput } from "./CredentialPrompts.js"

describe("CredentialPrompts", () => {
  it("builds a bearer token credential input", () => {
    assert.deepStrictEqual(buildBearerTokenCredentialInput({
      label: "Internal API",
      origin: "https://api.example.com",
      pathPrefix: "/v1/",
      token: "secret-token"
    }), {
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1/" } }],
      bearerToken: { token: "secret-token" }
    })
  })

  it("builds an OAuth2 credential input", () => {
    assert.deepStrictEqual(buildOAuth2CredentialInput({
      label: "Google Calendar",
      origin: "https://www.googleapis.com",
      pathPrefix: "/calendar/",
      clientId: "client-id",
      clientSecret: "client-secret",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
    }), {
      type: "OAuth2",
      label: "Google Calendar",
      allowedRequests: [{ url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } }],
      oauth2: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"]
      }
    })
  })
})
```

- [ ] **Step 2: Run the tests and see them fail**

Run:

```sh
pnpm test src/Infrastructure/Cli/CredentialPrompts.spec.ts
```

Expected: FAIL because `CredentialPrompts.ts` does not exist.

- [ ] **Step 3: Implement prompt helpers**

Create `src/Infrastructure/Cli/CredentialPrompts.ts`:

```ts
import * as Prompt from "@effect/cli/Prompt"
import { Effect, Redacted, Schema } from "effect"
import {
  CreateBearerTokenCredentialInput,
  CreateOAuth2CredentialInput
} from "../../Domain/Credentials/Credential.js"
import {
  googleOAuth2Template,
  googleScopeChoices,
  googleScopesFromSelections,
  providerChoices
} from "./OAuthTemplates.js"

type BearerTokenPromptValues = {
  readonly label: string
  readonly origin: string
  readonly pathPrefix: string
  readonly token: string
}

type OAuth2PromptValues = {
  readonly label: string
  readonly origin: string
  readonly pathPrefix: string
  readonly clientId: string
  readonly clientSecret: string
  readonly authorizationUrl: string
  readonly tokenUrl: string
  readonly scopes: ReadonlyArray<string>
}

type CreateBearerTokenCredentialInputType = Schema.Schema.Type<typeof CreateBearerTokenCredentialInput>
type CreateOAuth2CredentialInputType = Schema.Schema.Type<typeof CreateOAuth2CredentialInput>

export const promptBearerTokenCredentialInput = Prompt.all({
  label: nonEmptyText("Label: "),
  origin: nonEmptyText("Allowed origin: "),
  pathPrefix: nonEmptyText("Allowed path prefix: "),
  token: Prompt.password({ message: "Bearer token: " })
}).pipe(
  Prompt.map((values) => buildBearerTokenCredentialInput({
    label: values.label,
    origin: values.origin,
    pathPrefix: values.pathPrefix,
    token: Redacted.value(values.token)
  }))
)

export const promptOAuth2CredentialInput = Prompt.select({
  message: "Provider: ",
  choices: providerChoices
}).pipe(
  Prompt.flatMap((provider) => provider === "Google" ? googleOAuth2Prompt : customOAuth2Prompt)
)

const googleOAuth2Prompt = Prompt.all({
  label: nonEmptyText("Label: "),
  origin: nonEmptyText("Allowed origin: "),
  pathPrefix: nonEmptyText("Allowed path prefix: "),
  clientId: nonEmptyText("Client ID: "),
  clientSecret: Prompt.password({ message: "Client secret: " }),
  selectedScopes: Prompt.multiSelect({
    message: "Scopes: ",
    choices: googleScopeChoices,
    min: 1
  })
}).pipe(
  Prompt.flatMap((values) => {
    const needsCustomScopes = values.selectedScopes.includes("Custom")
    const customScopesPrompt = needsCustomScopes
      ? Prompt.list({ message: "Custom scopes, comma-separated: ", delimiter: "," })
      : Prompt.succeed([])

    return customScopesPrompt.pipe(
      Prompt.map((customScopes) => ({ values, customScopes }))
    )
  }),
  Prompt.map(({ values, customScopes }) => buildOAuth2CredentialInput({
      label: values.label,
      origin: values.origin,
      pathPrefix: values.pathPrefix,
      clientId: values.clientId,
      clientSecret: Redacted.value(values.clientSecret),
      authorizationUrl: googleOAuth2Template.authorizationUrl,
      tokenUrl: googleOAuth2Template.tokenUrl,
      scopes: googleScopesFromSelections(values.selectedScopes, customScopes)
    }))
)

const customOAuth2Prompt = Prompt.all({
  label: nonEmptyText("Label: "),
  origin: nonEmptyText("Allowed origin: "),
  pathPrefix: nonEmptyText("Allowed path prefix: "),
  clientId: nonEmptyText("Client ID: "),
  clientSecret: Prompt.password({ message: "Client secret: " }),
  authorizationUrl: nonEmptyText("Authorization URL: "),
  tokenUrl: nonEmptyText("Token URL: "),
  scopes: Prompt.list({ message: "Scopes, comma-separated: ", delimiter: "," })
}).pipe(
  Prompt.map((values) => buildOAuth2CredentialInput({
    label: values.label,
    origin: values.origin,
    pathPrefix: values.pathPrefix,
    clientId: values.clientId,
    clientSecret: Redacted.value(values.clientSecret),
    authorizationUrl: values.authorizationUrl,
    tokenUrl: values.tokenUrl,
    scopes: values.scopes.map((scope) => scope.trim()).filter((scope) => scope !== "")
  }))
)

export function buildBearerTokenCredentialInput(values: BearerTokenPromptValues): CreateBearerTokenCredentialInputType {
  return Schema.decodeUnknownSync(CreateBearerTokenCredentialInput)({
    type: "BearerToken",
    label: values.label,
    allowedRequests: [{ url: { origin: values.origin, pathPrefix: values.pathPrefix } }],
    bearerToken: { token: values.token }
  })
}

export function buildOAuth2CredentialInput(values: OAuth2PromptValues): CreateOAuth2CredentialInputType {
  return Schema.decodeUnknownSync(CreateOAuth2CredentialInput)({
    type: "OAuth2",
    label: values.label,
    allowedRequests: [{ url: { origin: values.origin, pathPrefix: values.pathPrefix } }],
    oauth2: {
      clientId: values.clientId,
      clientSecret: values.clientSecret,
      authorizationUrl: values.authorizationUrl,
      tokenUrl: values.tokenUrl,
      scopes: values.scopes
    }
  })
}

function nonEmptyText(message: string) {
  return Prompt.text({
    message,
    validate: (value) => value.trim() === ""
      ? Effect.fail("Value cannot be empty")
      : Effect.succeed(value.trim())
  })
}
```

- [ ] **Step 4: Verify prompt helper tests pass**

Run:

```sh
pnpm test src/Infrastructure/Cli/CredentialPrompts.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 8: Add The CLI Command Tree

**Files:**
- Create: `src/Infrastructure/Cli/UsherCli.ts`
- Modify: `src/Main.ts`

- [ ] **Step 1: Implement the command tree**

Create `src/Infrastructure/Cli/UsherCli.ts`:

```ts
import { Args, Command } from "@effect/cli"
import * as Prompt from "@effect/cli/Prompt"
import { NodeContext, NodeHttpClient } from "@effect/platform-node"
import { Console, Effect, Layer, Option, Schema } from "effect"
import { runUsherDaemon } from "../Daemon/UsherDaemon.js"
import { AdminApiClient, AdminApiClientLive, AdminApiError } from "./AdminApiClient.js"
import { loadUsherCliConfig, localAdminBaseUrl } from "./CliConfig.js"
import { formatCredentialCreated, formatCredentialDeleted, formatCredentialDetail, formatCredentialList } from "./CredentialFormatting.js"
import { promptBearerTokenCredentialInput, promptOAuth2CredentialInput } from "./CredentialPrompts.js"
import { CredentialId } from "../../Domain/Credentials/Credential.js"

const credentialIdArg = Args.text({ name: "credential-id" })

const daemonCommand = Command.make("daemon", {}, () => runUsherDaemon).pipe(
  Command.withDescription("Start the Usher HTTP daemon")
)

const listCommand = Command.make("list", {}, () => withAdminClient(Effect.gen(function*() {
  const client = yield* AdminApiClient
  const credentials = yield* client.list()
  yield* Console.log(formatCredentialList(credentials))
}))).pipe(Command.withDescription("List credentials"))

const getCommand = Command.make("get", { credentialId: credentialIdArg }, ({ credentialId }) => withAdminClient(Effect.gen(function*() {
  const parsedCredentialId = yield* parseCredentialId(credentialId)
  const client = yield* AdminApiClient
  const credential = yield* client.get(parsedCredentialId)
  yield* Console.log(formatCredentialDetail(credential))
}))).pipe(Command.withDescription("Show a credential"))

const deleteCommand = Command.make("delete", { credentialId: credentialIdArg }, ({ credentialId }) => withAdminClient(Effect.gen(function*() {
  const parsedCredentialId = yield* parseCredentialId(credentialId)
  const client = yield* AdminApiClient
  const credential = yield* client.get(parsedCredentialId).pipe(Effect.option)
  const message = Option.match(credential, {
    onNone: () => `Delete credential ${parsedCredentialId}? This cannot be undone.`,
    onSome: (value) => `Delete credential "${value.label}" (${value.credentialId})? This cannot be undone.`
  })
  const confirmed = yield* Prompt.run(Prompt.confirm({
    message,
    initial: false
  }))

  if (!confirmed) {
    yield* Console.log("No changes made.")
    return
  }

  yield* client.deleteById(parsedCredentialId)
  yield* Console.log(formatCredentialDeleted(parsedCredentialId))
}))).pipe(Command.withDescription("Delete a credential"))

const createBearerTokenCommand = Command.make("create-bearer-token", {}, () => withAdminClient(Effect.gen(function*() {
  const input = yield* Prompt.run(promptBearerTokenCredentialInput)
  const client = yield* AdminApiClient
  const credential = yield* client.create(input)
  yield* Console.log(formatCredentialCreated(credential))
}))).pipe(Command.withDescription("Interactively create a bearer token credential"))

const createOAuth2Command = Command.make("create-oauth2", {}, () => withAdminClient(Effect.gen(function*() {
  const input = yield* Prompt.run(promptOAuth2CredentialInput)
  const client = yield* AdminApiClient
  const credential = yield* client.create(input)
  yield* Console.log(formatCredentialCreated(credential))
}))).pipe(Command.withDescription("Interactively create an OAuth2 credential"))

const credentialsCommand = Command.make("credentials").pipe(
  Command.withDescription("Manage credentials through the local daemon"),
  Command.withSubcommands([
    listCommand,
    getCommand,
    deleteCommand,
    createBearerTokenCommand,
    createOAuth2Command
  ])
)

const rootCommand = Command.make("usher").pipe(
  Command.withDescription("Headless HTTP credential broker"),
  Command.withSubcommands([daemonCommand, credentialsCommand])
)

export function runUsherCli(args: ReadonlyArray<string>) {
  return Command.run(rootCommand, {
    name: "usher",
    version: "0.0.0",
    executable: "usher",
    summary: "Usher local administration CLI"
  })(args).pipe(
    Effect.catchTag("AdminApiError", (error) => Console.error(`${error.code}: ${error.message}`)),
    Effect.provide(Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer))
  )
}

function withAdminClient<R, E, A>(effect: Effect.Effect<A, E, R | AdminApiClient>) {
  return Effect.gen(function*() {
    const config = yield* loadUsherCliConfig
    const layer = AdminApiClientLive(localAdminBaseUrl(config.port))
    return yield* effect.pipe(
      Effect.catchAll((error) => Schema.is(AdminApiError)(error)
        ? Effect.fail(error)
        : Effect.fail(AdminApiError.make({
          code: "DaemonUnavailable",
          message: "Usher daemon is not running. Start it with `usher daemon`."
        }))),
      Effect.provide(layer)
    )
  })
}

function parseCredentialId(value: string) {
  return Schema.decodeUnknown(CredentialId)(value).pipe(
    Effect.mapError(() => AdminApiError.make({
      code: "InvalidCredentialId",
      message: "Credential ID is invalid"
    }))
  )
}
```

- [ ] **Step 2: Wire `Main.ts` to the CLI**

Replace `src/Main.ts` with:

```ts
import { NodeRuntime } from "@effect/platform-node"
import { runUsherCli } from "./Infrastructure/Cli/UsherCli.js"

NodeRuntime.runMain(runUsherCli(process.argv.slice(2)))
```

- [ ] **Step 3: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 9: Add CLI Behavior Tests

**Files:**
- Create: `src/Infrastructure/Cli/UsherCli.spec.ts`

- [ ] **Step 1: Write CLI behavior tests for help and command shape**

Create `src/Infrastructure/Cli/UsherCli.spec.ts` with tests that run the command in-process:

```ts
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Exit } from "effect"
import { runUsherCli } from "./UsherCli.js"

describe("UsherCli", () => {
  it.effect("shows help with no arguments", () =>
    Effect.gen(function*() {
      const result = yield* runUsherCli([]).pipe(Effect.exit)
      assert.assertTrue(Exit.isSuccess(result))
    }))
})
```

- [ ] **Step 2: Run CLI tests**

Run:

```sh
pnpm test src/Infrastructure/Cli/UsherCli.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 10: Update README Usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update daemon startup docs**

Change the development and compiled startup examples to show explicit daemon startup:

```md
Start the daemon from source during development:

```sh
pnpm dev -- daemon
```

Build and run the compiled daemon:

```sh
pnpm build
node dist/Main.mjs daemon
```
```

- [ ] **Step 2: Replace curl-only credential creation with CLI usage**

Add examples:

```md
Create a bearer token credential interactively:

```sh
usher credentials create-bearer-token
```

Create an OAuth2 credential interactively:

```sh
usher credentials create-oauth2
```

List, fetch, and delete credentials:

```sh
usher credentials list
usher credentials get cred_0123456789abcdef
usher credentials delete cred_0123456789abcdef
```
```

- [ ] **Step 3: Run docs-adjacent verification**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

## Task 11: Final Verification

**Files:**
- All files touched by earlier tasks

- [ ] **Step 1: Run typecheck**

Run:

```sh
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 2: Run tests**

Run:

```sh
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run Vite+ checks if available**

Run:

```sh
vp check
```

Expected: PASS. If `vp` is unavailable in the environment, record the command failure and rely on `pnpm typecheck` plus `pnpm test`.

- [ ] **Step 4: Run Vite+ tests if available**

Run:

```sh
vp test
```

Expected: PASS. If `vp` is unavailable in the environment, record the command failure and rely on `pnpm test`.

- [ ] **Step 5: Build**

Run:

```sh
pnpm build
```

Expected: PASS and `dist/Main.mjs` exists.

- [ ] **Step 6: Smoke-test help output**

Run:

```sh
node dist/Main.mjs --help
```

Expected: exits successfully and prints top-level help containing `daemon` and `credentials`.
