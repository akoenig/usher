import type * as Prompt from "@effect/cli/Prompt";
import { Schema } from "effect";

export const OAuthProvider = Schema.Literal("Google", "Custom");
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

export const googleOAuth2Template = {
  authorizationUrl:
    "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent",
  tokenUrl: "https://oauth2.googleapis.com/token",
};

export const providerChoices: ReadonlyArray<Prompt.Prompt.SelectChoice<OAuthProvider>> = [
  { title: "Google", value: "Google" },
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

export function hasRedundantGoogleScopeSelection(selections: ReadonlyArray<GoogleScopeSelection>) {
  return (
    selections.includes("Google Calendar readonly") &&
    selections.includes("Google Calendar read/write")
  );
}
