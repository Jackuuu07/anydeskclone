// const socket = io();

// // ── DOM ───────────────────────────────────────────────────────
// const createBtn = document.getElementById("createBtn");
// const shareScreenBtn = document.getElementById("shareScreenBtn");
// const joinBtn = document.getElementById("joinBtn");
// const codeInput = document.getElementById("codeInput");
// const myCodeEl = document.getElementById("myCode");
// const statusEl = document.getElementById("status");
// const remoteVideo = document.getElementById("remoteVideo");
// const statusDot = document.getElementById("statusDot");
// const copyBtn = document.getElementById("copyBtn");
// const videoWrap = document.getElementById("videoWrap");
// const placeholder = document.getElementById("placeholder");
// const controlBadge = document.getElementById("controlBadge");
// const toast = document.getElementById("toast");

// // ── State ─────────────────────────────────────────────────────
// let localScreenStream = null;
// let peerConnection = null;
// let currentCode = null;
// let isHost = false;
// let screenSender = null;
// let remoteStream = null;

// const rtcConfig = {
//   iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
// };

// // ── UI helpers ────────────────────────────────────────────────
// function setStatus(msg, state = "idle") {
//   statusEl.textContent = msg;
//   statusDot.className = "status-dot";
//   if (state === "connected") statusDot.classList.add("connected");
//   if (state === "pending") statusDot.classList.add("pending");
//   if (state === "error") statusDot.classList.add("error");
// }

// function setLive(on) {
//   videoWrap.classList.toggle("active", on);
//   placeholder.classList.toggle("hidden", on);
//   controlBadge.classList.toggle("show", on && !isHost);
// }

// function showCode(code) {
//   myCodeEl.classList.remove("empty");
//   myCodeEl.textContent = code.split("").join(" "); // "123456" → "1 2 3 4 5 6"
//   copyBtn.style.display = "grid";
//   shareScreenBtn.disabled = false;
// }

// function showToast(msg) {
//   toast.textContent = msg;
//   toast.classList.add("show");
//   setTimeout(() => toast.classList.remove("show"), 2000);
// }

// // ── Copy code button ──────────────────────────────────────────
// copyBtn.addEventListener("click", () => {
//   if (!currentCode) return;
//   navigator.clipboard
//     .writeText(currentCode)
//     .then(() => showToast("Code copied!"));
// });

// // ── Input: digits only ────────────────────────────────────────
// codeInput.addEventListener("input", (e) => {
//   e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
// });

// // ── WebRTC ────────────────────────────────────────────────────
// async function createPeerConnection() {
//   if (peerConnection) return peerConnection;

//   peerConnection = new RTCPeerConnection(rtcConfig);

//   peerConnection.onicecandidate = (e) => {
//     if (e.candidate && currentCode) {
//       socket.emit("ice-candidate", {
//         code: currentCode,
//         candidate: e.candidate,
//       });
//     }
//   };

//   peerConnection.ontrack = (e) => {
//     if (!remoteStream) {
//       remoteStream = new MediaStream();
//       remoteVideo.srcObject = remoteStream;
//     }
//     if (!remoteStream.getTracks().find((t) => t.id === e.track.id)) {
//       remoteStream.addTrack(e.track);
//     }
//     setLive(true);
//     setStatus("📡 Receiving live screen stream", "connected");
//   };

//   peerConnection.onconnectionstatechange = () => {
//     if (peerConnection.connectionState === "connected")
//       setStatus("✅ Connected", "connected");
//     if (peerConnection.connectionState === "disconnected")
//       setStatus("⚠️ Connection lost", "error");
//   };

//   return peerConnection;
// }

// async function startScreenShare() {
//   if (localScreenStream) return localScreenStream;
//   localScreenStream = await navigator.mediaDevices.getDisplayMedia({
//     video: true,
//     audio: true,
//   });
//   localScreenStream.getVideoTracks()[0].onended = () => {
//     setStatus("🛑 Screen sharing stopped", "idle");
//     localScreenStream = null;
//   };
//   return localScreenStream;
// }

