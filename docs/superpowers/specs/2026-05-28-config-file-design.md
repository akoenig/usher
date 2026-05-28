# Config File Design

## Goal

Move Usher daemon configuration into a standard user config file at `~/.config/usher/config.json`. Every daemon setting that is currently configured through environment variables must be configurable from the file, and environment variables may override file values when present.

## Configuration File

The daemon reads this file by default:

```text
~/.config/usher/config.json
```

The JSON shape mirrors the current daemon configuration:

```json
{
  "databasePath": "/home/alice/.config/usher/usher.sqlite",
  "encryptionKeyFile": "/home/alice/.config/usher/encryption.key",
  "baseUrl": "http://localhost:3000",
  "allowedCallerIps": ["127.0.0.1", "::1"],
  "port": 3000
}
```

`databasePath`, `encryptionKeyFile`, `baseUrl`, and `allowedCallerIps` are required. `port` is optional and defaults to `3000`.

`baseUrl` remains configurable because Usher uses it to produce absolute OAuth2 login URLs and redirect URIs. Local installations can use `http://localhost:3000`; reverse-proxy or non-default host setups can set the exact URL registered with OAuth providers.

## Environment Overrides

The daemon first loads `config.json`, then applies any present environment variables as overrides:

```text
USHER_DATABASE_PATH       -> databasePath
USHER_ENCRYPTION_KEY_FILE -> encryptionKeyFile
USHER_BASE_URL            -> baseUrl
USHER_ALLOWED_CALLER_IPS  -> allowedCallerIps
USHER_PORT                -> port
```

`USHER_ALLOWED_CALLER_IPS` keeps its existing comma-separated format and is decoded into the JSON array shape. This preserves operator flexibility while making the config file the normal setup path.

The CLI admin client may continue to read `USHER_PORT` for the local admin port. If it later needs to discover `port` from `config.json`, that should be a focused follow-up because this change targets daemon configuration.

## Error Handling

Missing or invalid `config.json` should fail daemon startup with an operator-facing configuration error. Invalid file fields and invalid environment override values should identify the relevant configuration source or key clearly enough for users to fix the setup.

The existing encryption key file validation remains unchanged. The config file stores the key file path, not the key material, so existing file ownership and permission checks still protect the encryption key.

## README Updates

The README setup flow should create `~/.config/usher`, create the key file safely, and write `config.json` instead of exporting daemon environment variables.

The key creation example should create the key file before writing secret content:

```sh
mkdir -p ~/.config/usher
touch ~/.config/usher/encryption.key
chmod 600 ~/.config/usher/encryption.key
node -e "console.log('base64url:' + require('node:crypto').randomBytes(32).toString('base64url'))" > ~/.config/usher/encryption.key
```

The README should remove `.usher` paths from setup examples and document the JSON configuration as the required daemon configuration. Environment variables should be documented as optional overrides, not the primary setup method.

## Testing

Add tests close to the config loader:

- Loads a complete `config.json` from `~/.config/usher/config.json`.
- Defaults `port` to `3000` when omitted from the file and env.
- Applies environment overrides after reading the file.
- Parses comma-separated `USHER_ALLOWED_CALLER_IPS` into an array.
- Fails when required file configuration is missing or invalid.

Update existing CLI/config tests whose assertions mention the old required env-only daemon configuration.
