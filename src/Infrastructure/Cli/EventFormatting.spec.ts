import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import type { AuditEvent } from "../../Application/Ports/AuditLog.js";
import { formatEvent, formatEvents } from "./EventFormatting.js";

describe("EventFormatting", () => {
  it("formats an allowed audit event", () => {
    const event: AuditEvent = {
      sequence: 1,
      event: "OutboundCallCompleted",
      timestamp: "2026-05-28T12:10:03.120Z",
      outcome: "allowed",
      method: "GET",
      targetUrl: "https://api.example.com/v1/users",
      upstreamStatus: 200,
      matchedCredentialId: "cred_0123456789abcdef",
      sourceIp: "127.0.0.1",
      userAgent: "curl/8.0",
    };

    assert.strictEqual(
      formatEvent(event),
      "OutboundCallCompleted 2026-05-28T12:10:03.120Z allowed GET https://api.example.com/v1/users 200 - cred_0123456789abcdef 127.0.0.1 curl/8.0",
    );
  });

  it("formats a denied audit event", () => {
    const event: AuditEvent = {
      sequence: 2,
      event: "OutboundCallCompleted",
      timestamp: "2026-05-28T12:11:44.812Z",
      outcome: "denied",
      method: "POST",
      targetUrl: "https://api.example.com/v1/admin",
      errorCode: "NoMatchingCredentialError",
      sourceIp: "127.0.0.1",
      userAgent: "curl/8.0",
    };

    assert.strictEqual(
      formatEvent(event),
      "OutboundCallCompleted 2026-05-28T12:11:44.812Z denied POST https://api.example.com/v1/admin - NoMatchingCredentialError - 127.0.0.1 curl/8.0",
    );
  });

  it("formats an empty event list", () => {
    assert.strictEqual(formatEvents([]), "");
  });
});
