import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Either } from "effect";
import {
  allowedRequestMatches,
  allowedRequestsOverlap,
  normalizeAllowedRequest,
  type AllowedRequest,
} from "./AllowedRequest.js";

function normalizedOrThrow(value: AllowedRequest) {
  return Either.getOrThrow(normalizeAllowedRequest(value));
}

describe("AllowedRequest", () => {
  it("matches same origin and path prefix", () => {
    const matcher = normalizedOrThrow({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" },
    });

    assert.assertTrue(
      allowedRequestMatches(matcher, new URL("https://api.example.com/calendar/events")),
    );
  });

  it("does not match sibling path prefix", () => {
    const matcher = normalizedOrThrow({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" },
    });

    assert.assertFalse(
      allowedRequestMatches(matcher, new URL("https://api.example.com/calendar2/events")),
    );
  });

  it("detects overlap for same origin where one prefix starts with the other", () => {
    const broad = normalizedOrThrow({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" },
    });
    const narrow = normalizedOrThrow({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/events/" },
    });

    assert.assertTrue(allowedRequestsOverlap(broad, narrow));
    assert.assertTrue(allowedRequestsOverlap(narrow, broad));
  });

  it("does not overlap different origins", () => {
    const left = normalizedOrThrow({
      url: { origin: "https://api.example.com", pathPrefix: "/calendar/" },
    });
    const right = normalizedOrThrow({
      url: { origin: "https://other.example.com", pathPrefix: "/calendar/events/" },
    });

    assert.assertFalse(allowedRequestsOverlap(left, right));
  });

  it("normalizes origin to URL origin", () => {
    const normalized = normalizedOrThrow({
      url: { origin: "https://api.example.com:443/calendar?ignored=true", pathPrefix: "/" },
    });

    assert.strictEqual(normalized.url.origin, "https://api.example.com");
  });

  it("rejects non-https origins", () => {
    const result = normalizeAllowedRequest({
      url: { origin: "http://api.example.com", pathPrefix: "/" },
    });

    assert.assertTrue(Either.isLeft(result));
  });

  it("rejects unparseable origins", () => {
    const result = normalizeAllowedRequest({
      url: { origin: "not a url", pathPrefix: "/" },
    });

    assert.assertTrue(Either.isLeft(result));
  });

  it("rejects pathPrefix values that do not start and end with slash", () => {
    assert.assertTrue(
      Either.isLeft(
        normalizeAllowedRequest({
          url: { origin: "https://api.example.com", pathPrefix: "calendar/" },
        }),
      ),
    );
    assert.assertTrue(
      Either.isLeft(
        normalizeAllowedRequest({
          url: { origin: "https://api.example.com", pathPrefix: "/calendar" },
        }),
      ),
    );
  });
});
