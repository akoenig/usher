import { Context, Effect, Schema } from "effect";
import { CredentialId } from "../../Domain/Credentials/Credential.js";

const NonEmptyString = Schema.String.pipe(Schema.nonEmptyString());

export const AuditOutcome = Schema.Literal("allowed", "denied", "error");
export type AuditOutcome = Schema.Schema.Type<typeof AuditOutcome>;

export const AuditEventName = Schema.Literal("OutboundCallCompleted");
export type AuditEventName = Schema.Schema.Type<typeof AuditEventName>;

export const AuditEventSequence = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));
export type AuditEventSequence = Schema.Schema.Type<typeof AuditEventSequence>;

export const AuditEventCursor = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
export type AuditEventCursor = Schema.Schema.Type<typeof AuditEventCursor>;

export const AuditRecord = Schema.Struct({
  timestamp: NonEmptyString,
  sourceIp: NonEmptyString,
  userAgent: NonEmptyString,
  method: NonEmptyString,
  targetUrl: NonEmptyString,
  matchedCredentialId: Schema.optional(CredentialId),
  upstreamStatus: Schema.optional(Schema.Number),
  errorCode: Schema.optional(NonEmptyString),
  outcome: AuditOutcome,
});
export type AuditRecord = Schema.Schema.Type<typeof AuditRecord>;

export const AuditEvent = Schema.Struct({
  sequence: AuditEventSequence,
  event: AuditEventName,
  timestamp: NonEmptyString,
  sourceIp: NonEmptyString,
  userAgent: NonEmptyString,
  method: NonEmptyString,
  targetUrl: NonEmptyString,
  matchedCredentialId: Schema.optional(CredentialId),
  upstreamStatus: Schema.optional(Schema.Number),
  errorCode: Schema.optional(NonEmptyString),
  outcome: AuditOutcome,
});
export type AuditEvent = Schema.Schema.Type<typeof AuditEvent>;

export const AuditEventReadOptions = Schema.Struct({
  limit: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
});
export type AuditEventReadOptions = Schema.Schema.Type<typeof AuditEventReadOptions>;

export class AuditLog extends Context.Tag("AuditLog")<
  AuditLog,
  {
    readonly record: (record: AuditRecord) => Effect.Effect<void>;
    readonly readRecent: (
      options: AuditEventReadOptions,
    ) => Effect.Effect<ReadonlyArray<AuditEvent>>;
    readonly readAfter: (cursor: AuditEventCursor) => Effect.Effect<ReadonlyArray<AuditEvent>>;
  }
>() {}
