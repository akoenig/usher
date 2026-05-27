import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
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
