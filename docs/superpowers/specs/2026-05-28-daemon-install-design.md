# Daemon Install Design

## Goal

Implement `usher daemon install` for issue #4. The command installs the existing daemon as a user-bound systemd unit for the user running the command, enables lingering for that same user, and starts the service. The existing `usher daemon` invocation becomes an alias for `usher daemon start`.

## CLI Behavior

- `usher daemon start` runs the existing daemon startup flow.
- `usher daemon` runs the same daemon startup flow as `usher daemon start`.
- `usher daemon install` installs and starts the user systemd service for the invoking user.

## Systemd Unit

The install command writes `usher.service` to the invoking user's systemd unit directory:

```text
~/.config/systemd/user/usher.service
```

The unit executes the currently invoked CLI binary with `daemon start`. The executable path must be escaped for systemd command-line parsing so paths with spaces or special characters do not break `ExecStart`.

The unit should use straightforward service settings:

```ini
[Unit]
Description=Usher daemon

[Service]
ExecStart=<escaped-current-cli-binary> daemon start
Restart=on-failure

[Install]
WantedBy=default.target
```

## Install Flow

The command runs entirely as the invoking user. It does not use `sudo`, does not target another account, and does not install a system-level unit.

The install sequence is:

1. Create `~/.config/systemd/user` if it does not exist.
2. Write `usher.service` with the generated unit content.
3. Run `systemctl --user daemon-reload`.
4. Run `loginctl enable-linger <current-user>`.
5. Run `systemctl --user enable --now usher.service`.
6. Print a concise success message.

If `loginctl enable-linger` requires privileges in the current environment, the command should surface that process failure instead of silently escalating privileges.

## Architecture

Keep the implementation in the infrastructure CLI boundary because installing a systemd user unit is host-adapter behavior, not domain or application workflow.

Add a small systemd installer helper near the CLI code. It should receive the current executable path from the CLI handler and use Effect Platform filesystem and command abstractions for testability. The daemon runtime remains in `Infrastructure/Daemon/UsherDaemon.ts`.

## Testing

Add tests close to the implementation:

- The command tree exposes `daemon`, `daemon start`, and `daemon install`.
- Generated unit content uses `ExecStart=<escaped-current-cli-binary> daemon start`.
- The install workflow creates the user unit directory, writes the unit file, and runs the expected process commands in order for the current user.

Tests should not require a live systemd user session.
