const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

// ── State ─────────────────────────────────────────────────────
// code → { agentId, viewerId }
const sessions = {};
// agentSocketId → code
const agentCodes = {};
// agentSocketId → browserSocketId waiting for that code
const agentPendingViewer = {};

io.on("connection", (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  // ── Agent registers itself as available ───────────────────
  socket.on("agent-ready", () => {
    socket.isAgent = true;
    console.log(`🤖 Agent ready: ${socket.id}`);
  });

  // ── Browser requests a code (routed to an available agent) ─
  socket.on("request-code", () => {
    const agent = [...io.sockets.sockets.values()].find(
      (s) => s.isAgent && !agentCodes[s.id]
    );

    if (!agent) {
      socket.emit("code-error", { message: "No agent available right now." });
      return;
    }

    agentPendingViewer[agent.id] = socket.id;  // remember which browser asked
    agent.emit("generate-code-for-viewer", { viewerId: socket.id });
  });

  // ── Agent registers a host code ───────────────────────────
  socket.on("register-host", ({ code }) => {
    if (sessions[code]) {
      socket.emit("register-error", { message: "Code already in use." });
      return;
    }
    sessions[code] = { agentId: socket.id, viewerId: null };
    agentCodes[socket.id] = code;
    socket.emit("register-success", { code });
    console.log(`🖥️  Host registered | Code: ${code}`);

    // ✅ Send the code to the browser that originally clicked "Get Code"
    const pendingBrowserId = agentPendingViewer[socket.id];
    if (pendingBrowserId) {
      const browserSocket = io.sockets.sockets.get(pendingBrowserId);
      if (browserSocket) browserSocket.emit("code-generated", { code });
      delete agentPendingViewer[socket.id];
    }
  });

  // ── Viewer joins with a code ──────────────────────────────
  socket.on("join-session", ({ code }) => {
    const session = sessions[code];
    if (!session) {
      socket.emit("join-error", { message: "Invalid code." });
      return;
    }
    if (session.viewerId) {
      socket.emit("join-error", { message: "Session already in use." });
      return;
    }

    session.viewerId = socket.id;
    socket.currentCode = code;
    socket.emit("join-success", { code });

    const agentSocket = io.sockets.sockets.get(session.agentId);
    if (agentSocket) agentSocket.emit("viewer-joined", { viewerId: socket.id });

    console.log(`👀 Viewer joined | Code: ${code}`);
  });

  // ── WebRTC signaling relay ────────────────────────────────
  socket.on("offer", ({ code, offer }) => {
    const session = sessions[code];
    if (!session) return;
    const target = io.sockets.sockets.get(session.viewerId);
    if (target) target.emit("offer", { offer });
  });

  socket.on("answer", ({ code, answer }) => {
    const session = sessions[code];
    if (!session) return;
    const target = io.sockets.sockets.get(session.agentId);
    if (target) target.emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ code, candidate }) => {
    const session = sessions[code];
    if (!session) return;
    const isAgent = agentCodes[socket.id] === code;
    const targetId = isAgent ? session.viewerId : session.agentId;
    const target = io.sockets.sockets.get(targetId);
    if (target) target.emit("ice-candidate", { candidate });
  });

  // ── Control events: viewer → agent ────────────────────────
  socket.on("control-event", (event) => {
    const code = socket.currentCode;
    const session = sessions[code];
    if (!session) return;
    const agent = io.sockets.sockets.get(session.agentId);
    if (agent) agent.emit("control-event", event);
  });

  // ── Disconnect cleanup ────────────────────────────────────
  socket.on("disconnect", () => {
    console.log(`❌ Disconnected: ${socket.id}`);

    // If agent disconnects
    const code = agentCodes[socket.id];
    if (code) {
      const session = sessions[code];
      if (session?.viewerId) {
        const viewer = io.sockets.sockets.get(session.viewerId);
        if (viewer) viewer.emit("session-ended", { message: "Host disconnected." });
      }
      delete sessions[code];
      delete agentCodes[socket.id];
    }

    // If viewer disconnects
    for (const [code, session] of Object.entries(sessions)) {
      if (session.viewerId === socket.id) {
        session.viewerId = null;
        const agent = io.sockets.sockets.get(session.agentId);
        if (agent) agent.emit("viewer-left", { message: "Viewer disconnected." });
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));