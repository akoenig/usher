import type { RedactedCredential } from "../../Application/Services/CredentialService.js";

export function formatCredentialList(credentials: ReadonlyArray<RedactedCredential>) {
  if (credentials.length === 0) {
    return "No credentials found.";
  }

  return credentials
    .map(
      (credential) =>
        `${credential.credentialId}  ${credential.type}  ${credential.status}  ${credential.label}`,
    )
    .join("\n");
}

export function formatCredentialDetail(credential: RedactedCredential) {
  const lines = [
    `ID: ${credential.credentialId}`,
    `Type: ${credential.type}`,
    `Label: ${credential.label}`,
    `Status: ${credential.status}`,
    "Allowed Requests:",
    ...credential.allowedRequests.map(
      (request) => `- ${request.url.origin}${request.url.pathPrefix}`,
    ),
  ];

  if (credential.type === "OAuth2") {
    return [
      ...lines,
      `Client ID: ${credential.clientId}`,
      `Authorization URL: ${credential.authorizationUrl}`,
      `Token URL: ${credential.tokenUrl}`,
      `Scopes: ${credential.scopes.join(", ")}`,
      `Granted Scopes: ${credential.grantedScopes.join(", ")}`,
      `Login URL: ${credential.loginUrl}`,
    ].join("\n");
  }

  return lines.join("\n");
}

export function formatCredentialCreated(credential: RedactedCredential) {
  if (credential.type === "OAuth2") {
    return `${formatCredentialDetail(credential)}\n\nOpen this URL to authorize the credential:\n${credential.loginUrl}`;
  }

  return formatCredentialDetail(credential);
}

export function formatCredentialDeleted(credentialId: string) {
  return `Deleted credential ${credentialId}`;
}
