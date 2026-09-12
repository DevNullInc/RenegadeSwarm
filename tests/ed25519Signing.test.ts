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

import { describe, it, expect } from 'vitest';
import {
  generateEd25519KeyPair,
  signSwarmManifest,
  verifySwarmManifestSignature,
} from '../src/protocol/crypto';
import { SwarmManifest } from '../src/protocol/types';

describe('Ed25519 Model Provenance Signing & Verification (Rule 10)', () => {
  const baseManifest: Omit<SwarmManifest, 'signature'> = {
    swarmSpecVersion: '1.0.0',
    manifestId: '12345678-1234-1234-1234-123456789abc',
    createdAt: 1723456789,
    createdBy: 'RenegadeSwarm/0.1.0',
    pieceLength: 4194304,
    totalSizeBytes: 2400000000,
    model: {
      title: 'FLUX.1-Dev-Cyberpunk',
      version: '1.0.0',
      modelType: 'LORA',
      baseModel: 'Flux.1 D',
      creator: 'TheStygianRenegade',
      nsfw: false,
      description: 'Signed Model',
      tags: ['cyberpunk'],
      license: 'MIT',
    },
    hashes: {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      infoHash: '4a5c88b2e118b6284f18b3ec48866164287d3d2a',
    },
    files: [
      {
        relativePath: 'flux_cyberpunk.safetensors',
        sizeBytes: 2400000000,
        fileType: 'Model',
        targetSubfolder: 'loras',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    ],
    announceList: [['udp://tracker.opentrackr.org:1337/announce']],
    urlList: [],
  };

  it('should generate valid 32-byte Ed25519 keypairs', () => {
    const keyPair = generateEd25519KeyPair();
    expect(keyPair.publicKeyHex).toBeTypeOf('string');
    expect(keyPair.publicKeyHex.length).toBe(64); // 32 bytes in hex
    expect(keyPair.privateKeyHex).toBeTypeOf('string');
    expect(keyPair.privateKeyHex.length).toBe(64);
  });

  it('should sign manifest and verify valid signature', () => {
    const keyPair = generateEd25519KeyPair();
    const signature = signSwarmManifest(baseManifest, keyPair.privateKeyHex, keyPair.publicKeyHex);

    expect(signature.algorithm).toBe('ed25519');
    expect(signature.publicKey).toBe(keyPair.publicKeyHex);
    expect(signature.signature.length).toBe(128); // 64 bytes in hex

    const signedManifest: SwarmManifest = {
      ...baseManifest,
      signature,
    };

    const isValid = verifySwarmManifestSignature(signedManifest);
    expect(isValid).toBe(true);
  });

  it('should reject signature if manifest metadata is tampered', () => {
    const keyPair = generateEd25519KeyPair();
    const signature = signSwarmManifest(baseManifest, keyPair.privateKeyHex, keyPair.publicKeyHex);

    const tamperedManifest: SwarmManifest = {
      ...baseManifest,
      model: {
        ...baseManifest.model,
        title: 'Tampered Model Title', // Modified field
      },
      signature,
    };

    const isValid = verifySwarmManifestSignature(tamperedManifest);
    expect(isValid).toBe(false);
  });

  it('should reject signature if signed with a different key', () => {
    const keyPairA = generateEd25519KeyPair();
    const keyPairB = generateEd25519KeyPair();

    const signatureA = signSwarmManifest(baseManifest, keyPairA.privateKeyHex, keyPairA.publicKeyHex);

    const forgedManifest: SwarmManifest = {
      ...baseManifest,
      signature: {
        ...signatureA,
        publicKey: keyPairB.publicKeyHex, // Mismatched public key
      },
    };

    const isValid = verifySwarmManifestSignature(forgedManifest);
    expect(isValid).toBe(false);
  });
});
