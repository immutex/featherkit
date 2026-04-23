import type { Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { URL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';

import type { OrchestratorEvent } from '../orchestrator/events.js';
import { tailEventLog } from './event-tail.js';

type WsServerHandle = {
  close: () => Promise<void>;
};

function broadcastJson(wss: WebSocketServer, payload: unknown): void {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

function writeUnauthorized(socket: Duplex): void {
  socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
  socket.destroy();
}

export function createWsServer(httpServer: HttpServer, token: string, stateDir: string, cwd: string, heartbeatMs = 4_000): WsServerHandle {
  const wss = new WebSocketServer({ noServer: true });
  const stopTailing = tailEventLog(stateDir, cwd, (event: OrchestratorEvent) => {
    broadcastJson(wss, event);
  });

  const heartbeatTimer = setInterval(() => {
    broadcastJson(wss, { type: 'ping', at: new Date().toISOString() });
  }, heartbeatMs);
  heartbeatTimer.unref?.();

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/events') {
      socket.destroy();
      return;
    }

    if (url.searchParams.get('token') !== token) {
      writeUnauthorized(socket);
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: 'ping', at: new Date().toISOString() }));
  });

  return {
    close: async () => {
      clearInterval(heartbeatTimer);
      stopTailing();
      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
