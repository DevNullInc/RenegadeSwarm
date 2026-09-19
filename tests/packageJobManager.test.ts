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
import { PackageJobManager } from '../src/main/engine/packageJobManager';
import { CreateSwarmPackageRequest } from '../src/shared/ipcContracts';

describe('PackageJobManager - Packaging State Hoisting & Job Resilience', () => {
  let tempDir: string;
  let modelPath: string;
  let previewPath: string;
  let manager: PackageJobManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-pkg-test-'));
    modelPath = path.join(tempDir, 'flux1_test_model.safetensors');
    previewPath = path.join(tempDir, 'flux1_test_model.png');

    // Create a mock valid SafeTensors file (8-byte header size + JSON metadata + tensor buffer)
    const headerJson = JSON.stringify({
      __metadata__: {
        format: 'pt',
        creator: 'TheStygianRenegade',
        base_model: 'Flux.1 D',
      },
      weight_tensor: {
        dtype: 'F16',
        shape: [16, 16],
        data_offsets: [0, 512],
      },
    });
    const headerBuf = Buffer.from(headerJson, 'utf-8');
    const headerSizeBuf = Buffer.alloc(8);
    headerSizeBuf.writeBigUInt64LE(BigInt(headerBuf.length));
    const tensorData = Buffer.alloc(512, 0x42);
    fs.writeFileSync(modelPath, Buffer.concat([headerSizeBuf, headerBuf, tensorData]));

    // Mock PNG image (valid 8-byte PNG header)
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(previewPath, Buffer.concat([pngHeader, Buffer.alloc(128, 0)]));

    manager = new PackageJobManager();
  });

  afterEach(() => {
    manager.cancelJob();
    manager.clearJob();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should successfully complete full packaging pipeline and emit progress events', async () => {
    const progressEvents: string[] = [];
    manager.on('progress', (job) => {
      if (job) {
        progressEvents.push(job.phase);
      }
    });

    const req: CreateSwarmPackageRequest = {
      modelFilePath: modelPath,
      previewFilePath: previewPath,
      title: 'Flux.1 Test Model',
      version: '1.0.0',
      modelType: 'Checkpoint',
      baseModel: 'Flux.1 D',
      creator: 'TheStygianRenegade',
      description: 'Test model package description',
      tags: ['flux', 'test'],
      license: 'MIT',
    };

    const initialJob = await manager.startJob(req);
    expect(initialJob).toBeDefined();
    expect(initialJob.phase).toBe('hashing');
    expect(initialJob.jobId).toBeDefined();

    // Wait for async job completion
    await new Promise<void>((resolve, reject) => {
      manager.on('completed', (job) => {
        try {
          expect(job.phase).toBe('completed');
          expect(job.percent).toBe(100);
          expect(job.manifest).toBeDefined();
          expect(job.manifest.model.title).toBe('Flux.1 Test Model');
          expect(job.manifest.hashes.sha256).toBeDefined();
          expect(job.manifest.hashes.infoHash).toBeDefined();
          expect(job.completedAt).toBeDefined();
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      manager.on('jobError', (job) => {
        reject(new Error(job.error || 'Job failed'));
      });
    });

    // Check active job query
    const activeJob = manager.getActiveJob();
    expect(activeJob).toBeDefined();
    expect(activeJob?.phase).toBe('completed');
    expect(activeJob?.manifest?.model.title).toBe('Flux.1 Test Model');

    // Progress events should have traversed the phases
    expect(progressEvents).toContain('hashing');
    expect(progressEvents).toContain('validating');
    expect(progressEvents).toContain('generating_manifest');
    expect(progressEvents).toContain('seeding');
    expect(progressEvents).toContain('completed');
  });

  it('should prevent concurrent packaging jobs when one is already active', async () => {
    const req: CreateSwarmPackageRequest = {
      modelFilePath: modelPath,
      title: 'Flux.1 Test Model Concurrent',
      version: '1.0.0',
      modelType: 'Checkpoint',
      description: '',
      tags: [],
      license: 'MIT',
    };

    await manager.startJob(req);
    await expect(manager.startJob(req)).rejects.toThrow(/already in progress/);
  });

  it('should allow cancelling an active job and recording error state', async () => {
    const req: CreateSwarmPackageRequest = {
      modelFilePath: modelPath,
      title: 'Flux.1 Test Model Cancel',
      version: '1.0.0',
      modelType: 'Checkpoint',
      description: '',
      tags: [],
      license: 'MIT',
    };

    const job = await manager.startJob(req);
    const cancelled = manager.cancelJob(job.jobId);
    expect(cancelled).toBe(true);

    const activeJob = manager.getActiveJob();
    expect(activeJob?.phase).toBe('error');
    expect(activeJob?.error).toContain('cancelled by user');
  });

  it('should allow clearing a completed or errored job', async () => {
    const req: CreateSwarmPackageRequest = {
      modelFilePath: modelPath,
      title: 'Flux.1 Test Model Clear',
      version: '1.0.0',
      modelType: 'Checkpoint',
      description: '',
      tags: [],
      license: 'MIT',
    };

    await manager.startJob(req);
    manager.cancelJob();

    expect(manager.getActiveJob()).not.toBeNull();
    const cleared = manager.clearJob();
    expect(cleared).toBe(true);
    expect(manager.getActiveJob()).toBeNull();
  });

  it('should reject forbidden file types and non-existent files', async () => {
    const nonExistentReq: CreateSwarmPackageRequest = {
      modelFilePath: path.join(tempDir, 'does_not_exist.safetensors'),
      title: 'Non Existent',
      version: '1.0.0',
      modelType: 'Checkpoint',
      description: '',
      tags: [],
      license: 'MIT',
    };

    await expect(manager.startJob(nonExistentReq)).rejects.toThrow(/Model file not found/);

    const forbiddenPath = path.join(tempDir, 'bad_script.exe');
    fs.writeFileSync(forbiddenPath, 'MZ mock executable');
    const forbiddenReq: CreateSwarmPackageRequest = {
      modelFilePath: forbiddenPath,
      title: 'Forbidden Exe',
      version: '1.0.0',
      modelType: 'Checkpoint',
      description: '',
      tags: [],
      license: 'MIT',
    };

    await expect(manager.startJob(forbiddenReq)).rejects.toThrow(/Security Exception/);
  });
});
