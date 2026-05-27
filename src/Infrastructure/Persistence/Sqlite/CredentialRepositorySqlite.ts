import { SqlClient } from "@effect/sql"
import { Effect, Layer, Schema } from "effect"
import { CredentialRepository, type OAuthState } from "../../../Application/Ports/CredentialRepository.js"
import { CredentialId, type Credential } from "../../../Domain/Credentials/Credential.js"
import { CredentialNotFoundError, OAuthStateInvalidError } from "../../../Domain/Errors/UsherErrors.js"
import { decodeCredentialRow, OAuthStateRow, type CredentialRow } from "./Schema.js"

export const CredentialRepositorySqlite = Layer.effect(
  CredentialRepository,
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    const list = () => sql<CredentialRow>`SELECT
      credential_id,
      type,
      label,
      status,
      allowed_requests_json,
      config_json,
      created_at,
      updated_at
    FROM credentials
    ORDER BY created_at, credential_id`.pipe(
      Effect.flatMap((rows) => Effect.forEach(rows, decodeCredentialRow)),
      Effect.orDie
    )

    return {
      insert: (credential: Credential) => sql`INSERT INTO credentials (
        credential_id,
        type,
        label,
        status,
        allowed_requests_json,
        config_json,
        created_at,
        updated_at
      ) VALUES (
        ${credential.credentialId},
        ${credential.type},
        ${credential.label},
        ${credential.status},
        ${JSON.stringify(credential.allowedRequests)},
        ${JSON.stringify(getConfig(credential))},
        ${credential.createdAt},
        ${credential.updatedAt}
      )`.pipe(Effect.asVoid, Effect.orDie),
      update: (credential: Credential) => Effect.gen(function*() {
        yield* sql<CredentialRow>`SELECT
          credential_id,
          type,
          label,
          status,
          allowed_requests_json,
          config_json,
          created_at,
          updated_at
        FROM credentials
        WHERE credential_id = ${credential.credentialId}`.pipe(
          Effect.orDie,
          Effect.flatMap((rows) => decodeSingleCredential(rows))
        )
        yield* sql`UPDATE credentials SET
          type = ${credential.type},
          label = ${credential.label},
          status = ${credential.status},
          allowed_requests_json = ${JSON.stringify(credential.allowedRequests)},
          config_json = ${JSON.stringify(getConfig(credential))},
          created_at = ${credential.createdAt},
          updated_at = ${credential.updatedAt}
        WHERE credential_id = ${credential.credentialId}`.pipe(Effect.orDie)
      }).pipe(Effect.asVoid),
      list,
      getById: (credentialId: CredentialId) => sql<CredentialRow>`SELECT
        credential_id,
        type,
        label,
        status,
        allowed_requests_json,
        config_json,
        created_at,
        updated_at
      FROM credentials
      WHERE credential_id = ${credentialId}`.pipe(
        Effect.orDie,
        Effect.flatMap((rows) => decodeSingleCredential(rows))
      ),
      deleteById: (credentialId: CredentialId) => Effect.gen(function*() {
        const rows = yield* sql<CredentialRow>`SELECT
          credential_id,
          type,
          label,
          status,
          allowed_requests_json,
          config_json,
          created_at,
          updated_at
        FROM credentials
        WHERE credential_id = ${credentialId}`.pipe(Effect.orDie)
        yield* decodeSingleCredential(rows)
        yield* sql`DELETE FROM credentials WHERE credential_id = ${credentialId}`.pipe(Effect.orDie)
      }).pipe(Effect.asVoid),
      findAllNonDeleted: list,
      insertOAuthState: (state: OAuthState) => sql`INSERT INTO oauth_states (
        state,
        credential_id,
        code_verifier,
        redirect_uri,
        created_at,
        expires_at
      ) VALUES (
        ${state.state},
        ${state.credentialId},
        ${state.codeVerifier},
        ${state.redirectUri},
        ${state.createdAt},
        ${state.expiresAt}
      )`.pipe(Effect.asVoid, Effect.orDie),
      consumeOAuthState: ({ state, now }: { readonly state: string; readonly now: string }) => sql<OAuthStateRow>`DELETE FROM oauth_states
        WHERE state = ${state} AND expires_at > ${now}
        RETURNING
          state,
          credential_id,
          code_verifier,
          redirect_uri,
          created_at,
          expires_at`.pipe(
        Effect.orDie,
        Effect.flatMap(decodeOAuthState)
      )
    }
  })
)

function getConfig(credential: Credential) {
  if (credential.type === "BearerToken") {
    return credential.bearerToken
  }

  return credential.oauth2
}

function decodeSingleCredential(rows: ReadonlyArray<CredentialRow>) {
  const credentialRow = rows[0]

  if (credentialRow === undefined) {
    return Effect.fail(CredentialNotFoundError.make())
  }

  return decodeCredentialRow(credentialRow).pipe(Effect.orDie)
}

function decodeOAuthState(rows: ReadonlyArray<OAuthStateRow>) {
  return Effect.gen(function*() {
    const row = rows[0]

    if (row === undefined) {
      return yield* Effect.fail(OAuthStateInvalidError.make())
    }

    const oauthStateRow = yield* Schema.decodeUnknown(OAuthStateRow)(row).pipe(Effect.orDie)

    return {
      state: oauthStateRow.state,
      credentialId: Schema.decodeUnknownSync(CredentialId)(oauthStateRow.credential_id),
      codeVerifier: oauthStateRow.code_verifier,
      redirectUri: oauthStateRow.redirect_uri,
      createdAt: oauthStateRow.created_at,
      expiresAt: oauthStateRow.expires_at
    }
  })
}
