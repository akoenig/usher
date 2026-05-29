import type { AuditEvent } from "../../Application/Ports/AuditLog.js";

export function formatEvent(event: AuditEvent) {
  return [
    event.event,
    event.timestamp,
    event.outcome,
    event.method,
    event.targetUrl,
    event.upstreamStatus ?? "-",
    event.errorCode ?? "-",
    event.matchedCredentialId ?? "-",
    event.sourceIp,
    event.userAgent,
  ].join(" ");
}

export function formatEvents(events: ReadonlyArray<AuditEvent>) {
  return events.map(formatEvent).join("\n");
}
