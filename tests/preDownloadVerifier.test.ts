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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PreDownloadVerifier } from '../src/main/engine/preDownloadVerifier';
import { KeyringManager } from '../src/main/engine/keyringManager';
import { generateEd25519KeyPair, signSwarmManifest } from '../src/protocol/crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('PreDownloadVerifier Engine', () => {
  let verifier: PreDownloadVerifier;
  let testKeyringManager: KeyringManager;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = path.join(os.tmpdir(), 'test_predownload_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    const securityDir = path.join(tmpDir, 'security');
    fs.mkdirSync(securityDir, { recursive: true });
    testKeyringManager = new KeyringManager(securityDir);
    verifier = new PreDownloadVerifier(testKeyringManager);
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should verify model against CivitAI by reported SHA256 before download', async () => {
    const testSha = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0';
    const mockCivitaiResponse = {
      id: 998877,
      modelId: 554433,
      name: 'v2.0 Turbo',
      description: '<p>A state-of-the-art diffusion fine-tune</p>',
      baseModel: 'Flux.1 D',
      model: {
        name: 'Flux Turbo Realism',
        type: 'Checkpoint',
        creator: { username: 'RenegadeArtist' },
        tags: [{ name: 'photorealism' }],
      },
      images: [
        { url: 'https://civitai.com/preview.jpg', nsfw: false, nsfwLevel: 1 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCivitaiResponse,
    } as any);

    const result = await verifier.verifyPreDownload({
      sha256: testSha,
      fileName: 'Flux_Turbo_Realism.safetensors',
    });

    expect(result.status).toBe('verified_civitai');
    expect(result.source).toBe('civitai');
    expect(result.isCustomModel).toBe(false);
    expect(result.title).toBe('Flux Turbo Realism (v2.0 Turbo)');
    expect(result.creator).toBe('RenegadeArtist');
    expect(result.civitaiVersionId).toBe(998877);
    expect(result.civitaiModelId).toBe(554433);
    expect(result.baseModel).toBe('Flux.1 D');
    expect(result.canProceed).toBe(true);
    expect(result.trustScore).toBeGreaterThanOrEqual(90);

    fetchSpy.mockRestore();
  });

  it('should verify model against Hugging Face repository API when source is HuggingFace', async () => {
    const mockHfResponse = {
      id: 'Qwen/Qwen2.5-7B-Instruct',
      author: 'Qwen',
      pipeline_tag: 'text-generation',
      tags: ['qwen', 'text-generation', 'llm'],
      cardData: {
        base_model: 'Qwen/Qwen2.5-7B',
      },
      description: 'Official Qwen 2.5 7B Instruct weights',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHfResponse,
    } as any);

    const result = await verifier.verifyPreDownload({
      hfRepoId: 'Qwen/Qwen2.5-7B-Instruct',
      fileName: 'qwen2.5-7b-instruct.gguf',
    });

    expect(result.status).toBe('verified_huggingface');
    expect(result.source).toBe('huggingface');
    expect(result.creator).toBe('Qwen');
    expect(result.modelType).toBe('text-generation');
    expect(result.canProceed).toBe(true);

    fetchSpy.mockRestore();
  });

  it('should verify custom unindexed model via Custom Model Verifier and Web of Trust keyring', () => {
    const keypair = generateEd25519KeyPair();

    // Add creator to local keyring as VerifiedCreator
    testKeyringManager.addEntry({
      creatorName: 'TrustedCustomCreator',
      publicKeyHex: keypair.publicKeyHex,
      trustLevel: 'VerifiedCreator',
      addedAt: Date.now(),
    });

    const infoHash = '1234567890abcdef1234567890abcdef12345678';
    const rawManifest: any = {
      swarmSpecVersion: '1.0.0',
      manifestId: 'manifest_custom_1',
      createdAt: Date.now(),
      totalSizeBytes: 1024,
      hashes: {
        sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        infoHash,
      },
      model: {
        title: 'Custom Cyberpunk LoRA',
        version: '1.0.0',
        modelType: 'LORA',
        baseModel: 'SDXL 1.0',
        creator: 'TrustedCustomCreator',
        description: 'Personal custom trained cyberpunk style',
        tags: ['cyberpunk', 'neon'],
        nsfw: false,
        license: 'MIT',
      },
      files: [{ relativePath: 'cyberpunk_lora.safetensors', fileType: 'Model', sizeBytes: 1024 }],
      announceList: [],
      urlList: [],
    };

    const signature = signSwarmManifest(rawManifest, keypair.privateKeyHex, keypair.publicKeyHex);
    const mockManifest = { ...rawManifest, signature };

    const result = verifier.verifyCustomModel({
      sha256: mockManifest.hashes.sha256,
      fileName: 'cyberpunk_lora.safetensors',
      manifest: mockManifest,
    });

    expect(result.status).toBe('verified_custom_trusted');
    expect(result.isCustomModel).toBe(true);
    expect(result.trustLevel).toBe('VerifiedCreator');
    expect(result.trustScore).toBe(98);
    expect(result.canProceed).toBe(true);
    expect(result.title).toBe('Custom Cyberpunk LoRA');
  });

  it('should reject custom model if signed by a Blocked creator in local keyring', () => {
    const keypair = generateEd25519KeyPair();

    // Add creator as Blocked in local keyring
    testKeyringManager.addEntry({
      creatorName: 'MaliciousActor',
      publicKeyHex: keypair.publicKeyHex,
      trustLevel: 'Blocked',
      addedAt: Date.now(),
    });

    const infoHash = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const rawManifest: any = {
      swarmSpecVersion: '1.0.0',
      manifestId: 'manifest_blocked',
      createdAt: Date.now(),
      totalSizeBytes: 1024,
      hashes: {
        sha256: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        infoHash,
      },
      model: {
        title: 'Dangerous Model',
        version: '1.0.0',
        modelType: 'Checkpoint',
        creator: 'MaliciousActor',
        nsfw: false,
        license: 'Unknown',
        description: 'Dangerous payload',
        tags: [],
      },
      files: [{ relativePath: 'dangerous.safetensors', fileType: 'Model', sizeBytes: 1024 }],
      announceList: [],
      urlList: [],
    };

    const signature = signSwarmManifest(rawManifest, keypair.privateKeyHex, keypair.publicKeyHex);
    const mockManifest = { ...rawManifest, signature };

    const result = verifier.verifyCustomModel({
      fileName: 'dangerous.safetensors',
      manifest: mockManifest,
    });

    expect(result.status).toBe('rejected');
    expect(result.canProceed).toBe(false);
    expect(result.trustLevel).toBe('Blocked');
    expect(result.reason).toContain('blocked');
  });

  it('should automatically save companion .sha256 and .info assets upon model promotion', async () => {
    const targetModelPath = path.join(tmpDir, 'Renegade_Super_Model.safetensors');
    fs.writeFileSync(targetModelPath, Buffer.alloc(512));

    const testSha = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    const mockManifest: any = {
      manifestId: 'manifest_save_test',
      hashes: { sha256: testSha, infoHash: 'info123' },
      model: {
        title: 'Renegade Super Model',
        version: '1.2.0',
        creator: 'TheStygianRenegade',
        modelType: 'Checkpoint',
        baseModel: 'Flux.1 D',
        description: 'Companion file generation test model',
        tags: ['flux', 'companion'],
      },
    };

    await verifier.saveCompanionAssets({
      targetModelPath,
      sha256: testSha,
      manifest: mockManifest,
      previewBuffer: Buffer.alloc(256),
    });

    const expectedShaFile = path.join(tmpDir, 'Renegade_Super_Model.sha256');
    const expectedInfoFile = path.join(tmpDir, 'Renegade_Super_Model.info');
    const expectedImgFile = path.join(tmpDir, 'Renegade_Super_Model.png');

    expect(fs.existsSync(expectedShaFile)).toBe(true);
    expect(fs.readFileSync(expectedShaFile, 'utf8')).toBe(testSha);

    expect(fs.existsSync(expectedInfoFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(expectedInfoFile, 'utf8'));
    expect(parsed.title).toBe('Renegade Super Model');
    expect(parsed.creator).toBe('TheStygianRenegade');
    expect(parsed.baseModel).toBe('Flux.1 D');

    expect(fs.existsSync(expectedImgFile)).toBe(true);
  });
});
