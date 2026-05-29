import type * as Prompt from "@effect/cli/Prompt";
import { Schema } from "effect";

const ClientSecretBasic = Schema.decodeUnknownSync(Schema.Literal("client_secret_basic"))(
  "client_secret_basic",
);

export const OAuthProvider = Schema.Literal("Google", "X", "Custom");
export type OAuthProvider = Schema.Schema.Type<typeof OAuthProvider>;

export const GoogleScopeSelection = Schema.Literal(
  "Google Calendar readonly",
  "Google Calendar read/write",
  "Google Drive readonly",
  "Google Drive file-level access",
  "Gmail readonly",
  "Custom",
);
export type GoogleScopeSelection = Schema.Schema.Type<typeof GoogleScopeSelection>;

export const XScopeSelection = Schema.Literal(
  "Tweet read",
  "Tweet write",
  "Users read",
  "Users email",
  "Follows read",
  "Follows write",
  "Likes read",
  "Likes write",
  "Bookmarks read",
  "Bookmarks write",
  "Media write",
  "Offline access",
  "Custom",
);
export type XScopeSelection = Schema.Schema.Type<typeof XScopeSelection>;

export const googleOAuth2Template = {
  authorizationUrl:
    "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent",
  tokenUrl: "https://oauth2.googleapis.com/token",
};

export const xOAuth2Template = {
  authorizationUrl: "https://x.com/i/oauth2/authorize",
  tokenUrl: "https://api.x.com/2/oauth2/token",
  tokenAuthMethod: ClientSecretBasic,
};

export const googleAllowedOriginHelp = [
  "Google API allowed request examples:",
  "- Calendar: allowed origin https://www.googleapis.com, path prefix /calendar/",
  "- Drive: allowed origin https://www.googleapis.com, path prefix /drive/",
  "- Gmail: allowed origin https://gmail.googleapis.com, path prefix /gmail/",
].join("\n");

export const xAllowedOriginHelp = [
  "X API allowed request example:",
  "- X API v2: allowed origin https://api.x.com, path prefix /2/",
].join("\n");

export const providerChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<OAuthProvider>> = [
  { title: "Google", value: "Google" },
  { title: "X", value: "X" },
  { title: "Custom", value: "Custom" },
];

export const googleScopeChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<GoogleScopeSelection>> = [
  { title: "Google Calendar readonly", value: "Google Calendar readonly" },
  { title: "Google Calendar read/write", value: "Google Calendar read/write" },
  { title: "Google Drive readonly", value: "Google Drive readonly" },
  { title: "Google Drive file-level access", value: "Google Drive file-level access" },
  { title: "Gmail readonly", value: "Gmail readonly" },
  { title: "Custom", value: "Custom" },
];

export const xScopeChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<XScopeSelection>> = [
  { title: "Tweet read", value: "Tweet read" },
  { title: "Tweet write", value: "Tweet write" },
  { title: "Users read", value: "Users read" },
  { title: "Users email", value: "Users email" },
  { title: "Follows read", value: "Follows read" },
  { title: "Follows write", value: "Follows write" },
  { title: "Likes read", value: "Likes read" },
  { title: "Likes write", value: "Likes write" },
  { title: "Bookmarks read", value: "Bookmarks read" },
  { title: "Bookmarks write", value: "Bookmarks write" },
  { title: "Media write", value: "Media write" },
  { title: "Offline access", value: "Offline access" },
  { title: "Custom", value: "Custom" },
];

export function googleScopesFromSelections(
  selections: ReadonlyArray<GoogleScopeSelection>,
  customScopes: ReadonlyArray<string>,
) {
  const scopes = selections.flatMap((selection) => scopeStringsForGoogleSelection(selection));
  return Array.from(
    new Set([
      ...scopes,
      ...customScopes.map((scope) => scope.trim()).filter((scope) => scope !== ""),
    ]),
  );
}

export function xScopesFromSelections(
  selections: ReadonlyArray<XScopeSelection>,
  customScopes: ReadonlyArray<string>,
) {
  const scopes = selections.flatMap((selection) => scopeStringsForXSelection(selection));
  return Array.from(
    new Set([
      ...scopes,
      ...customScopes.map((scope) => scope.trim()).filter((scope) => scope !== ""),
    ]),
  );
}

function scopeStringsForGoogleSelection(selection: GoogleScopeSelection) {
  if (selection === "Google Calendar readonly")
    return ["https://www.googleapis.com/auth/calendar.readonly"];
  if (selection === "Google Calendar read/write")
    return ["https://www.googleapis.com/auth/calendar"];
  if (selection === "Google Drive readonly")
    return ["https://www.googleapis.com/auth/drive.readonly"];
  if (selection === "Google Drive file-level access")
    return ["https://www.googleapis.com/auth/drive.file"];
  if (selection === "Gmail readonly") return ["https://www.googleapis.com/auth/gmail.readonly"];
  return [];
}

function scopeStringsForXSelection(selection: XScopeSelection) {
  if (selection === "Tweet read") return ["tweet.read"];
  if (selection === "Tweet write") return ["tweet.write"];
  if (selection === "Users read") return ["users.read"];
  if (selection === "Users email") return ["users.email"];
  if (selection === "Follows read") return ["follows.read"];
  if (selection === "Follows write") return ["follows.write"];
  if (selection === "Likes read") return ["like.read"];
  if (selection === "Likes write") return ["like.write"];
  if (selection === "Bookmarks read") return ["bookmark.read"];
  if (selection === "Bookmarks write") return ["bookmark.write"];
  if (selection === "Media write") return ["media.write"];
  if (selection === "Offline access") return ["offline.access"];
  return [];
}

export function hasRedundantGoogleScopeSelection(selections: ReadonlyArray<GoogleScopeSelection>) {
  return (
    selections.includes("Google Calendar readonly") &&
    selections.includes("Google Calendar read/write")
  );
}
