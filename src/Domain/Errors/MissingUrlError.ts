import { Schema } from "effect";

import { codeField, messageField } from "./ErrorFields.js";

export class MissingUrlError extends Schema.TaggedError<MissingUrlError>("MissingUrlError")(
  "MissingUrlError",
  {
    code: codeField("MissingUrlError"),
    message: messageField("Missing target URL"),
  },
) {}
