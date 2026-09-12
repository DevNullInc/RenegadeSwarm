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

describe('SQLite ATTACH DATABASE Cross-DB Bridge', () => {
  let localDbPath: string;
  let mockCmmDbPath: string;
  let bridge: CmmDbBridge;

  beforeAll(async () => {
    const tmp = os.tmpdir();
    localDbPath = path.join(tmp, 'test_renegadeswarm.sqlite');
    mockCmmDbPath = path.join(tmp, 'test_mock_renegadecmm.sqlite');

    if (fs.existsSync(localDbPath)) fs.unlinkSync(localDbPath);
    if (fs.existsSync(mockCmmDbPath)) fs.unlinkSync(mockCmmDbPath);

    // Create mock CMM database with local_models table
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
            preview_url TEXT,
            source TEXT DEFAULT 'civitai',
            hf_repo_id TEXT,
            hf_commit_sha TEXT,
            quantization TEXT
          );
          INSERT INTO local_models (id, file_path, file_name, file_size, modified_at, sha256, civitai_name, model_type)
          VALUES ('cmm_1', 'C:/models/flux.safetensors', 'flux.safetensors', 12000000000, 1723456789, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'FLUX.1 Dev', 'Checkpoint');
        `, () => {
          db.close();
          resolve(null);
        });
      });
    });

    bridge = new CmmDbBridge(localDbPath, mockCmmDbPath);
  });

  afterAll(async () => {
    await bridge.close();
    try {
      if (fs.existsSync(localDbPath)) fs.unlinkSync(localDbPath);
      if (fs.existsSync(mockCmmDbPath)) fs.unlinkSync(mockCmmDbPath);
    } catch {}
  });

  it('should initialize local DB and attach CMM database atomically', async () => {
    await bridge.initLocalDb();
    const attached = await bridge.attachCmmDatabase(mockCmmDbPath);
    expect(attached).toBe(true);
  });

  it('should query models from attached cmm database', async () => {
    const models = await bridge.getLocalModels();
    expect(models.length).toBe(1);
    expect(models[0].civitai_name).toBe('FLUX.1 Dev');
    expect(models[0].model_type).toBe('Checkpoint');
  });

  it('should atomically register a completed download into cmm.local_models', async () => {
    const mockManifest = {
      swarmSpecVersion: '1.0.0' as const,
      manifestId: '33333333-3333-3333-3333-333333333333',
      createdAt: Date.now(),
      createdBy: 'RenegadeSwarm/0.1.0',
      pieceLength: 4194304,
      totalSizeBytes: 2400000000,
      model: {
        title: 'SDXL Cyberpunk LoRA',
        version: '1.0.0',
        modelType: 'LORA',
        baseModel: 'SDXL 1.0',
        creator: 'DevNullInc',
        nsfw: false,
        description: 'LoRA',
        tags: [],
        license: 'MIT',
      },
      hashes: {
        sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        infoHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      files: [
        {
          relativePath: 'cyberpunk.safetensors',
          sizeBytes: 2400000000,
          fileType: 'Model' as const,
          targetSubfolder: 'loras',
        },
      ],
      announceList: [],
      urlList: [],
    };

    const registered = await bridge.registerCompletedDownload(mockManifest, 'C:/models/loras/cyberpunk.safetensors');
    expect(registered).toBe(true);

    const updatedModels = await bridge.getLocalModels();
    expect(updatedModels.length).toBe(2);
    expect(updatedModels.some((m) => m.civitai_name === 'SDXL Cyberpunk LoRA')).toBe(true);
  });

  it('should update and enrich existing model metadata in cmm.local_models', async () => {
    const enriched = await bridge.updateModelMetadata({
      filePath: 'C:/models/flux.safetensors',
      fileName: 'flux.safetensors',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      civitaiModelId: 998877,
      civitaiVersionId: 112233,
      civitaiName: 'FLUX.1 Dev (Enriched Edition)',
      creator: 'TheStygianRenegade',
      modelType: 'Checkpoint',
      baseModel: 'Flux.1 D',
      description: 'Enriched model description from registry',
      tags: ['flux', 'hyperrealism'],
      previewUrl: 'https://civitai.com/preview.jpg',
    });

    expect(enriched).toBe(true);

    const models = await bridge.getLocalModels();
    const fluxModel = models.find((m) => m.file_name === 'flux.safetensors');
    expect(fluxModel).toBeDefined();
    expect(fluxModel?.civitai_name).toBe('FLUX.1 Dev (Enriched Edition)');
    expect(fluxModel?.civitai_model_id).toBe(998877);
    expect(fluxModel?.civitai_version_id).toBe(112233);
    expect(fluxModel?.preview_url).toBe('https://civitai.com/preview.jpg');
  });
});
