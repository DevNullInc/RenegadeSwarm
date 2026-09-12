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
import { ModelMetadataExtractor } from '../src/main/metadata/modelMetadataExtractor';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ModelMetadataExtractor Engine', () => {
  let tmpDir: string;
  let safetensorsPath: string;
  let previewPath: string;
  let rawGgufPath: string;
  let extractor: ModelMetadataExtractor;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), 'test_metadata_extractor_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    safetensorsPath = path.join(tmpDir, 'flux1-dev-finetune.safetensors');
    previewPath = path.join(tmpDir, 'flux1-dev-finetune.preview.png');
    rawGgufPath = path.join(tmpDir, 'sdxl_cyberpunk_q8.gguf');

    // Create a mock .safetensors header
    const mockMetadata = {
      __metadata__: {
        'modelspec.title': 'Flux.1 Dev Hyper Realism',
        'modelspec.author': 'TheStygianRenegade',
        'modelspec.version': '2.1.0',
        'modelspec.architecture': 'Flux.1 D',
        'modelspec.description': 'Ultra high-fidelity photorealism fine-tune for Flux.1',
        'modelspec.tags': 'flux, realism, portrait, fine-tune',
        'modelspec.type': 'Checkpoint',
      },
    };

    const headerJsonStr = JSON.stringify(mockMetadata);
    const headerBuf = Buffer.from(headerJsonStr, 'utf8');
    const headerLenBuf = Buffer.alloc(8);
    headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);

    const dummyTensors = Buffer.alloc(1024, 0x42); // 1KB mock tensor payload
    const safetensorsFileContent = Buffer.concat([headerLenBuf, headerBuf, dummyTensors]);

    fs.writeFileSync(safetensorsPath, safetensorsFileContent);
    fs.writeFileSync(previewPath, Buffer.alloc(100)); // dummy preview file
    fs.writeFileSync(rawGgufPath, Buffer.alloc(2048)); // dummy gguf file

    extractor = new ModelMetadataExtractor();
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should parse embedded __metadata__ from safetensors header correctly', async () => {
    const meta = await extractor.extractMetadata(safetensorsPath);
    expect(meta.title).toBe('Flux.1 Dev Hyper Realism');
    expect(meta.creator).toBe('TheStygianRenegade');
    expect(meta.version).toBe('2.1.0');
    expect(meta.baseModel).toBe('Flux.1 D');
    expect(meta.description).toBe('Ultra high-fidelity photorealism fine-tune for Flux.1');
    expect(meta.tags).toEqual(['flux', 'realism', 'portrait', 'fine-tune']);
    expect(meta.modelType).toBe('Checkpoint');
  });

  it('should auto-detect sibling preview image files', async () => {
    const meta = await extractor.extractMetadata(safetensorsPath);
    expect(meta.previewFilePath).toBe(previewPath);
  });

  it('should format clean title and infer model type/baseModel from raw filenames when header missing', async () => {
    const meta = await extractor.extractMetadata(rawGgufPath);
    expect(meta.title).toBe('Sdxl Cyberpunk Q8');
    expect(meta.baseModel).toBe('SDXL 1.0');
  });

  it('should reject non-existent file paths with descriptive error', async () => {
    await expect(extractor.extractMetadata('/invalid/non_existent_file.safetensors')).rejects.toThrow('File not found');
  });
});
