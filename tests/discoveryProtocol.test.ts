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
  serializeExtendedHandshake,
  parseExtendedHandshake,
  serializeExtendedMessage,
  parseExtendedMessage,
  serializeDiscoveryPayload,
  parseDiscoveryPayload,
  EXTENDED_HANDSHAKE_ID,
  RS_DISCOVERY_EXTENSION_ID,
} from '../src/protocol/wireProtocol';
import {
  RENEGADE_SWARM_DISCOVERY_EXTENSION,
  DiscoveredModelEntrySchema,
  DiscoveryCatalogQuerySchema,
  DiscoveryCatalogResponseSchema,
  DiscoveredModelEntry,
} from '../src/protocol/discoveryTypes';

describe('P2P Model Discovery Protocol (BEP 10)', () => {
  it('should serialize and parse BEP 10 extended handshakes with RenegadeSwarm capabilities', () => {
    const handshakeDict = {
      m: {
        [RENEGADE_SWARM_DISCOVERY_EXTENSION]: RS_DISCOVERY_EXTENSION_ID,
        ut_metadata: 2,
      },
      v: 'RenegadeSwarm/0.3.0',
      renegade_swarm_version: '0.3.0',
      capabilities: ['model_catalog', 'wot_signatures'],
    };

    const msgBuf = serializeExtendedHandshake(handshakeDict);
    expect(msgBuf.length).toBeGreaterThan(4);

    // Skip 4-byte length and 1-byte message ID (20 for Extended)
    const extPayload = msgBuf.subarray(5);
    const parsedExt = parseExtendedMessage(extPayload);
    expect(parsedExt).not.toBeNull();
    expect(parsedExt!.extendedId).toBe(EXTENDED_HANDSHAKE_ID);

    const parsedDict = parseExtendedHandshake(parsedExt!.data);
    expect(parsedDict).not.toBeNull();
    expect(parsedDict!.m[RENEGADE_SWARM_DISCOVERY_EXTENSION]).toBe(RS_DISCOVERY_EXTENSION_ID);
    expect(parsedDict!.v).toBe('RenegadeSwarm/0.3.0');
    expect(parsedDict!.capabilities).toContain('wot_signatures');
  });

  it('should serialize and parse discovery catalog queries and validate schema', () => {
    const query = {
      queryId: '11111111-2222-3333-4444-555555555555',
      query: 'flux cyberpunk',
      modelType: 'LORA' as const,
      baseModel: 'Flux.1 D',
      verifiedOnly: false,
      limit: 25,
    };

    const validated = DiscoveryCatalogQuerySchema.parse(query);
    expect(validated.query).toBe('flux cyberpunk');

    const payloadBuf = serializeDiscoveryPayload('catalog_query', validated);
    const parsedEnvelope = parseDiscoveryPayload(payloadBuf);
    expect(parsedEnvelope).not.toBeNull();
    expect(parsedEnvelope!.type).toBe('catalog_query');
    expect(parsedEnvelope!.payload.query).toBe('flux cyberpunk');
  });

  it('should serialize and parse discovery catalog responses and validate model entries', () => {
    const sampleModel: DiscoveredModelEntry = {
      infoHash: '4a5c88b2e118b6284f18b3ec48866164287d3d2a',
      title: 'FLUX.1-Dev Cyberpunk',
      version: '1.0.0',
      modelType: 'LORA',
      baseModel: 'Flux.1 D',
      totalSizeBytes: 2400000000,
      creator: 'TheStygianRenegade',
      creatorPublicKey: '70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      tags: ['flux', 'cyberpunk'],
      description: 'High detail cyberpunk LoRA',
      publishedAt: Date.now(),
      urlList: ['https://huggingface.co/test/model.safetensors'],
      nsfw: false,
    };

    const response = {
      queryId: '11111111-2222-3333-4444-555555555555',
      responderPeerId: '0123456789abcdef0123456789abcdef01234567',
      models: [sampleModel],
    };

    const validated = DiscoveryCatalogResponseSchema.parse(response);
    expect(validated.models).toHaveLength(1);
    expect(validated.models[0].title).toBe('FLUX.1-Dev Cyberpunk');

    const payloadBuf = serializeDiscoveryPayload('catalog_response', validated);
    const parsedEnvelope = parseDiscoveryPayload(payloadBuf);
    expect(parsedEnvelope).not.toBeNull();
    expect(parsedEnvelope!.type).toBe('catalog_response');
    expect(parsedEnvelope!.payload.models[0].infoHash).toBe('4a5c88b2e118b6284f18b3ec48866164287d3d2a');
  });

  it('should reject malformed extended payloads gracefully', () => {
    expect(parseExtendedMessage(Buffer.alloc(0))).toBeNull();
    expect(parseExtendedHandshake(Buffer.from('not-json'))).toBeNull();
    expect(parseDiscoveryPayload(Buffer.from('{ broken json'))).toBeNull();
  });
});
