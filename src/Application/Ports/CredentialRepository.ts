import { Context, Effect } from "effect"
import type { Credential, CredentialId } from "../../Domain/Credentials/Credential.js"
import type { CredentialNotFoundError } from "../../Domain/Errors/UsherErrors.js"

export class CredentialRepository extends Context.Tag("CredentialRepository")<
  CredentialRepository,
  {
    readonly insert: (credential: Credential) => Effect.Effect<void>
    readonly list: () => Effect.Effect<ReadonlyArray<Credential>>
    readonly getById: (credentialId: CredentialId) => Effect.Effect<Credential, CredentialNotFoundError>
    readonly deleteById: (credentialId: CredentialId) => Effect.Effect<void, CredentialNotFoundError>
    readonly findAllNonDeleted: () => Effect.Effect<ReadonlyArray<Credential>>
  }
>() {}
