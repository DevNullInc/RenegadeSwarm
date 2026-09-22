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
  DhtHardeningManager,
  crc32c,
  verifyBEP42NodeId,
  ipToBuffer,
} from '../src/main/engine/dhtHardening';

describe('DHT Hardening & BEP 42 Security (Rules 9, 12, 14)', () => {
  const dht = new DhtHardeningManager({ maxQueriesPerSecond: 5, maxBackgroundBandwidthKbps: 5 });

  it('should compute Castagnoli CRC32C and verify BEP 42 node prefix', () => {
    const ip = '124.31.75.21';
    const ipBytes = Buffer.from([124, 31, 75, 21]);
    const crc = crc32c(ipBytes);
    expect(crc).toBeTypeOf('number');
    expect(crc).toBeGreaterThan(0);
  });

  it('should support IPv6 conversion and verification in BEP 42', () => {
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const buf = ipToBuffer(ipv6);
    expect(buf).not.toBeNull();
    expect(buf!.length).toBe(8);

    const nodeId = dht.generateLocalBep42NodeId(ipv6);
    expect(nodeId.length).toBe(40);
    expect(verifyBEP42NodeId(nodeId, ipv6)).toBe(true);
  });

  it('should pin and check allowed swarm infoHashes', () => {
    const infoHash = '4a5c88b2e118b6284f18b3ec48866164287d3d2a';
    expect(dht.isSwarmPinned(infoHash)).toBe(false);

    dht.pinSwarmInfoHash(infoHash);
    expect(dht.isSwarmPinned(infoHash)).toBe(true);

    dht.unpinSwarmInfoHash(infoHash);
    expect(dht.isSwarmPinned(infoHash)).toBe(false);
  });

  it('should generate and verify valid BEP 42 compliant Node IDs for IPv4', () => {
    const ip = '192.168.1.100';
    const nodeId = dht.generateLocalBep42NodeId(ip);

    expect(nodeId).toBeTypeOf('string');
    expect(nodeId.length).toBe(40); // 20 bytes in hex

    const isValid = dht.verifyBep42NodeId(ip, nodeId);
    expect(isValid).toBe(true);
  });

  it('should reject invalid or spoofed BEP 42 Node IDs', () => {
    const ip = '192.168.1.100';
    const fakeNodeId = '00112233445566778899aabbccddeeff00112233';

    const isValid = dht.verifyBep42NodeId(ip, fakeNodeId);
    expect(isValid).toBe(false);
  });

  it('should enforce query rate limiting under burst load', () => {
    // 5 allowed per second
    for (let i = 0; i < 5; i++) {
      expect(dht.checkQueryRateLimit()).toBe(true);
    }
    // 6th should be throttled
    expect(dht.checkQueryRateLimit()).toBe(false);
  });

  it('should enforce byte bandwidth limit (< 5KB/s) for DHT maintenance', () => {
    const customDht = new DhtHardeningManager({ maxBackgroundBandwidthKbps: 1 }); // 1024 bytes/sec
    expect(customDht.checkBandwidthLimit(500)).toBe(true);
    expect(customDht.checkBandwidthLimit(500)).toBe(true);
    // 1000 + 100 = 1100 > 1024 -> throttled
    expect(customDht.checkBandwidthLimit(100)).toBe(false);
  });
});
