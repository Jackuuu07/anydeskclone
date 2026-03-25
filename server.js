const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

// ── State ─────────────────────────────────────
// code → { hostId, viewerId }
const sessions = {};

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // ── REGISTER HOST (ANYONE CAN DO THIS) ──────
  socket.on("register-host", ({ code }) => {
    if (sessions[code]) {
      socket.emit("register-error", { message: "Code already in use" });
      return;
    }

    sessions[code] = {
      hostId: socket.id,
      viewerId: null,
    };

    socket.currentCode = code;

    socket.emit("register-success", { code });

    console.log("🖥️ Host registered:", code);
  });

  // ── JOIN SESSION (ANYONE CAN DO THIS) ───────
  socket.on("join-session", ({ code }) => {
    const session = sessions[code];

    if (!session) {
      socket.emit("join-error", { message: "Invalid code" });
      return;
    }

    if (session.viewerId) {
      socket.emit("join-error", { message: "Session busy" });
      return;
    }

    session.viewerId = socket.id;
    socket.currentCode = code;

    socket.emit("join-success", { code });

    const host = io.sockets.sockets.get(session.hostId);
    if (host) host.emit("viewer-joined");

    console.log("👀 Viewer joined:", code);
  });

  // ── WebRTC SIGNALING ────────────────────────
  socket.on("offer", ({ code, offer }) => {
    const session = sessions[code];
    if (!session) return;

    const viewer = io.sockets.sockets.get(session.viewerId);
    if (viewer) viewer.emit("offer", { offer });
  });

  socket.on("answer", ({ code, answer }) => {
    const session = sessions[code];
    if (!session) return;

    const host = io.sockets.sockets.get(session.hostId);
    if (host) host.emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ code, candidate }) => {
    const session = sessions[code];
    if (!session) return;

    const isHost = session.hostId === socket.id;
    const targetId = isHost ? session.viewerId : session.hostId;

    const target = io.sockets.sockets.get(targetId);
    if (target) target.emit("ice-candidate", { candidate });
  });

  // ── CONTROL EVENTS ──────────────────────────
  socket.on("control-event", (event) => {
    const code = socket.currentCode;
    const session = sessions[code];
    if (!session) return;

    const host = io.sockets.sockets.get(session.hostId);
    if (host) host.emit("control-event", event);
  });

  // ── DISCONNECT CLEANUP ──────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    for (const [code, session] of Object.entries(sessions)) {
      if (session.hostId === socket.id) {
        const viewer = io.sockets.sockets.get(session.viewerId);
        if (viewer) {
          viewer.emit("session-ended", {
            message: "Host disconnected",
          });
        }
        delete sessions[code];
      }

      if (session.viewerId === socket.id) {
        session.viewerId = null;
        const host = io.sockets.sockets.get(session.hostId);
        if (host) {
          host.emit("viewer-left", {
            message: "Viewer disconnected",
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("🚀 Server running on port", PORT)
);

