import { Context, Effect, Redacted } from "effect";
import type { CredentialId } from "../../Domain/Credentials/Credential.js";
import type { SemanticError } from "../../Domain/Errors/UsherErrors.js";

export class SecretVault extends Context.Tag("SecretVault")<
  SecretVault,
  {
    readonly encrypt: (input: {
      readonly credentialId: CredentialId;
      readonly purpose: string;
      readonly plaintext: Redacted.Redacted<string>;
    }) => Effect.Effect<string, SemanticError>;
    readonly decrypt: (input: {
      readonly credentialId: CredentialId;
      readonly purpose: string;
      readonly ciphertext: string;
    }) => Effect.Effect<Redacted.Redacted<string>, SemanticError>;
  }
>() {}
