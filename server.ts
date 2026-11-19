import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { ClientToServerMessage } from './src/multiplayer/protocol';
import { OnlineRoomManager } from './src/multiplayer/roomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  const roomManager = new OnlineRoomManager();

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      onlinePlayers: roomManager.getOnlineCount(),
      timestamp: Date.now(),
    });
  });

  app.head('/api/health', (_req, res) => {
    res.status(200).end();
  });

  // Authoritative real-time WebSocket endpoint on /ws
  const wss = new WebSocketServer({ server, path: '/ws' });
  let nextClientSeq = 1;

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `c_${Date.now().toString(36)}_${nextClientSeq++}`;
    roomManager.addClient({
      id: clientId,
      send: (msg) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      },
    });

    ws.on('message', (raw) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        const msg = JSON.parse(text) as ClientToServerMessage;
        if (msg && typeof msg.type === 'string') {
          roomManager.handleMessage(clientId, msg);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      roomManager.removeClient(clientId);
    });

    ws.on('error', () => {
      roomManager.removeClient(clientId);
    });
  });

  // Fixed 30 Hz authoritative simulation tick loop
  const TICK_DT = 1 / 30;
  setInterval(() => {
    roomManager.stepAllMatches(TICK_DT, Date.now());
  }, Math.round(TICK_DT * 1000));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`FiFA 2026 server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
