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
  parseExtendedHandshake,
  parseDiscoveryPayload,
  safeJsonParse,
  MAX_EXTENDED_HANDSHAKE_SIZE,
  MAX_DISCOVERY_PAYLOAD_SIZE,
} from '../src/protocol/wireProtocol';
import {
  sanitizePathSegment,
  CmmFolderRouter,
} from '../src/main/cmm/cmmFolderRouter';
import {
  computeFileSha256,
  buildSwarmManifest,
} from '../src/main/engine/manifestBuilder';
import {
  DiscoveryEngine,
  MAX_DISCOVERED_CACHE_SIZE,
} from '../src/main/engine/discoveryEngine';

describe('Penetration Testing Security & Remote Hardening Suite', () => {
  describe('BEP 10 Wire Protocol & Remote Buffer Safety', () => {
    it('rejects oversized extended handshake buffers > 64KB', () => {
      const oversizedBuf = Buffer.alloc(MAX_EXTENDED_HANDSHAKE_SIZE + 1, 0x20);
      const parsed = parseExtendedHandshake(oversizedBuf);
      expect(parsed).toBeNull();
    });

    it('rejects oversized discovery payload buffers > 512KB', () => {
      const oversizedBuf = Buffer.alloc(MAX_DISCOVERY_PAYLOAD_SIZE + 1, 0x20);
      const parsed = parseDiscoveryPayload(oversizedBuf);
      expect(parsed).toBeNull();
    });

    it('strips prototype pollution keys (__proto__, constructor, prototype)', () => {
      const maliciousJson = JSON.stringify({
        __proto__: { isAdmin: true },
        constructor: { name: 'exploit' },
        prototype: { exploit: true },
        m: { renegade_swarm_discovery_v1: 1 },
        v: 'RenegadeSwarm/0.3.0',
      });

      const parsed = safeJsonParse<any>(maliciousJson);
      expect(parsed).toBeDefined();
      expect(parsed.m).toBeDefined();
      expect((parsed as any).isAdmin).toBeUndefined();
      expect(({} as any).isAdmin).toBeUndefined(); // Prototype not polluted
    });

    it('safely parses valid BEP 10 handshake within bounds', () => {
      const validPayload = Buffer.from(
        JSON.stringify({
          m: { renegade_swarm_discovery_v1: 1 },
          v: 'RenegadeSwarm/0.3.0',
        }),
        'utf8'
      );
      const parsed = parseExtendedHandshake(validPayload);
      expect(parsed).not.toBeNull();
      expect(parsed?.m?.renegade_swarm_discovery_v1).toBe(1);
    });
  });

  describe('Windows Device Names & Path Confinement', () => {
    it('neutralizes Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)', () => {
      expect(sanitizePathSegment('CON')).toBe('_RS_CON');
      expect(sanitizePathSegment('con.safetensors')).toBe('_RS_con.safetensors');
      expect(sanitizePathSegment('PRN.info')).toBe('_RS_PRN.info');
      expect(sanitizePathSegment('aux.sha256')).toBe('_RS_aux.sha256');
      expect(sanitizePathSegment('NUL.safetensors')).toBe('_RS_NUL.safetensors');
      expect(sanitizePathSegment('com1.pth')).toBe('_RS_com1.pth');
      expect(sanitizePathSegment('lpt1.bin')).toBe('_RS_lpt1.bin');
      expect(sanitizePathSegment('legitimate_model.safetensors')).toBe('legitimate_model.safetensors');
    });

    it('rejects UNC network paths to prevent NetNTLM SMB coercion', () => {
      const router = new CmmFolderRouter({
        rootPath: 'C:\\Models',
        cmmFolders: ['C:\\Models\\Checkpoints'],
      });

      expect(router.isPathAllowed('\\\\attacker.com\\share\\malicious.safetensors')).toBe(false);
      expect(router.isPathAllowed('//attacker.com/share/malicious.safetensors')).toBe(false);
      expect(router.isPathAllowed('\\\\192.168.1.50\\c$\\payload.pt')).toBe(false);
    });

    it('rejects UNC paths in computeFileSha256 and buildSwarmManifest', async () => {
      await expect(computeFileSha256('\\\\10.0.0.1\\share\\evil.safetensors')).rejects.toThrow(
        /UNC paths are disallowed/i
      );

      await expect(
        buildSwarmManifest({
          modelFilePath: '\\\\10.0.0.1\\share\\evil.safetensors',
          title: 'Evil Model',
          version: '1.0.0',
          modelType: 'Checkpoint',
          baseModel: 'SD 1.5',
          creator: 'Attacker',
          tags: ['test'],
        } as any)
      ).rejects.toThrow(/UNC network path/i);
    });
  });

  describe('Discovery Catalog Memory Bounds & Peer Rate Limiting', () => {
    it('evicts oldest discovered models when cache reaches MAX_DISCOVERED_CACHE_SIZE', () => {
      const engine = new DiscoveryEngine();

      // Seed cache up to MAX_DISCOVERED_CACHE_SIZE
      for (let i = 0; i < MAX_DISCOVERED_CACHE_SIZE; i++) {
        const hash = i.toString().padStart(40, '0');
        const evaluated = engine.evaluateModelTrust({
          infoHash: hash,
          title: `Model ${i}`,
          version: '1.0.0',
          modelType: 'CHECKPOINT',
          baseModel: 'SDXL',
          totalSizeBytes: 1000,
          creator: 'Tester',
          publishedAt: Date.now() - (MAX_DISCOVERED_CACHE_SIZE - i) * 1000,
          tags: ['test'],
          description: 'Desc',
          urlList: [],
          nsfw: false,
        });
        (engine as any).cacheDiscoveredModel(evaluated);
      }

      expect(engine.getStats().cachedDiscoveredModels).toBe(MAX_DISCOVERED_CACHE_SIZE);

      // Add one more model to trigger eviction
      const newHash = 'f'.repeat(40);
      const newModel = engine.evaluateModelTrust({
        infoHash: newHash,
        title: 'New Overflow Model',
        version: '1.0.0',
        modelType: 'CHECKPOINT',
        baseModel: 'SDXL',
        totalSizeBytes: 2000,
        creator: 'Tester',
        publishedAt: Date.now(),
        tags: ['overflow'],
        description: 'New model',
        urlList: [],
        nsfw: false,
      });
      (engine as any).cacheDiscoveredModel(newModel);

      // Cache size must remain bounded at MAX_DISCOVERED_CACHE_SIZE
      expect(engine.getStats().cachedDiscoveredModels).toBe(MAX_DISCOVERED_CACHE_SIZE);
    });

    it('rate limits flooding peer messages to max 20 per second', () => {
      const engine = new DiscoveryEngine();
      const peerId = 'peer_flooder_123';

      let accepted = 0;
      for (let i = 0; i < 30; i++) {
        const canProceed = (engine as any).checkPeerRateLimit(peerId);
        if (canProceed) accepted++;
      }

      expect(accepted).toBe(20); // First 20 allowed, subsequent 10 rejected
    });
  });
});
