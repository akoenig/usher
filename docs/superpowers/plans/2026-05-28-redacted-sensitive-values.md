# Redacted Sensitive Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep sensitive values as Effect `Redacted.Redacted<string>` across domain, application, and infrastructure flows.

**Architecture:** Use Effect Schema redacted transformations at command DTO boundaries, propagate redacted values through application ports and services, and unwrap only inside infrastructure adapters that call external APIs requiring plain strings. Persisted encrypted credential data remains string ciphertext.

**Tech Stack:** TypeScript, Effect, Effect Schema, Effect Context services, @effect/vitest, Vite+ via `vp`, package commands via `pnpm`.

---

## File Structure

- Modify `src/Domain/Credentials/Credential.ts`: define redacted non-empty secret schemas for create DTOs.
- Modify `src/Domain/Credentials/Credential.spec.ts`: assert create DTO secrets decode to `Redacted` values.
- Modify `src/Application/Ports/SecretVault.ts`: accept redacted plaintext and return redacted decrypted plaintext.
- Modify `src/Application/Ports/OAuth2Client.ts`: use redacted state, code verifier, client secrets, refresh tokens, and token response fields.
- Modify `src/Application/Ports/CredentialRepository.ts`: store and consume redacted OAuth state/code verifier through the port.
- Modify `src/Application/Ports/HttpExecutor.ts`: add a prepared outbound header record that allows redacted header values.
- Modify `src/Application/Services/CredentialService.ts`: pass redacted create secrets to the vault unchanged.
- Modify `src/Application/Services/OAuth2Service.ts`: generate redacted OAuth state and code verifier, and preserve redaction during token exchange.
- Modify `src/Application/Services/CallService.ts`: build redacted Authorization values and pass them to the HTTP executor.
- Modify `src/Infrastructure/Encryption/NodeSecretVault.ts`: unwrap only inside encryption and wrap decrypted plaintext immediately.
- Modify `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`: unwrap redacted inputs only while building provider requests and wrap provider token responses.
- Modify `src/Infrastructure/Http/HttpExecutorLive.ts`: unwrap redacted outbound headers only at the `fetch` boundary.
- Modify `src/Infrastructure/Http/HttpServer.ts`: wrap callback state before passing it into `OAuth2Service`.
- Modify `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.ts`: unwrap OAuth state/code verifier only for SQL storage and queries, then wrap on read.
- Modify existing `*.spec.ts` files near those implementations to keep tests colocated.

## Task 1: Domain Create DTOs Decode Secrets As Redacted

**Files:**

- Modify: `src/Domain/Credentials/Credential.ts`
- Modify: `src/Domain/Credentials/Credential.spec.ts`

- [ ] **Step 1: Write failing domain tests**

In `src/Domain/Credentials/Credential.spec.ts`, change the import and strengthen the first two tests:

```ts
import { Either, Redacted, Schema } from "effect";
```

In `decodes OAuth2 create input`, add after `assert.strictEqual(decoded.type, "OAuth2");`:

```ts
assert.assertTrue(Redacted.isRedacted(decoded.oauth2.clientSecret));
assert.strictEqual(Redacted.value(decoded.oauth2.clientSecret), "client-secret");
```

In `decodes BearerToken create input`, add after `assert.strictEqual(decoded.type, "BearerToken");`:

```ts
assert.assertTrue(Redacted.isRedacted(decoded.bearerToken.token));
assert.strictEqual(Redacted.value(decoded.bearerToken.token), "secret-token");
```

- [ ] **Step 2: Run failing domain tests**

Run: `pnpm test src/Domain/Credentials/Credential.spec.ts`

Expected: FAIL because `decoded.oauth2.clientSecret` and `decoded.bearerToken.token` are still plain strings.

- [ ] **Step 3: Implement redacted create schemas**

In `src/Domain/Credentials/Credential.ts`, change the import:

```ts
import { Data, Schema } from "effect";
```

Keep that import as-is and add this after `NonEmptyString`:

```ts
const NonEmptyRedactedString = Schema.Redacted(NonEmptyString);
```

Change `OAuth2CreateConfig` and `BearerTokenCreateConfig`:

```ts
export const OAuth2CreateConfig = Schema.Struct({
  clientId: NonEmptyString,
  clientSecret: NonEmptyRedactedString,
  authorizationUrl: NonEmptyString,
  tokenUrl: NonEmptyString,
  scopes: Schema.Array(NonEmptyString),
});

export const BearerTokenCreateConfig = Schema.Struct({
  token: NonEmptyRedactedString,
});
```

