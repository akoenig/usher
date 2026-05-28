import { Context, Effect, Schema } from "effect";
import type { SemanticError } from "../../Domain/Errors/UsherErrors.js";

export const OutboundBody = Schema.Union(Schema.String, Schema.Uint8ArrayFromSelf);
export type OutboundBody = Schema.Schema.Type<typeof OutboundBody>;

export const HeaderRecord = Schema.Record({ key: Schema.String, value: Schema.String });
export type HeaderRecord = Schema.Schema.Type<typeof HeaderRecord>;

export const BearerHeaderValue = Schema.Struct({
  scheme: Schema.Literal("Bearer"),
  token: Schema.Redacted(Schema.String),
});
export type BearerHeaderValue = Schema.Schema.Type<typeof BearerHeaderValue>;

export const SensitiveHeaderValue = Schema.Union(
  Schema.String,
  Schema.Redacted(Schema.String),
  BearerHeaderValue,
);
export type SensitiveHeaderValue = Schema.Schema.Type<typeof SensitiveHeaderValue>;

export const PreparedHeaderRecord = Schema.Record({
  key: Schema.String,
  value: SensitiveHeaderValue,
});
export type PreparedHeaderRecord = Schema.Schema.Type<typeof PreparedHeaderRecord>;

export const PreparedOutboundRequest = Schema.Struct({
  method: Schema.String,
  url: Schema.String,
  headers: PreparedHeaderRecord,
  body: Schema.optional(OutboundBody),
});
export type PreparedOutboundRequest = Schema.Schema.Type<typeof PreparedOutboundRequest>;

export const UpstreamResponse = Schema.Struct({
  status: Schema.Number,
  headers: HeaderRecord,
  body: OutboundBody,
});
export type UpstreamResponse = Schema.Schema.Type<typeof UpstreamResponse>;

export class HttpExecutor extends Context.Tag("HttpExecutor")<
  HttpExecutor,
  {
    readonly execute: (
      request: PreparedOutboundRequest,
    ) => Effect.Effect<UpstreamResponse, SemanticError>;
  }
>() {}
