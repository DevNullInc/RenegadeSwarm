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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import sqlite3 from 'sqlite3';
import { cmmDbBridge } from '../src/main/cmm/cmmDbBridge';
import { swarmEngine } from '../src/main/engine/swarmEngine';
import { sharingPolicyManager } from '../src/main/engine/sharingPolicyManager';
import { keyringManager } from '../src/main/engine/keyringManager';
import { modelMetadataExtractor } from '../src/main/metadata/modelMetadataExtractor';
import { buildSwarmManifest } from '../src/main/engine/manifestBuilder';
import { signSwarmManifest } from '../src/protocol/crypto';

describe('Instant Opt-In Auto-Packaging & Swarm Seeding Flow', () => {
  let tmpDir: string;
  let dummyDbPath: string;
  let dummyModelPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renegadeswarm_optin_test_'));
    dummyDbPath = path.join(tmpDir, 'renegadecmm.sqlite');
    dummyModelPath = path.join(tmpDir, 'dreamshaper_v8.safetensors');

    // Create a mock model file (with valid safetensors header)
    const header = JSON.stringify({
      __metadata__: {
        format: 'pt',
        modelspec_title: 'DreamShaper v8',
        modelspec_author: 'Lykon',
        modelspec_architecture: 'sd_v1.5',
      },
    });
    const headerBuf = Buffer.from(header, 'utf-8');
    const lenBuf = Buffer.alloc(8);
    lenBuf.writeBigInt64LE(BigInt(headerBuf.length));
    const payload = Buffer.concat([lenBuf, headerBuf, Buffer.alloc(1024, 0xaa)]);
    fs.writeFileSync(dummyModelPath, payload);

    // Create mock CMM database with local_models table
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(dummyDbPath, (err) => {
        if (err) return reject(err);
        db.serialize(() => {
          db.run(`
            CREATE TABLE local_models (
              id TEXT PRIMARY KEY,
              file_path TEXT NOT NULL,
              file_name TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              modified_at INTEGER NOT NULL,
              sha256 TEXT,
              civitai_model_id INTEGER,
              civitai_version_id INTEGER,
              civitai_name TEXT,
              model_type TEXT,
              preview_url TEXT,
              source TEXT,
              hf_repo_id TEXT,
              hf_commit_sha TEXT,
              quantization TEXT
            );
          `);
          db.run(
            `INSERT INTO local_models (
              id, file_path, file_name, file_size, modified_at, sha256,
              civitai_model_id, civitai_version_id, civitai_name, model_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              'model_123',
              dummyModelPath,
              'dreamshaper_v8.safetensors',
              payload.length,
              Date.now(),
              'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              4384,
              128713,
              'DreamShaper',
              'Checkpoint',
            ],
            () => {
              db.close(() => resolve());
            }
          );
        });
      });
    });

    cmmDbBridge.setCmmDbPath(dummyDbPath);
    await cmmDbBridge.attachCmmDatabase(dummyDbPath);
  });

  afterEach(async () => {
    await cmmDbBridge.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('correctly retrieves model by ID using getModelById in cmmDbBridge', async () => {
    const model = await cmmDbBridge.getModelById('model_123');
    expect(model).toBeDefined();
    expect(model?.id).toBe('model_123');
    expect(model?.civitai_name).toBe('DreamShaper');
    expect(model?.model_type).toBe('Checkpoint');
  });

  it('immediately packages and seeds a model when opted in without user intervention', async () => {
    const model = await cmmDbBridge.getModelById('model_123');
    expect(model).not.toBeNull();

    // 1. Extract metadata
    const extractedMeta = await modelMetadataExtractor.extractMetadata(model!.file_path);
    expect(extractedMeta.title).toContain('DreamShaper');

    // 2. Obtain creator identity
    let identity = keyringManager.getInternalUserIdentity();
    if (!identity) {
      keyringManager.generateNewIdentity('Renegade Tester', true);
      identity = keyringManager.getInternalUserIdentity();
    }
    expect(identity?.publicKeyHex).toBeDefined();

    // 3. Build packaging request
    const createPkgReq = {
      modelFilePath: model!.file_path,
      title: model!.civitai_name || extractedMeta.title || model!.file_name,
      version: extractedMeta.version || '1.0.0',
      modelType: model!.model_type || extractedMeta.modelType || 'Checkpoint',
      baseModel: extractedMeta.baseModel || 'SD 1.5',
      creator: identity?.creatorName || 'Renegade Tester',
      creatorPublicKey: identity?.publicKeyHex,
      description: 'Auto-seeded from RenegadeCMM',
      tags: ['ai-model', 'checkpoint'],
      civitaiModelId: model!.civitai_model_id,
      civitaiVersionId: model!.civitai_version_id,
      license: 'Other',
    };

    // 4. Build manifest with precomputed SHA256 (instant)
    const manifest = await buildSwarmManifest(createPkgReq, {
      precomputedModelSha256: model!.sha256,
    });
    expect(manifest.hashes.sha256).toBe(model!.sha256);
    expect(manifest.model.title).toBe('DreamShaper');

    // 5. Sign manifest
    if (identity && identity.privateKeyHex) {
      manifest.signature = signSwarmManifest(manifest, identity.privateKeyHex, identity.publicKeyHex);
    }
    expect(manifest.signature).toBeDefined();

    // 6. Register with SwarmEngine
    const seedStatus = swarmEngine.registerSeedingManifest(manifest, model!.file_path);
    expect(seedStatus.state).toBe('seeding');
    expect(seedStatus.progressRatio).toBe(1.0);
    expect(seedStatus.cmmSynced).toBe(true);
    expect(seedStatus.title).toBe('DreamShaper');

    // 7. Verify SwarmEngine active torrent list displays the new seeding model in swarm monitor
    const activeTorrents = swarmEngine.getActiveTorrents();
    const found = activeTorrents.find((t) => t.infoHash === manifest.hashes.infoHash);
    expect(found).toBeDefined();
    expect(found?.state).toBe('seeding');
    expect(found?.totalBytes).toBe(manifest.totalSizeBytes);

    // 8. Verify Opt-Out unseeds and removes the torrent
    swarmEngine.removeTorrent(manifest.hashes.infoHash, false);
    const updatedTorrents = swarmEngine.getActiveTorrents();
    expect(updatedTorrents.find((t) => t.infoHash === manifest.hashes.infoHash)).toBeUndefined();
    // Verify file still exists on disk
    expect(fs.existsSync(model!.file_path)).toBe(true);
  });
});
