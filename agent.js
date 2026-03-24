const io = require("socket.io-client");
const {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  nonstandard: { RTCVideoSource },
} = require("@roamhq/wrtc");

const screenshot = require("screenshot-desktop");
const sharp = require("sharp");

const {
  mouse,
  keyboard,
  Button,
  Key,
  Point,
  straightTo,
} = require("@nut-tree-fork/nut-js");

// ── nut.js config ─────────────────────────────
mouse.config.mouseSpeed = 9999;
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

// ── Key map ───────────────────────────────────
const KEY_MAP = {
  Backspace: Key.Backspace,
  Tab: Key.Tab,
  Enter: Key.Return,
  Escape: Key.Escape,
  Delete: Key.Delete,
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  " ": Key.Space,
  Control: Key.LeftControl,
  Alt: Key.LeftAlt,
  Shift: Key.LeftShift,
};

// ── Socket ────────────────────────────────────
const SERVER = "https://anydeskclone-iisg.onrender.com" || "http://localhost:3000";

const socket = io(SERVER);

// ── State ─────────────────────────────────────
let currentCode = null;
let peerConnection = null;
let videoSource = null;
let capturing = false;

// ── Utils ─────────────────────────────────────
function log(icon, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${icon} ${msg}`);
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

//
// ──────────────────────────────────────────────
// 🔥 MANUAL RGBA → I420 CONVERSION (WORKING)
// ──────────────────────────────────────────────
//
function rgbaToI420Manual(rgba, width, height) {
  const ySize = width * height;
  const uvWidth = width >> 1;
  const uvHeight = height >> 1;
  const uvSize = uvWidth * uvHeight;

  const yPlane = Buffer.allocUnsafe(ySize);
  const uPlane = Buffer.allocUnsafe(uvSize);
  const vPlane = Buffer.allocUnsafe(uvSize);

  let yIndex = 0;
  let uIndex = 0;
  let vIndex = 0;

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const idx = (j * width + i) * 4;

      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      // Y
      yPlane[yIndex++] =
        (0.257 * r + 0.504 * g + 0.098 * b + 16) & 0xff;

      // UV (subsampled)
      if ((j & 1) === 0 && (i & 1) === 0) {
        uPlane[uIndex++] =
          (-0.148 * r - 0.291 * g + 0.439 * b + 128) & 0xff;

        vPlane[vIndex++] =
          (0.439 * r - 0.368 * g - 0.071 * b + 128) & 0xff;
      }
    }
  }

  return Buffer.concat([yPlane, uPlane, vPlane]);
}

//
// ──────────────────────────────────────────────
// 🎥 CAPTURE LOOP
// ──────────────────────────────────────────────
//
async function captureLoop() {
  if (!capturing) return;

  try {
    const img = await screenshot({ format: "png" });

    const { data, info } = await sharp(img)
      .resize(1280, 720, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;

    if (data.length !== w * h * 4) {
      console.error("❌ Invalid RGBA frame");
      return;
    }

    // 🔥 Convert to I420
    const i420 = rgbaToI420Manual(data, w, h);

    if (!videoSource) return;

    videoSource.onFrame({
      width: w,
      height: h,
      data: i420,
    });

  } catch (err) {
    console.error("💥 Capture error:", err.message);
  }

  if (capturing) {
    setTimeout(captureLoop, 1000 / 15);
  }
}

function startCapture() {
  if (capturing) return;
  capturing = true;
  log("🎥", "Screen capture started");
  captureLoop();
}

function stopCapture() {
  capturing = false;
  log("🛑", "Capture stopped");
}

//
// ──────────────────────────────────────────────
// 🌐 WebRTC SETUP
// ──────────────────────────────────────────────
//
async function setupWebRTC() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  videoSource = new RTCVideoSource();
  const track = videoSource.createTrack();
  peerConnection.addTrack(track);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate && currentCode) {
      socket.emit("ice-candidate", { code: currentCode, candidate });
    }
  };

  startCapture();

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { code: currentCode, offer });

  log("📨", "Offer sent");
}

//
// ──────────────────────────────────────────────
// 🔌 SOCKET EVENTS
// ──────────────────────────────────────────────
//
socket.on("connect", () => {
  log("🔌", "Connected");
  socket.emit("agent-ready");
});

socket.on("generate-code-for-viewer", () => {
  currentCode = generateCode();

  console.log(`\nCODE: ${currentCode}\n`);

  socket.emit("register-host", { code: currentCode });
});

socket.on("register-success", ({ code }) => {
  currentCode = code;
  log("📋", `Registered ${code}`);
});

socket.on("viewer-joined", async () => {
  log("👀", "Viewer connected");
  await setupWebRTC();
});

socket.on("answer", async ({ answer }) => {
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(answer)
  );
  log("✅", "Answer received");
});

socket.on("ice-candidate", async ({ candidate }) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  }
});

socket.on("viewer-left", () => {
  log("👋", "Viewer left");
  stopCapture();
});

socket.on("disconnect", () => {
  log("⚠️", "Disconnected");
  stopCapture();
});

//
// ──────────────────────────────────────────────
// 🎮 CONTROL EVENTS
// ──────────────────────────────────────────────
//
socket.on("control-event", async (event) => {
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

      case "type":
        if (event.text) await keyboard.type(event.text);
        break;
    }
  } catch (err) {
    console.error("Control error:", err.message);
  }
});