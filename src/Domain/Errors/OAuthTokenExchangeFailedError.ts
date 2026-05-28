import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class OAuthTokenExchangeFailedError extends Schema.TaggedError<OAuthTokenExchangeFailedError>(
  "OAuthTokenExchangeFailedError",
)("OAuthTokenExchangeFailedError", {
  code: codeField("OAuthTokenExchangeFailedError"),
  message: messageField("OAuth token exchange failed"),
}) {}
