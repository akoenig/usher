import { SqlClient } from "@effect/sql"
import { Effect, Layer } from "effect"
import { CredentialRepository } from "../../../Application/Ports/CredentialRepository.js"
import type { Credential, CredentialId } from "../../../Domain/Credentials/Credential.js"
import { CredentialNotFoundError } from "../../../Domain/Errors/UsherErrors.js"
import { decodeCredentialRow, type CredentialRow } from "./Schema.js"

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
      findAllNonDeleted: list
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
