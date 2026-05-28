import { HttpBody, HttpClient, HttpClientError, HttpClientRequest } from "@effect/platform";
import { Context, Effect, Layer, Schema } from "effect";
import type * as ParseResult from "effect/ParseResult";
import { AuditEvent, AuditEventSequence } from "../../Application/Ports/AuditLog.js";
import { RedactedCredential } from "../../Application/Services/CredentialService.js";
import { CreateCredentialInput, CredentialId } from "../../Domain/Credentials/Credential.js";

const RedactedCredentials = Schema.Array(RedactedCredential);
const AuditEvents = Schema.Array(AuditEvent);

export const AdminEventsRequest = Schema.Union(
  Schema.Struct({
    limit: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
    after: Schema.optional(Schema.Never),
  }),
  Schema.Struct({
    after: AuditEventSequence,
    limit: Schema.optional(Schema.Never),
  }),
);
export type AdminEventsRequest = Schema.Schema.Type<typeof AdminEventsRequest>;

const AdminApiErrorResponse = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
  }),
});

type AdminApiClientError =
  | AdminApiError
  | HttpClientError.HttpClientError
  | HttpBody.HttpBodyError
  | ParseResult.ParseError;

type JsonResponse = {
  readonly status: number;
  readonly json: Effect.Effect<unknown, HttpClientError.ResponseError>;
};

type NoBodyResponse = JsonResponse & {
  readonly arrayBuffer: Effect.Effect<ArrayBuffer, HttpClientError.ResponseError>;
};

type ExecuteJsonRequest = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<JsonResponse, HttpClientError.HttpClientError>;

type ExecuteNoBodyRequest = (
  request: HttpClientRequest.HttpClientRequest,
) => Effect.Effect<NoBodyResponse, HttpClientError.HttpClientError>;

export class AdminApiError extends Schema.TaggedError<AdminApiError>()("AdminApiError", {
  code: Schema.String,
  message: Schema.String,
}) {}

export class AdminApiClient extends Context.Tag("AdminApiClient")<
  AdminApiClient,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<RedactedCredential>, AdminApiClientError>;
    readonly get: (
      credentialId: CredentialId,
    ) => Effect.Effect<RedactedCredential, AdminApiClientError>;
    readonly create: (
      input: CreateCredentialInput,
    ) => Effect.Effect<RedactedCredential, AdminApiClientError>;
    readonly deleteById: (credentialId: CredentialId) => Effect.Effect<void, AdminApiClientError>;
    readonly listEvents: (
      input: AdminEventsRequest,
    ) => Effect.Effect<ReadonlyArray<AuditEvent>, AdminApiClientError>;
  }
>() {}

export function AdminApiClientLive(baseUrl: string) {
  return Layer.effect(
    AdminApiClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      return makeAdminApiClient(baseUrl, client.execute, client.execute);
    }),
  );
}

export function makeAdminApiClient(
  baseUrl: string,
  executeJsonRequest: ExecuteJsonRequest,
  executeNoBodyRequest: ExecuteNoBodyRequest,
): Context.Tag.Service<AdminApiClient> {
  return {
    list: () =>
      executeJson(
        executeJsonRequest,
        request(HttpClientRequest.get(adminCredentialsPath()), baseUrl),
        RedactedCredentials,
      ),
    get: (credentialId) =>
      executeJson(
        executeJsonRequest,
        request(HttpClientRequest.get(adminCredentialPath(credentialId)), baseUrl),
        RedactedCredential,
      ),
    create: (input) =>
      Effect.gen(function* () {
        const createRequest = yield* request(
          HttpClientRequest.post(adminCredentialsPath()),
          baseUrl,
        ).pipe(HttpClientRequest.schemaBodyJson(CreateCredentialInput)(input));

        return yield* executeJson(executeJsonRequest, createRequest, RedactedCredential);
      }),
    deleteById: (credentialId) =>
      executeNoBody(
        executeNoBodyRequest,
        request(HttpClientRequest.del(adminCredentialPath(credentialId)), baseUrl),
      ),
    listEvents: (input) =>
      executeJson(
        executeJsonRequest,
        request(HttpClientRequest.get(adminEventsPath(input)), baseUrl),
        AuditEvents,
      ),
  };
}

export function adminCredentialsPath() {
  return "/credentials";
}

export function adminCredentialPath(credentialId: CredentialId) {
  return `${adminCredentialsPath()}/${credentialId}`;
}

export function adminEventsPath(input: AdminEventsRequest) {
  if ("limit" in input) {
    return `/events?limit=${input.limit}`;
  }

  return `/events?after=${input.after}`;
}

function request(httpRequest: HttpClientRequest.HttpClientRequest, baseUrl: string) {
  return httpRequest.pipe(HttpClientRequest.prependUrl(baseUrl));
}

function executeJson<A, I>(
  execute: ExecuteJsonRequest,
  httpRequest: HttpClientRequest.HttpClientRequest,
  schema: Schema.Schema<A, I>,
) {
  return execute(httpRequest).pipe(
    Effect.flatMap((response) => decodeJsonResponse(response, schema)),
    Effect.scoped,
  );
}

function executeNoBody(
  execute: ExecuteNoBodyRequest,
  httpRequest: HttpClientRequest.HttpClientRequest,
) {
  return execute(httpRequest).pipe(
    Effect.flatMap((response) =>
      isSuccessfulStatus(response.status)
        ? drainSuccessfulNoBodyResponse(response)
        : decodeAdminApiError(response),
    ),
    Effect.scoped,
  );
}

function drainSuccessfulNoBodyResponse(response: NoBodyResponse) {
  return response.arrayBuffer.pipe(Effect.asVoid);
}

function decodeJsonResponse<A, I>(response: JsonResponse, schema: Schema.Schema<A, I>) {
  if (isSuccessfulStatus(response.status)) {
    return response.json.pipe(Effect.flatMap(Schema.decodeUnknown(schema)));
  }

  return decodeAdminApiError(response);
}

function decodeAdminApiError(response: JsonResponse) {
  return response.json.pipe(
    Effect.flatMap(Schema.decodeUnknown(AdminApiErrorResponse)),
    Effect.flatMap(({ error }) => Effect.fail(AdminApiError.make(error))),
  );
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300;
}