// async function attachAndOffer() {
//   await createPeerConnection();
//   await startScreenShare();

//   const track = localScreenStream.getVideoTracks()[0];
//   if (!track) return;

//   if (screenSender) {
//     await screenSender.replaceTrack(track);
//   } else {
//     screenSender = peerConnection.addTrack(track, localScreenStream);
//   }

//   const offer = await peerConnection.createOffer();
//   await peerConnection.setLocalDescription(offer);
//   socket.emit("offer", { code: currentCode, offer });
// }

// function cleanup() {
//   if (peerConnection) {
//     peerConnection.close();
//     peerConnection = null;
//   }
//   screenSender = null;
//   remoteStream = null;
//   remoteVideo.srcObject = null;
//   setLive(false);
//   detachControlListeners();
// }

// // ── Control events (viewer only) ──────────────────────────────
// // function getScaledCoords(e) {
// //   const rect = remoteVideo.getBoundingClientRect();
// //   return {
// //     x: Math.round(
// //       (e.clientX - rect.left) * (remoteVideo.videoWidth / rect.width),
// //     ),
// //     y: Math.round(
// //       (e.clientY - rect.top) * (remoteVideo.videoHeight / rect.height),
// //     ),
// //   };
// // }

// function getScaledCoords(e) {
//   const rect = remoteVideo.getBoundingClientRect();

//   // ✅ Guard: fall back to raw coords if stream not loaded yet
//   const vidW = remoteVideo.videoWidth || rect.width;
//   const vidH = remoteVideo.videoHeight || rect.height;

//   return {
//     x: Math.round((e.clientX - rect.left) * (vidW / rect.width)),
//     y: Math.round((e.clientY - rect.top) * (vidH / rect.height)),
//   };
// }


// function sendControl(event) {
//   console.log(
//     "🎮 sendControl:",
//     event.type,
//     "| isHost:",
//     isHost,
//     "| code:",
//     currentCode,
//   );
//   if (!currentCode || isHost) {
//     console.log("❌ BLOCKED — isHost:", isHost, "currentCode:", currentCode);
//     return;
//   }
//   console.log("✅ EMITTING to server");
//   socket.emit("control-event", event);
// }

// let lastMove = 0;
// function onMouseMove(e) {
//   if (Date.now() - lastMove < 16) return;
//   lastMove = Date.now();
//   sendControl({ type: "mouse_move", ...getScaledCoords(e) });
// }

// function onMouseDown(e) {
//   sendControl({
//     type: e.button === 2 ? "right_click" : "click",
//     ...getScaledCoords(e),
//   });
// }

// function onDblClick(e) {
//   sendControl({ type: "double_click", ...getScaledCoords(e) });
// }

// function onScroll(e) {
//   e.preventDefault();
//   sendControl({
//     type: "scroll",
//     dx: Math.round(e.deltaX),
//     dy: Math.round(e.deltaY),
//   });
// }

// function onKeyDown(e) {
//   e.preventDefault();
//   // If a modifier is held, always send as key_tap (e.g. Ctrl+C, Alt+F4)
//   if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
//     sendControl({ type: "type", text: e.key });
//   } else {
//     sendControl({
//       type: "key_tap",
//       key: e.key,
//       ctrlKey: e.ctrlKey,
//       altKey: e.altKey,
//       shiftKey: e.shiftKey,
//       metaKey: e.metaKey,
//     });
//   }
// }

// function attachControlListeners() {
//   remoteVideo.setAttribute("tabindex", "0");
//   remoteVideo.focus();

//   // Add this to attachControlListeners()
//   remoteVideo.addEventListener("click", () => remoteVideo.focus());

//   remoteVideo.addEventListener("mousemove", onMouseMove);
//   remoteVideo.addEventListener("mousedown", onMouseDown);
//   remoteVideo.addEventListener("dblclick", onDblClick);
//   remoteVideo.addEventListener("wheel", onScroll, { passive: false });
//   remoteVideo.addEventListener("keydown", onKeyDown);
//   remoteVideo.addEventListener("contextmenu", (e) => e.preventDefault());
// }

