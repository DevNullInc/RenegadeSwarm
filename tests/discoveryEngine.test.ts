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

import { describe, it, expect, beforeEach } from 'vitest';
import { DiscoveryEngine, DiscoveryPeerConnection } from '../src/main/engine/discoveryEngine';
import { DiscoveredModelEntry } from '../src/protocol/discoveryTypes';
import { generateEd25519KeyPair, signEd25519 } from '../src/protocol/crypto';

describe('DiscoveryEngine Service', () => {
  let engine: DiscoveryEngine;

  beforeEach(() => {
    engine = new DiscoveryEngine();
  });

  const sampleModel1: DiscoveredModelEntry = {
    infoHash: '4a5c88b2e118b6284f18b3ec48866164287d3d2a',
    title: 'FLUX.1-Dev Cyberpunk LoRA',
    version: '1.0.0',
    modelType: 'LORA',
    baseModel: 'Flux.1 D',
    totalSizeBytes: 2400000000,
    creator: 'TheStygianRenegade',
    creatorPublicKey: '70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    tags: ['flux', 'cyberpunk'],
    description: 'High detail cyberpunk LoRA',
    publishedAt: 1720000000000,
    urlList: [],
    nsfw: false,
  };

  const sampleModel2: DiscoveredModelEntry = {
    infoHash: '5b6d77c3e218b6284f18b3ec48866164287d3d2b',
    title: 'Llama-3.1-8B-Instruct-GGUF',
    version: '1.0.0',
    modelType: 'GGUF_LLM',
    baseModel: 'Llama 3.1 8B',
    totalSizeBytes: 4900000000,
    creator: 'MetaAI',
    tags: ['llama', 'chat'],
    description: 'Quantized LLM for ComfyUI nodes',
    publishedAt: 1721000000000,
    urlList: [],
    nsfw: false,
  };

  it('should index and query local models correctly', async () => {
    engine.indexLocalModel(sampleModel1);
    engine.indexLocalModel(sampleModel2);

    expect(engine.getLocalCatalog()).toHaveLength(2);

    // Search by title
    const resultsFlux = await engine.search('cyberpunk');
    expect(resultsFlux).toHaveLength(1);
    expect(resultsFlux[0].title).toBe('FLUX.1-Dev Cyberpunk LoRA');

    // Search by modelType
    const resultsLLM = await engine.search('', { modelType: 'GGUF_LLM' });
    expect(resultsLLM).toHaveLength(1);
    expect(resultsLLM[0].title).toBe('Llama-3.1-8B-Instruct-GGUF');

    // Search with no match
    const resultsEmpty = await engine.search('nonexistent_model_xyz');
    expect(resultsEmpty).toHaveLength(0);
  });

  it('should evaluate mathematical Ed25519 signatures and assign Community trust tier', () => {
    const { publicKeyHex, privateKeyHex } = generateEd25519KeyPair();
    const infoHash = '6c7e88d4f318b6284f18b3ec48866164287d3d2c';
    const title = 'Custom FineTune Model';
    const totalSizeBytes = 1200000000;
    const publishedAt = 1722000000000;

    const message = `${infoHash}:${title}:${totalSizeBytes}:${publishedAt}`;
    const signatureHex = signEd25519(Buffer.from(message, 'utf8'), privateKeyHex);

    const model: DiscoveredModelEntry = {
      infoHash,
      title,
      version: '1.0.0',
      modelType: 'CHECKPOINT',
      baseModel: 'SDXL 1.0',
      totalSizeBytes,
      creator: 'AnonCreator',
      creatorPublicKey: publicKeyHex,
      signature: signatureHex,
      tags: ['sdxl'],
      description: 'Tested signed model',
      publishedAt,
      urlList: [],
      nsfw: false,
    };

    const evaluated = engine.evaluateModelTrust(model, 'peer-1');
    expect(evaluated.trustLevel).toBe('Community');
    expect(evaluated.trustScore).toBe(50);
  });

  it('should broadcast search queries to connected peers and aggregate results', async () => {
    let sentMessage: any = null;

    const mockPeer: DiscoveryPeerConnection = {
      peerId: 'peer-abc-123',
      ip: '192.168.1.50',
      port: 6881,
      extensionId: 1,
      sendDiscoveryMessage: (type, payload) => {
        sentMessage = { type, payload };
        // Simulate immediate response from peer
        if (type === 'catalog_query') {
          engine.handleInboundMessage('peer-abc-123', 'catalog_response', {
            queryId: payload.queryId,
            responderPeerId: 'peer-abc-123',
            models: [sampleModel1],
          });
        }
      },
    };

    engine.registerDiscoveryPeer(mockPeer);
    expect(engine.getConnectedDiscoveryPeersCount()).toBe(1);

    const results = await engine.search('cyberpunk', { timeoutMs: 50 });
    expect(sentMessage).not.toBeNull();
    expect(sentMessage.type).toBe('catalog_query');
    expect(results).toHaveLength(1);
    expect(results[0].infoHash).toBe(sampleModel1.infoHash);

    engine.unregisterDiscoveryPeer('peer-abc-123');
    expect(engine.getConnectedDiscoveryPeersCount()).toBe(0);
  });

  it('should find active local seeded models matching search terms like Anima', async () => {
    engine.indexLocalModel({
      infoHash: 'aabbccddeeff00112233445566778899aabbccdd',
      title: 'Anima-Pencil-XL-v1.0',
      version: '1.0.0',
      modelType: 'CHECKPOINT',
      baseModel: 'SDXL 1.0',
      totalSizeBytes: 6900000000,
      creator: 'Local Seeder',
      tags: ['anime', 'illustration', 'pencil'],
      description: 'Anima anime style checkpoint',
      publishedAt: Date.now(),
      urlList: [],
    });

    const results = await engine.search('Anima');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Anima-Pencil-XL-v1.0');
    expect(results[0].peerCount).toBeGreaterThanOrEqual(1);

    // Case-insensitive query
    const resultsLower = await engine.search('anima');
    expect(resultsLower).toHaveLength(1);
    expect(resultsLower[0].title).toBe('Anima-Pencil-XL-v1.0');
  });
});
