import { Config, Effect, Schema } from "effect"

export const UsherConfig = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.Number
})
export type UsherConfig = Schema.Schema.Type<typeof UsherConfig>

export const loadUsherConfig = Config.all({
  databasePath: Config.nonEmptyString("USHER_DATABASE_PATH"),
  encryptionKeyFile: Config.nonEmptyString("USHER_ENCRYPTION_KEY_FILE"),
  baseUrl: Config.nonEmptyString("USHER_BASE_URL"),
  allowedCallerIps: Config.string("USHER_ALLOWED_CALLER_IPS").pipe(
    Config.map((value) => value.split(",").map((ip) => ip.trim()).filter((ip) => ip !== ""))
  ),
  port: Config.port("USHER_PORT")
}).pipe(
  Effect.flatMap(Schema.decodeUnknown(UsherConfig))
)
