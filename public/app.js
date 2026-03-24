// ── Server URL ────────────────────────────────────────────────
const SERVER_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : window.location.origin;

const socket = io(SERVER_URL);

// ── DOM ───────────────────────────────────────────────────────
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const codeInput = document.getElementById("codeInput");
const myCodeEl = document.getElementById("myCode");
const statusEl = document.getElementById("status");
const remoteVideo = document.getElementById("remoteVideo");
const statusDot = document.getElementById("statusDot");
const copyBtn = document.getElementById("copyBtn");
const videoWrap = document.getElementById("videoWrap");
const placeholder = document.getElementById("placeholder");
const controlBadge = document.getElementById("controlBadge");
const agentNote = document.getElementById("agentNote");
const toast = document.getElementById("toast");

// ── State ─────────────────────────────────────────────────────
let peerConnection = null;
let remoteStream = null;
let currentCode = null;
let isHost = false;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ── UI helpers ────────────────────────────────────────────────
function setStatus(msg, state = "idle") {
  statusEl.textContent = msg;
  statusDot.className = "status-dot";
  if (state === "connected") statusDot.classList.add("connected");
  if (state === "pending") statusDot.classList.add("pending");
  if (state === "error") statusDot.classList.add("error");
}

function setLive(on) {
  videoWrap.classList.toggle("active", on);
  controlBadge.classList.toggle("show", on && !isHost);
  if (on && !isHost) remoteVideo.focus();
}

function showCode(code) {
  myCodeEl.classList.remove("empty");
  myCodeEl.textContent = code;
  copyBtn.style.display = "grid";
  agentNote.style.display = "flex";
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

// ── Copy ──────────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  if (!currentCode) return;
  navigator.clipboard
    .writeText(currentCode)
    .then(() => showToast("✅ Code copied!"));
});

// ── Input: digits only ────────────────────────────────────────
codeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

// ── WebRTC ────────────────────────────────────────────────────
async function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate && currentCode) {
      socket.emit("ice-candidate", { code: currentCode, candidate });
    }
  };

  peerConnection.ontrack = (e) => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
    }
    if (!remoteStream.getTracks().find((t) => t.id === e.track.id)) {
      remoteStream.addTrack(e.track);
    }
    // Explicitly play — autoplay alone is unreliable when srcObject is set dynamically
    remoteVideo.play().catch((err) => console.warn("play() failed:", err));
    setLive(true);
    setStatus("📡 Receiving stream", "connected");
    attachControlListeners();
  };

  peerConnection.onconnectionstatechange = () => {
    if (!peerConnection) return;
    const s = peerConnection.connectionState;
    if (s === "connected") setStatus("✅ Connected", "connected");
    if (s === "disconnected") setStatus("⚠️ Connection lost", "error");
    if (s === "failed") setStatus("❌ Connection failed", "error");
  };

  return peerConnection;
}

function cleanup() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteStream = null;
  remoteVideo.srcObject = null;
  setLive(false);
  detachControlListeners();
}

// ── Control: send to agent via server ────────────────────────
function sendControl(event) {
  if (!currentCode || isHost) return;
  if (!peerConnection || peerConnection.connectionState !== "connected") return;
  socket.emit("control-event", event);
}

// ── Coordinate mapping ────────────────────────────────────────
function getScaledCoords(e) {
  const rect = remoteVideo.getBoundingClientRect();
  const vidW = remoteVideo.videoWidth || rect.width;
  const vidH = remoteVideo.videoHeight || rect.height;

  // account for letterboxing (object-fit: contain)
  const scale = Math.min(rect.width / vidW, rect.height / vidH);
  const drawW = vidW * scale;
  const drawH = vidH * scale;
  const offX = (rect.width - drawW) / 2;
  const offY = (rect.height - drawH) / 2;

  const localX = e.clientX - rect.left - offX;
  const localY = e.clientY - rect.top - offY;

  return {
    x: Math.round((localX / drawW) * vidW),
    y: Math.round((localY / drawH) * vidH),
  };
}

// ── Mouse handlers ────────────────────────────────────────────
let lastMove = 0;
function onMouseMove(e) {
  // move custom cursor
  const rect = remoteVideo.getBoundingClientRect();
  cursorEl.style.left = `${e.clientX - rect.left}px`;
  cursorEl.style.top = `${e.clientY - rect.top}px`;

  if (Date.now() - lastMove < 16) return;
  lastMove = Date.now();
  sendControl({ type: "mouse_move", ...getScaledCoords(e) });
}

function onMouseDown(e) {
  remoteVideo.focus();
  sendControl({
    type: e.button === 2 ? "right_click" : "click",
    ...getScaledCoords(e),
  });
}

function onDblClick(e) {
  sendControl({ type: "double_click", ...getScaledCoords(e) });
}

function onScroll(e) {
  e.preventDefault();
  sendControl({
    type: "scroll",
    dx: Math.round(e.deltaX),
    dy: Math.round(e.deltaY),
  });
}

