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
import { CmmDbBridge } from '../src/main/cmm/cmmDbBridge';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('RenegadeCMM Periodic Auto-Discovery & Health Check', () => {
  let localDbPath: string;
  let mockCmmDir: string;
  let mockCmmDbPath: string;
  let mockPidPath: string;
  let bridge: CmmDbBridge;

  beforeAll(async () => {
    const tmp = os.tmpdir();
    localDbPath = path.join(tmp, 'test_autodiscovery_swarm.sqlite');
    mockCmmDir = path.join(tmp, 'test_cmm_discovery_dir');
    if (!fs.existsSync(mockCmmDir)) {
      fs.mkdirSync(mockCmmDir, { recursive: true });
    }
    mockCmmDbPath = path.join(mockCmmDir, 'renegadecmm.sqlite');
    mockPidPath = path.join(mockCmmDir, '.cmm.pid');

    if (fs.existsSync(localDbPath)) fs.unlinkSync(localDbPath);
    if (fs.existsSync(mockCmmDbPath)) fs.unlinkSync(mockCmmDbPath);
    if (fs.existsSync(mockPidPath)) fs.unlinkSync(mockPidPath);

    // Setup mock CMM DB
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(mockCmmDbPath, (err) => {
        if (err) return reject(err);
        db.exec(`
          CREATE TABLE local_models (
            id TEXT PRIMARY KEY,
            file_path TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            modified_at INTEGER NOT NULL,
            sha256 TEXT,
            civitai_model_id INTEGER,
            civitai_version_id INTEGER,
            civitai_name TEXT,
            model_type TEXT,
            source TEXT DEFAULT 'civitai',
            hf_repo_id TEXT,
            hf_commit_sha TEXT,
            quantization TEXT
          );
          INSERT INTO local_models (id, file_path, file_name, file_size, modified_at, sha256, civitai_name, model_type)
          VALUES 
            ('mod-1', '/models/checkpoints/flux1-dev.safetensors', 'flux1-dev.safetensors', 12884901888, 1715000000, 'abc123hash', 'Flux 1 Dev', 'checkpoints'),
            ('mod-2', '/models/loras/cyberpunk_v2.safetensors', 'cyberpunk_v2.safetensors', 150000000, 1715100000, 'def456hash', 'Cyberpunk Style', 'loras');
        `, (execErr) => {
          db.close();
          if (execErr) reject(execErr);
          else resolve(true);
        });
      });
    });

    bridge = new CmmDbBridge(localDbPath, mockCmmDbPath);
  });

  afterAll(async () => {
    bridge.close();
    try { if (fs.existsSync(localDbPath)) fs.unlinkSync(localDbPath); } catch {}
    try { if (fs.existsSync(mockCmmDbPath)) fs.unlinkSync(mockCmmDbPath); } catch {}
    try { if (fs.existsSync(mockPidPath)) fs.unlinkSync(mockPidPath); } catch {}
  });

  it('should report connected status and accurate model count when DB exists', async () => {
    const status = await bridge.checkCmmStatus();
    expect(status.connected).toBe(true);
    expect(status.discovered).toBe(true);
    expect(status.modelCount).toBe(2);
    expect(status.dbPath).toBe(mockCmmDbPath);
    expect(status.lastChecked).toBeGreaterThan(0);
  });

  it('should detect running process when .cmm.pid is active', async () => {
    // Write current process PID to mock .cmm.pid
    fs.writeFileSync(mockPidPath, process.pid.toString(), 'utf8');

    const status = await bridge.checkCmmStatus();
    expect(status.connected).toBe(true);
    expect(status.discovered).toBe(true);
    expect(status.isProcessRunning).toBe(true);
  });

  it('should report offline and undiscovered when target database does not exist', async () => {
    const offlineBridge = new CmmDbBridge(localDbPath, '/invalid/nonexistent/renegadecmm.sqlite');
    const status = await offlineBridge.checkCmmStatus();
    expect(status.connected).toBe(false);
    expect(status.discovered).toBe(false);
    expect(status.modelCount).toBe(0);
    expect(status.isProcessRunning).toBe(false);
    offlineBridge.close();
  });

  it('should dynamically reflect newly added models on subsequent status checks', async () => {
    // Add 3rd model into CMM DB
    await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(mockCmmDbPath, (err) => {
        if (err) return reject(err);
        db.run(
          `INSERT INTO local_models (id, file_path, file_name, file_size, modified_at, sha256, civitai_name, model_type)
           VALUES ('mod-3', '/models/vae/sdxl_vae.safetensors', 'sdxl_vae.safetensors', 335544320, 1715200000, 'vae789hash', 'SDXL VAE', 'vae')`,
          (runErr) => {
            db.close();
            if (runErr) reject(runErr);
            else resolve(true);
          }
        );
      });
    });

    const status = await bridge.checkCmmStatus();
    expect(status.connected).toBe(true);
    expect(status.modelCount).toBe(3);
  });

  it('should compute persistent database paths matching standard OS specifications', async () => {
    const { getDefaultPersistentCmmDbPath } = await import('../src/main/cmm/cmmDbBridge');
    const persistentPath = getDefaultPersistentCmmDbPath();
    expect(persistentPath).toContain('renegadecmm.sqlite');

    if (process.platform === 'win32') {
      expect(persistentPath).toContain('RenegadeCMM');
      expect(persistentPath).toMatch(/[A-Za-z]:\\.*AppData\\Roaming\\RenegadeCMM\\renegadecmm\.sqlite/i);
    } else if (process.platform === 'darwin') {
      expect(persistentPath).toContain('Library/Application Support/RenegadeCMM/renegadecmm.sqlite');
    } else {
      expect(persistentPath).toContain('RenegadeCMM/renegadecmm.sqlite');
    }
  });
});
