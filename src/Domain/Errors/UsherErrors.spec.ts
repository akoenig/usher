import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { Either, Schema } from "effect"
import {
  ErrorResponseBody,
  MissingUserAgentError,
  NoMatchingCredentialError,
  semanticErrorMakers,
  toErrorResponseBody
} from "./UsherErrors.js"

describe("UsherErrors", () => {
  it("converts NoMatchingCredentialError to an error response body", () => {
    const error = NoMatchingCredentialError.make()
    const body = toErrorResponseBody(error)

    assert.deepStrictEqual(body, {
      error: {
        code: "NoMatchingCredentialError",
        message: "No matching credential found for the requested URL"
      }
    })
  })

  it("creates MissingUserAgentError with its semantic code", () => {
    const error = MissingUserAgentError.make()

    assert.strictEqual(error.code, "MissingUserAgentError")
  })

  it("creates every semantic error with a code ending in Error", () => {
    for (const makeError of semanticErrorMakers) {
      const error = makeError()

      assert.assertTrue(error.code.endsWith("Error"))
    }
  })

  it("decodes an error response body", () => {
    const decoded = Schema.decodeUnknownEither(ErrorResponseBody)({
      error: {
        code: "NoMatchingCredentialError",
        message: "No matching credential found for the requested URL"
      }
    })

    assert.assertTrue(Either.isRight(decoded))
  })
})