// ── Keyboard ──────────────────────────────────────────────────
function onKeyDown(e) {
  if (document.activeElement === codeInput) return;
  if (isHost || !currentCode) return;
  e.preventDefault();

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    sendControl({ type: "type", text: e.key });
  } else {
    sendControl({
      type: "key_tap",
      key: e.key,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    });
  }
}

function attachControlListeners() {
  remoteVideo.setAttribute("tabindex", "0");
  remoteVideo.addEventListener("mousemove", onMouseMove);
  remoteVideo.addEventListener("mousedown", onMouseDown);
  remoteVideo.addEventListener("dblclick", onDblClick);
  remoteVideo.addEventListener("wheel", onScroll, { passive: false });
  remoteVideo.addEventListener("contextmenu", (e) => e.preventDefault());
  remoteVideo.addEventListener("loadedmetadata", () => {
    if (!isHost) remoteVideo.focus();
  });
  document.addEventListener("keydown", onKeyDown);

  // Touch events (Mobile)
  remoteVideo.addEventListener("touchstart", handleTouchStart);
  remoteVideo.addEventListener("touchmove", handleTouchMove);
  remoteVideo.addEventListener("touchmove", handleTouchScroll);
}

function detachControlListeners() {
  remoteVideo.removeEventListener("mousemove", onMouseMove);
  remoteVideo.removeEventListener("mousedown", onMouseDown);
  remoteVideo.removeEventListener("dblclick", onDblClick);
  remoteVideo.removeEventListener("wheel", onScroll);
  document.removeEventListener("keydown", onKeyDown);

  // Mobile events
  remoteVideo.removeEventListener("touchstart", handleTouchStart);
  remoteVideo.removeEventListener("touchmove", handleTouchMove);
  remoteVideo.removeEventListener("touchmove", handleTouchScroll);
}

// ── Button handlers ───────────────────────────────────────────
createBtn.addEventListener("click", () => {
  createBtn.disabled = true;
  socket.emit("request-code");
  setStatus("⏳ Requesting code from agent…", "pending");
});

// Share screen is handled entirely by agent.js — no browser action needed

joinBtn.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (code.length !== 6)
    return setStatus("Please enter a 6-digit code", "error");
  isHost = false;
  socket.emit("join-session", { code });
  setStatus("⏳ Connecting…", "pending");
});

// ── TOUCH SUPPORT (MOBILE) ─────────────────────

let lastTap = 0;

function handleTouchStart(e) {
  if (isHost) return;

  const touch = e.touches[0];
  const coords = getScaledCoords({
    clientX: touch.clientX,
    clientY: touch.clientY,
  });

  const now = Date.now();

  // Double tap
  if (now - lastTap < 300) {
    sendControl({ type: "double_click", ...coords });
  } else {
    sendControl({ type: "click", ...coords });
  }

  lastTap = now;
}

function handleTouchMove(e) {
  if (isHost) return;

  const touch = e.touches[0];

  const coords = getScaledCoords({
    clientX: touch.clientX,
    clientY: touch.clientY,
  });

  sendControl({
    type: "mouse_move",
    ...coords,
  });
}

function handleTouchScroll(e) {
  if (isHost) return;

  if (e.touches.length === 2) {
    e.preventDefault();

    const dy = e.touches[0].clientY - e.touches[1].clientY;

    sendControl({
      type: "scroll",
      dy: dy > 0 ? 10 : -10,
    });
  }
}

// ── Socket events ─────────────────────────────────────────────
socket.on("code-generated", ({ code }) => {
  currentCode = code;
  isHost = true;
  showCode(code);
  setStatus("✅ Code ready. Share it with the viewer.", "connected");
  createBtn.disabled = false;
});

socket.on("code-error", ({ message }) => {
  setStatus("❌ " + message, "error");
  createBtn.disabled = false;
});

socket.on("register-success", ({ code }) => {
  currentCode = code;
  isHost = true;
  showCode(code);
  setStatus("✅ Registered.", "connected");
});

socket.on("join-success", async ({ code }) => {
  currentCode = code;
  setStatus("✅ Joined! Waiting for host stream…", "connected");
  await createPeerConnection();
});

socket.on("join-error", ({ message }) => setStatus("❌ " + message, "error"));

socket.on("offer", async ({ offer }) => {
  try {
    await createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", { code: currentCode, answer });
  } catch (err) {
    setStatus("❌ Failed to handle offer", "error");
    console.error(err);
  }
});

socket.on("answer", async ({ answer }) => {
  try {
    await peerConnection?.setRemoteDescription(
      new RTCSessionDescription(answer),
    );
  } catch (err) {
    console.error("Answer error:", err);
  }
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    if (peerConnection)
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("ICE error:", err);
  }
});

socket.on("viewer-left", ({ message }) => {
  setStatus("👋 " + message, "idle");
  cleanup();
});

socket.on("session-ended", ({ message }) => {
  setStatus("🔴 " + message, "error");
  cleanup();
  currentCode = null;
  myCodeEl.textContent = "— — — — — —";
  myCodeEl.classList.add("empty");
  copyBtn.style.display = "none";
  agentNote.style.display = "none";
  showToast("Session ended");
});
