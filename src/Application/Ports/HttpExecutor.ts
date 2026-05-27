import { Context, Effect, Schema } from "effect"
import type { SemanticError } from "../../Domain/Errors/UsherErrors.js"

export const OutboundBody = Schema.Union(Schema.String, Schema.Uint8ArrayFromSelf)
export type OutboundBody = Schema.Schema.Type<typeof OutboundBody>

export const HeaderRecord = Schema.Record({ key: Schema.String, value: Schema.String })
export type HeaderRecord = Schema.Schema.Type<typeof HeaderRecord>

export const PreparedOutboundRequest = Schema.Struct({
  method: Schema.String,
  url: Schema.String,
  headers: HeaderRecord,
  body: Schema.optional(OutboundBody)
})
export type PreparedOutboundRequest = Schema.Schema.Type<typeof PreparedOutboundRequest>

export const UpstreamResponse = Schema.Struct({
  status: Schema.Number,
  headers: HeaderRecord,
  body: OutboundBody
})
export type UpstreamResponse = Schema.Schema.Type<typeof UpstreamResponse>

export class HttpExecutor extends Context.Tag("HttpExecutor")<
  HttpExecutor,
  {
    readonly execute: (request: PreparedOutboundRequest) => Effect.Effect<UpstreamResponse, SemanticError>
  }
>() {}
