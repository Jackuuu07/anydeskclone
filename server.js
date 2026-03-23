const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

app.use(express.static("public"));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const PORT = process.env.PORT || 3000;

/*
  sessions:
  code -> { hostSocketId, viewerSocketId }
*/
const sessions = {};

/*
  socketToCode:
  socketId -> code
*/
const socketToCode = {};

/*
  activeHosts:
  code -> true (active agent)
*/
const activeHosts = {};

io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  // ─────────────────────────────────────────────
  // HOST (AGENT) REGISTRATION
  // ─────────────────────────────────────────────
  socket.on("register-host", ({ code }) => {
    if (!code) return;

    sessions[code] = {
      hostSocketId: socket.id,
      viewerSocketId: null,
    };

    socketToCode[socket.id] = code;
    socket.join(code);

    activeHosts[code] = true;

    socket.emit("register-success", { code });

    console.log(`🖥️ Host registered | Code: ${code}`);
  });

  // ─────────────────────────────────────────────
  // VIEWER JOIN
  // ─────────────────────────────────────────────
  socket.on("join-session", ({ code }) => {
    const session = sessions[code];

    if (!session) {
      return socket.emit("join-error", {
        message: "Invalid code. Host not found.",
      });
    }

    if (session.viewerSocketId) {
      return socket.emit("join-error", {
        message: "Session already has a viewer.",
      });
    }

    session.viewerSocketId = socket.id;
    socketToCode[socket.id] = code;
    socket.join(code);

    socket.emit("join-success", { code });

    io.to(session.hostSocketId).emit("viewer-joined", {
      viewerId: socket.id,
    });

    console.log(`👀 Viewer joined | Code: ${code}`);
  });

  // ─────────────────────────────────────────────
  // CONTROL EVENTS (VIEWER → AGENT)
  // ─────────────────────────────────────────────
  socket.on("control-event", ({ code, event }) => {
    const session = sessions[code];

    if (!session || socket.id !== session.viewerSocketId) {
      console.log("❌ Invalid control sender");
      return;
    }

    io.to(session.hostSocketId).emit("control-event", event);
  });

  // ─────────────────────────────────────────────
  // WEBRTC SIGNALING
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // DISCONNECT
  // ─────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);

    const code = socketToCode[socket.id];
    if (!code) return;

    const session = sessions[code];
    if (!session) return;

    if (socket.id === session.hostSocketId) {
      // Host disconnected
      if (session.viewerSocketId) {
        io.to(session.viewerSocketId).emit("session-ended", {
          message: "Host disconnected.",
        });
      }

      delete sessions[code];
      delete activeHosts[code];

      console.log(`🗑️ Session destroyed: ${code}`);
    } else if (socket.id === session.viewerSocketId) {
      // Viewer disconnected
      io.to(session.hostSocketId).emit("viewer-left", {
        message: "Viewer disconnected.",
      });

      session.viewerSocketId = null;
    }

    delete socketToCode[socket.id];
  });
});

// ─────────────────────────────────────────────
// API: GET ACTIVE HOST CODE
// ─────────────────────────────────────────────
app.get("/host", (req, res) => {
  const codes = Object.keys(activeHosts);
  res.json({ codes });
});

// ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});