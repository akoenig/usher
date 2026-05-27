import { Context, Effect, Schema } from "effect"
import { CredentialId } from "../../Domain/Credentials/Credential.js"

const NonEmptyString = Schema.String.pipe(Schema.nonEmptyString())

export const AuditOutcome = Schema.Literal("allowed", "denied", "error")
export type AuditOutcome = Schema.Schema.Type<typeof AuditOutcome>

export const AuditRecord = Schema.Struct({
  timestamp: NonEmptyString,
  sourceIp: NonEmptyString,
  userAgent: NonEmptyString,
  method: NonEmptyString,
  targetUrl: NonEmptyString,
  matchedCredentialId: Schema.optional(CredentialId),
  upstreamStatus: Schema.optional(Schema.Number),
  errorCode: Schema.optional(NonEmptyString),
  outcome: AuditOutcome
})
export type AuditRecord = Schema.Schema.Type<typeof AuditRecord>

export class AuditLog extends Context.Tag("AuditLog")<
  AuditLog,
  {
    readonly record: (record: AuditRecord) => Effect.Effect<void>
  }
>() {}
