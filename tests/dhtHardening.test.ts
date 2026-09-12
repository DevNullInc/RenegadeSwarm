import { describe, it, expect } from 'vitest';
import { DhtHardeningManager } from '../src/main/engine/dhtHardening';

describe('DHT Hardening & BEP 42 Security (Rules 9, 12, 14)', () => {
  const dht = new DhtHardeningManager({ maxQueriesPerSecond: 5 });

  it('should pin and check allowed swarm infoHashes', () => {
    const infoHash = '4a5c88b2e118b6284f18b3ec48866164287d3d2a';
    expect(dht.isSwarmPinned(infoHash)).toBe(false);

    dht.pinSwarmInfoHash(infoHash);
    expect(dht.isSwarmPinned(infoHash)).toBe(true);

    dht.unpinSwarmInfoHash(infoHash);
    expect(dht.isSwarmPinned(infoHash)).toBe(false);
  });

  it('should generate and verify valid BEP 42 compliant Node IDs', () => {
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
});
