import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import { isAdminRequestAllowed, isCallRequestAllowed } from "./AccessControl.js"

describe("AccessControl", () => {
  it("allows loopback callers for admin endpoints", () => {
    assert.strictEqual(isAdminRequestAllowed("127.0.0.1"), true)
    assert.strictEqual(isAdminRequestAllowed("::1"), true)
  })

  it("denies non-loopback callers for admin endpoints", () => {
    assert.strictEqual(isAdminRequestAllowed("203.0.113.10"), false)
  })

  it("allows loopback callers for call endpoints", () => {
    assert.strictEqual(isCallRequestAllowed("127.0.0.1", []), true)
    assert.strictEqual(isCallRequestAllowed("::1", []), true)
  })

  it("allows configured caller IPs for call endpoints", () => {
    assert.strictEqual(isCallRequestAllowed("203.0.113.10", ["203.0.113.10"]), true)
  })

  it("denies non-allowlisted caller IPs for call endpoints", () => {
    assert.strictEqual(isCallRequestAllowed("203.0.113.11", ["203.0.113.10"]), false)
  })
})
