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

import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { SwarmManifest } from '../../protocol/types';

export interface CmmLocalModelRow {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  modified_at: number;
  sha256?: string;
  civitai_model_id?: number;
  civitai_version_id?: number;
  civitai_name?: string;
  model_type?: string;
  preview_url?: string;
  source?: string;
  hf_repo_id?: string;
  hf_commit_sha?: string;
  quantization?: string;
}

export interface CmmStatusResult {
  connected: boolean;
  dbPath: string;
  modelCount: number;
  isProcessRunning: boolean;
  lastChecked: number;
}

export class CmmDbBridge {
  private localDb: sqlite3.Database | null = null;
  private localDbPath: string;
  private cmmDbPath: string = '';
  private isAttached: boolean = false;
  private lastStatusResult: CmmStatusResult | null = null;

  constructor(localDbPath?: string, cmmDbPath?: string) {
    this.localDbPath = localDbPath || path.join(process.cwd(), 'renegadeswarm.sqlite');
    if (cmmDbPath) {
      this.cmmDbPath = cmmDbPath;
    } else {
      this.cmmDbPath = this.discoverCmmDbPath();
    }
  }

  discoverCmmDbPath(): string {
    const candidatePaths = [
      'D:/gitprojects/RenegadeCMM/renegadecmm.sqlite',
      'D:\\gitprojects\\RenegadeCMM\\renegadecmm.sqlite',
      path.join(process.cwd(), '..', 'RenegadeCMM', 'renegadecmm.sqlite'),
      path.join(process.cwd(), 'renegadecmm.sqlite'),
      path.join(process.env.APPDATA || '', 'RenegadeCMM', 'renegadecmm.sqlite'),
      path.join(process.env.HOME || '', '.config', 'renegadecmm', 'renegadecmm.sqlite'),
    ];

    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) {
        return path.resolve(p);
      }
    }
    return '';
  }

  setCmmDbPath(targetPath: string) {
    this.cmmDbPath = targetPath;
    this.isAttached = false;
  }

  getCmmDbPath(): string {
    if (!this.cmmDbPath) {
      this.cmmDbPath = this.discoverCmmDbPath();
    }
    return this.cmmDbPath;
  }

  /**
   * Performs an active health check on RenegadeCMM availability, process state, and database connectivity.
   */
  async checkCmmStatus(): Promise<CmmStatusResult> {
    const dbPath = this.getCmmDbPath();
    const now = Date.now();

    if (!dbPath || !fs.existsSync(dbPath)) {
      this.isAttached = false;
      this.lastStatusResult = {
        connected: false,
        dbPath: dbPath || '',
        modelCount: 0,
        isProcessRunning: false,
        lastChecked: now,
      };
      return this.lastStatusResult;
    }

    // Check if CMM process is actively running via PID file
    let isProcessRunning = false;
    const cmmDir = path.dirname(dbPath);
    const pidPath = path.join(cmmDir, '.cmm.pid');
    if (fs.existsSync(pidPath)) {
      try {
        const pidStr = fs.readFileSync(pidPath, 'utf8').trim();
        const pid = parseInt(pidStr, 10);
        if (!isNaN(pid)) {
          process.kill(pid, 0); // Check if process is alive (signal 0)
          isProcessRunning = true;
        }
      } catch {
        isProcessRunning = false;
      }
    }

    // Verify database connectivity and retrieve active model count
    try {
      const ok = await this.attachCmmDatabase(dbPath);
      if (!ok) {
        this.lastStatusResult = {
          connected: false,
          dbPath,
          modelCount: 0,
          isProcessRunning,
          lastChecked: now,
        };
        return this.lastStatusResult;
      }

      const modelCount = await new Promise<number>((resolve) => {
        this.localDb?.get(
          'SELECT COUNT(*) as count FROM cmm.local_models;',
          (err, row: any) => {
            if (err) resolve(0);
            else resolve(row?.count || 0);
          }
        );
      });

      this.lastStatusResult = {
        connected: true,
        dbPath,
        modelCount,
        isProcessRunning,
        lastChecked: now,
      };
      return this.lastStatusResult;
    } catch {
      this.isAttached = false;
      this.lastStatusResult = {
        connected: false,
        dbPath,
        modelCount: 0,
        isProcessRunning: false,
        lastChecked: now,
      };
      return this.lastStatusResult;
    }
  }

  async initLocalDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.localDb = new sqlite3.Database(this.localDbPath, async (err) => {
        if (err) return reject(err);
        if (this.localDb) {
          this.localDb.run('PRAGMA journal_mode = WAL;');
          this.localDb.run(`
            CREATE TABLE IF NOT EXISTS swarm_transfers (
              info_hash TEXT PRIMARY KEY,
              manifest_id TEXT,
              title TEXT NOT NULL,
              model_type TEXT NOT NULL,
              state TEXT NOT NULL,
              total_bytes INTEGER NOT NULL,
              downloaded_bytes INTEGER DEFAULT 0,
              uploaded_bytes INTEGER DEFAULT 0,
              cmm_synced INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }

  async attachCmmDatabase(cmmPath?: string): Promise<boolean> {
    const targetCmmPath = cmmPath || this.cmmDbPath;
    if (!targetCmmPath || !fs.existsSync(targetCmmPath)) {
      return false;
    }

    if (!this.localDb) {
      await this.initLocalDb();
    }

    // Normalize path slashes for SQLite ATTACH
    const normalizedPath = path.resolve(targetCmmPath).replace(/\\/g, '/');

    return new Promise((resolve) => {
      if (this.isAttached) {
        this.localDb?.run('DETACH DATABASE cmm;', () => {
          this.attachDirect(normalizedPath, resolve);
        });
      } else {
        this.attachDirect(normalizedPath, resolve);
      }
    });
  }

  private attachDirect(normalizedPath: string, resolve: (res: boolean) => void) {
    this.localDb?.run(`ATTACH DATABASE '${normalizedPath}' AS cmm;`, (err) => {
      if (err) {
        // If already attached, consider success
        if (err.message.includes('already in use') || err.message.includes('already attached')) {
          this.isAttached = true;
          return resolve(true);
        }
        this.isAttached = false;
        resolve(false);
      } else {
        this.isAttached = true;
        resolve(true);
      }
    });
  }

  async getLocalModels(limit = 100): Promise<CmmLocalModelRow[]> {
    if (!this.isAttached) {
      const ok = await this.attachCmmDatabase();
      if (!ok) return [];
    }

    return new Promise((resolve, reject) => {
      this.localDb?.all(
        'SELECT * FROM cmm.local_models ORDER BY modified_at DESC LIMIT ?;',
        [limit],
        (err, rows) => {
          if (err) return reject(err);
          resolve((rows as CmmLocalModelRow[]) || []);
        }
      );
    });
  }

  async registerCompletedDownload(manifest: SwarmManifest, targetFilePath: string): Promise<boolean> {
    if (!this.isAttached) {
      const ok = await this.attachCmmDatabase();
      if (!ok) return false;
    }

    const fileStat = fs.existsSync(targetFilePath) ? fs.statSync(targetFilePath) : null;
    const fileSize = fileStat ? fileStat.size : manifest.totalSizeBytes;
    const modifiedAt = fileStat ? Math.floor(fileStat.mtimeMs) : Date.now();
    const fileName = path.basename(targetFilePath);
    const modelId = `swarm_${manifest.hashes.infoHash}`;

    return new Promise((resolve) => {
      // Atomic cross-database write between local swarm transfer state and cmm catalog
      this.localDb?.serialize(() => {
        const stmt = `
          INSERT OR REPLACE INTO cmm.local_models (
            id, file_path, file_name, file_size, modified_at, sha256,
            civitai_model_id, civitai_version_id, civitai_name,
            model_type, source, hf_repo_id, hf_commit_sha, quantization
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;

        this.localDb?.run(
          stmt,
          [
            modelId,
            targetFilePath,
            fileName,
            fileSize,
            modifiedAt,
            manifest.hashes.sha256,
            manifest.model.civitaiModelId || null,
            manifest.model.civitaiVersionId || null,
            manifest.model.title,
            manifest.model.modelType,
            'swarm',
            manifest.model.hfRepoId || null,
            manifest.model.hfCommitSha || null,
            manifest.model.quantization || null,
          ],
          (err) => {
            if (err) return resolve(false);

            this.localDb?.run(
              'UPDATE swarm_transfers SET cmm_synced = 1 WHERE info_hash = ?;',
              [manifest.hashes.infoHash],
              () => resolve(true)
            );
          }
        );
      });
    });
  }

  async close() {
    if (this.localDb) {
      if (this.isAttached) {
        await new Promise((r) => this.localDb?.run('DETACH DATABASE cmm;', () => r(null)));
        this.isAttached = false;
      }
      this.localDb.close();
      this.localDb = null;
    }
  }
}

export const cmmDbBridge = new CmmDbBridge();
