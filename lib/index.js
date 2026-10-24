/**
 * dsh-auto-preset
 *
 * 记住你在会话里手动选择的权限预设，并在下次打开该会话时把它恢复回来。
 *
 * 用户确认的行为规则（2026-10-24）：
 *   1. 首次打开会话：不动，保持系统默认（工作区修改）。
 *   2. 你手动切到「自动审查」→ 记住；以后再打开该会话，自动恢复成「自动审查」。
 *   3. 你再切到「完全权限」→ 记住；以后再打开，恢复成「完全权限」，不要动。
 *   4. 你之后又主动切回「自动审查」→ 记住，以后继续保持「自动审查」。
 *   —— 一句话：跟着你最后一次的手动选择走，第一次不插手。
 *
 * 实现：
 *   - session/event 里观察 `permission/preset`，记下最后一次手动选择（初始 pin 与
 *     本插件自己的 set 不算）。
 *   - session/created（新建/打开旧会话都会触发）时，如果该会话有记录且当前值不同，
 *     就切回记录值。
 *   - 状态落盘在插件目录 state.json，跨 web 重启保留；删掉即全部重置。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const name = "auto-preset";
const inject = ["permissionPresets", "sessions"];

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = process.env.DSH_AUTOPRESET_STATE || join(HERE, "..", "state.json");

function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.sessions && typeof parsed.sessions === "object") {
      return parsed;
    }
  } catch {
    /* missing or corrupt state starts empty */
  }
  return { sessions: {} };
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* state persistence must never break anything */
  }
}

function apply(ctx) {
  const presets = ctx.permissionPresets;
  const armed = new Set(); // sessions whose initial pin has passed
  let applying = false;

  const namesOf = () => {
    try {
      return Array.isArray(presets.names) ? presets.names : [];
    } catch {
      return [];
    }
  };

  // 1) 观察手动选择
  ctx.effect(() =>
    ctx.on("session/event", (session, event) => {
      try {
        if (applying) return;
        if (event?.type !== "permission/preset") return;
        const sid = String(session?.id ?? "");
        if (!sid || !armed.has(sid)) return; // 初始 pin 不算用户选择
        const choice = event?.data?.preset;
        if (typeof choice !== "string" || !choice) return;
        const state = loadState();
        state.sessions[sid] = { last: choice, updatedAt: new Date().toISOString() };
        saveState(state);
      } catch {
        /* observing must never break the event */
      }
    }),
  );

  // 2) 打开会话时恢复最后一次手动选择
  ctx.effect(() =>
    ctx.on("session/created", (session) => {
      const sid = String(session?.id ?? "");
      try {
        const record = sid ? loadState().sessions[sid] : undefined;
        const last = typeof record?.last === "string" ? record.last : null;
        const names = namesOf();
        if (last !== null && names.includes(last)) {
          let current;
          try {
            current = presets.current(session);
          } catch {
            current = undefined;
          }
          if (current !== last) {
            applying = true;
            try {
              presets.set(session, last);
            } finally {
              applying = false;
            }
          }
        }
        if (sid) armed.add(sid);
      } catch (error) {
        try {
          ctx.logger?.warn?.(`[auto-preset] ${error?.message ?? String(error)}`);
        } catch {
          /* logging must never break session creation */
        }
      }
    }),
  );
}

export { apply, inject, name };
