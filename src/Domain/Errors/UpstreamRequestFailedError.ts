import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class UpstreamRequestFailedError extends Schema.TaggedError<UpstreamRequestFailedError>(
  "UpstreamRequestFailedError",
)("UpstreamRequestFailedError", {
  code: codeField("UpstreamRequestFailedError"),
  message: messageField("Upstream request failed"),
}) {}