- [ ] **Step 4: Run domain tests and typecheck**

Run: `pnpm test src/Domain/Credentials/Credential.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: FAIL in downstream code that still expects these fields to be strings. Those failures guide later tasks.

## Task 2: Redact Application Port Contracts

**Files:**

- Modify: `src/Application/Ports/SecretVault.ts`
- Modify: `src/Application/Ports/OAuth2Client.ts`
- Modify: `src/Application/Ports/CredentialRepository.ts`
- Modify: `src/Application/Ports/HttpExecutor.ts`

- [ ] **Step 1: Update `SecretVault` contract**

In `src/Application/Ports/SecretVault.ts`, change the import:

```ts
import { Context, Effect, Redacted } from "effect";
```

Change the sensitive fields:

```ts
readonly plaintext: Redacted.Redacted<string>;
```

and:

```ts
}) => Effect.Effect<Redacted.Redacted<string>, SemanticError>;
```

- [ ] **Step 2: Update `OAuth2Client` contract**

In `src/Application/Ports/OAuth2Client.ts`, change the import:

```ts
import { Context, Effect, Redacted, Schema } from "effect";
```

Change `OAuth2TokenResponse`:

```ts
export const OAuth2TokenResponse = Schema.Struct({
  accessToken: Schema.Redacted(Schema.String),
  refreshToken: Schema.optional(Schema.Redacted(Schema.String)),
  scopes: Schema.optional(Schema.Array(Schema.String)),
});
```

Change the sensitive input fields in the service tag:

```ts
readonly state: Redacted.Redacted<string>;
readonly codeVerifier: Redacted.Redacted<string>;
```

```ts
readonly clientSecret: Redacted.Redacted<string>;
readonly codeVerifier: Redacted.Redacted<string>;
```

```ts
readonly clientSecret: Redacted.Redacted<string>;
readonly refreshToken: Redacted.Redacted<string>;
```

- [ ] **Step 3: Update `CredentialRepository` OAuth state contract**

In `src/Application/Ports/CredentialRepository.ts`, change the import:

```ts
import { Context, Effect, Redacted } from "effect";
```

Change `OAuthState`:

```ts
export type OAuthState = {
  readonly state: Redacted.Redacted<string>;
  readonly credentialId: CredentialId;
  readonly codeVerifier: Redacted.Redacted<string>;
  readonly redirectUri: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};
```

Change `consumeOAuthState` input:

```ts
readonly state: Redacted.Redacted<string>;
readonly now: string;
```

- [ ] **Step 4: Update `HttpExecutor` prepared outbound headers**

In `src/Application/Ports/HttpExecutor.ts`, change the import:

```ts
import { Context, Effect, Schema } from "effect";
```

Add after `HeaderRecord`:

```ts
export const SensitiveHeaderValue = Schema.Union(Schema.String, Schema.Redacted(Schema.String));
export type SensitiveHeaderValue = Schema.Schema.Type<typeof SensitiveHeaderValue>;

export const PreparedHeaderRecord = Schema.Record({
  key: Schema.String,
  value: SensitiveHeaderValue,
});
export type PreparedHeaderRecord = Schema.Schema.Type<typeof PreparedHeaderRecord>;
```

Change `PreparedOutboundRequest`:

```ts
export const PreparedOutboundRequest = Schema.Struct({
  method: Schema.String,
  url: Schema.String,
  headers: PreparedHeaderRecord,
  body: Schema.optional(OutboundBody),
});
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: FAIL in implementations and tests that still use strings at these port boundaries.

## Task 3: Preserve Redaction In Application Services

**Files:**

- Modify: `src/Application/Services/CredentialService.ts`
- Modify: `src/Application/Services/OAuth2Service.ts`
- Modify: `src/Application/Services/CallService.ts`
- Modify: `src/Application/Services/CredentialService.spec.ts`
- Modify: `src/Application/Services/OAuth2Service.spec.ts`
- Modify: `src/Application/Services/CallService.spec.ts`

- [ ] **Step 1: Update `CredentialService` secret flow**

In `src/Application/Services/CredentialService.ts`, no unwrapping is needed. Keep these vault calls passing redacted values directly:

```ts
plaintext: bearerInput.bearerToken.token,
```

and:

```ts
plaintext: oauth2Input.oauth2.clientSecret,
```

- [ ] **Step 2: Update `OAuth2Service` redacted state and verifier flow**

In `src/Application/Services/OAuth2Service.ts`, change the import:

```ts
import { Context, Effect, Layer, Redacted, Schema } from "effect";
```

Change service inputs:

