const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.static("public")); // serve index.html from /public folder

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

const sessions = {}; // code -> { hostSocketId, viewerSocketId }
const socketToCode = {}; // socketId -> code

const activeHosts = {}; // code -> true

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // ── Agent/Host registers ──────────────────────────────────────
  //   socket.on("register-host", ({ code }) => {
  //     if (!code)
  //       return socket.emit("register-error", { message: "No code provided" });
  //     if (sessions[code])
  //       return socket.emit("register-error", { message: "Code already in use" });

  //     sessions[code] = { hostSocketId: socket.id, viewerSocketId: null };
  //     socketToCode[socket.id] = code;
  //     socket.join(code);
  //     socket.emit("register-success", { code });
  //     console.log(`🖥️  Host registered | Code: ${code}`);
  //   });
  socket.on("register-host", ({ code }) => {
    if (!code) return;

    sessions[code] = { hostSocketId: socket.id, viewerSocketId: null };
    socketToCode[socket.id] = code;
    socket.join(code);

    activeHosts[code] = true; // ✅ store

    socket.emit("register-success", { code });
    console.log(`🖥️ Host registered | Code: ${code}`);
  });

  // ── Viewer joins ──────────────────────────────────────────────
  socket.on("join-session", ({ code }) => {
    const session = sessions[code];
    if (!session)
      return socket.emit("join-error", {
        message: "Invalid code. Host not found.",
      });
    if (session.viewerSocketId)
      return socket.emit("join-error", {
        message: "Session already has a viewer.",
      });

    session.viewerSocketId = socket.id;
    socketToCode[socket.id] = code;
    socket.join(code);

    socket.emit("join-success", { code });
    io.to(session.hostSocketId).emit("viewer-joined", { viewerId: socket.id });
    console.log(`👀 Viewer joined | Code: ${code}`);
  });

  // ── Control events (viewer → host agent) ─────────────────────
  socket.on("control-event", ({ code, event }) => {
    const session = sessions[code];

    if (!session || socket.id !== session.viewerSocketId) {
      console.log("❌ Not viewer");
      return;
    }

    io.to(session.hostSocketId).emit("control-event", event);
  });

  // ── WebRTC signaling ──────────────────────────────────────────
  socket.on("offer", ({ code, offer }) => {
    const session = sessions[code];
    if (!session) return;
    const target =
      socket.id === session.hostSocketId
        ? session.viewerSocketId
        : session.hostSocketId;
    if (target) io.to(target).emit("offer", { offer });
  });

  socket.on("answer", ({ code, answer }) => {
    const session = sessions[code];
    if (!session) return;
    const target =
      socket.id === session.hostSocketId
        ? session.viewerSocketId
        : session.hostSocketId;
    if (target) io.to(target).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ code, candidate }) => {
    const session = sessions[code];
    if (!session) return;
    const target =
      socket.id === session.hostSocketId
        ? session.viewerSocketId
        : session.hostSocketId;
    if (target) io.to(target).emit("ice-candidate", { candidate });
  });

  // ── Disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    const code = socketToCode[socket.id];
    if (!code) return;
    const session = sessions[code];
    if (!session) return;

    if (socket.id === session.hostSocketId) {
      if (session.viewerSocketId)
        io.to(session.viewerSocketId).emit("session-ended", {
          message: "Host disconnected.",
        });
      delete sessions[code];
      console.log(`🗑️  Session destroyed: ${code}`);
    } else if (socket.id === session.viewerSocketId) {
      io.to(session.hostSocketId).emit("viewer-left", {
        message: "Viewer disconnected.",
      });
      session.viewerSocketId = null;
    }

    delete socketToCode[socket.id];

    if (socket.id === session.hostSocketId) {
      delete activeHosts[code]; // ✅ remove
    }
  });
});

app.get("/host", (req, res) => {
  const codes = Object.keys(activeHosts);
  res.json({ codes });
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
