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
import path from 'path';
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
        // Fire one non-blocking wakeup ping to sister daemon (CMM on :5174) with 400ms timeout
        this.sendSisterWakeup().catch(() => {});
        resolve(this.port);
      });
    });
  }

  /**
   * Fires a single non-blocking wakeup ping to sister CMM daemon if running.
   * Single attempt, 400ms timeout, swallows errors (no retry loop).
   */
  public async sendSisterWakeup(targetPort: number = 5174): Promise<boolean> {
    const token = this.tokenManager.getOrCreateToken();
    const payload = JSON.stringify({
      source: 'swarm',
      ts: Date.now(),
    });

    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: targetPort,
          path: '/api/sister/wakeup',
          method: 'POST',
          timeout: 400,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': `Bearer ${token}`,
          },
        },
        (res) => {
          res.resume(); // consume response stream
          resolve(res.statusCode === 200);
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.write(payload);
      req.end();
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

    // Security check 2: CORS / Origin validation for local development, SwarmTracker, & CMM bridge
    const origin = req.headers.origin || '';
    const isAllowedOrigin =
      !origin ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('https://localhost') ||
      origin.startsWith('https://127.0.0.1') ||
      origin === 'https://swarm.renegadeinc.net' ||
      origin === 'http://swarm.renegadeinc.net' ||
      /^https?:\/\/([a-zA-Z0-9-]+\.)*renegadeinc\.net(:\d+)?$/.test(origin);

    if (origin && isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Swarm-Auth-Token, Accept, Access-Control-Request-Private-Network');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
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

    // Route 1: Swarm Directory & Active Seeds (Public on 127.0.0.1 - Zero Secrets Exposed)
    if (
      (pathname === '/api/swarms' || pathname === '/api/torrents' || pathname === '/api/feed') &&
      req.method === 'GET'
    ) {
      const activeTorrents = swarmEngine.getActiveTorrents();
      const swarmsData = activeTorrents.map((t) => {
        const manifest = (swarmEngine as any).manifests?.get(t.infoHash);
        return {
          infoHash: t.infoHash,
          manifestId: t.manifestId || manifest?.manifestId || 'unresolved',
          title: t.title,
          version: manifest?.model?.version || '1.0.0',
          modelType: t.modelType,
          baseModel: t.baseModel || manifest?.model?.baseModel || 'Universal',
          creator: manifest?.model?.creator || 'LocalSeeder',
          creatorPublicKey: manifest?.signature?.publicKey || '',
          trustLevel: manifest?.signature ? 'VerifiedCreator' : 'Community',
          isVerified: Boolean(manifest?.signature),
          nsfw: Boolean(manifest?.model?.nsfw),
          description: manifest?.model?.description || `Decentralized AI model package actively seeded on RenegadeSwarm.`,
          tags: manifest?.model?.tags || [],
          totalBytes: t.totalBytes,
          seeders: Math.max(1, t.seedersConnected || 1),
          leechers: t.peersConnected || 0,
          completed: 1,
          ratio: t.ratio || 0.0,
          healthScore: 100,
          healthStatus: 'Healthy',
          isLocalSeeder: true,
          savePath: t.savePath,
          files: manifest?.files || [
            {
              relativePath: path.basename(t.savePath || t.title),
              sizeBytes: t.totalBytes,
              fileType: 'Model',
              targetSubfolder: (t.modelType || 'checkpoints').toLowerCase(),
              sha256: manifest?.hashes?.sha256 || '',
            },
          ],
          hashes: manifest?.hashes || {
            sha256: manifest?.hashes?.sha256 || '',
            infoHash: t.infoHash,
          },
          signature: manifest?.signature,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          online: true,
          version: '0.3.0',
          daemon_version: '0.3.0',
          peers: activeTorrents.reduce((acc, t) => acc + (t.peersConnected || 0), 0),
          seeding: activeTorrents.filter((t) => t.state === 'seeding').length,
          downloading: activeTorrents.filter((t) => t.state === 'downloading').length,
          totalSwarms: activeTorrents.length,
          swarms: swarmsData,
          timestamp: Date.now(),
        })
      );
      return;
    }

    // Route 2: Health & Telemetry Check (Public on 127.0.0.1 - Zero Secrets Exposed)
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
          try {
            if (typeof (this.mainWindow as any).isVisible === 'function' && !(this.mainWindow as any).isVisible()) {
              (this.mainWindow as any).show();
            }
            if (typeof (this.mainWindow as any).isMinimized === 'function' && (this.mainWindow as any).isMinimized()) {
              (this.mainWindow as any).restore();
            }
            if (typeof (this.mainWindow as any).show === 'function') {
              (this.mainWindow as any).show();
            }
            if (typeof (this.mainWindow as any).focus === 'function') {
              (this.mainWindow as any).focus();
            }
          } catch { }
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

    // Route 5: Sister Wakeup Poke (POST-Only, Protected by Bearer Token)
    if (pathname === '/api/sister/wakeup' && req.method === 'POST') {
      if (!this.isAuthorized(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized: Valid Bearer token required' }));
        return;
      }

      getBody().then((body) => {
        // Acknowledge wakeup from sister (e.g. CMM)
        // Notify main window to reset budget and update badge immediately
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('cmm:sisterWakeup', {
            source: body?.source || 'cmm',
            ts: body?.ts || Date.now(),
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Swarm sister wakeup acknowledged' }));
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