```ts
readonly state: Redacted.Redacted<string>;
```

Change `generateOpaqueValue`:

```ts
function generateOpaqueValue(prefix: string) {
  return Redacted.make(`${prefix}_${randomBytes(24).toString("base64url")}`);
}
```

When encrypting refresh tokens, keep the redacted value:

```ts
plaintext: tokenResponse.refreshToken,
```

- [ ] **Step 3: Update `CallService` authorization flow**

In `src/Application/Services/CallService.ts`, change the import:

```ts
import { Context, Effect, Layer, Match, Redacted } from "effect";
```

In `authorizationFor`, wrap bearer authorizations without unwrapping outside this function:

```ts
.pipe(Effect.map((token) => Redacted.make(`Bearer ${Redacted.value(token)}`)));
```

For OAuth access tokens, return a redacted Authorization value:

```ts
return Redacted.make(`Bearer ${Redacted.value(tokenResponse.accessToken)}`);
```

- [ ] **Step 4: Update application test doubles**

In application specs that define `makeSecretVault`, import `Redacted` and change fake vaults to unwrap only inside fake ciphertext construction and wrap decrypted plaintext:

```ts
import { Effect, Layer, Redacted, Ref } from "effect";
```

```ts
encrypt: (input) => Effect.succeed(`encrypted:${input.purpose}:${Redacted.value(input.plaintext)}`),
decrypt: (input) => Effect.succeed(Redacted.make(input.ciphertext.replace(`encrypted:${input.purpose}:`, ""))),
```

In OAuth client fakes, return redacted tokens:

```ts
accessToken: Redacted.make("access-token"),
refreshToken: Redacted.make("refresh-token"),
```

When asserting OAuth state URLs in tests, compare with `Redacted.value(state.state)`:

```ts
assert.assertTrue(result.loginUrl.includes(`state=${Redacted.value(state.state)}`));
```

- [ ] **Step 5: Run service tests and typecheck**

Run: `pnpm test src/Application/Services/CredentialService.spec.ts src/Application/Services/OAuth2Service.spec.ts src/Application/Services/CallService.spec.ts`

Expected: PASS after all fakes are updated.

Run: `pnpm typecheck`

Expected: FAIL only in infrastructure adapters and infrastructure tests not yet updated.

## Task 4: Redact Infrastructure Boundaries

**Files:**

- Modify: `src/Infrastructure/Encryption/NodeSecretVault.ts`
- Modify: `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`
- Modify: `src/Infrastructure/Http/HttpExecutorLive.ts`
- Modify: `src/Infrastructure/Http/HttpServer.ts`
- Modify: `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.ts`
- Modify related specs under `src/Infrastructure/**`

- [ ] **Step 1: Update `NodeSecretVault`**

In `src/Infrastructure/Encryption/NodeSecretVault.ts`, change the import:

```ts
import { Effect, Layer, Redacted, Schema } from "effect";
```

Change plaintext types to `Redacted.Redacted<string>` and decrypted return type to `Effect.Effect<Redacted.Redacted<string>, SemanticError>`.

Inside `encrypt`, change cipher update:

```ts
cipher.update(Redacted.value(input.plaintext), "utf8"),
```

Inside `decrypt`, wrap the returned string:

```ts
return Redacted.make(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8"));
```

- [ ] **Step 2: Update `OAuth2HttpClient`**

In `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`, change the import:

```ts
import { Effect, Either, Layer, Redacted, Schema } from "effect";
```

Unwrap only when writing URL/form fields:

```ts
url.searchParams.set("state", Redacted.value(input.state));
url.searchParams.set("code_challenge", Redacted.value(input.codeVerifier));
```

```ts
client_secret: Redacted.value(input.clientSecret),
code_verifier: Redacted.value(input.codeVerifier),
```

```ts
client_secret: Redacted.value(input.clientSecret),
refresh_token: Redacted.value(input.refreshToken),
```

Wrap token responses before decoding through `OAuth2TokenResponse`:

```ts
return (
  yield *
  Schema.decodeUnknown(OAuth2TokenResponse)({
    accessToken: Redacted.make(decoded.access_token),
    refreshToken:
      decoded.refresh_token === undefined ? undefined : Redacted.make(decoded.refresh_token),
    scopes:
      decoded.scope === undefined
        ? undefined
        : decoded.scope.split(" ").filter((scope) => scope.length > 0),
  }).pipe(Effect.mapError(() => OAuthTokenExchangeFailedError.make()))
);
```

- [ ] **Step 3: Update `HttpExecutorLive`**

