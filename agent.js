const io = require("socket.io-client");
const {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  nonstandard: { RTCVideoSource, RTCVideoSink },
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

// ── CONFIG ─────────────────────────────
const SERVER =
  process.env.NODE_ENV === "production"
    ? "https://anydeskclone-iisg.onrender.com"
    : "http://localhost:3000";

const socket = io(SERVER);

let mode = process.argv[2]; // share / connect
let targetCode = process.argv[3];

let currentCode = null;
let peerConnection = null;
let videoSource = null;
let videoSink = null;
let capturing = false;

// ── UTILS ─────────────────────────────
function log(icon, msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${icon} ${msg}`);
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── RGBA → I420 ───────────────────────
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

      yPlane[yIndex++] = (0.257 * r + 0.504 * g + 0.098 * b + 16) & 0xff;

      if ((j & 1) === 0 && (i & 1) === 0) {
        uPlane[uIndex++] = (-0.148 * r - 0.291 * g + 0.439 * b + 128) & 0xff;
        vPlane[vIndex++] = (0.439 * r - 0.368 * g - 0.071 * b + 128) & 0xff;
      }
    }
  }

  return Buffer.concat([yPlane, uPlane, vPlane]);
}

// ── CAPTURE LOOP ──────────────────────
async function captureLoop() {
  if (!capturing) return;

  try {
    const img = await screenshot({ format: "png" });

    const { data, info } = await sharp(img)
      .resize(960, 540)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const frame = rgbaToI420Manual(data, info.width, info.height);

    videoSource.onFrame({
      width: info.width,
      height: info.height,
      data: frame,
    });
  } catch (err) {
    console.error("Capture error:", err.message);
  }

  setTimeout(captureLoop, 1000 / 15);
}

function startCapture() {
  capturing = true;
  captureLoop();
}

// ── SHARE MODE ────────────────────────
async function startShare() {
  currentCode = generateCode();
  console.log(`\n🟢 SHARE MODE\nCODE: ${currentCode}\n`);

  socket.emit("register-host", { code: currentCode });

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
    ],
  });

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE:", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("AGENT STATE:", peerConnection.connectionState);
  };

  videoSource = new RTCVideoSource();
  const track = videoSource.createTrack();
  peerConnection.addTrack(track);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit("ice-candidate", { code: currentCode, candidate });
    }
  };

  startCapture();

  socket.on("viewer-joined", async () => {
    log("👀", "Viewer joined");

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("offer", { code: currentCode, offer });
  });
}

// ── CONNECT MODE ──────────────────────
async function startConnect(code) {
  currentCode = code;

  console.log(`\n🔵 CONNECT MODE\nConnecting to: ${code}\n`);

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "c5c28fb864e93dcb12d5e929",
        credential: "TaVYwBAUxvuarWT4",
      },
    ],
  });

  peerConnection.oniceconnectionstatechange = () => {
    console.log("ICE:", peerConnection.iceConnectionState);
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("AGENT STATE:", peerConnection.connectionState);
  };

  peerConnection.ontrack = (event) => {
    const track = event.track;

    videoSink = new RTCVideoSink(track);

    videoSink.onframe = ({ frame }) => {
      // You can display or process frames here
      // For now just log
      process.stdout.write(".");
    };
  };

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit("ice-candidate", { code, candidate });
    }
  };

  socket.emit("join-session", { code });
}

// ── SOCKET EVENTS ─────────────────────
socket.on("connect", () => {
  log("🔌", "Connected");

  if (mode === "share") startShare();
  else if (mode === "connect") startConnect(targetCode);
  else {
    console.log("Usage:");
    console.log("node agent.js share");
    console.log("node agent.js connect <CODE>");
  }
});

socket.on("offer", async ({ offer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { code: currentCode, answer });
});

socket.on("answer", async ({ answer }) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (e) {
    console.error(e);
  }
});

// ── CONTROL EVENTS ────────────────────
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
