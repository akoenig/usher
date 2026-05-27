import { HttpClient, HttpClientRequest, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Effect, Layer, Ref } from "effect"
import { CallService, type CallCommand } from "../../Application/Services/CallService.js"
import { CredentialService } from "../../Application/Services/CredentialService.js"
import { OAuth2Service } from "../../Application/Services/OAuth2Service.js"
import { NoMatchingCredentialError } from "../../Domain/Errors/UsherErrors.js"
import { makeHttpApp } from "./HttpServer.js"

describe("HttpServer", () => {
  it.effect("forwards call method body and headers and preserves upstream status and body", () =>
    Effect.gen(function*() {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([])

      return yield* Effect.gen(function*() {
        yield* HttpServer.serveEffect(makeHttpApp({ allowedCallerIps: [] }))
        const response = yield* HttpClientRequest.post("/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers").pipe(
          HttpClientRequest.setHeader("x-correlation-id", "request-123"),
          HttpClientRequest.setHeader("user-agent", "usher-test"),
          HttpClientRequest.bodyText("{\"name\":\"Ada\"}", "application/json"),
          HttpClient.execute
        )
        const body = yield* response.text
        const forwarded = yield* Ref.get(commands)
        const command = forwarded[0]

        assert.strictEqual(response.status, 202)
        assert.strictEqual(response.headers["x-upstream"], "accepted")
        assert.strictEqual(body, "created")
        assert.strictEqual(command?.method, "POST")
        assert.strictEqual(command?.targetUrl, "https://api.example.com/v1/users")
        assert.strictEqual(command?.headers["x-correlation-id"], "request-123")
        assert.deepStrictEqual(command?.body, new TextEncoder().encode("{\"name\":\"Ada\"}"))
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")))
    }))

  it.effect("returns usher error headers and JSON body for service errors", () =>
    Effect.gen(function*() {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([])

      return yield* Effect.gen(function*() {
        yield* HttpServer.serveEffect(makeHttpApp({ allowedCallerIps: [] }))
        const response = yield* HttpClient.get("/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers", {
          headers: { "user-agent": "usher-test" }
        })
        const body = yield* response.json

        assert.strictEqual(response.status, 400)
        assert.strictEqual(response.headers["x-usher-error"], "true")
        assert.strictEqual(response.headers["x-usher-error-code"], "NoMatchingCredentialError")
        assert.deepStrictEqual(body, {
          error: {
            code: "NoMatchingCredentialError",
            message: "No matching credential found for the requested URL"
          }
        })
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "error")))
    }))
})

function makeTestLayer(
  commands: Ref.Ref<ReadonlyArray<CallCommand>>,
  mode: "success" | "error"
) {
  return Layer.mergeAll(
    Layer.succeed(CallService, {
      call: (command) => call(commands, mode, command),
      execute: (command) => call(commands, mode, command)
    }),
    Layer.succeed(CredentialService, {
      create: () => Effect.die("unused"),
      list: () => Effect.die("unused"),
      getById: () => Effect.die("unused"),
      deleteById: () => Effect.die("unused")
    }),
    Layer.succeed(OAuth2Service, {
      buildLoginUrl: () => Effect.die("unused"),
      handleCallback: () => Effect.die("unused")
    }),
    NodeHttpServer.layerTest
  )
}

function call(
  commands: Ref.Ref<ReadonlyArray<CallCommand>>,
  mode: "success" | "error",
  command: CallCommand
) {
  return Effect.gen(function*() {
    yield* Ref.update(commands, (existing) => [...existing, command])
    if (mode === "error") {
      return yield* Effect.fail(NoMatchingCredentialError.make())
    }

    return {
      status: 202,
      headers: { "x-upstream": "accepted" },
      body: "created"
    }
  })
}
