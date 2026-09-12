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

import crypto from 'crypto';

export interface DhtSecurityConfig {
  maxQueriesPerSecond: number; // Max queries allowed per second
  maxBackgroundBandwidthKbps: number; // Max 5KB/s maintenance bandwidth (Rule 14)
  enforceBep42: boolean;
}

export class DhtHardeningManager {
  private allowedInfoHashes: Set<string> = new Set();
  private queryCounter: number = 0;
  private lastResetTime: number = Date.now();
  private config: DhtSecurityConfig;

  constructor(config?: Partial<DhtSecurityConfig>) {
    this.config = {
      maxQueriesPerSecond: 20,
      maxBackgroundBandwidthKbps: 5,
      enforceBep42: true,
      ...(config || {}),
    };
  }

  /**
   * Rule 12: Pin explicit swarm infoHash. DHT discovery is restricted to pinned swarms.
   */
  pinSwarmInfoHash(infoHash: string) {
    this.allowedInfoHashes.add(infoHash.toLowerCase());
  }

  unpinSwarmInfoHash(infoHash: string) {
    this.allowedInfoHashes.delete(infoHash.toLowerCase());
  }

  isSwarmPinned(infoHash: string): boolean {
    return this.allowedInfoHashes.has(infoHash.toLowerCase());
  }

  /**
   * Rule 14: Rate limits incoming/outgoing DHT queries to keep background bandwidth < 5KB/s.
   */
  checkQueryRateLimit(): boolean {
    const now = Date.now();
    if (now - this.lastResetTime >= 1000) {
      this.queryCounter = 0;
      this.lastResetTime = now;
    }

    if (this.queryCounter >= this.config.maxQueriesPerSecond) {
      return false; // Rate limit exceeded
    }

    this.queryCounter++;
    return true;
  }

  /**
   * BEP 42: Validates whether a remote DHT Node ID complies with IP-derived security hash.
   */
  verifyBep42NodeId(ip: string, nodeIdHex: string, r: number = 0): boolean {
    if (!this.config.enforceBep42) return true;
    if (nodeIdHex.length !== 40) return false;

    try {
      // BEP 42 IP-based CRC32/SHA-1 generation verification
      const ipBytes = ip.split('.').map(Number);
      if (ipBytes.length !== 4) return false;

      const mask = [0x03, 0x0f, 0x3f, 0xff];
      const maskedIp = Buffer.from([
        (ipBytes[0] & mask[0]) | (r << 5),
        ipBytes[1] & mask[1],
        ipBytes[2] & mask[2],
        ipBytes[3] & mask[3],
      ]);

      const expectedLeadingBytes = crypto.createHash('sha1').update(maskedIp).digest().slice(0, 3);
      const actualLeadingBytes = Buffer.from(nodeIdHex.slice(0, 6), 'hex');

      // The top 21 bits of the node ID must match
      return (
        (expectedLeadingBytes[0] === actualLeadingBytes[0]) &&
        (expectedLeadingBytes[1] === actualLeadingBytes[1]) &&
        ((expectedLeadingBytes[2] & 0xf8) === (actualLeadingBytes[2] & 0xf8))
      );
    } catch {
      return false;
    }
  }

  /**
   * Generates a BEP 42 compliant Node ID for the local client.
   */
  generateLocalBep42NodeId(ip: string, r: number = 0): string {
    const ipBytes = ip.split('.').map(Number);
    const mask = [0x03, 0x0f, 0x3f, 0xff];
    const maskedIp = Buffer.from([
      (ipBytes[0] & mask[0]) | (r << 5),
      ipBytes[1] & mask[1],
      ipBytes[2] & mask[2],
      ipBytes[3] & mask[3],
    ]);

    const sha1 = crypto.createHash('sha1').update(maskedIp).digest();
    const randomSuffix = crypto.randomBytes(17);

    const nodeId = Buffer.concat([sha1.slice(0, 3), randomSuffix]);
    return nodeId.toString('hex');
  }
}

export const dhtHardeningManager = new DhtHardeningManager();
