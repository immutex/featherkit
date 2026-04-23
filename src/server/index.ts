import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { URL } from 'node:url';

import type { FeatherConfig } from '../config/schema.js';
import { requireAuth } from './auth.js';
import { handleConnectionsRoute } from './routes/connections.js';
import { handleMemoryRoute } from './routes/memory.js';
import { handleStateRoute } from './routes/state.js';
import { handleTasksRoute } from './routes/tasks.js';
import { handleVerificationRoute } from './routes/verification.js';
import { handleWorkflowRoute } from './routes/workflow.js';
import { createWsServer } from './ws.js';
import { sendJson } from './utils.js';

type StartServerOptions = {
  cwd?: string;
  readOnly?: boolean;
};

const DASHBOARD_DEV_ORIGIN = 'http://localhost:5173';

export type DashboardServer = {
  token: string;
  port: number;
  readOnly: boolean;
  url: string;
  close: () => Promise<void>;
};

function notFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'Not Found' });
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  if (req.headers.origin !== DASHBOARD_DEV_ORIGIN) {
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', DASHBOARD_DEV_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, OPTIONS');
  res.setHeader('Vary', 'Origin');
}

export async function startServer(config: FeatherConfig, port: number, options: StartServerOptions = {}): Promise<DashboardServer> {
  const cwd = options.cwd ?? process.cwd();
  const readOnly = options.readOnly ?? false;
  const token = randomBytes(32).toString('hex');
  const tokenPath = join(cwd, config.stateDir, 'dashboard.token');

  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, `${token}\n`, 'utf8');

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
      const pathname = url.pathname;

       setCorsHeaders(req, res);

      if (!pathname.startsWith('/api/')) {
        notFound(res);
        return;
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (!requireAuth(req, res, token)) {
        return;
      }

      const context = { config, cwd, readOnly };
      if (await handleStateRoute(req, res, pathname, context)) return;
      if (await handleWorkflowRoute(req, res, pathname, context)) return;
      if (await handleVerificationRoute(req, res, pathname, context)) return;
      if (await handleMemoryRoute(req, res, pathname, context)) return;
      if (await handleConnectionsRoute(req, res, pathname, context)) return;
      if (await handleTasksRoute(req, res, pathname, context)) return;

      notFound(res);
    })().catch((error) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  const wsServer = createWsServer(server, token, config.stateDir, cwd);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine dashboard server port.');
  }

  return {
    token,
    port: address.port,
    readOnly,
    url: `http://localhost:${address.port}`,
    close: async () => {
      await wsServer.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
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
