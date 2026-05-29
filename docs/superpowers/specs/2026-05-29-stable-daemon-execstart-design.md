# Stable Daemon ExecStart Design

## Goal

Fix `usher daemon install` so the generated user systemd unit starts Usher through a stable executable path instead of pnpm's versioned package internals path.

## Problem

The installer currently derives `ExecStart` from `process.argv[1]`. Under pnpm global installs, running `usher daemon install` launches the package's compiled entrypoint through a shim, so `process.argv[1]` is a path like:

```text
/home/loom/.local/share/pnpm/global/v11/183c-19e72e4659b/node_modules/@akoenig/usher/dist/Main.mjs
```

That path changes when pnpm reinstalls or upgrades the package. A systemd unit that stores it fails with `status=203/EXEC` after the old package path disappears.

## Design

During `daemon install`, resolve the stable `usher` executable from the install-time `PATH` and write that absolute path to `ExecStart`.

For pnpm global installs this should produce a path like:

```text
/home/loom/.local/share/pnpm/bin/usher
```

The systemd unit rendering remains unchanged: it still accepts an `executablePath` and escapes it for `ExecStart`. The installer changes only how it obtains that path.

## Behavior

`usher daemon install` must:

- Search the current `PATH` for an executable named `usher`.
- Use the resolved absolute wrapper path as `ExecStart`.
- Keep `Environment=USHER_NODE=<current Node executable>` so the wrapper can run under the same Node installation used during install.
- Avoid using `process.argv[1]` as the installed `ExecStart` path.
- Fail clearly if `usher` cannot be found on `PATH`.

The failure message should tell the operator that `usher` could not be found on `PATH` and that they should install it globally or run the command with `PATH` including the Usher wrapper.

## Non-Goals

- Do not special-case pnpm internals paths.
- Do not rely on user systemd inheriting shell `PATH` by writing `ExecStart=usher daemon start`.
- Do not change the daemon runtime or HTTP behavior.
- Do not migrate existing broken units automatically outside the normal `usher daemon install` rewrite flow.

## Testing

Add focused tests around executable resolution and installer wiring:

- A resolver test returns the first executable `usher` found in a supplied `PATH`.
- A resolver test ignores non-executable candidates.
- A resolver test fails clearly when no executable `usher` exists on `PATH`.
- An install-path test verifies `daemon install` wiring uses the resolved wrapper path rather than `process.argv[1]`.
- Existing systemd unit rendering tests continue to cover escaping and service content.

## Operator Recovery

After this fix is released, affected operators can run:

```bash
pnpm add -g @akoenig/usher@<fixed-version>
hash -r
usher daemon install
systemctl --user daemon-reload
systemctl --user reset-failed usher.service
systemctl --user restart usher.service
```

The resulting unit should point `ExecStart` at the stable wrapper path.