// function detachControlListeners() {
//   remoteVideo.removeEventListener("mousemove", onMouseMove);
//   remoteVideo.removeEventListener("mousedown", onMouseDown);
//   remoteVideo.removeEventListener("dblclick", onDblClick);
//   remoteVideo.removeEventListener("wheel", onScroll);
//   remoteVideo.removeEventListener("keydown", onKeyDown);
// }

// // ── Buttons ───────────────────────────────────────────────────
// createBtn.addEventListener("click", () => {
//   isHost = true;
//   const code = Math.floor(100000 + Math.random() * 900000).toString();
//   socket.emit("register-host", { code });
//   setStatus("⏳ Registering…", "pending");
// });

// shareScreenBtn.addEventListener("click", async () => {
//   if (!isHost) return;
//   try {
//     setStatus("🖥️ Starting screen share…", "pending");
//     await attachAndOffer();
//     setStatus("📨 Offer sent — waiting for viewer…", "pending");
//   } catch (err) {
//     console.error(err);
//     setStatus("❌ Failed to share screen", "error");
//   }
// });

// joinBtn.addEventListener("click", () => {
//   const code = codeInput.value.trim();
//   if (code.length !== 6)
//     return setStatus("Please enter a 6-digit code", "error");
//   isHost = false;
//   socket.emit("join-session", { code });
//   setStatus("⏳ Connecting…", "pending");
// });

// // ── Socket events ─────────────────────────────────────────────
// socket.on("register-success", ({ code }) => {
//   currentCode = code;
//   showCode(code);
//   setStatus("✅ Registered. Click Share Screen when ready.", "connected");
// });

// socket.on("register-error", ({ message }) =>
//   setStatus("❌ " + message, "error"),
// );

// socket.on("viewer-joined", async () => {
//   setStatus("👀 Viewer joined!", "pending");
//   try {
//     if (localScreenStream) {
//       await attachAndOffer();
//       setStatus("📨 Offer sent", "pending");
//     } else {
//       setStatus("👀 Viewer joined. Click Share Screen to begin.", "pending");
//     }
//   } catch (err) {
//     setStatus("❌ Failed to send offer", "error");
//   }
// });

// socket.on("join-success", async ({ code }) => {
//   currentCode = code;
//   setStatus("✅ Joined! Waiting for host stream…", "connected");
//   await createPeerConnection();
//   attachControlListeners();
// });

// socket.on("join-error", ({ message }) => setStatus("❌ " + message, "error"));

// socket.on("offer", async ({ offer }) => {
//   try {
//     await createPeerConnection();
//     await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
//     const answer = await peerConnection.createAnswer();
//     await peerConnection.setLocalDescription(answer);
//     socket.emit("answer", { code: currentCode, answer });
//   } catch (err) {
//     setStatus("❌ Failed to handle offer", "error");
//   }
// });

// socket.on("answer", async ({ answer }) => {
//   try {
//     await peerConnection.setRemoteDescription(
//       new RTCSessionDescription(answer),
//     );
//   } catch (err) {
//     setStatus("❌ Failed to handle answer", "error");
//   }
// });

// socket.on("ice-candidate", async ({ candidate }) => {
//   try {
//     if (peerConnection)
//       await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
//   } catch (err) {
//     console.error("ICE error:", err);
//   }
// });

// socket.on("viewer-left", ({ message }) => {
//   setStatus("👋 " + message, "idle");
//   cleanup();
// });

// socket.on("session-ended", ({ message }) => {
//   setStatus("🔴 " + message, "error");
//   cleanup();
//   currentCode = null;
//   myCodeEl.textContent = "— — — — — —";
//   myCodeEl.classList.add("empty");
//   copyBtn.style.display = "none";
//   shareScreenBtn.disabled = true;
// });


// ✅ Auto-detects localhost vs deployed Render URL
const SERVER_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : window.location.origin;
const socket = io(SERVER_URL);

