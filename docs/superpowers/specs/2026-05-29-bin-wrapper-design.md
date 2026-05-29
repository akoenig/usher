# Bin Wrapper Design

## Goal

Move executable bootstrapping out of `src/Main.ts` and into a dedicated published shell wrapper at `bin/usher`. This fixes user-level systemd daemon startup when Node is installed outside systemd's default `PATH`, while keeping the application entrypoint as normal TypeScript compiled by Vite+.

## Requirements

- `src/Main.ts` must not contain a shebang.
- The package `usher` binary must point to `bin/usher`.
- `bin/usher` must execute the existing bundled ESM entrypoint `dist/Main.mjs` with Node and forward all CLI arguments unchanged.
- `bin/usher` must honor `USHER_NODE` as an absolute Node executable override, falling back to `node` for normal interactive use.
- `usher daemon install` must continue to install the currently invoked CLI executable path with `daemon start`.
- The service should run the wrapper instead of invoking `dist/Main.mjs` directly.

## Design

Add a small bash wrapper at `bin/usher`. The wrapper resolves its own directory, computes the package root, and runs:

```sh
"${USHER_NODE:-node}" "$ROOT/dist/Main.mjs" "$@"
```

`package.json` changes `bin.usher` from `dist/Main.mjs` to `bin/usher` and includes `bin` in the published files. `src/Main.ts` becomes a normal module entrypoint with no shebang.

The systemd installer captures `process.execPath` when `usher daemon install` runs and writes it to the user unit as `USHER_NODE`. Once the published binary is the wrapper, `process.argv[1]` resolves to `bin/usher`, so the generated unit uses:

```ini
Environment=USHER_NODE=<escaped-absolute-node-path>
ExecStart=<escaped-current-cli-binary> daemon start
```

This keeps systemd running the stable wrapper path while ensuring the wrapper uses the same Node binary that successfully ran the install command. It avoids relying on the user systemd manager `PATH`, which often excludes version-manager Node installs.

## Testing

- Update the main entrypoint test to assert `src/Main.ts` has no shebang.
- Add packaging coverage that `package.json` maps `bin.usher` to `bin/usher`.
- Add wrapper coverage that `bin/usher` invokes `dist/Main.mjs` through `USHER_NODE` when set and forwards arguments.
- Keep systemd unit tests validating `Environment=USHER_NODE=<node>` plus `ExecStart=<wrapper> daemon start` and argument escaping.

## Error Handling

The wrapper delegates missing Node or missing `dist/Main.mjs` errors to the shell/Node runtime. This matches the existing CLI behavior while keeping failure messages direct.
