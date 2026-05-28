import { Effect, Schema } from "effect";
import {
  AllowedRequest,
  Credential,
  CredentialStatus,
  CredentialType,
  StoredBearerTokenConfig,
  StoredOAuth2Config,
} from "../../../Domain/Credentials/Credential.js";

export const CredentialRow = Schema.Struct({
  credential_id: Schema.String,
  type: CredentialType,
  label: Schema.String,
  status: CredentialStatus,
  allowed_requests_json: Schema.String,
  config_json: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
});
export type CredentialRow = Schema.Schema.Type<typeof CredentialRow>;

export const MigrationRow = Schema.Struct({
  migration_id: Schema.Number,
  name: Schema.String,
});
export type MigrationRow = Schema.Schema.Type<typeof MigrationRow>;

export const OAuthStateRow = Schema.Struct({
  state: Schema.String,
  credential_id: Schema.String,
  code_verifier: Schema.String,
  redirect_uri: Schema.String,
  created_at: Schema.String,
  expires_at: Schema.String,
});
export type OAuthStateRow = Schema.Schema.Type<typeof OAuthStateRow>;

const AllowedRequestsJson = Schema.parseJson(Schema.NonEmptyArray(AllowedRequest));
const StoredBearerTokenConfigJson = Schema.parseJson(StoredBearerTokenConfig);
const StoredOAuth2ConfigJson = Schema.parseJson(StoredOAuth2Config);

export function decodeCredentialRow(row: unknown) {
  return Effect.gen(function* () {
    const credentialRow = yield* Schema.decodeUnknown(CredentialRow)(row);
    const allowedRequests = yield* Schema.decodeUnknown(AllowedRequestsJson)(
      credentialRow.allowed_requests_json,
    );

    if (credentialRow.type === "BearerToken") {
      const bearerToken = yield* Schema.decodeUnknown(StoredBearerTokenConfigJson)(
        credentialRow.config_json,
      );

      return yield* Schema.decodeUnknown(Credential)({
        credentialId: credentialRow.credential_id,
        type: credentialRow.type,
        label: credentialRow.label,
        status: credentialRow.status,
        allowedRequests,
        createdAt: credentialRow.created_at,
        updatedAt: credentialRow.updated_at,
        bearerToken,
      });
    }

    const oauth2 = yield* Schema.decodeUnknown(StoredOAuth2ConfigJson)(credentialRow.config_json);

    return yield* Schema.decodeUnknown(Credential)({
      credentialId: credentialRow.credential_id,
      type: credentialRow.type,
      label: credentialRow.label,
      status: credentialRow.status,
      allowedRequests,
      createdAt: credentialRow.created_at,
      updatedAt: credentialRow.updated_at,
      oauth2,
    });
  });
}
