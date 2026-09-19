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
import { SwarmDaemonServer } from '../src/main/engine/swarmDaemonServer';
import { swarmEngine } from '../src/main/engine/swarmEngine';

describe('SwarmDaemonServer HTTP Bridge (:5180)', () => {
  let server: SwarmDaemonServer;
  const testPort = 5189;

  beforeAll(async () => {
    server = new SwarmDaemonServer({ port: testPort, host: '127.0.0.1' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  function makeRequest(
    method: string,
    urlPath: string,
    body?: any,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const reqHeaders: Record<string, string> = {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}),
        ...headers,
      };

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path: urlPath,
          method,
          headers: reqHeaders,
        },
        (res) => {
          let resBody = '';
          res.on('data', (chunk) => (resBody += chunk));
          res.on('end', () => {
            let parsed: any;
            try {
              parsed = JSON.parse(resBody);
            } catch {
              parsed = resBody;
            }
            resolve({ status: res.statusCode || 0, data: parsed, headers: res.headers });
          });
        }
      );

      req.on('error', (err) => reject(err));
      if (payload) req.write(payload);
      req.end();
    });
  }

  it('should respond with health and swarm state on /api/health', async () => {
    const res = await makeRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.data.online).toBe(true);
    expect(res.data.status).toBe('ok');
    expect(res.data.version).toBe('0.3.0');
    expect(typeof res.data.peers).toBe('number');
  });

  it('should accept window focus command on /api/window/focus', async () => {
    let windowShown = false;
    const mockWin: any = {
      isMinimized: () => false,
      restore: () => {},
      show: () => {
        windowShown = true;
      },
      focus: () => {},
    };
    server.setMainWindow(mockWin);

    const res = await makeRequest('POST', '/api/window/focus', {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(windowShown).toBe(true);
  });

  it('should accept model ingest notification on /api/ingest', async () => {
    let receivedEvent: any = null;
    swarmEngine.once('cmm:modelIngested', (evt) => {
      receivedEvent = evt;
    });

    const res = await makeRequest('POST', '/api/ingest', {
      filePath: 'D:/models/checkpoints/flux.safetensors',
      fileName: 'flux.safetensors',
      sha256: 'abc123456',
      modelType: 'Checkpoint',
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.ingested).toBe(true);
  });

  it('should return CMM status on /api/cmm/status', async () => {
    const res = await makeRequest('GET', '/api/cmm/status');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.cmm).toBeDefined();
  });

  it('should handle CORS preflight OPTIONS request for approved origins', async () => {
    const res = await makeRequest('OPTIONS', '/api/health', undefined, {
      origin: 'http://127.0.0.1:5174',
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5174');
  });
});
