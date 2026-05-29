# X OAuth2 Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an X OAuth2 preset that uses HTTP Basic token endpoint authentication without changing Google OAuth behavior.

**Architecture:** Store an OAuth2 token auth method on credentials and thread it through application services to the OAuth2 HTTP client. Keep `client_secret_post` as the default for existing, Google, and Custom credentials; use `client_secret_basic` for X.

**Tech Stack:** TypeScript, Effect Schema, Effect services, `@effect/vitest`, Effect Platform HTTP client.

---

### Task 1: Domain and Port Shape

**Files:**

- Modify: `src/Domain/Credentials/Credential.ts`
- Modify: `src/Application/Ports/OAuth2Client.ts`
- Test: `src/Domain/Credentials/Credential.spec.ts`

- [ ] **Step 1: Write failing tests for OAuth2 token auth method decoding**

Add assertions that OAuth2 create config accepts `tokenAuthMethod: "client_secret_basic"` and stored OAuth2 config accepts optional `tokenAuthMethod`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/Domain/Credentials/Credential.spec.ts`
Expected: FAIL because `tokenAuthMethod` is not part of the schemas.

- [ ] **Step 3: Add token auth schemas and port fields**

Add `OAuth2TokenAuthMethod = Schema.Literal("client_secret_post", "client_secret_basic")`. Add optional `tokenAuthMethod` to create and stored OAuth2 config schemas. Add `tokenAuthMethod?: OAuth2TokenAuthMethod` to `exchangeAuthorizationCode` and `refreshAccessToken` inputs.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/Domain/Credentials/Credential.spec.ts`
Expected: PASS.

### Task 2: X CLI Preset

**Files:**

- Modify: `src/Infrastructure/Cli/OAuthTemplates.ts`
- Modify: `src/Infrastructure/Cli/OAuthTemplates.spec.ts`
- Modify: `src/Infrastructure/Cli/CredentialPrompts.ts`
- Modify: `src/Infrastructure/Cli/CredentialPrompts.spec.ts`

- [ ] **Step 1: Write failing tests for X template and credential input**

Add tests for `xOAuth2Template`, `xAllowedOriginHelp`, `xScopesFromSelections`, and `buildOAuth2CredentialInput` preserving an explicit `tokenAuthMethod`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/Infrastructure/Cli/OAuthTemplates.spec.ts src/Infrastructure/Cli/CredentialPrompts.spec.ts`
Expected: FAIL because X exports and credential input support do not exist.

- [ ] **Step 3: Implement X provider prompt path**

Add `X` to `OAuthProvider`. Add X endpoint template, allowed-origin help, scope choices, and scope mapping. In `promptOAuth2CredentialInput`, branch like Google but use X template and set `tokenAuthMethod: "client_secret_basic"`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/Infrastructure/Cli/OAuthTemplates.spec.ts src/Infrastructure/Cli/CredentialPrompts.spec.ts`
Expected: PASS.

### Task 3: Token Exchange Authentication

**Files:**

- Modify: `src/Infrastructure/OAuth2/OAuth2HttpClient.ts`
- Modify: `src/Infrastructure/OAuth2/OAuth2HttpClient.spec.ts`
- Modify: `src/Application/Services/OAuth2Service.ts`
- Modify: `src/Application/Services/CallService.ts`
- Test: `src/Application/Services/OAuth2Service.spec.ts`
- Test: `src/Application/Services/CallService.spec.ts`

- [ ] **Step 1: Write failing OAuth2 HTTP client tests**

Add tests proving `client_secret_basic` sends `Authorization: Basic base64(client_id:client_secret)` for authorization-code and refresh-token exchanges and omits `client_id` and `client_secret` from the form body.

- [ ] **Step 2: Run OAuth2 HTTP client test to verify it fails**

Run: `pnpm vitest run src/Infrastructure/OAuth2/OAuth2HttpClient.spec.ts`
Expected: FAIL because token auth method is ignored.

- [ ] **Step 3: Implement token request selection**

Default missing auth method to `client_secret_post`. For `client_secret_post`, keep current body fields. For `client_secret_basic`, set the Basic authorization header and omit client credentials from form fields.

- [ ] **Step 4: Thread stored token auth method through services**

Pass `credential.oauth2.tokenAuthMethod` from OAuth2 callback exchange and access-token refresh call sites.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/Infrastructure/OAuth2/OAuth2HttpClient.spec.ts src/Application/Services/OAuth2Service.spec.ts src/Application/Services/CallService.spec.ts`
Expected: PASS.

### Task 4: Full Verification

**Files:**

- No source modifications expected.

- [ ] **Step 1: Run immediate typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Run project checks and tests**

Run: `vp check`
Expected: PASS.

Run: `vp test`
Expected: PASS.
