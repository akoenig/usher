import { describe, it } from "@effect/vitest"
import * as assert from "@effect/vitest/utils"
import {
  allowedRequestMatches,
  allowedRequestsOverlap,
  normalizeAllowedRequest
} from "./AllowedRequest.js"

describe("AllowedRequest", () => {
  it("matches same origin and path prefix", () => {
    const matcher = normalizeAllowedRequest({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" }
    })

    assert.assertTrue(
      allowedRequestMatches(matcher, new URL("https://api.example.com/calendar/events"))
    )
  })

  it("does not match sibling path prefix", () => {
    const matcher = normalizeAllowedRequest({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" }
    })

    assert.assertFalse(
      allowedRequestMatches(matcher, new URL("https://api.example.com/calendar2/events"))
    )
  })

  it("detects overlap for same origin where one prefix starts with the other", () => {
    const broad = normalizeAllowedRequest({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" }
    })
    const narrow = normalizeAllowedRequest({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/events/" }
    })

    assert.assertTrue(allowedRequestsOverlap(broad, narrow))
    assert.assertTrue(allowedRequestsOverlap(narrow, broad))
  })

  it("does not overlap different origins", () => {
    const left = normalizeAllowedRequest({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" }
    })
    const right = normalizeAllowedRequest({
      url: { origin: "https://other.example.com", pathPrefix: "/calendar/events/" }
    })

    assert.assertFalse(allowedRequestsOverlap(left, right))
  })

  it("normalizes origin to URL origin", () => {
    const normalized = normalizeAllowedRequest({
      url: { origin: "https://api.example.com:443/calendar?ignored=true", pathPrefix: "/" }
    })

    assert.strictEqual(normalized.url.origin, "https://api.example.com")
  })

  it("rejects non-https origins", () => {
    assert.throws(() =>
      normalizeAllowedRequest({
        url: { origin: "http://api.example.com", pathPrefix: "/" }
      })
    )
  })

  it("rejects pathPrefix values that do not start and end with slash", () => {
    assert.throws(() =>
      normalizeAllowedRequest({
        url: { origin: "https://api.example.com", pathPrefix: "calendar/" }
      })
    )
    assert.throws(() =>
      normalizeAllowedRequest({
        url: { origin: "https://api.example.com", pathPrefix: "/calendar" }
      })
    )
  })
})
