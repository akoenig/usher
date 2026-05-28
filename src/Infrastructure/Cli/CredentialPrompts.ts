import * as Prompt from "@effect/cli/Prompt";
import { Effect, Redacted, Schema } from "effect";
import {
  CreateBearerTokenCredentialInput,
  CreateOAuth2CredentialInput,
} from "../../Domain/Credentials/Credential.js";
import {
  googleOAuth2Template,
  googleScopeChoices,
  googleScopesFromSelections,
  providerChoices,
} from "./OAuthTemplates.js";

const BearerTokenCredentialValues = Schema.Struct({
  label: Schema.String,
  origin: Schema.String,
  pathPrefix: Schema.String,
  token: Schema.String,
});
type BearerTokenCredentialValues = Schema.Schema.Type<typeof BearerTokenCredentialValues>;

const OAuth2CredentialValues = Schema.Struct({
  label: Schema.String,
  origin: Schema.String,
  pathPrefix: Schema.String,
  clientId: Schema.String,
  clientSecret: Schema.String,
  authorizationUrl: Schema.String,
  tokenUrl: Schema.String,
  scopes: Schema.Array(Schema.String),
});
type OAuth2CredentialValues = Schema.Schema.Type<typeof OAuth2CredentialValues>;

type CreateBearerTokenCredentialInputValue = Schema.Schema.Type<
  typeof CreateBearerTokenCredentialInput
>;
type CreateOAuth2CredentialInputValue = Schema.Schema.Type<typeof CreateOAuth2CredentialInput>;

export const promptBearerTokenCredentialInput = Prompt.map(
  Prompt.all({
    label: Prompt.text({ message: "Label" }),
    origin: Prompt.text({ message: "Allowed origin" }),
    pathPrefix: Prompt.text({ message: "Allowed path prefix" }),
    token: Prompt.password({ message: "Bearer token" }),
  }),
  (values) =>
    buildBearerTokenCredentialInput({
      label: values.label,
      origin: values.origin,
      pathPrefix: values.pathPrefix,
      token: Redacted.value(values.token),
    }),
);

export const promptOAuth2CredentialInput = Effect.gen(function* () {
  const provider = yield* Prompt.select({
    message: "OAuth2 provider",
    choices: providerChoices,
  });

  const common = yield* Prompt.all({
    label: Prompt.text({ message: "Label" }),
    origin: Prompt.text({ message: "Allowed origin" }),
    pathPrefix: Prompt.text({ message: "Allowed path prefix" }),
    clientId: Prompt.text({ message: "Client ID" }),
    clientSecret: Prompt.password({ message: "Client secret" }),
  });

  if (provider === "Google") {
    const selections = yield* Prompt.multiSelect({
      message: "Google scopes",
      choices: googleScopeChoices,
    });
    const customScopes = selections.includes("Custom")
      ? yield* Prompt.list({ message: "Custom scopes", delimiter: "," })
      : [];

    return buildOAuth2CredentialInput({
      ...common,
      clientSecret: Redacted.value(common.clientSecret),
      authorizationUrl: googleOAuth2Template.authorizationUrl,
      tokenUrl: googleOAuth2Template.tokenUrl,
      scopes: googleScopesFromSelections(selections, customScopes),
    });
  }

  const endpointValues = yield* Prompt.all({
    authorizationUrl: Prompt.text({ message: "Authorization URL" }),
    tokenUrl: Prompt.text({ message: "Token URL" }),
    scopes: Prompt.list({ message: "Scopes", delimiter: "," }),
  });

  return buildOAuth2CredentialInput({
    ...common,
    clientSecret: Redacted.value(common.clientSecret),
    authorizationUrl: endpointValues.authorizationUrl,
    tokenUrl: endpointValues.tokenUrl,
    scopes: trimScopes(endpointValues.scopes),
  });
});

export function buildBearerTokenCredentialInput(
  values: BearerTokenCredentialValues,
): CreateBearerTokenCredentialInputValue {
  return Schema.decodeUnknownSync(CreateBearerTokenCredentialInput)({
    type: "BearerToken",
    label: values.label,
    allowedRequests: [{ url: { origin: values.origin, pathPrefix: values.pathPrefix } }],
    bearerToken: { token: values.token },
  });
}

export function buildOAuth2CredentialInput(
  values: OAuth2CredentialValues,
): CreateOAuth2CredentialInputValue {
  return Schema.decodeUnknownSync(CreateOAuth2CredentialInput)({
    type: "OAuth2",
    label: values.label,
    allowedRequests: [{ url: { origin: values.origin, pathPrefix: values.pathPrefix } }],
    oauth2: {
      clientId: values.clientId,
      clientSecret: values.clientSecret,
      authorizationUrl: values.authorizationUrl,
      tokenUrl: values.tokenUrl,
      scopes: trimScopes(values.scopes),
    },
  });
}

function trimScopes(scopes: ReadonlyArray<string>) {
  return scopes.map((scope) => scope.trim()).filter((scope) => scope !== "");
}
