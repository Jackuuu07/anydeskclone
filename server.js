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

let waitingViewers = [];

let agents = [];

io.on("connection", (socket) => {
  socket.on("agent-ready", () => {
    agents.push(socket.id);
  });

  // Browser asks for code
  socket.on("request-code", () => {
    waitingViewers.push(socket.id);

    const agentId = agents[0]; // pick available agent

    if (agentId) {
      io.to(agentId).emit("generate-code-for-viewer"); // ✅ NOT broadcast
    } else {
      socket.emit("error", { message: "No agent available" });
    }
  });

  console.log("🔌 Connected:", socket.id);

  // ── Agent/Host registers ──────────────────────────────────────
  socket.on("register-host", ({ code }) => {
    sessions[code] = { hostSocketId: socket.id, viewerSocketId: null };
    socketToCode[socket.id] = code;

    socket.join(code);

    socket.emit("register-success", { code });

    // ✅ correct logic
    const viewerId = waitingViewers.shift();
    if (viewerId) {
      io.to(viewerId).emit("code-generated", { code });
    }

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
  socket.on("control-event", (event) => {
    const code = socketToCode[socket.id];
    console.log("🟡 SERVER received:", event);
    console.log("code:", code, "| socket:", socket.id);

    console.log("control-event from:", socket.id, "| code:", code); // ← add

    if (!code) return console.log("DROP: no code"); // ← add

    const session = sessions[code];

    console.log("viewerSocketId:", session?.viewerSocketId); // ← add

    if (!session || socket.id !== session.viewerSocketId)
      return console.log("DROP: not viewer"); // ← add
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

    agents = agents.filter((id) => id !== socket.id);

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
  });
});

server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
