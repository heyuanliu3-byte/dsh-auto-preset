# dsh-auto-preset

A small [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that remembers your **last manual permission-preset choice** for each session and restores it when you reopen that session.

> Status: early / experimental. It talks to DSH's experimental `permissionPresets` API and was tested against `@deepseek-ai/dsh` **0.2.1-rc.2** and **0.2.1-rc.3** (the permission-presets code is identical in both). A future DSH release may change the API and break it.

## Why

DSH's permission presets (`workspace-write`, `danger-full-access`, and the experimental `auto` = auto review) are stored per session. The default preset for a session is inferred from the process defaults, so a session can come back as the wrong mode after a restart — and the experimental **Auto** preset cannot be configured as the default preset at all:

```js
// @deepseek-ai/dsh-permission-presets
if ("auto" in this.presets) throw new Error('permission: "auto" is reserved ...')
if (!Object.hasOwn(this.presets, defaultPreset)) throw new Error('permission: unknown default preset')
```

This plugin instead watches what you actually pick and puts it back.

## Behavior

1. **First time** a session is opened: do nothing. The system default applies.
2. You switch a session to **Auto review** → remembered. Reopening the session restores Auto review.
3. You switch it to **Full access** → remembered. Reopening keeps Full access; the plugin will not force Auto back.
4. You later switch back to **Auto review** → remembered again. The plugin follows your last manual choice.

In one sentence: it follows your latest manual choice; it never overrides a choice you made.

State is kept in `state.json` next to the plugin (persists across DSH restarts). Delete that file to reset everything.

## Install

```bash
# from a DSH checkout / any shell with `dsh` on PATH
dsh plugin --profile web add link:/absolute/path/to/dsh-auto-preset
```

Then add `"dsh-auto-preset"` to the profile's bundle list (`package.json` → `dsh.profile.bundles`) and restart the DSH web server.

The plugin must be loaded **after** `@deepseek-ai/dsh-experimental-auto-review`, because the `auto` preset only exists while that bundle is live.

## How it works

- `session/created` fires when a session enters the store — for a brand-new session *and* for a reopened one.
- `session/event` (`permission/preset`) tells the plugin which preset was selected. Events emitted before the plugin has "armed" a session (the initial pin) are ignored, and the plugin's own `presets.set()` calls are ignored via a reentrancy flag.
- On open, if a stored choice exists and differs from the current value, the plugin calls `permissionPresets.set(session, storedChoice)`.

See [`lib/index.js`](lib/index.js) — it is ~130 lines.

## Caveats

- Experimental API: the permission-presets internals may change between DSH releases.
- Only `permission/preset` events are observed; a "custom" sandbox/approval combination is not represented as a preset and is therefore not restored.
- Web profile only in my setup; it does not require any non-official plugin in the desktop profile.

## License

MIT — see [LICENSE](LICENSE).
