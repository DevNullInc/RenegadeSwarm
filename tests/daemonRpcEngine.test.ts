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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { DaemonRpcEngine, mapDaemonStatus } from '../src/main/engine/daemonRpcEngine';

describe('DaemonRpcEngine (Transmission/rqbit JSON-RPC Integration)', () => {
  let server: http.Server;
  let serverPort: number;
  let engine: DaemonRpcEngine;
  let receivedSessionId = '';
  const validSessionId = 'test-session-token-12345';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const authHeader = req.headers['x-transmission-session-id'];
      receivedSessionId = authHeader as string;

      // Simulate Transmission CSRF 409 Challenge if token is missing/wrong
      if (authHeader !== validSessionId) {
        res.writeHead(409, {
          'X-Transmission-Session-Id': validSessionId,
          'Content-Type': 'text/html',
        });
        res.end('<h1>409: Conflict</h1><p>Compulsory X-Transmission-Session-Id header missing</p>');
        return;
      }

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const { method, arguments: args } = parsed;

          if (method === 'session-get') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                result: 'success',
                arguments: {
                  version: '4.0.5',
                  'rpc-version': 17,
                  'download-dir': '/tmp/downloads',
                },
              })
            );
          } else if (method === 'torrent-add') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                result: 'success',
                arguments: {
                  'torrent-added': {
                    id: 101,
                    name: 'TestModel',
                    hashString: '1234567890abcdef1234567890abcdef12345678',
                  },
                },
              })
            );
          } else if (method === 'torrent-get') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                result: 'success',
                arguments: {
                  torrents: [
                    {
                      id: 101,
                      name: 'Flux1-Dev',
                      hashString: '1234567890abcdef1234567890abcdef12345678',
                      status: 4, // downloading
                      percentDone: 0.75,
                      rateDownload: 15 * 1024 * 1024,
                      rateUpload: 2 * 1024 * 1024,
                      peersConnected: 12,
                      peersSendingToUs: 8,
                      peersGettingFromUs: 4,
                      uploadRatio: 0.25,
                      downloadDir: '/models/checkpoints',
                      totalSize: 1024 * 1024 * 1024 * 4,
                      eta: 45,
                    },
                  ],
                },
              })
            );
          } else if (method === 'torrent-stop' || method === 'torrent-start' || method === 'torrent-remove' || method === 'session-set') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result: 'success', arguments: {} }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result: 'unknown-method', arguments: {} }));
          }
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'parse-error' }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        engine = new DaemonRpcEngine({ port: serverPort });
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should map daemon status codes accurately', () => {
    expect(mapDaemonStatus(0)).toBe('paused');
    expect(mapDaemonStatus(1)).toBe('queued');
    expect(mapDaemonStatus(2)).toBe('verifying');
    expect(mapDaemonStatus(3)).toBe('queued');
    expect(mapDaemonStatus(4)).toBe('downloading');
    expect(mapDaemonStatus(5)).toBe('queued');
    expect(mapDaemonStatus(6)).toBe('seeding');
    expect(mapDaemonStatus(99)).toBe('downloading');
  });

  it('should pass health check with CSRF 409 handshake negotiation', async () => {
    const isHealthy = await engine.checkHealth();
    expect(isHealthy).toBe(true);
    expect(receivedSessionId).toBe(validSessionId);
  });

  it('should add magnet URI and return daemon torrent ID', async () => {
    const torrentId = await engine.addMagnet(
      'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=TestModel',
      '/tmp/downloads'
    );
    expect(torrentId).toBe(101);
  });

  it('should add torrent buffer and return daemon torrent ID', async () => {
    const torrentId = await engine.addTorrentBuffer(Buffer.from('d8:announce...'), '/tmp/downloads');
    expect(torrentId).toBe(101);
  });

  it('should query active torrents with detailed transfer fields', async () => {
    const torrents = await engine.getTorrents();
    expect(torrents.length).toBe(1);
    expect(torrents[0].id).toBe(101);
    expect(torrents[0].name).toBe('Flux1-Dev');
    expect(torrents[0].percentDone).toBe(0.75);
    expect(torrents[0].rateDownload).toBe(15 * 1024 * 1024);
    expect(torrents[0].status).toBe(4);
  });

  it('should pause, resume, and remove torrents', async () => {
    const pauseOk = await engine.pauseTorrent(101);
    expect(pauseOk).toBe(true);

    const resumeOk = await engine.resumeTorrent(101);
    expect(resumeOk).toBe(true);

    const removeOk = await engine.removeTorrent(101, false);
    expect(removeOk).toBe(true);
  });

  it('should configure session speed limits and seed ratio', async () => {
    const limitOk = await engine.setSpeedLimits({
      downloadLimitKbps: 50000,
      uploadLimitKbps: 10000,
      seedRatioLimit: 2.0,
    });
    expect(limitOk).toBe(true);
  });
});
