/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import http from 'http';
import { BrowserWindow } from 'electron';
import { swarmEngine } from './swarmEngine';
import { cmmDbBridge } from '../cmm/cmmDbBridge';
import { cmmFolderRouter } from '../cmm/cmmFolderRouter';
import { DaemonAuthTokenManager, daemonAuthTokenManager } from './daemonAuthToken';

export interface SwarmDaemonServerConfig {
  port?: number;
  host?: string;
}

export class SwarmDaemonServer {
  private server: http.Server | null = null;
  private mainWindow: BrowserWindow | null = null;
  private port: number;
  private host: string;
  private tokenManager: DaemonAuthTokenManager;

  constructor(config?: SwarmDaemonServerConfig, tokenManager: DaemonAuthTokenManager = daemonAuthTokenManager) {
    this.port = config?.port || parseInt(process.env.SWARM_DAEMON_PORT || '', 10) || 5180;
    this.host = config?.host || '127.0.0.1';
    this.tokenManager = tokenManager;
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
  }

  public getTokenManager(): DaemonAuthTokenManager {
    return this.tokenManager;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        return resolve(this.port);
      }

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[SwarmDaemonServer] Port ${this.port} in use. Retrying or running background daemon.`);
        }
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        console.info(`[SwarmDaemonServer] Listening on http://${this.host}:${this.port}`);
        resolve(this.port);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private isLoopback(remoteAddress?: string): boolean {
    if (!remoteAddress) return false;
    return (
      remoteAddress === '127.0.0.1' ||
      remoteAddress === '::1' ||
      remoteAddress === '::ffff:127.0.0.1'
    );
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const authHeader = (req.headers['authorization'] || req.headers['x-swarm-auth-token']) as string | undefined;
    return this.tokenManager.verifyBearerToken(authHeader);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const remoteAddr = req.socket.remoteAddress;

    // Security check 1: Reject non-loopback connections (CWE-668)
    if (!this.isLoopback(remoteAddr)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access denied: loopback only' }));
      return;
    }

    // Security check 2: CORS / Origin validation for local development & CMM bridge
    const origin = req.headers.origin || '';
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5180',
      'http://127.0.0.1:5180',
      'http://localhost:5181',
      'http://127.0.0.1:5181',
    ];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Swarm-Auth-Token, Accept');
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    // Helper to read JSON request body with 1MB stream cap (CWE-400)
    const getBody = (): Promise<any> => {
      return new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += chunk;
          if (raw.length > 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
      });
    };

    // Route 1: Health & Telemetry Check (Public on 127.0.0.1 - Zero Secrets Exposed)
    if (
      (pathname === '/api/health' || pathname === '/health' || pathname === '/api/status') &&
      req.method === 'GET'
    ) {
      const activeTorrents = swarmEngine.getActiveTorrents();
      const seedingCount = activeTorrents.filter((t) => t.state === 'seeding').length;
      const downloadingCount = activeTorrents.filter((t) => t.state === 'downloading').length;
      const totalPeers = activeTorrents.reduce((acc, t) => acc + (t.peersConnected || 0), 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          online: true,
          version: '0.3.0',
          daemon_version: '0.3.0',
          peers: totalPeers,
          seeding: seedingCount,
          downloading: downloadingCount,
          torrents: activeTorrents.length,
          timestamp: Date.now(),
        })
      );
      return;
    }

    // Route 2: Native Window Focus / Activation (POST-Only, Protected by Bearer Token)
    if (pathname === '/api/window/focus' || pathname === '/api/focus') {
      if (req.method === 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed: Window activation requires POST' }));
        return;
      }

      if (req.method === 'POST') {
        if (!this.isAuthorized(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Valid Bearer token required' }));
          return;
        }

        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) this.mainWindow.restore();
          this.mainWindow.show();
          this.mainWindow.focus();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Window activated' }));
        return;
      }
    }

    // Route 3: Model Ingest Notification (POST-Only, Protected by Bearer Token)
    if (
      (pathname === '/api/ingest' || pathname === '/api/models/scan') &&
      req.method === 'POST'
    ) {
      if (!this.isAuthorized(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Valid Bearer token required' }));
        return;
      }

      getBody().then((body) => {
        const filePath = body.filePath;
        if (!filePath || typeof filePath !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing or invalid filePath parameter' }));
          return;
        }

        // Validate path confinement
        if (!cmmFolderRouter.isPathAllowed(filePath)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Path confinement violation: File path is not within configured model roots' }));
          return;
        }

        // Trigger ingest in swarmEngine (Safe staging without auto-opt-in)
        try {
          swarmEngine.ingestDownloadedModel(filePath, body);
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ingested: true, filePath }));
      });
      return;
    }

    // Route 4: CMM Database Bridge Status (Protected by Bearer Token - Prevents Path Leakage)
    if (pathname === '/api/cmm/status' && req.method === 'GET') {
      if (!this.isAuthorized(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Valid Bearer token required' }));
        return;
      }

      cmmDbBridge.checkCmmStatus().then((cmmStatus) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, cmm: cmmStatus }));
      });
      return;
    }

    // 404 Fallback
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found', path: pathname }));
  }

  getAuthTokenManager(): DaemonAuthTokenManager {
    return this.tokenManager;
  }
}

export const swarmDaemonServer = new SwarmDaemonServer();
