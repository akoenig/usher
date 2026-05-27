import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Layer, Ref } from "effect"
import type { Credential } from "../../Domain/Credentials/Credential.js"
import {
  MissingUserAgentError,
  NoMatchingCredentialError,
  OAuthStateInvalidError,
  ReservedHeaderError
} from "../../Domain/Errors/UsherErrors.js"
import { AuditLog, type AuditRecord } from "../Ports/AuditLog.js"
import { CredentialRepository, type OAuthState } from "../Ports/CredentialRepository.js"
import { HttpExecutor, type PreparedOutboundRequest } from "../Ports/HttpExecutor.js"
import { OAuth2Client } from "../Ports/OAuth2Client.js"
import { SecretVault } from "../Ports/SecretVault.js"
import { CallService, CallServiceLive } from "./CallService.js"

describe("CallService", () => {
  it.effect("fails when no active credential matches the target URL", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          return yield* service.call({
            method: "GET",
            targetUrl: "https://api.example.com/v1/users",
            headers: { "User-Agent": "usher-test" },
            sourceIp: "203.0.113.10"
          })
        }),
        yield* makeLayer([])
      ))

      assert.assertInstanceOf(error, NoMatchingCredentialError)
    }))

  it.effect("fails when User-Agent is missing", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          return yield* service.call({
            method: "GET",
            targetUrl: "https://api.example.com/v1/users",
            headers: {},
            sourceIp: "203.0.113.10"
          })
        }),
        yield* makeLayer([bearerCredential])
      ))

      assert.assertInstanceOf(error, MissingUserAgentError)
    }))

  it.effect("fails when Authorization is supplied by the caller", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          return yield* service.call({
            method: "GET",
            targetUrl: "https://api.example.com/v1/users",
            headers: { "User-Agent": "usher-test", Authorization: "Bearer caller-token" },
            sourceIp: "203.0.113.10"
          })
        }),
        yield* makeLayer([bearerCredential])
      ))

      assert.assertInstanceOf(error, ReservedHeaderError)
    }))

  it.effect("injects bearer authorization and forwards method body and non-hop-by-hop headers", () =>
    Effect.gen(function*() {
      const requests = yield* Ref.make<ReadonlyArray<PreparedOutboundRequest>>([])
      const result = yield* Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          return yield* service.call({
            method: "POST",
            targetUrl: "https://api.example.com/v1/users",
            headers: {
              "User-Agent": "usher-test",
              "Content-Type": "application/json",
              Connection: "keep-alive",
              "Keep-Alive": "timeout=5"
            },
            body: "{\"name\":\"Ada\"}",
            sourceIp: "203.0.113.10"
          })
        }),
        yield* makeLayer([bearerCredential], { requests })
      )

      const forwarded = yield* Ref.get(requests)
      const request = forwarded[0]

      assert.strictEqual(result.status, 201)
      assert.strictEqual(forwarded.length, 1)
      assert.deepStrictEqual(request, {
        method: "POST",
        url: "https://api.example.com/v1/users",
        headers: {
          "User-Agent": "usher-test",
          "Content-Type": "application/json",
          Authorization: "Bearer decrypted-bearer-token"
        },
        body: "{\"name\":\"Ada\"}"
      })
    }))

  it.effect("refreshes OAuth2 access token and injects bearer authorization", () =>
    Effect.gen(function*() {
      const requests = yield* Ref.make<ReadonlyArray<PreparedOutboundRequest>>([])
      const refreshTokens = yield* Ref.make<ReadonlyArray<string>>([])

      yield* Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          return yield* service.call({
            method: "GET",
            targetUrl: "https://calendar.example.com/calendars/primary/events",
            headers: { "User-Agent": "usher-test" },
            sourceIp: "203.0.113.10"
          })
        }),
        yield* makeLayer([oauth2Credential], { requests, refreshTokens })
      )

      const forwarded = yield* Ref.get(requests)
      const refreshed = yield* Ref.get(refreshTokens)

      assert.deepStrictEqual(refreshed, ["decrypted-refresh-token"])
      assert.strictEqual(forwarded[0]?.headers.Authorization, "Bearer refreshed-access-token")
    }))

  it.effect("records success and error outcomes without authorization", () =>
    Effect.gen(function*() {
      const auditRecords = yield* Ref.make<ReadonlyArray<AuditRecord>>([])

      yield* Effect.provide(
        Effect.gen(function*() {
          const service = yield* CallService

          yield* service.call({
            method: "GET",
            targetUrl: "https://api.example.com/v1/users",
            headers: { "User-Agent": "usher-test" },
            sourceIp: "203.0.113.10"
          })

          return yield* Effect.flip(service.call({
            method: "GET",
            targetUrl: "https://other.example.com/v1/users",
            headers: { "User-Agent": "usher-test" },
            sourceIp: "203.0.113.10"
          }))
        }),
        yield* makeLayer([bearerCredential], { auditRecords })
      )

      const records = yield* Ref.get(auditRecords)

      assert.strictEqual(records.length, 2)
      assert.deepStrictEqual(records.map((record) => record.outcome), ["allowed", "denied"])
      assert.strictEqual(records[0]?.matchedCredentialId, bearerCredential.credentialId)
      assert.strictEqual(records[0]?.upstreamStatus, 201)
      assert.strictEqual(records[1]?.errorCode, "NoMatchingCredentialError")
      assert.assertFalse(JSON.stringify(records).includes("Authorization"))
      assert.assertFalse(JSON.stringify(records).includes("decrypted-bearer-token"))
    }))
})

const bearerCredential: Credential = {
  credentialId: "cred_bearertoken0001",
  type: "BearerToken",
  label: "API",
  status: "active",
  allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1/" } }],
  bearerToken: { encryptedToken: "encrypted-bearer-token" },
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z"
}

