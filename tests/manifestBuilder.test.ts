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
import { buildSwarmManifest, computeFileSha256, computeBitTorrentInfoHash } from '../src/main/engine/manifestBuilder';
import { SwarmManifestSchema } from '../src/protocol/validation';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Swarm Manifest Builder & Protocol Verification', () => {
  let tempModelPath: string;
  let tempPreviewPath: string;

  beforeAll(() => {
    const tempDir = os.tmpdir();
    tempModelPath = path.join(tempDir, 'test_mock_model.safetensors');
    tempPreviewPath = path.join(tempDir, 'test_mock_model.png');

    // Create valid SafeTensors mock model file
    const jsonHeader = JSON.stringify({ __metadata__: { format: 'pt' }, 'weight': { dtype: 'F16', shape: [10, 10], data_offsets: [0, 200] } });
    const jsonBytes = Buffer.from(jsonHeader, 'utf8');
    const modelBuf = Buffer.alloc(8 + jsonBytes.length + 1024);
    modelBuf.writeUInt32LE(jsonBytes.length, 0);
    jsonBytes.copy(modelBuf, 8);
    fs.writeFileSync(tempModelPath, modelBuf);

    // Create valid PNG preview file
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    fs.writeFileSync(tempPreviewPath, pngHeader);
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempModelPath)) fs.unlinkSync(tempModelPath);
      if (fs.existsSync(tempPreviewPath)) fs.unlinkSync(tempPreviewPath);
    } catch {}
  });

  it('should compute valid 64-char SHA256 string for local file', async () => {
    const sha = await computeFileSha256(tempModelPath);
    expect(sha).toBeTypeOf('string');
    expect(sha.length).toBe(64);
  });

  it('should compute valid 40-char InfoHash', () => {
    const infoHash = computeBitTorrentInfoHash('test_info_payload');
    expect(infoHash).toBeTypeOf('string');
    expect(infoHash.length).toBe(40);
  });

  it('should build a compliant SwarmManifest object with web seeds and announce list', async () => {
    const manifest = await buildSwarmManifest({
      modelFilePath: tempModelPath,
      previewFilePath: tempPreviewPath,
      title: 'FLUX Test LoRA',
      version: '1.0.0',
      modelType: 'LORA',
      baseModel: 'Flux.1 D',
      creator: 'RenegadeCreator',
      tags: ['test', 'flux'],
      hfRepoId: 'renegade/flux-lora-test',
    });

    expect(manifest.swarmSpecVersion).toBe('1.0.0');
    expect(manifest.createdBy).toMatch(/^RenegadeSwarm\/\d+\.\d+\.\d+/);
    expect(manifest.model.title).toBe('FLUX Test LoRA');
    expect(manifest.files.length).toBe(2);
    expect(manifest.hashes.sha256.length).toBe(64);
    expect(manifest.hashes.infoHash.length).toBe(40);
    expect(manifest.urlList.length).toBeGreaterThan(0);
    expect(manifest.urlList[0]).toContain('huggingface.co/renegade/flux-lora-test');
    expect(manifest.announceList.length).toBeGreaterThan(0);

    // Validate that it adheres strictly to Zod schema
    const parsed = SwarmManifestSchema.safeParse(manifest);
    expect(parsed.success).toBe(true);
  });
});