// ── DOM ───────────────────────────────────────────────────────
const createBtn      = document.getElementById("createBtn");
const shareScreenBtn = document.getElementById("shareScreenBtn");
const joinBtn        = document.getElementById("joinBtn");
const codeInput      = document.getElementById("codeInput");
const myCodeEl       = document.getElementById("myCode");
const statusEl       = document.getElementById("status");
const remoteVideo    = document.getElementById("remoteVideo");
const statusDot      = document.getElementById("statusDot");
const copyBtn        = document.getElementById("copyBtn");
const videoWrap      = document.getElementById("videoWrap");
const placeholder    = document.getElementById("placeholder");
const controlBadge   = document.getElementById("controlBadge");
const toast          = document.getElementById("toast");

// ── State ─────────────────────────────────────────────────────
let localScreenStream = null;
let peerConnection    = null;
let currentCode       = null;
let isHost            = false;
let screenSender      = null;
let remoteStream      = null;

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

// ── UI helpers ────────────────────────────────────────────────
function setStatus(msg, state = "idle") {
  statusEl.textContent = msg;
  statusDot.className = "status-dot";
  if (state === "connected") statusDot.classList.add("connected");
  if (state === "pending")   statusDot.classList.add("pending");
  if (state === "error")     statusDot.classList.add("error");
}

function setLive(on) {
  videoWrap.classList.toggle("active", on);
  placeholder.classList.toggle("hidden", on);
  controlBadge.classList.toggle("show", on && !isHost);
  // ✅ Focus video as soon as stream is live so keyboard works immediately
  if (on && !isHost) remoteVideo.focus();
}

function showCode(code) {
  myCodeEl.classList.remove("empty");
  myCodeEl.textContent = code.split("").join(" ");
  copyBtn.style.display = "grid";
  shareScreenBtn.disabled = false;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// ── Copy code button ──────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  if (!currentCode) return;
  navigator.clipboard.writeText(currentCode).then(() => showToast("Code copied!"));
});

// ── Input: digits only ────────────────────────────────────────
codeInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

// ── WebRTC ────────────────────────────────────────────────────
async function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate && currentCode) {
      socket.emit("ice-candidate", { code: currentCode, candidate: e.candidate });
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
    setLive(true);
    setStatus("📡 Receiving live screen stream", "connected");
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === "connected")
      setStatus("✅ Connected", "connected");
    if (peerConnection.connectionState === "disconnected")
      setStatus("⚠️ Connection lost", "error");
  };

  return peerConnection;
}

async function startScreenShare() {
  if (localScreenStream) return localScreenStream;
  localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  localScreenStream.getVideoTracks()[0].onended = () => {
    setStatus("🛑 Screen sharing stopped", "idle");
    localScreenStream = null;
  };
  return localScreenStream;
}

async function attachAndOffer() {
  await createPeerConnection();
  await startScreenShare();

  const track = localScreenStream.getVideoTracks()[0];
  if (!track) return;

  if (screenSender) {
    await screenSender.replaceTrack(track);
  } else {
    screenSender = peerConnection.addTrack(track, localScreenStream);
  }

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { code: currentCode, offer });
}

function cleanup() {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  screenSender = null;
  remoteStream = null;
  remoteVideo.srcObject = null;
  setLive(false);
  detachControlListeners();
}

// ── Control events (viewer only) ──────────────────────────────
function getScaledCoords(e) {
  const rect = remoteVideo.getBoundingClientRect();
  const vidW = remoteVideo.videoWidth  || rect.width;
  const vidH = remoteVideo.videoHeight || rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * (vidW / rect.width)),
    y: Math.round((e.clientY - rect.top)  * (vidH / rect.height)),
  };
}

function sendControl(event) {
  if (!currentCode || isHost) return;
  socket.emit("control-event", event);
}

let lastMove = 0;
function onMouseMove(e) {
  if (Date.now() - lastMove < 16) return;
  lastMove = Date.now();
  sendControl({ type: "mouse_move", ...getScaledCoords(e) });
}

function onMouseDown(e) {
  // ✅ Re-focus on every click so keyboard always works after clicking
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
  sendControl({ type: "scroll", dx: Math.round(e.deltaX), dy: Math.round(e.deltaY) });
}

