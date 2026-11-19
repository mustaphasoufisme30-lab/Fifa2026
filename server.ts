import express from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { ClientToServerMessage } from './src/multiplayer/protocol';
import { OnlineRoomManager } from './src/multiplayer/roomManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
}

function loadFirebaseProjectId(): string {
  const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FirebaseAppletConfig;
  if (!parsed.projectId) {
    throw new Error('Missing projectId in firebase-applet-config.json');
  }
  return parsed.projectId;
}

function initFirebaseTokenVerifier() {
  const projectId = loadFirebaseProjectId();
  const adminApp = getApps().length ? getApp() : initializeApp({ projectId });
  const adminAuth = getAuth(adminApp);
  return async (idToken: string): Promise<{ uid: string; emailVerified: boolean }> => {
    // Verify signature, expiry, aud, and iss against Google's public certs locally
    // (no checkRevoked=true so no extra GCP IAM roles are required).
    const decoded = await adminAuth.verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      emailVerified: decoded.email_verified === true,
    };
  };
}

export async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  const verifyFirebaseIdToken = initFirebaseTokenVerifier();
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
    const sendSafe = (payload: Parameters<Parameters<OnlineRoomManager['addClient']>[0]['send']>[0]) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    roomManager.addClient({
      id: clientId,
      send: sendSafe,
    });

    ws.on('message', async (raw) => {
      try {
        const text = typeof raw === 'string' ? raw : raw.toString('utf8');
        const msg = JSON.parse(text) as ClientToServerMessage;
        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'auth') {
          if (typeof msg.idToken !== 'string' || msg.idToken.trim().length < 20) {
            sendSafe({
              type: 'auth:error',
              message: 'Jeton Firebase manquant ou invalide.',
            });
            return;
          }
          try {
            const verified = await verifyFirebaseIdToken(msg.idToken.trim());
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!verified.uid || !verified.emailVerified) {
              sendSafe({
                type: 'auth:error',
                message: 'Compte Google vérifié requis pour le mode multijoueur en ligne.',
              });
              return;
            }
            if (roomManager.authenticateClient(clientId, verified.uid)) {
              sendSafe({ type: 'auth:ok', uid: verified.uid });
            }
          } catch {
            sendSafe({
              type: 'auth:error',
              message: 'Jeton Firebase invalide ou expiré. Reconnectez-vous.',
            });
          }
          return;
        }

        roomManager.handleMessage(clientId, msg);
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
