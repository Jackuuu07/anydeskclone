const io = require("socket.io-client");
const {
  mouse,
  keyboard,
  Button,
  Key,
  Point,
  straightTo,
} = require("@nut-tree-fork/nut-js");

// ── nut.js — instant, no delay ────────────────────────────────
mouse.config.mouseSpeed = 9999;
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// ── Browser key → nut.js Key ──────────────────────────────────
const KEY_MAP = {
  Backspace: Key.Backspace,
  Tab: Key.Tab,
  Enter: Key.Return,
  Escape: Key.Escape,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  " ": Key.Space,
  CapsLock: Key.CapsLock,
  F1: Key.F1,
  F2: Key.F2,
  F3: Key.F3,
  F4: Key.F4,
  F5: Key.F5,
  F6: Key.F6,
  F7: Key.F7,
  F8: Key.F8,
  F9: Key.F9,
  F10: Key.F10,
  F11: Key.F11,
  F12: Key.F12,
  Control: Key.LeftControl,
  Alt: Key.LeftAlt,
  Shift: Key.LeftShift,
  Meta: Key.LeftSuper,
};

// ── Socket ────────────────────────────────────────────────────
// const socket = io("https://anydeskclone-iisg.onrender.com", {
const socket = io("http://localhost:3000", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

let currentCode = null;

let agents = [];

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function log(icon, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${icon}  ${msg}`);
}

socket.on("agent-ready", () => {
  agents.push(socket.id);
});

// ── Connection ────────────────────────────────────────────────
socket.on("connect", () => {
  console.log("Connected");
  socket.emit("agent-ready"); // 🔥 register as agent
});

socket.on("generate-code-for-viewer", () => {
  currentCode = generateCode();

  console.log("\n  ┌──────────────────────────┐");
  console.log(`  │   CODE :  ${currentCode}         │`);
  console.log("  └──────────────────────────┘\n");

  socket.emit("register-host", { code: currentCode });
});

// socket.on("request-code", () => {
//   waitingViewers.push(socket.id);

//   const agentId = agents[0]; // pick first available agent

//   if (agentId) {
//     io.to(agentId).emit("generate-code-for-viewer");
//   } else {
//     socket.emit("error", "No agent available");
//   }
// });

socket.on("register-success", ({ code }) => {
  currentCode = code;

  console.log("\n  ┌──────────────────────────┐");
  console.log(`  │   CODE :  ${code}         │`);
  console.log("  └──────────────────────────┘\n");

  log("📋", `Registered | Code: ${code}`);
});

socket.on("register-error", ({ message }) => {
  log("❌", `Error: ${message}`);
  currentCode = generateCode();
  socket.emit("register-host", { code: currentCode });
});

socket.on("viewer-joined", ({ viewerId }) =>
  log("👀", `Viewer connected: ${viewerId}`),
);
socket.on("viewer-left", ({ message }) => log("👋", message));
socket.on("session-ended", ({ message }) => log("🔴", message));
socket.on("disconnect", (reason) => log("⚠️ ", `Disconnected: ${reason}`));
socket.on("reconnect", (n) => log("🔁", `Reconnected after ${n} attempt(s)`));

// ── Control events ────────────────────────────────────────────
socket.on("control-event", async (event) => {
  if (!event?.type) return;

  try {
    switch (event.type) {
      case "mouse_move":
        await mouse.move(straightTo(new Point(event.x, event.y)));
        break;

      case "click":
        if (event.x !== undefined)
          await mouse.move(straightTo(new Point(event.x, event.y)));
        await mouse.click(Button.LEFT);
        break;

      case "right_click":
        if (event.x !== undefined)
          await mouse.move(straightTo(new Point(event.x, event.y)));
        await mouse.click(Button.RIGHT);
        break;

      case "double_click":
        if (event.x !== undefined)
          await mouse.move(straightTo(new Point(event.x, event.y)));
        await mouse.doubleClick(Button.LEFT);
        break;

      case "scroll": {
        const steps = 3;
        const dy = event.dy || 0;
        const dx = event.dx || 0;
        if (dy > 0) await mouse.scrollDown(steps);
        else if (dy < 0) await mouse.scrollUp(steps);
        if (dx > 0) await mouse.scrollRight(steps);
        else if (dx < 0) await mouse.scrollLeft(steps);
        break;
      }

      case "type":
        if (event.text) await keyboard.type(event.text);
        break;

      case "key_tap": {
        // Look up in KEY_MAP first, then try Key[A-Z/0-9] for combos like Ctrl+C
        let key = KEY_MAP[event.key];
        if (!key && event.key.length === 1) key = Key[event.key.toUpperCase()];
        if (!key) {
          log("⚠️ ", `Unmapped key: "${event.key}"`);
          break;
        }

        const mods = [];
        if (event.ctrlKey || event.metaKey) mods.push(Key.LeftControl);
        if (event.altKey) mods.push(Key.LeftAlt);
        if (event.shiftKey) mods.push(Key.LeftShift);

        await keyboard.pressKey(...mods, key);
        await keyboard.releaseKey(...mods, key);
        break;
      }

      case "mouse_down":
        await mouse.pressButton(
          event.button === 2 ? Button.RIGHT : Button.LEFT,
        );
        break;

      case "mouse_up":
        await mouse.releaseButton(
          event.button === 2 ? Button.RIGHT : Button.LEFT,
        );
        break;

      default:
        log("❓", `Unknown event: ${event.type}`);
    }
  } catch (err) {
    log("💥", `[${event.type}] ${err.message}`);
  }
});

// ── Shutdown ──────────────────────────────────────────────────
process.on("SIGINT", () => {
  socket.disconnect();
  process.exit(0);
});
process.on("SIGTERM", () => {
  socket.disconnect();
  process.exit(0);
});
