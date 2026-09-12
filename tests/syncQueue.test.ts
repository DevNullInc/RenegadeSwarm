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
import { SyncQueueManager } from '../src/main/engine/syncQueue';
import { SwarmManifest } from '../src/protocol/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

describe('Sync Queue State Machine & Quarantine Lifecycle (Rules 15, 16, 17)', () => {
  let tempQuarantineDir: string;
  let tempModelsRoot: string;
  let queueManager: SyncQueueManager;
  let testFileContent: Buffer;
  let testSha256: string;

  beforeAll(() => {
    const tmp = os.tmpdir();
    tempQuarantineDir = path.join(tmp, 'test_quarantine');
    tempModelsRoot = path.join(tmp, 'test_comfy_models');

    if (!fs.existsSync(tempQuarantineDir)) fs.mkdirSync(tempQuarantineDir, { recursive: true });
    if (!fs.existsSync(tempModelsRoot)) fs.mkdirSync(tempModelsRoot, { recursive: true });

    const jsonHeader = JSON.stringify({ __metadata__: { format: 'pt' }, 'weight': { dtype: 'F16', shape: [10, 10], data_offsets: [0, 200] } });
    const jsonBytes = Buffer.from(jsonHeader, 'utf8');
    testFileContent = Buffer.alloc(8 + jsonBytes.length + 1024 * 512);
    testFileContent.writeUInt32LE(jsonBytes.length, 0);
    jsonBytes.copy(testFileContent, 8);

    testSha256 = crypto.createHash('sha256').update(testFileContent).digest('hex');

    queueManager = new SyncQueueManager(tempQuarantineDir);
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempQuarantineDir)) fs.rmSync(tempQuarantineDir, { recursive: true, force: true });
      if (fs.existsSync(tempModelsRoot)) fs.rmSync(tempModelsRoot, { recursive: true, force: true });
    } catch {}
  });

  it('should transition through Quarantine -> Validating -> Queued upon enqueueing', () => {
    const manifest: SwarmManifest = {
      swarmSpecVersion: '1.0.0',
      manifestId: '11111111-2222-3333-4444-555555555555',
      createdAt: Date.now(),
      createdBy: 'RenegadeSwarm/0.1.0',
      pieceLength: 1048576,
      totalSizeBytes: testFileContent.length,
      model: {
        title: 'Cyberpunk LoRA',
        version: '1.0.0',
        modelType: 'LORA',
        baseModel: 'SDXL 1.0',
        creator: 'TheStygianRenegade',
        nsfw: false,
        description: '',
        tags: [],
        license: 'MIT',
      },
      hashes: {
        sha256: testSha256,
        infoHash: 'b1b2b3b4b5b6b7b8b9b0c1c2c3c4c5c6c7c8c9c0',
      },
      files: [
        {
          relativePath: 'cyberpunk.safetensors',
          sizeBytes: testFileContent.length,
          fileType: 'Model',
          targetSubfolder: 'loras',
        },
      ],
      announceList: [],
      urlList: [],
    };

    const item = queueManager.enqueueModel(manifest, tempModelsRoot);
    expect(item.state).toBe('Queued');
    expect(item.quarantineFilePath.includes('.part')).toBe(true);

    // Verify audit log entries
    const logs = queueManager.getAuditLogs().filter((l) => l.infoHash === item.infoHash);
    expect(logs.some((l) => l.toState === 'Quarantine')).toBe(true);
    expect(logs.some((l) => l.toState === 'Validating')).toBe(true);
    expect(logs.some((l) => l.toState === 'Queued')).toBe(true);
  });

  it('should mark Active, verify SHA256 in quarantine, and promote to Verified destination', async () => {
    const infoHash = 'b1b2b3b4b5b6b7b8b9b0c1c2c3c4c5c6c7c8c9c0';
    queueManager.markActive(infoHash);

    const item = queueManager.getItem(infoHash);
    expect(item?.state).toBe('Active');

    // Simulate writing complete downloaded file into quarantine temporary path
    fs.writeFileSync(item!.quarantineFilePath, testFileContent);

    // Complete download -> Validates SHA256 and atomically moves to final destination
    const promoted = await queueManager.handleDownloadComplete(infoHash);
    expect(promoted).toBe(true);
    expect(item?.state).toBe('Verified');
    expect(fs.existsSync(item!.finalDestinationPath)).toBe(true);
    expect(fs.existsSync(item!.quarantineFilePath)).toBe(false); // Part file moved
  });
});
