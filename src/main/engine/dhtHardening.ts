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
import net from 'net';

export interface DhtSecurityConfig {
  maxQueriesPerSecond: number; // Max queries allowed per second
  maxBackgroundBandwidthKbps: number; // Max 5KB/s maintenance bandwidth (Rule 14)
  enforceBep42: boolean;
}

/**
 * Computes standard 32-bit Castagnoli CRC32C for BEP 42 IP validation.
 */
export function crc32c(data: Buffer): number {
  const POLY = 0x82f63b78; // Castagnoli reversed polynomial
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? POLY : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Converts IPv4 or IPv6 address string into BEP 42 masked IP buffer.
 */
export function ipToBuffer(ip: string, r: number = 0): Buffer | null {
  const cleanIp = ip.trim();
  const ipType = net.isIP(cleanIp);

  if (ipType === 4) {
    const ipBytes = cleanIp.split('.').map(Number);
    if (ipBytes.length !== 4) return null;

    const mask = [0x03, 0x0f, 0x3f, 0xff];
    return Buffer.from([
      (ipBytes[0] & mask[0]) | ((r & 0x07) << 5),
      ipBytes[1] & mask[1],
      ipBytes[2] & mask[2],
      ipBytes[3] & mask[3],
    ]);
  } else if (ipType === 6) {
    // Parse IPv6 hex groups
    try {
      const parts = cleanIp.split(':');
      let expanded: number[] = [];
      let doubleColonIndex = parts.indexOf('');

      if (doubleColonIndex !== -1) {
        const head = parts.slice(0, doubleColonIndex).filter(Boolean);
        const tail = parts.slice(doubleColonIndex + 1).filter(Boolean);
        const missing = 8 - (head.length + tail.length);
        const zeros = new Array(missing).fill('0');
        expanded = [...head, ...zeros, ...tail].map((h) => parseInt(h || '0', 16));
      } else {
        expanded = parts.map((h) => parseInt(h, 16));
      }

      const raw16 = Buffer.alloc(16);
      for (let i = 0; i < 8; i++) {
        raw16.writeUInt16BE(expanded[i] || 0, i * 2);
      }

      // BEP 42 IPv6 mask uses first 8 bytes
      const maskV6 = [0x01, 0x03, 0x07, 0x0f, 0x1f, 0x3f, 0x7f, 0xff];
      const masked = Buffer.alloc(8);
      masked[0] = (raw16[0] & maskV6[0]) | ((r & 0x07) << 5);
      for (let i = 1; i < 8; i++) {
        masked[i] = raw16[i] & maskV6[i];
      }
      return masked;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * BEP 42: Validates whether a remote DHT Node ID complies with IP-derived security hash (Castagnoli CRC32C).
 */
export function verifyBEP42NodeId(nodeId: Buffer | string, ip: string, r: number = 0): boolean {
  try {
    const nodeBuf = typeof nodeId === 'string' ? Buffer.from(nodeId, 'hex') : nodeId;
    if (nodeBuf.length !== 20) return false;

    const maskedIp = ipToBuffer(ip, r);
    if (!maskedIp) return false;

    const crc = crc32c(maskedIp);
    const expectedPrefix = (crc >>> 27) & 0x1f; // Top 5 bits
    const actualPrefix = nodeBuf[0] >>> 3; // Top 5 bits of first byte

    return actualPrefix === expectedPrefix;
  } catch {
    return false;
  }
}

export class DhtHardeningManager {
  private allowedInfoHashes: Set<string> = new Set();
  private queryCounter: number = 0;
  private bytesThisSecond: number = 0;
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
   * Rule 14: Rate limits incoming/outgoing DHT queries and enforces < 5KB/s maintenance bandwidth.
   */
  checkQueryRateLimit(estimatedPacketBytes: number = 200): boolean {
    const now = Date.now();
    if (now - this.lastResetTime >= 1000) {
      this.queryCounter = 0;
      this.bytesThisSecond = 0;
      this.lastResetTime = now;
    }

    if (this.queryCounter >= this.config.maxQueriesPerSecond) {
      return false; // Query rate limit exceeded
    }

    const maxBytes = this.config.maxBackgroundBandwidthKbps * 1024;
    if (this.bytesThisSecond + estimatedPacketBytes > maxBytes) {
      return false; // Background bandwidth limit exceeded (<5KB/s)
    }

    this.queryCounter++;
    this.bytesThisSecond += estimatedPacketBytes;
    return true;
  }

  /**
   * Enforces specific byte bandwidth limit against configured budget.
   */
  checkBandwidthLimit(bytes: number): boolean {
    const now = Date.now();
    if (now - this.lastResetTime >= 1000) {
      this.queryCounter = 0;
      this.bytesThisSecond = 0;
      this.lastResetTime = now;
    }

    const maxBytes = this.config.maxBackgroundBandwidthKbps * 1024;
    if (this.bytesThisSecond + bytes > maxBytes) {
      return false;
    }

    this.bytesThisSecond += bytes;
    return true;
  }

  /**
   * BEP 42: Validates whether a remote DHT Node ID complies with IP-derived security hash.
   */
  verifyBep42NodeId(ip: string, nodeIdHex: string, r: number = 0): boolean {
    if (!this.config.enforceBep42) return true;
    return verifyBEP42NodeId(nodeIdHex, ip, r);
  }

  /**
   * Generates a BEP 42 compliant Node ID for the local client using Castagnoli CRC32C.
   */
  generateLocalBep42NodeId(ip: string, r: number = 0): string {
    const maskedIp = ipToBuffer(ip, r);
    if (!maskedIp) {
      return crypto.randomBytes(20).toString('hex');
    }

    const crc = crc32c(maskedIp);
    const top5Bits = (crc >>> 27) & 0x1f;

    const randomBytes = crypto.randomBytes(20);
    // Set top 5 bits of first byte to match CRC32C prefix
    randomBytes[0] = (top5Bits << 3) | (randomBytes[0] & 0x07);

    return randomBytes.toString('hex');
  }
}

export const dhtHardeningManager = new DhtHardeningManager();
