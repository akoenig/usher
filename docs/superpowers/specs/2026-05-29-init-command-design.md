# Init Command Design

## Goal

Add `usher init` so users can create the default daemon config without copying shell snippets from the README.

## Behavior

`usher init` creates `~/.config/usher/config.json` for the current user. It creates the parent directory, creates the config file with `0600` permissions, writes a generated inline `encryptionKey`, and includes default local daemon settings.

The command is intentionally safe: if `config.json` already exists and is non-empty, it fails with a clear message and does not overwrite the file. There is no `--force` option initially because replacing the encryption key makes existing encrypted credentials unreadable.

The generated config contains:

```json
{
  "databasePath": "$HOME/.config/usher/usher.sqlite",
  "encryptionKey": "base64url:<32-byte random key encoded as base64url>",
  "baseUrl": "http://localhost:3000",
  "allowedCallerIps": ["127.0.0.1", "::1"],
  "port": 3000
}
```

## README

The README should tell users to run `usher init` after installation, then `usher daemon start`. It should keep a short config reference, but the setup flow should not require manually generating JSON.

## Testing

Tests should cover command-tree exposure, generated config content, `0600` permissions, parent directory creation, and refusal to overwrite an existing non-empty config.
