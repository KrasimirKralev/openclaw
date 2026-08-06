---
summary: "Operate OpenClaw on a ClawBox appliance, where the Gateway is managed by a system service"
read_when:
  - Running OpenClaw on a ClawBox device
  - The standard gateway service commands do not work on your hardware
  - OpenClaw shipped preinstalled and you need to update or troubleshoot it
title: "ClawBox"
---

ClawBox is a Jetson-based appliance that ships with OpenClaw preinstalled, so there is nothing to install -- but the standard operating commands in these docs do not apply as written. The Gateway runs as a **system** service rather than a `systemctl --user` unit, the `openclaw` binary is not on `PATH` for non-interactive shells, and the Control UI is bound to the LAN instead of loopback. This page documents the working commands.

If you are setting up Jetson hardware yourself rather than using a preconfigured appliance, follow the general Linux and ARM64 guidance in the [install overview](/install) instead.

## What is different

| Standard instruction | On ClawBox |
| -------------------- | ---------- |
| `openclaw <command>` | Not on `PATH` over SSH -- use the absolute path or export it first |
| `systemctl --user status openclaw-gateway.service` | No user unit exists; the Gateway is the system service `clawbox-gateway.service` |
| `journalctl --user -u openclaw-gateway.service` | Use the system journal for `clawbox-gateway` |
| Gateway on loopback, reached via SSH tunnel | Gateway binds to the LAN on port `18789`; open it directly |

## Running the CLI

The CLI is installed under a user-owned npm prefix. Interactive login shells pick it up from `~/.bashrc`, but non-interactive shells (including `ssh host 'openclaw ...'`) do not:

```bash
# Explicit path -- always works
~/.npm-global/bin/openclaw status

# Or export once for the current shell
export PATH="$HOME/.npm-global/bin:$PATH"
openclaw status
```

## Gateway service

The Gateway is supervised by the appliance as a system service, so the `--user` commands in the rest of these docs do not apply:

```bash
systemctl status clawbox-gateway.service
sudo systemctl restart clawbox-gateway.service
journalctl -u clawbox-gateway.service -f
```

Do not start a second Gateway by hand -- the service already owns the port and the state directory.

## Control UI

The Gateway is configured with `"bind": "lan"` and listens on `0.0.0.0:18789`, so the dashboard is reachable directly from another machine on the same network:

```
http://<clawbox-address>:18789
```

No SSH tunnel is required. Because the UI is served over the LAN rather than loopback, the origin you browse from must be present in `gateway.controlUi.allowedOrigins`; the appliance ships with its own address allowlisted. If you reach the box under a different hostname or address, add that origin to the list.

## Updating

The npm tree is user-owned, so updates do not need `sudo`, but they do need the explicit path:

```bash
~/.npm-global/bin/openclaw update
sudo systemctl restart clawbox-gateway.service
```

Restart the service afterwards so the running Gateway picks up the new version.

## Configuration and state

State lives in the standard location, so everything in [Gateway configuration](/gateway/configuration) applies unchanged:

- `~/.openclaw/` -- `openclaw.json`, per-agent `auth-profiles.json`, channel/provider state, sessions
- `~/.openclaw/workspace/` -- agent workspace

Snapshots work the same way:

```bash
~/.npm-global/bin/openclaw backup create
```

## Troubleshooting

**`openclaw: command not found`** -- Expected over SSH. Use `~/.npm-global/bin/openclaw` or export the prefix onto `PATH` first.

**`systemctl --user` reports no such unit** -- Expected. The Gateway is a system service on this appliance: `systemctl status clawbox-gateway.service`.

**Control UI rejects the origin** -- Add the address you are browsing from to `gateway.controlUi.allowedOrigins`, then restart the service.

**Gateway will not start** -- Check `journalctl -u clawbox-gateway.service --no-pager -n 100`, then run `~/.npm-global/bin/openclaw doctor --non-interactive`.

## Next steps

- [Channels](/channels) -- connect Telegram, WhatsApp, Discord, and more
- [Gateway configuration](/gateway/configuration) -- all config options
- [Updating](/install/updating) -- general update guidance

## Related

- [Install overview](/install)
- [Platforms](/platforms)
