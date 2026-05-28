import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class MissingUserAgentError extends Schema.TaggedError<MissingUserAgentError>(
  "MissingUserAgentError",
)("MissingUserAgentError", {
  code: codeField("MissingUserAgentError"),
  message: messageField("Missing user agent"),
}) {}
