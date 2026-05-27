import { Data, Schema } from "effect"

export const CredentialId = Schema.String.pipe(
  Schema.pattern(/^cred_[A-Za-z0-9_-]{16,}$/)
)
export type CredentialId = Schema.Schema.Type<typeof CredentialId>

export const CredentialStatus = Schema.Literal("pending", "active", "error")
export type CredentialStatus = Schema.Schema.Type<typeof CredentialStatus>

export const CredentialType = Schema.Literal("OAuth2", "BearerToken")
export type CredentialType = Schema.Schema.Type<typeof CredentialType>

export const AllowedRequest = Schema.Struct({
  url: Schema.Struct({
    origin: Schema.String,
    pathPrefix: Schema.String
  })
})
export type AllowedRequest = Schema.Schema.Type<typeof AllowedRequest>

export const OAuth2CreateConfig = Schema.Struct({
  clientId: Schema.String,
  clientSecret: Schema.String,
  authorizationUrl: Schema.String,
  tokenUrl: Schema.String,
  scopes: Schema.Array(Schema.String)
})
export type OAuth2CreateConfig = Schema.Schema.Type<typeof OAuth2CreateConfig>

export const BearerTokenCreateConfig = Schema.Struct({
  token: Schema.String
})
export type BearerTokenCreateConfig = Schema.Schema.Type<typeof BearerTokenCreateConfig>

export const CreateOAuth2CredentialInput = Schema.Struct({
  type: Schema.Literal("OAuth2"),
  label: Schema.String,
  allowedRequests: Schema.Array(AllowedRequest),
  oauth2: OAuth2CreateConfig
})
export type CreateOAuth2CredentialInput = Schema.Schema.Type<typeof CreateOAuth2CredentialInput>

export const CreateBearerTokenCredentialInput = Schema.Struct({
  type: Schema.Literal("BearerToken"),
  label: Schema.String,
  allowedRequests: Schema.Array(AllowedRequest),
  bearerToken: BearerTokenCreateConfig
})
export type CreateBearerTokenCredentialInput = Schema.Schema.Type<typeof CreateBearerTokenCredentialInput>

export const CreateCredentialInput = Schema.Union(
  CreateOAuth2CredentialInput,
  CreateBearerTokenCredentialInput
)
export type CreateCredentialInput = Schema.Schema.Type<typeof CreateCredentialInput>

export const StoredOAuth2Config = Schema.Struct({
  clientId: Schema.String,
  encryptedClientSecret: Schema.String,
  authorizationUrl: Schema.String,
  tokenUrl: Schema.String,
  scopes: Schema.Array(Schema.String),
  grantedScopes: Schema.Array(Schema.String),
  encryptedRefreshToken: Schema.optional(Schema.String)
})
export type StoredOAuth2Config = Schema.Schema.Type<typeof StoredOAuth2Config>

export const StoredBearerTokenConfig = Schema.Struct({
  encryptedToken: Schema.String
})
export type StoredBearerTokenConfig = Schema.Schema.Type<typeof StoredBearerTokenConfig>

const StoredCredentialFields = {
  credentialId: CredentialId,
  label: Schema.String,
  status: CredentialStatus,
  allowedRequests: Schema.Array(AllowedRequest),
  createdAt: Schema.String,
  updatedAt: Schema.String
}

export const StoredOAuth2Credential = Schema.Struct({
  ...StoredCredentialFields,
  type: Schema.Literal("OAuth2"),
  oauth2: StoredOAuth2Config
})
export type StoredOAuth2Credential = Schema.Schema.Type<typeof StoredOAuth2Credential>

export const StoredBearerTokenCredential = Schema.Struct({
  ...StoredCredentialFields,
  type: Schema.Literal("BearerToken"),
  bearerToken: StoredBearerTokenConfig
})
export type StoredBearerTokenCredential = Schema.Schema.Type<typeof StoredBearerTokenCredential>

export const Credential = Schema.Union(
  StoredOAuth2Credential,
  StoredBearerTokenCredential
)
export type Credential = Schema.Schema.Type<typeof Credential>

export function credentialArray(values: ReadonlyArray<Credential>) {
  return Data.array(values)
}