// ✅ Keyboard listener on DOCUMENT — works regardless of what is focused
function onKeyDown(e) {
  // Don't intercept if user is typing in the code input box
  if (document.activeElement === codeInput) return;
  if (isHost || !currentCode) return;

  e.preventDefault();

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    sendControl({ type: "type", text: e.key });
  } else {
    sendControl({
      type: "key_tap",
      key: e.key,
      ctrlKey:  e.ctrlKey,
      altKey:   e.altKey,
      shiftKey: e.shiftKey,
      metaKey:  e.metaKey,
    });
  }
}

function attachControlListeners() {
  remoteVideo.setAttribute("tabindex", "0");

  remoteVideo.addEventListener("mousemove",   onMouseMove);
  remoteVideo.addEventListener("mousedown",   onMouseDown);
  remoteVideo.addEventListener("dblclick",    onDblClick);
  remoteVideo.addEventListener("wheel",       onScroll, { passive: false });
  remoteVideo.addEventListener("contextmenu", (e) => e.preventDefault());

  // ✅ Keyboard on document — no focus issue ever
  document.addEventListener("keydown", onKeyDown);

  // ✅ Re-focus when stream metadata loads
  remoteVideo.addEventListener("loadedmetadata", () => {
    if (!isHost) remoteVideo.focus();
  });
}

function detachControlListeners() {
  remoteVideo.removeEventListener("mousemove",   onMouseMove);
  remoteVideo.removeEventListener("mousedown",   onMouseDown);
  remoteVideo.removeEventListener("dblclick",    onDblClick);
  remoteVideo.removeEventListener("wheel",       onScroll);
  document.removeEventListener("keydown",        onKeyDown);
}

// ── Buttons ───────────────────────────────────────────────────
// createBtn.addEventListener("click", () => {
//   isHost = true;
//   const code = Math.floor(100000 + Math.random() * 900000).toString();
//   socket.emit("register-host", { code });
//   setStatus("⏳ Registering…", "pending");
// });

createBtn.addEventListener("click", () => {
  socket.emit("request-code"); // 🔥 ask for agent code
  setStatus("⏳ Waiting for agent...", "pending");
});

shareScreenBtn.addEventListener("click", async () => {
  if (!isHost) return;
  try {
    setStatus("🖥️ Starting screen share…", "pending");
    await attachAndOffer();
    setStatus("📨 Offer sent — waiting for viewer…", "pending");
  } catch (err) {
    console.error(err);
    setStatus("❌ Failed to share screen", "error");
  }
});

joinBtn.addEventListener("click", () => {
  const code = codeInput.value.trim();
  if (code.length !== 6) return setStatus("Please enter a 6-digit code", "error");
  isHost = false;
  socket.emit("join-session", { code });
  setStatus("⏳ Connecting…", "pending");
});

socket.on("code-generated", ({ code }) => {
  setStatus(`✅ Code: ${code}`, "success");
});

// ── Socket events ─────────────────────────────────────────────
socket.on("register-success", ({ code }) => {
  currentCode = code;
  showCode(code);
  setStatus("✅ Registered. Click Share Screen when ready.", "connected");
});

socket.on("register-error", ({ message }) => setStatus("❌ " + message, "error"));

socket.on("viewer-joined", async () => {
  setStatus("👀 Viewer joined!", "pending");
  try {
    if (localScreenStream) {
      await attachAndOffer();
      setStatus("📨 Offer sent", "pending");
    } else {
      setStatus("👀 Viewer joined. Click Share Screen to begin.", "pending");
    }
  } catch (err) {
    setStatus("❌ Failed to send offer", "error");
  }
});

socket.on("join-success", async ({ code }) => {
  currentCode = code;
  setStatus("✅ Joined! Waiting for host stream…", "connected");
  await createPeerConnection();
  attachControlListeners();
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
  }
});

socket.on("answer", async ({ answer }) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    setStatus("❌ Failed to handle answer", "error");
  }
});

socket.on("ice-candidate", async ({ candidate }) => {
  try {
    if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
  shareScreenBtn.disabled = true;
});