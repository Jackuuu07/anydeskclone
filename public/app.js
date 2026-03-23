const socket = io();

// ── DOM ─────────────────────────────
const codeInput = document.getElementById("codeInput");
const joinBtn = document.getElementById("joinBtn");
const remoteVideo = document.getElementById("remoteVideo");
const viewerScreen = document.getElementById("viewerScreen");
const backBtn = document.getElementById("backBtn");
const myId = document.getElementById("myId");

let peerConnection;
let currentCode = null;
let isHost = false;

// ── GET HOST ID ─────────────────────
async function fetchHost() {
  try {
    const res = await fetch("/host");
    const data = await res.json();

    if (data.codes.length > 0) {
      myId.innerText = data.codes[0];
    } else {
      myId.innerText = "Start agent";
    }
  } catch {
    myId.innerText = "Error";
  }
}

setInterval(fetchHost, 2000);

// ── JOIN ────────────────────────────
joinBtn.onclick = () => {
  const code = codeInput.value;
  if (!code) return;

  isHost = false;
  currentCode = code;

  socket.emit("join-session", { code });
};

// ── WEBRTC ─────────────────────────
function createPC() {
  peerConnection = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    viewerScreen.style.display = "block";
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", {
        code: currentCode,
        candidate: e.candidate
      });
    }
  };
}

// ── SOCKET EVENTS ──────────────────
socket.on("join-success", async ({ code }) => {
  currentCode = code;
  createPC();
});

socket.on("offer", async ({ offer }) => {
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { code: currentCode, answer });
});

socket.on("answer", async ({ answer }) => {
  await peerConnection.setRemoteDescription(answer);
});

socket.on("ice-candidate", async ({ candidate }) => {
  if (peerConnection) {
    await peerConnection.addIceCandidate(candidate);
  }
});

// ── CONTROL EVENTS ─────────────────
function sendControl(event) {
  if (!currentCode) return;

  socket.emit("control-event", {
    code: currentCode,
    event
  });
}

remoteVideo.addEventListener("mousemove", (e) => {
  sendControl({
    type: "mouse_move",
    x: e.clientX,
    y: e.clientY
  });
});

remoteVideo.addEventListener("click", () => {
  sendControl({ type: "click" });
});

document.addEventListener("keydown", (e) => {
  sendControl({
    type: "key_tap",
    key: e.key
  });
});

// ── BACK BUTTON ─────────────────────
backBtn.onclick = () => {
  viewerScreen.style.display = "none";
  if (peerConnection) peerConnection.close();
};