In `src/Infrastructure/Http/HttpExecutorLive.ts`, change the import:

```ts
import { Effect, Layer, Redacted } from "effect";
```

Add helper:

```ts
function unredactedHeaders(headers: PreparedOutboundRequest["headers"]): HeaderRecord {
  const result: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    result[name] = Redacted.isRedacted(value) ? Redacted.value(value) : value;
  }

  return result;
}
```

Use it in both `fetch` branches:

```ts
headers: unredactedHeaders(request.headers),
```

- [ ] **Step 4: Update `HttpServer` callback state boundary**

In `src/Infrastructure/Http/HttpServer.ts`, change the import:

```ts
import { Effect, Layer, Option, Redacted, Schema } from "effect";
```

Wrap callback state:

```ts
state: Redacted.make(state),
```

- [ ] **Step 5: Update SQLite OAuth state storage**

In `src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.ts`, import `Redacted` from `effect`.

When inserting/querying OAuth state, unwrap `state.state`, `state.codeVerifier`, and consume input state with `Redacted.value(...)`.

When building an `OAuthState` from a row, wrap the sensitive values:

```ts
state: Redacted.make(row.state),
codeVerifier: Redacted.make(row.code_verifier),
```

- [ ] **Step 6: Update infrastructure tests**

In OAuth HTTP client tests, pass redacted input values and assert provider requests still receive plain strings:

```ts
clientSecret: Redacted.make("client-secret"),
codeVerifier: Redacted.make("code-verifier"),
refreshToken: Redacted.make("refresh-token"),
```

Assert decoded token response fields are redacted:

```ts
assert.assertTrue(Redacted.isRedacted(result.accessToken));
assert.strictEqual(Redacted.value(result.accessToken), "access-token");
```

In `HttpExecutorLive.spec.ts`, add a test that a redacted Authorization header is sent:

```ts
it.effect("unwraps redacted outbound headers at the fetch boundary", () =>
  Effect.gen(function* () {
    const executor = yield* HttpExecutor;

    const response = yield* executor.execute({
      method: "GET",
      url: "https://example.com",
      headers: { Authorization: Redacted.make("Bearer access-token") },
    });

    assert.strictEqual(response.status, 200);
  }).pipe(Effect.provide(HttpExecutorLive)),
);
```

If this test would perform a real network request, instead use the existing HTTP test server pattern from nearby specs and assert the received `authorization` header equals `Bearer access-token`.

- [ ] **Step 7: Run infrastructure tests and typecheck**

Run: `pnpm test src/Infrastructure/Encryption/NodeSecretVault.spec.ts src/Infrastructure/OAuth2/OAuth2HttpClient.spec.ts src/Infrastructure/Http/HttpExecutorLive.spec.ts src/Infrastructure/Persistence/Sqlite/CredentialRepositorySqlite.spec.ts src/Infrastructure/Http/HttpServer.spec.ts src/Infrastructure/Http/UsherE2E.spec.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

## Task 5: Full Verification And Sensitive String Scan

**Files:**

- Modify only files discovered by verification failures.

- [ ] **Step 1: Search for remaining plain secret-shaped fields**

Run: `rg "(clientSecret|refreshToken|accessToken|codeVerifier|plaintext|Authorization: authorization|token: Schema.String|clientSecret: Schema.String|refreshToken: string|accessToken: string|codeVerifier: string)" src`

Expected: matches either use `Redacted`, are encrypted ciphertext, are external decoded JSON field names, or are test literals intentionally wrapped with `Redacted.make`.

- [ ] **Step 2: Run required typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run full project checks**

Run: `vp check`

Expected: PASS.

Run: `vp test`

Expected: PASS.

- [ ] **Step 4: Review git diff**

Run: `git diff -- src docs/superpowers/specs docs/superpowers/plans`

Expected: diff only includes the Redacted refactor, the approved design doc, and this implementation plan.

Do not commit unless the user explicitly requests a commit.

## Self-Review

Spec coverage: Task 1 covers domain create schemas. Task 2 covers application port contracts. Task 3 covers application service data flow. Task 4 covers infrastructure unwrapping boundaries and persistence. Task 5 covers verification and remaining sensitive string scanning.

Placeholder scan: The plan avoids TBD/TODO placeholders and includes concrete file paths, code snippets, commands, and expected results.

Type consistency: Sensitive values use `Redacted.Redacted<string>` or `Schema.Redacted(Schema.String)` consistently. Persisted encrypted credential fields remain strings. Prepared outbound headers accept redacted values while inbound and response headers remain plain strings.