const oauth2Credential: Credential = {
  credentialId: "cred_oauth2token0001",
  type: "OAuth2",
  label: "Calendar",
  status: "active",
  allowedRequests: [{ url: { origin: "https://calendar.example.com", pathPrefix: "/calendars/" } }],
  oauth2: {
    clientId: "client-id",
    encryptedClientSecret: "encrypted-client-secret",
    authorizationUrl: "https://auth.example.com/authorize",
    tokenUrl: "https://auth.example.com/token",
    scopes: ["calendar.readonly"],
    grantedScopes: ["calendar.readonly"],
    encryptedRefreshToken: "encrypted-refresh-token"
  },
  createdAt: "2026-05-27T00:00:00.000Z",
  updatedAt: "2026-05-27T00:00:00.000Z"
}

function makeLayer(
  credentials: ReadonlyArray<Credential>,
  refs?: {
    readonly requests?: Ref.Ref<ReadonlyArray<PreparedOutboundRequest>>
    readonly refreshTokens?: Ref.Ref<ReadonlyArray<string>>
    readonly auditRecords?: Ref.Ref<ReadonlyArray<AuditRecord>>
  }
) {
  return Effect.gen(function*() {
    const stored = yield* Ref.make(credentials)
    const requests = refs?.requests ?? (yield* Ref.make<ReadonlyArray<PreparedOutboundRequest>>([]))
    const refreshTokens = refs?.refreshTokens ?? (yield* Ref.make<ReadonlyArray<string>>([]))
    const auditRecords = refs?.auditRecords ?? (yield* Ref.make<ReadonlyArray<AuditRecord>>([]))

    return Layer.provide(
      CallServiceLive,
      Layer.mergeAll(
        Layer.succeed(CredentialRepository, makeCredentialRepository(stored)),
        Layer.succeed(SecretVault, makeSecretVault()),
        Layer.succeed(OAuth2Client, makeOAuth2Client(refreshTokens)),
        Layer.succeed(HttpExecutor, makeHttpExecutor(requests)),
        Layer.succeed(AuditLog, makeAuditLog(auditRecords))
      )
    )
  })
}

function makeCredentialRepository(stored: Ref.Ref<ReadonlyArray<Credential>>) {
  return {
    insert: (credential: Credential) => Ref.update(stored, (credentials) => [...credentials, credential]),
    update: (credential: Credential) => Ref.update(stored, (credentials) =>
      credentials.map((storedCredential) =>
        storedCredential.credentialId === credential.credentialId ? credential : storedCredential
      )
    ),
    list: () => Ref.get(stored),
    getById: (credentialId: Credential["credentialId"]) => Effect.gen(function*() {
      const credentials = yield* Ref.get(stored)
      const credential = credentials.find((storedCredential) => storedCredential.credentialId === credentialId)

      if (credential === undefined) {
        return yield* Effect.die("missing credential")
      }

      return credential
    }),
    deleteById: (_credentialId: Credential["credentialId"]) => Effect.void,
    findAllNonDeleted: () => Ref.get(stored),
    insertOAuthState: (_state: OAuthState) => Effect.void,
    consumeOAuthState: (_input: { readonly state: string; readonly now: string }) =>
      Effect.fail(OAuthStateInvalidError.make())
  }
}

function makeSecretVault() {
  return {
    encrypt: (_input: {
      readonly credentialId: Credential["credentialId"]
      readonly purpose: string
      readonly plaintext: string
    }) => Effect.succeed("encrypted"),
    decrypt: (input: {
      readonly credentialId: Credential["credentialId"]
      readonly purpose: string
      readonly ciphertext: string
    }) => {
      if (input.ciphertext === "encrypted-bearer-token") {
        return Effect.succeed("decrypted-bearer-token")
      }

      if (input.ciphertext === "encrypted-refresh-token") {
        return Effect.succeed("decrypted-refresh-token")
      }

      return Effect.succeed("decrypted-client-secret")
    }
  }
}

function makeOAuth2Client(refreshTokens: Ref.Ref<ReadonlyArray<string>>) {
  return {
    buildAuthorizationUrl: (_input: {
      readonly authorizationUrl: string
      readonly clientId: string
      readonly redirectUri: string
      readonly scopes: ReadonlyArray<string>
      readonly state: string
      readonly codeVerifier: string
    }) => Effect.succeed("https://auth.example.com/authorize"),
    exchangeAuthorizationCode: (_input: {
      readonly tokenUrl: string
      readonly clientId: string
      readonly clientSecret: string
      readonly code: string
      readonly redirectUri: string
      readonly codeVerifier: string
    }) => Effect.succeed({ accessToken: "access-token" }),
    refreshAccessToken: (input: {
      readonly tokenUrl: string
      readonly clientId: string
      readonly clientSecret: string
      readonly refreshToken: string
    }) => Ref.update(refreshTokens, (tokens) => [...tokens, input.refreshToken]).pipe(
      Effect.as({ accessToken: "refreshed-access-token" })
    )
  }
}

function makeHttpExecutor(requests: Ref.Ref<ReadonlyArray<PreparedOutboundRequest>>) {
  return {
    execute: (request: PreparedOutboundRequest) => Ref.update(requests, (stored) => [...stored, request]).pipe(
      Effect.as({
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: "{\"ok\":true}"
      })
    )
  }
}

function makeAuditLog(auditRecords: Ref.Ref<ReadonlyArray<AuditRecord>>) {
  return {
    record: (record: AuditRecord) => Ref.update(auditRecords, (records) => [...records, record])
  }
}
