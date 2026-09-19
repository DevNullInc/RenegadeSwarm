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

describe('Swarm Daemon Authentication & Authorization Security', () => {
  let server: SwarmDaemonServer;
  const testPort = 5190;
  let validToken: string;

  beforeAll(async () => {
    server = new SwarmDaemonServer({ port: testPort, host: '127.0.0.1' });
    await server.start();
    validToken = server.getAuthTokenManager().getOrCreateToken();
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

  it('GET /api/health should be public and secret-free on 127.0.0.1', async () => {
    const res = await makeRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.data.online).toBe(true);
    expect(res.data.token).toBeUndefined();
    expect(res.data.privateKey).toBeUndefined();
  });

  it('POST /api/window/focus should reject unauthenticated requests with 401', async () => {
    const res = await makeRequest('POST', '/api/window/focus', {});
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Unauthorized: Valid Bearer token required');
  });

  it('POST /api/window/focus should reject invalid Bearer token with 401', async () => {
    const res = await makeRequest('POST', '/api/window/focus', {}, {
      authorization: 'Bearer invalid-token-xyz',
    });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Unauthorized: Valid Bearer token required');
  });

  it('GET /api/window/focus should be rejected with 405 Method Not Allowed', async () => {
    const res = await makeRequest('GET', '/api/window/focus', undefined, {
      authorization: `Bearer ${validToken}`,
    });
    expect(res.status).toBe(405);
    expect(res.data.error).toBe('Method Not Allowed: Window activation requires POST');
  });

  it('POST /api/ingest should reject unauthenticated requests with 401', async () => {
    const res = await makeRequest('POST', '/api/ingest', { filePath: '/models/flux.safetensors' });
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Unauthorized: Valid Bearer token required');
  });

  it('POST /api/models/scan should reject unauthenticated requests with 401', async () => {
    const res = await makeRequest('POST', '/api/models/scan', {});
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Unauthorized: Valid Bearer token required');
  });

  it('GET /api/cmm/status should reject unauthenticated requests with 401', async () => {
    const res = await makeRequest('GET', '/api/cmm/status');
    expect(res.status).toBe(401);
    expect(res.data.error).toBe('Unauthorized: Valid Bearer token required');
  });

  it('Protected endpoints should succeed when presenting valid Bearer token', async () => {
    const focusRes = await makeRequest('POST', '/api/window/focus', {}, {
      authorization: `Bearer ${validToken}`,
    });
    expect(focusRes.status).toBe(200);
    expect(focusRes.data.success).toBe(true);

    const cmmRes = await makeRequest('GET', '/api/cmm/status', undefined, {
      authorization: `Bearer ${validToken}`,
    });
    expect(cmmRes.status).toBe(200);
    expect(cmmRes.data.success).toBe(true);
  });
});
