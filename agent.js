const io = require("socket.io-client");
const {
  mouse,
  keyboard,
  Button,
  Key,
  Point,
  straightTo,
} = require("@nut-tree-fork/nut-js");

// ── SPEED CONFIG ─────────────────────────────
mouse.config.mouseSpeed = 9999;
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// ── CHANGE THIS TO YOUR RENDER URL ───────────
const socket = io("https://anydeskclone-iisg.onrender.com", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 2000,
});

let currentCode = null;

// ── GENERATE UNIQUE CODE ─────────────────────
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── LOG HELPER ───────────────────────────────
function log(icon, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${icon} ${msg}`);
}

// ── CONNECT ──────────────────────────────────
socket.on("connect", () => {
  log("✅", `Connected (${socket.id})`);

  currentCode = generateCode();

  console.log("\n===============================");
  console.log(`   YOUR ID: ${currentCode}`);
  console.log("===============================\n");

  socket.emit("register-host", { code: currentCode });
});

socket.on("register-success", ({ code }) => {
  log("📋", `Registered | Code: ${code}`);
});

socket.on("viewer-joined", () => {
  log("👀", "Viewer connected");
});

socket.on("viewer-left", ({ message }) => {
  log("👋", message);
});

socket.on("session-ended", ({ message }) => {
  log("🔴", message);
});

// ─────────────────────────────────────────────
// CONTROL EVENTS
// ─────────────────────────────────────────────
socket.on("control-event", async (event) => {
  console.log("🔵 Received:", event);

  if (!event?.type) return;

  try {
    switch (event.type) {
      case "mouse_move":
        await mouse.move(straightTo(new Point(event.x, event.y)));
        break;

      case "click":
        await mouse.click(Button.LEFT);
        break;

      case "right_click":
        await mouse.click(Button.RIGHT);
        break;

      case "double_click":
        await mouse.doubleClick(Button.LEFT);
        break;

      case "scroll":
        if (event.dy > 0) await mouse.scrollDown(3);
        else await mouse.scrollUp(3);
        break;

      case "type":
        await keyboard.type(event.text);
        break;

      case "key_tap":
        const key = Key[event.key?.toUpperCase()] || Key.Enter;
        await keyboard.pressKey(key);
        await keyboard.releaseKey(key);
        break;

      default:
        console.log("❓ Unknown event:", event.type);
    }
  } catch (err) {
    console.log("💥 Error:", err.message);
  }
});

// ── CLEAN EXIT ───────────────────────────────
process.on("SIGINT", () => {
  socket.disconnect();
  process.exit();
});