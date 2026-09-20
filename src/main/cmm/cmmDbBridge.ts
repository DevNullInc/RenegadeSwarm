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
import http from 'http';
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
  discovered: boolean;
  dbPath: string;
  modelCount: number;
  isProcessRunning: boolean;
  lastChecked: number;
  comfyuiRoot?: string;
  comfyuiFolders?: string[];
  comfyuiInstallDir?: string;
  folderMappings?: Record<string, string>;
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
      path.join(process.env.APPDATA || '', 'civitai-model-manager', 'renegadecmm.sqlite'),
      path.join(process.env.APPDATA || '', 'civitai-model-manager', 'civitai_manager.sqlite'),
      path.join(process.env.USERPROFILE || '', 'RenegadeCMM', 'renegadecmm.sqlite'),
      path.join(process.env.HOME || '', '.config', 'renegadecmm', 'renegadecmm.sqlite'),
      path.join(process.env.HOME || '', 'RenegadeCMM', 'renegadecmm.sqlite'),
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
   * Queries the live CMM HTTP API bridge (port 5174) for active configuration.
   */
  async fetchCmmApiConfig(apiPort: number = 5174): Promise<{ online: boolean; pid?: number; config?: any }> {
    return new Promise((resolve) => {
      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: apiPort,
          path: '/api/config',
          timeout: 800,
        },
        (res) => {
          if (res.statusCode !== 200) {
            return resolve({ online: false });
          }
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const config = JSON.parse(data);
              resolve({ online: true, config });
            } catch {
              resolve({ online: false });
            }
          });
        }
      );
      req.on('error', () => resolve({ online: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ online: false });
      });
    });
  }

  /**
   * Performs an active health check on RenegadeCMM availability, process state, and database connectivity.
   */
  async checkCmmStatus(): Promise<CmmStatusResult> {
    const dbPath = this.getCmmDbPath();
    const now = Date.now();
    const discovered = Boolean(dbPath && fs.existsSync(dbPath));

    // 1. Check if CMM is online via HTTP API Bridge
    const apiResult = await this.fetchCmmApiConfig().catch(() => ({ online: false, config: undefined }));
    let isProcessRunning = Boolean(apiResult.online);

    // 2. Check PID file if HTTP check didn't confirm running
    if (!isProcessRunning && dbPath) {
      const cmmDir = path.dirname(dbPath);
      const pidPath = path.join(cmmDir, '.cmm.pid');
      if (fs.existsSync(pidPath)) {
        try {
          const pidStr = fs.readFileSync(pidPath, 'utf8').trim();
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid)) {
            process.kill(pid, 0); // signal 0 liveness check
            isProcessRunning = true;
          }
        } catch {
          isProcessRunning = false;
        }
      }
    }

    let comfyuiRoot = apiResult.config?.comfyui_root || '';
    let comfyuiFolders: string[] = Array.isArray(apiResult.config?.comfyui_folders) ? apiResult.config.comfyui_folders : [];
    let comfyuiInstallDir = apiResult.config?.comfyui_install_dir || '';
    let folderMappings: Record<string, string> = apiResult.config?.folder_mappings || {};

    if (!discovered) {
      this.isAttached = false;
      this.lastStatusResult = {
        connected: false,
        discovered: false,
        dbPath: dbPath || '',
        modelCount: 0,
        isProcessRunning: false,
        lastChecked: now,
        comfyuiRoot,
        comfyuiFolders,
        comfyuiInstallDir,
        folderMappings,
      };
      return this.lastStatusResult;
    }

    // Verify database connectivity and retrieve active model count and app config
    try {
      const ok = await this.attachCmmDatabase(dbPath);
      if (!ok) {
        this.lastStatusResult = {
          connected: false,
          discovered: true,
          dbPath,
          modelCount: 0,
          isProcessRunning,
          lastChecked: now,
          comfyuiRoot,
          comfyuiFolders,
          comfyuiInstallDir,
          folderMappings,
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

      // If HTTP API didn't already populate configs, query cmm.app_config table
      if (!comfyuiRoot || !comfyuiFolders.length) {
        await new Promise<void>((resolve) => {
          this.localDb?.all(
            'SELECT key, value FROM cmm.app_config;',
            (err, rows: any[]) => {
              if (!err && Array.isArray(rows)) {
                for (const r of rows) {
                  try {
                    const val = JSON.parse(r.value);
                    if (r.key === 'comfyui_root' && !comfyuiRoot) comfyuiRoot = typeof val === 'string' ? val : '';
                    if (r.key === 'comfyui_folders' && !comfyuiFolders.length) comfyuiFolders = Array.isArray(val) ? val : [];
                    if (r.key === 'comfyui_install_dir' && !comfyuiInstallDir) comfyuiInstallDir = typeof val === 'string' ? val : '';
                    if (r.key === 'folder_mappings' && !Object.keys(folderMappings).length && typeof val === 'object') folderMappings = val;
                  } catch {
                    if (r.key === 'comfyui_root' && !comfyuiRoot) comfyuiRoot = String(r.value || '');
                    if (r.key === 'comfyui_install_dir' && !comfyuiInstallDir) comfyuiInstallDir = String(r.value || '');
                  }
                }
              }
              resolve();
            }
          );
        });
      }

      // If comfyui_root is present but not in comfyui_folders, ensure it's included
      if (comfyuiRoot && !comfyuiFolders.some((f) => f.toLowerCase() === comfyuiRoot.toLowerCase())) {
        comfyuiFolders.unshift(comfyuiRoot);
      }

      this.lastStatusResult = {
        connected: true,
        discovered: true,
        dbPath,
        modelCount,
        isProcessRunning,
        lastChecked: now,
        comfyuiRoot,
        comfyuiFolders,
        comfyuiInstallDir,
        folderMappings,
      };
      return this.lastStatusResult;
    } catch {
      this.isAttached = false;
      this.lastStatusResult = {
        connected: false,
        discovered: true,
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
          `);
          this.localDb.run(`
            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
          `, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }

  async getPersistedAppSettings(): Promise<{ customFolders: string[]; defaultFolder: string }> {
    if (!this.localDb) await this.initLocalDb();
    return new Promise((resolve) => {
      this.localDb?.all('SELECT key, value FROM app_settings;', (err, rows: any[]) => {
        const out = { customFolders: [] as string[], defaultFolder: '' };
        if (!err && Array.isArray(rows)) {
          for (const r of rows) {
            try {
              if (r.key === 'custom_model_folders') out.customFolders = JSON.parse(r.value);
              if (r.key === 'default_download_folder') out.defaultFolder = JSON.parse(r.value);
            } catch {
              if (r.key === 'default_download_folder') out.defaultFolder = r.value;
            }
          }
        }
        resolve(out);
      });
    });
  }

  async savePersistedAppSettings(settings: { customFolders?: string[]; defaultFolder?: string }): Promise<void> {
    if (!this.localDb) await this.initLocalDb();
    return new Promise((resolve) => {
      this.localDb?.serialize(() => {
        if (settings.customFolders !== undefined) {
          this.localDb?.run(
            'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);',
            ['custom_model_folders', JSON.stringify(settings.customFolders)]
          );
        }
        if (settings.defaultFolder !== undefined) {
          this.localDb?.run(
            'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);',
            ['default_download_folder', JSON.stringify(settings.defaultFolder)]
          );
        }
        resolve();
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

  async getModelById(modelId: string): Promise<CmmLocalModelRow | null> {
    if (!this.isAttached) {
      const ok = await this.attachCmmDatabase();
      if (!ok) return null;
    }

    const normalizedPath = modelId.replace(/\\/g, '/');
    return new Promise((resolve) => {
      this.localDb?.get(
        'SELECT * FROM cmm.local_models WHERE id = ? OR LOWER(file_path) = LOWER(?) OR LOWER(file_path) = LOWER(?) LIMIT 1;',
        [modelId, modelId, normalizedPath],
        (err, row) => {
          if (err || !row) resolve(null);
          else resolve(row as CmmLocalModelRow);
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

  async updateModelMetadata(data: {
    filePath: string;
    fileName?: string;
    sha256?: string;
    civitaiModelId?: number;
    civitaiVersionId?: number;
    civitaiName?: string;
    creator?: string;
    modelType?: string;
    baseModel?: string;
    description?: string;
    tags?: string[];
    previewUrl?: string;
    source?: string;
    hfRepoId?: string;
    hfCommitSha?: string;
    quantization?: string;
    rawJson?: string;
  }): Promise<boolean> {
    if (!this.isAttached) {
      const ok = await this.attachCmmDatabase();
      if (!ok) return false;
    }

    const normalizedPath = path.resolve(data.filePath);
    const fileName = data.fileName || path.basename(normalizedPath);

    // 1. Update cmm.local_models dynamically based on existing schema
    const columns = await new Promise<string[]>((resolve) => {
      this.localDb?.all('PRAGMA cmm.table_info(local_models);', (err, rows: any[]) => {
        if (err || !Array.isArray(rows)) resolve([]);
        else resolve(rows.map((r) => r.name));
      });
    });

    const setClauses: string[] = [];
    const params: any[] = [];

    const fieldMap: Record<string, any> = {
      sha256: data.sha256,
      civitai_model_id: data.civitaiModelId,
      civitai_version_id: data.civitaiVersionId,
      civitai_name: data.civitaiName,
      model_type: data.modelType,
      preview_url: data.previewUrl,
      source: data.source || (data.civitaiModelId ? 'civitai' : data.hfRepoId ? 'huggingface' : undefined),
      hf_repo_id: data.hfRepoId,
      hf_commit_sha: data.hfCommitSha,
      quantization: data.quantization,
    };

    for (const [col, val] of Object.entries(fieldMap)) {
      if (val !== undefined && (columns.length === 0 || columns.includes(col))) {
        setClauses.push(`${col} = COALESCE(?, ${col})`);
        params.push(val);
      }
    }

    if (setClauses.length > 0) {
      const updateLocalSql = `
        UPDATE cmm.local_models
        SET ${setClauses.join(', ')}
        WHERE LOWER(file_path) = LOWER(?) OR LOWER(file_path) = LOWER(?) OR file_name = ?;
      `;
      params.push(normalizedPath, normalizedPath.replace(/\\/g, '/'), fileName);

      await new Promise<void>((resolve) => {
        this.localDb?.run(updateLocalSql, params, () => resolve());
      });
    }

    // 2. If CivitAI Model ID is present, update cmm.civitai_models table if it exists
    if (data.civitaiModelId) {
      const upsertCivitaiModelSql = `
        INSERT INTO cmm.civitai_models (id, name, type, creator_username, fetched_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = COALESCE(excluded.name, civitai_models.name),
          type = COALESCE(excluded.type, civitai_models.type),
          creator_username = COALESCE(excluded.creator_username, civitai_models.creator_username),
          fetched_at = CURRENT_TIMESTAMP;
      `;
      await new Promise<void>((resolve) => {
        this.localDb?.run(
          upsertCivitaiModelSql,
          [
            data.civitaiModelId,
            data.civitaiName || fileName,
            data.modelType || 'Checkpoint',
            data.creator || null,
          ],
          () => resolve()
        );
      });
    }

    // 3. If CivitAI Version ID is present, update cmm.civitai_versions table if it exists
    if (data.civitaiVersionId && data.civitaiModelId) {
      const upsertCivitaiVersionSql = `
        INSERT INTO cmm.civitai_versions (id, model_id, name, base_model, sha256, raw_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = COALESCE(excluded.name, civitai_versions.name),
          base_model = COALESCE(excluded.base_model, civitai_versions.base_model),
          sha256 = COALESCE(excluded.sha256, civitai_versions.sha256),
          raw_json = COALESCE(excluded.raw_json, civitai_versions.raw_json);
      `;
      await new Promise<void>((resolve) => {
        this.localDb?.run(
          upsertCivitaiVersionSql,
          [
            data.civitaiVersionId,
            data.civitaiModelId,
            data.civitaiName || fileName,
            data.baseModel || null,
            data.sha256 || null,
            data.rawJson || null,
          ],
          () => resolve()
        );
      });
    }

    return true;
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
