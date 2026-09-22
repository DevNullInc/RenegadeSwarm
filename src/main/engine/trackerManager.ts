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

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import dgram from 'dgram';
import crypto from 'crypto';
import { app } from 'electron';
import EventEmitter from 'events';
import { dhtHardeningManager } from './dhtHardening';
import { debugLogManager } from '../telemetry/debugLogManager';

export const TRACKERS_ALL_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/refs/heads/master/trackers_all.txt';
export const BLACKLIST_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/refs/heads/master/blacklist.txt';
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_TRACKERS = 100; // Ceiling to prevent unbounded memory/announce tier growth

/**
 * Robust zero-dependency Bencode Decoder for BitTorrent metainfo and HTTP tracker responses.
 */
export function decodeBencode(buf: Buffer): any {
  let pos = 0;

  function decode(): any {
    if (pos >= buf.length) throw new Error('Unexpected EOF in bencode stream');
    const byte = buf[pos];

    // Integer: i<num>e
    if (byte === 0x69) {
      pos++;
      const end = buf.indexOf(0x65, pos);
      if (end === -1) throw new Error('Unterminated integer in bencode');
      const numStr = buf.toString('ascii', pos, end);
      pos = end + 1;
      return parseInt(numStr, 10);
    }

    // List: l<items>e
    if (byte === 0x6c) {
      pos++;
      const list: any[] = [];
      while (pos < buf.length && buf[pos] !== 0x65) {
        list.push(decode());
      }
      pos++; // consume 'e'
      return list;
    }

    // Dictionary: d<key><val>...e
    if (byte === 0x64) {
      pos++;
      const dict: Record<string, any> = {};
      while (pos < buf.length && buf[pos] !== 0x65) {
        const key = decodeString();
        dict[key] = decode();
      }
      pos++; // consume 'e'
      return dict;
    }

    // Byte string: <len>:<content>
    if (byte >= 0x30 && byte <= 0x39) {
      const colon = buf.indexOf(0x3a, pos);
      if (colon === -1) throw new Error('Unterminated string length in bencode');
      const len = parseInt(buf.toString('ascii', pos, colon), 10);
      pos = colon + 1;
      const data = buf.subarray(pos, pos + len);
      pos += len;
      return data;
    }

    throw new Error(`Unexpected bencode token: 0x${byte.toString(16)} at offset ${pos}`);
  }

  function decodeString(): string {
    const res = decode();
    if (Buffer.isBuffer(res)) return res.toString('utf8');
    return String(res);
  }

  return decode();
}

export interface TrackerSyncMetadata {
  lastSyncTime: number;
  trackersCount: number;
  blacklistCount: number;
  version: string;
}

export interface TrackerStats {
  trackersCount: number;
  blacklistCount: number;
  lastSyncTime: number;
  isSyncing: boolean;
}

export const DEFAULT_BUILTIN_TRACKERS: string[] = [
  'udp://tracker.opentrackr.org:1337/announce',
  'wss://tracker.webtorrent.dev',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.datacenter.tools:6969/announce',
];

export class TrackerManager extends EventEmitter {
  private customStorageDir?: string;
  private activeTrackers: string[] = [...DEFAULT_BUILTIN_TRACKERS];
  private blacklist: Set<string> = new Set();
  private lastSyncTime: number = 0;
  private isSyncing: boolean = false;
  private syncTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private sessionPeerId: Buffer;

  constructor(customStorageDir?: string) {
    super();
    this.customStorageDir = customStorageDir;
    // Generate persistent 20-byte session peer ID: '-RS0300-' + 12 random hex chars
    this.sessionPeerId = Buffer.concat([
      Buffer.from('-RS0300-', 'utf8'),
      Buffer.from(crypto.randomBytes(6).toString('hex'), 'ascii'),
    ]);
    this.loadFromDiskSync();
  }

  public getPeerId(): string {
    return this.sessionPeerId.toString('utf8');
  }

  public getPeerIdBuffer(): Buffer {
    return Buffer.from(this.sessionPeerId);
  }

  public getStorageDir(): string {
    if (this.customStorageDir) {
      return this.customStorageDir;
    }
    try {
      if (app && typeof app.getPath === 'function') {
        const userData = app.getPath('userData');
        return path.join(userData, 'trackers');
      }
    } catch {
      // Fallback for tests / headless execution
    }
    return path.join(process.cwd(), '.renegadeswarm_security', 'trackers');
  }

  public async init(options: { autoSync?: boolean } = {}): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Ensure local tracker directory exists
    const storageDir = this.getStorageDir();
    try {
      await fs.promises.mkdir(storageDir, { recursive: true });
    } catch (e) {
      console.warn('[TrackerManager] Could not create storage directory:', e);
    }

    // 2. Load cached trackers and blacklist from local disk
    await this.loadFromDiskAsync();

    // 3. Check if 24 hours have elapsed since last sync, or if cache is empty
    const now = Date.now();
    const shouldSync = (options.autoSync ?? true) && (this.lastSyncTime === 0 || now - this.lastSyncTime >= SYNC_INTERVAL_MS);

    if (shouldSync) {
      // Non-blocking background sync on startup
      this.syncTrackers().catch((err) => {
        console.warn('[TrackerManager] Startup background sync encountered error:', err.message);
      });
    }

    // 4. Setup recurring 24-hour sync timer
    this.syncTimer = setInterval(() => {
      this.syncTrackers().catch((err) => {
        console.warn('[TrackerManager] Scheduled 24-hour sync encountered error:', err.message);
      });
    }, SYNC_INTERVAL_MS);
  }

  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.isInitialized = false;
  }

  public getStats(): TrackerStats {
    return {
      trackersCount: this.activeTrackers.length,
      blacklistCount: this.blacklist.size,
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }

  public getAllTrackers(): string[] {
    return [...this.activeTrackers];
  }

  public getBlacklist(): string[] {
    return Array.from(this.blacklist.values());
  }

  /**
   * Validates whether a tracker URL has a supported protocol and well-formed host.
   */
  public isValidTracker(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.length < 10 || trimmed.length > 512) return false;

    const isSupportedScheme =
      trimmed.startsWith('udp://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('wss://');

    if (!isSupportedScheme) return false;

    // Check basic URL format regex
    return /^[a-z0-9+-.]+:\/\/[^/:]+(:\d+)?(\/.*)?$/i.test(trimmed);
  }

  /**
   * Returns tiered announce list format (string[][]) for torrent manifests and magnet links.
   */
  public getAnnounceList(tierSize = 3): string[][] {
    if (this.activeTrackers.length === 0) {
      return DEFAULT_BUILTIN_TRACKERS.map((t) => [t]);
    }

    const tiers: string[][] = [];
    for (let i = 0; i < this.activeTrackers.length; i += tierSize) {
      tiers.push(this.activeTrackers.slice(i, i + tierSize));
    }
    return tiers;
  }

  /**
   * Checks if a tracker URL or hostname is blacklisted.
   */
  public isTrackerBlacklisted(trackerUrl: string): boolean {
    if (!trackerUrl) return false;
    const cleanUrl = trackerUrl.trim().toLowerCase();

    if (this.blacklist.has(cleanUrl)) return true;

    try {
      const noSlash = cleanUrl.replace(/\/+$/, '');
      if (this.blacklist.has(noSlash)) return true;

      const match = cleanUrl.match(/^[a-z0-9+-.]+:\/\/([^/]+)/i);
      if (match && match[1]) {
        const hostPort = match[1].toLowerCase();
        if (this.blacklist.has(hostPort)) return true;

        const hostOnly = hostPort.split(':')[0];
        if (this.blacklist.has(hostOnly)) return true;

        // Check if host matches any blacklisted domain suffix (e.g. sub.bad-tracker.com -> bad-tracker.com)
        for (const blItem of this.blacklist) {
          if (hostOnly === blItem || hostOnly.endsWith('.' + blItem) || hostPort === blItem) {
            return true;
          }
        }
      }
    } catch {
      // Invalid URL format
    }

    return false;
  }

  /**
   * Filters an array of trackers, stripping blacklisted entries and invalid lines.
   */
  public filterTrackers(trackers: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const raw of trackers) {
      const trimmed = (raw || '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (!this.isValidTracker(trimmed)) continue;

      const lower = trimmed.toLowerCase();
      if (!this.isTrackerBlacklisted(trimmed) && !seen.has(lower)) {
        seen.add(lower);
        result.push(trimmed);
      }
    }

    // Apply MAX_TRACKERS ceiling to prevent unbounded announce tiers
    if (result.length > MAX_TRACKERS) {
      result.length = MAX_TRACKERS;
    }

    return result;
  }

  /**
   * Pin explicit swarm infoHash and ensure DHT hardening registration.
   */
  public registerSwarmInfoHash(infoHash: string): void {
    dhtHardeningManager.pinSwarmInfoHash(infoHash);
  }

  /**
   * Performs BEP 15 UDP Tracker Announce protocol flow (Connect -> Announce).
   */
  public async udpAnnounce(
    trackerUrl: string,
    infoHashBuf: Buffer,
    event: 'started' | 'stopped' | 'completed' | 'update' = 'update',
    stats: { port?: number; uploaded?: number; downloaded?: number; left?: number; peerId?: Buffer } = {}
  ): Promise<{ interval?: number; seeders?: number; leechers?: number; peers?: Array<{ ip: string; port: number }> }> {
    return new Promise((resolve, reject) => {
      let socket: dgram.Socket | null = null;
      let isClosed = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          if (timeoutId) clearTimeout(timeoutId);
          if (socket) {
            try { socket.close(); } catch {}
            socket = null;
          }
        }
      };

      try {
        const parsed = new URL(trackerUrl);
        const host = parsed.hostname;
        const port = parseInt(parsed.port, 10) || 1337;
        const peerId = stats.peerId || this.sessionPeerId;

        socket = dgram.createSocket('udp4');

        timeoutId = setTimeout(() => {
          cleanup();
          debugLogManager.logWarn('TRACKER', `[UDP] Tracker timeout (5000ms) connecting to ${trackerUrl}`);
          reject(new Error(`UDP tracker timeout for ${trackerUrl}`));
        }, 5000);

        // Phase 1: Connect Request (16 bytes)
        const connectTransactionId = crypto.randomBytes(4).readUInt32BE(0);
        const connectReq = Buffer.allocUnsafe(16);
        connectReq.writeBigInt64BE(0x41727101980n, 0); // protocol_id
        connectReq.writeUInt32BE(0, 8); // action 0 = connect
        connectReq.writeUInt32BE(connectTransactionId, 12);

        let connectionId: bigint | null = null;
        debugLogManager.logDebug('TRACKER', `[UDP] Connect request sent -> ${host}:${port} (txId: 0x${connectTransactionId.toString(16)})`);

        socket.on('message', (msg: Buffer) => {
          try {
            if (msg.length < 8) return;
            const action = msg.readUInt32BE(0);
            const txId = msg.readUInt32BE(4);

            // Error response (action 3)
            if (action === 3) {
              const errMsg = msg.subarray(8).toString('utf8');
              cleanup();
              debugLogManager.logWarn('TRACKER', `[UDP] Tracker error response from ${host}:${port}: ${errMsg}`);
              return reject(new Error(`UDP tracker error: ${errMsg}`));
            }

            // Connect response (action 0)
            if (action === 0 && txId === connectTransactionId && connectionId === null) {
              if (msg.length < 16) return;
              connectionId = msg.readBigInt64BE(8);
              debugLogManager.logDebug('TRACKER', `[UDP] Connect established <- ${host}:${port} (connId: 0x${connectionId.toString(16)}). Sending announce request...`);

              // Phase 2: Send Announce Request (98 bytes)
              const announceTxId = crypto.randomBytes(4).readUInt32BE(0);
              const announceReq = Buffer.alloc(98);
              announceReq.writeBigInt64BE(connectionId, 0);
              announceReq.writeUInt32BE(1, 8); // action 1 = announce
              announceReq.writeUInt32BE(announceTxId, 12);
              infoHashBuf.copy(announceReq, 16, 0, 20);
              peerId.copy(announceReq, 36, 0, 20);
              announceReq.writeBigInt64BE(BigInt(stats.downloaded || 0), 56);
              announceReq.writeBigInt64BE(BigInt(stats.left !== undefined ? stats.left : 0), 64);
              announceReq.writeBigInt64BE(BigInt(stats.uploaded || 0), 72);
              const eventCode = event === 'completed' ? 1 : event === 'started' ? 2 : event === 'stopped' ? 3 : 0;
              announceReq.writeUInt32BE(eventCode, 80);
              announceReq.writeUInt32BE(0, 84); // IP address = 0 (default)
              announceReq.writeUInt32BE(crypto.randomBytes(4).readUInt32BE(0), 88); // key
              announceReq.writeInt32BE(-1, 92); // num_want = -1 (default)
              announceReq.writeUInt16BE(stats.port || 6881, 96);

              if (!socket) return;
              socket.removeAllListeners('message');

              socket.on('message', (annMsg: Buffer) => {
                if (annMsg.length < 8) return;
                const annAction = annMsg.readUInt32BE(0);
                const annTx = annMsg.readUInt32BE(4);

                if (annAction === 3) {
                  const annErrMsg = annMsg.subarray(8).toString('utf8');
                  cleanup();
                  debugLogManager.logWarn('TRACKER', `[UDP] Tracker rejected announce from ${host}:${port}: ${annErrMsg}`);
                  return reject(new Error(`UDP announce error: ${annErrMsg}`));
                }

                if (annAction === 1 && annTx === announceTxId) {
                  cleanup();
                  const interval = annMsg.length >= 12 ? annMsg.readUInt32BE(8) : 300;
                  const leechers = annMsg.length >= 16 ? annMsg.readUInt32BE(12) : 0;
                  const seeders = annMsg.length >= 20 ? annMsg.readUInt32BE(16) : 0;

                  const peers: Array<{ ip: string; port: number }> = [];
                  for (let offset = 20; offset + 6 <= annMsg.length; offset += 6) {
                    const ip = `${annMsg[offset]}.${annMsg[offset + 1]}.${annMsg[offset + 2]}.${annMsg[offset + 3]}`;
                    const p = annMsg.readUInt16BE(offset + 4);
                    peers.push({ ip, port: p });
                  }

                  debugLogManager.logInfo('TRACKER', `[UDP] Announce response from ${trackerUrl} -> Seeders: ${seeders}, Leechers: ${leechers}, Peers: ${peers.length}, Interval: ${interval}s`, {
                    trackerUrl,
                    seeders,
                    leechers,
                    peersCount: peers.length,
                    interval,
                    peers: peers.slice(0, 10),
                  });

                  return resolve({ interval, seeders, leechers, peers });
                }
              });

              debugLogManager.logDebug('TRACKER', `[UDP] Dispatched announce request to ${host}:${port} [event: ${event}, hash: ${infoHashBuf.toString('hex').slice(0, 16)}...]`);
              socket.send(announceReq, port, host);
            }
          } catch (err: any) {
            cleanup();
            debugLogManager.logWarn('TRACKER', `[UDP] Exception processing packet from ${trackerUrl}: ${err.message}`);
            reject(err);
          }
        });

        socket.on('error', (err) => {
          cleanup();
          debugLogManager.logWarn('TRACKER', `[UDP] Socket error on ${trackerUrl}: ${err.message}`);
          reject(err);
        });

        socket.send(connectReq, port, host);
      } catch (err: any) {
        cleanup();
        debugLogManager.logWarn('TRACKER', `[UDP] Failed to initialize UDP socket for ${trackerUrl}: ${err.message}`);
        reject(err);
      }
    });
  }

  /**
   * Performs BEP 3 / BEP 48 HTTP/HTTPS Tracker Announce with binary bencode response decoding.
   */
  public async httpAnnounce(
    trackerUrl: string,
    infoHashBuf: Buffer,
    event: 'started' | 'stopped' | 'completed' | 'update' = 'update',
    stats: { port?: number; uploaded?: number; downloaded?: number; left?: number; peerId?: Buffer } = {}
  ): Promise<{ interval?: number; seeders?: number; leechers?: number; peers?: Array<{ ip: string; port: number }> }> {
    let encodedInfoHash = '';
    for (let i = 0; i < 20; i++) {
      encodedInfoHash += '%' + infoHashBuf[i].toString(16).padStart(2, '0');
    }

    const peerId = stats.peerId || this.sessionPeerId;
    let encodedPeerId = '';
    for (let i = 0; i < 20; i++) {
      encodedPeerId += '%' + peerId[i].toString(16).padStart(2, '0');
    }

    const port = stats.port || 6881;
    const uploaded = stats.uploaded || 0;
    const downloaded = stats.downloaded || 0;
    const left = stats.left !== undefined ? stats.left : 0;
    const delimiter = trackerUrl.includes('?') ? '&' : '?';
    const eventParam = event !== 'update' ? `&event=${event}` : '';
    const fullUrl = `${trackerUrl}${delimiter}info_hash=${encodedInfoHash}&peer_id=${encodedPeerId}&port=${port}&uploaded=${uploaded}&downloaded=${downloaded}&left=${left}&compact=1&numwant=50${eventParam}`;

    debugLogManager.logDebug('TRACKER', `[HTTP] Dispatching announce GET -> ${trackerUrl} [event: ${event}, hash: ${infoHashBuf.toString('hex').slice(0, 16)}...]`);

    try {
      const binaryData = await this.fetchBinary(fullUrl, 5000);
      const decoded = decodeBencode(binaryData);

      if (decoded && decoded['failure reason']) {
        const failReason = Buffer.isBuffer(decoded['failure reason'])
          ? decoded['failure reason'].toString('utf8')
          : String(decoded['failure reason']);
        debugLogManager.logWarn('TRACKER', `[HTTP] Tracker returned failure reason from ${trackerUrl}: ${failReason}`);
        throw new Error(`HTTP tracker failure: ${failReason}`);
      }

      const interval = typeof decoded?.interval === 'number' ? decoded.interval : 300;
      const seeders = typeof decoded?.complete === 'number' ? decoded.complete : 0;
      const leechers = typeof decoded?.incomplete === 'number' ? decoded.incomplete : 0;

      const peers: Array<{ ip: string; port: number }> = [];
      if (Buffer.isBuffer(decoded?.peers)) {
        const pBuf = decoded.peers;
        for (let offset = 0; offset + 6 <= pBuf.length; offset += 6) {
          const ip = `${pBuf[offset]}.${pBuf[offset + 1]}.${pBuf[offset + 2]}.${pBuf[offset + 3]}`;
          const p = pBuf.readUInt16BE(offset + 4);
          peers.push({ ip, port: p });
        }
      } else if (Array.isArray(decoded?.peers)) {
        for (const p of decoded.peers) {
          if (p && p.ip && p.port) {
            const ip = Buffer.isBuffer(p.ip) ? p.ip.toString('utf8') : String(p.ip);
            peers.push({ ip, port: Number(p.port) });
          }
        }
      }

      debugLogManager.logInfo('TRACKER', `[HTTP] Announce response from ${trackerUrl} -> Seeders: ${seeders}, Leechers: ${leechers}, Peers: ${peers.length}, Interval: ${interval}s`, {
        trackerUrl,
        seeders,
        leechers,
        peersCount: peers.length,
        interval,
        peers: peers.slice(0, 10),
      });

      return { interval, seeders, leechers, peers };
    } catch (err: any) {
      debugLogManager.logWarn('TRACKER', `[HTTP] Announce failed on ${trackerUrl}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Broadcasts announce messages to all active UDP & HTTP BitTorrent trackers.
   */
  public async announceTorrent(
    infoHash: string,
    event: 'started' | 'stopped' | 'completed' | 'update' = 'update',
    stats: { port?: number; uploaded?: number; downloaded?: number; left?: number; peerId?: string } = {}
  ): Promise<{ attempted: number; succeeded: number; peersDiscovered: Array<{ ip: string; port: number }> }> {
    const rawHashHex = (infoHash || '').replace(/[^a-fA-F0-9]/g, '');
    if (rawHashHex.length !== 40) {
      debugLogManager.logWarn('TRACKER', `Announce rejected: invalid 40-hex infoHash "${infoHash}"`);
      return { attempted: 0, succeeded: 0, peersDiscovered: [] };
    }

    const hashBuf = Buffer.from(rawHashHex, 'hex');
    const peerIdBuf = stats.peerId ? Buffer.from(stats.peerId, 'utf8').subarray(0, 20) : this.sessionPeerId;

    // Filter to valid real BitTorrent trackers (UDP & HTTP/HTTPS, excluding observers)
    const candidateTrackers = this.activeTrackers.filter((t) => {
      const lower = t.toLowerCase();
      if (lower.includes('swarm.renegadeinc.net')) return false; // Observer, not tracker
      return lower.startsWith('udp://') || lower.startsWith('http://') || lower.startsWith('https://');
    });

    // Announce across top candidate trackers (capped to 20 to prevent socket exhaustion)
    const targetTrackers = candidateTrackers.slice(0, 20);

    debugLogManager.logInfo('TRACKER', `Starting ${event} announce for swarm ${rawHashHex.slice(0, 16)}... across ${targetTrackers.length} candidate trackers`, {
      infoHash: rawHashHex,
      event,
      targetTrackersCount: targetTrackers.length,
      sampleTargets: targetTrackers.slice(0, 5),
    });

    let succeeded = 0;
    let attempted = 0;
    const peersDiscovered: Array<{ ip: string; port: number }> = [];

    const promises = targetTrackers.map(async (trackerUrl) => {
      attempted++;
      try {
        let result: { peers?: Array<{ ip: string; port: number }> } | null = null;
        if (trackerUrl.startsWith('udp://')) {
          result = await this.udpAnnounce(trackerUrl, hashBuf, event, { ...stats, peerId: peerIdBuf });
        } else if (trackerUrl.startsWith('http://') || trackerUrl.startsWith('https://')) {
          result = await this.httpAnnounce(trackerUrl, hashBuf, event, { ...stats, peerId: peerIdBuf });
        }

        if (result) {
          succeeded++;
          if (result.peers && result.peers.length > 0) {
            for (const p of result.peers) {
              if (!peersDiscovered.some((x) => x.ip === p.ip && x.port === p.port)) {
                peersDiscovered.push(p);
              }
            }
          }
        }
      } catch {
        // Individual tracker timeout or errors are normal in P2P mesh
      }
    });

    await Promise.allSettled(promises);
    debugLogManager.logInfo('TRACKER', `Announce batch completed for swarm ${rawHashHex.slice(0, 16)}... -> ${succeeded}/${attempted} trackers responded, ${peersDiscovered.length} total peers discovered`, {
      infoHash: rawHashHex,
      event,
      attempted,
      succeeded,
      peersDiscoveredCount: peersDiscovered.length,
      samplePeers: peersDiscovered.slice(0, 5),
    });

    this.emit('tracker:announced', { infoHash, event, attempted, succeeded, peersCount: peersDiscovered.length });
    return { attempted, succeeded, peersDiscovered };
  }

  /**
   * Fetches raw binary Buffer from an HTTP/HTTPS endpoint with stream cap.
   */
  public fetchBinary(url: string, timeoutMs: number = 5000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }

        const chunks: Buffer[] = [];
        let totalLen = 0;
        res.on('data', (chunk) => {
          chunks.push(chunk);
          totalLen += chunk.length;
          if (totalLen > 2 * 1024 * 1024) {
            req.destroy(new Error('Response exceeded 2MB stream cap'));
          }
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout fetching ${url}`));
      });

      req.on('error', (err) => reject(err));
    });
  }

  /**
   * Performs download of blacklist and trackers_all lists from authoritative repository.
   */
  public async syncTrackers(force = false): Promise<{ success: boolean; trackersCount: number; blacklistCount: number }> {
    if (this.isSyncing && !force) {
      return { success: false, trackersCount: this.activeTrackers.length, blacklistCount: this.blacklist.size };
    }

    this.isSyncing = true;
    debugLogManager.logInfo('TRACKER', `Starting tracker list synchronization from authoritative repository...`);
    this.emit('sync:started');

    try {
      // 1. Fetch blacklist first so we can filter trackers during processing
      const blacklistText = await this.fetchTextFile(BLACKLIST_URL, 10000);
      const rawBlacklist = this.parseList(blacklistText);

      // 2. Fetch all public trackers
      const trackersText = await this.fetchTextFile(TRACKERS_ALL_URL, 10000);
      const rawTrackers = this.parseList(trackersText);

      // 3. Update memory structures
      this.blacklist = new Set();
      for (const item of rawBlacklist) {
        for (const bl of this.parseBlacklistItem(item)) {
          this.blacklist.add(bl);
        }
      }

      const filtered = this.filterTrackers(rawTrackers);

      if (filtered.length > 0) {
        this.activeTrackers = filtered;
      } else {
        // Fallback to built-in if remote returned empty list
        this.activeTrackers = this.filterTrackers(DEFAULT_BUILTIN_TRACKERS);
      }

      this.lastSyncTime = Date.now();

      // 4. Persist to disk asynchronously
      await this.saveToDiskAsync(trackersText, blacklistText);

      debugLogManager.logInfo('TRACKER', `Tracker synchronization complete: ${this.activeTrackers.length} active trackers loaded, ${this.blacklist.size} blacklisted hosts`, {
        trackersCount: this.activeTrackers.length,
        blacklistCount: this.blacklist.size,
      });

      this.emit('sync:completed', this.getStats());
      return {
        success: true,
        trackersCount: this.activeTrackers.length,
        blacklistCount: this.blacklist.size,
      };
    } catch (err: any) {
      debugLogManager.logWarn('TRACKER', `Tracker sync encountered error: ${err.message}. Retaining ${this.activeTrackers.length} cached trackers`, { error: err.message });
      console.warn('[TrackerManager] Sync failed, maintaining cached list:', err.message);
      this.emit('sync:failed', { error: err.message });
      return {
        success: false,
        trackersCount: this.activeTrackers.length,
        blacklistCount: this.blacklist.size,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private parseList(content: string): string[] {
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));
  }

  private parseBlacklistItem(item: string): string[] {
    const clean = item.trim().toLowerCase();
    if (!clean || clean.startsWith('#')) return [];

    const items = [clean];
    const match = clean.match(/^[a-z0-9+-.]+:\/\/([^/]+)/i);
    if (match && match[1]) {
      const hostPort = match[1].toLowerCase();
      items.push(hostPort);
      const hostOnly = hostPort.split(':')[0];
      items.push(hostOnly);
    }
    return items;
  }

  public loadFromDiskSync(): void {
    const storageDir = this.getStorageDir();
    const metaPath = path.join(storageDir, 'tracker_sync.json');
    const blacklistPath = path.join(storageDir, 'blacklist.txt');
    const trackersPath = path.join(storageDir, 'trackers_all.txt');

    try {
      if (fs.existsSync(metaPath)) {
        const meta: TrackerSyncMetadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        this.lastSyncTime = meta.lastSyncTime || 0;
      }

      if (fs.existsSync(blacklistPath)) {
        const blContent = fs.readFileSync(blacklistPath, 'utf8');
        const blItems = this.parseList(blContent);
        this.blacklist = new Set();
        for (const item of blItems) {
          for (const bl of this.parseBlacklistItem(item)) {
            this.blacklist.add(bl);
          }
        }
      }

      if (fs.existsSync(trackersPath)) {
        const trContent = fs.readFileSync(trackersPath, 'utf8');
        const trItems = this.parseList(trContent);
        const filtered = this.filterTrackers(trItems);
        if (filtered.length > 0) {
          this.activeTrackers = filtered;
        }
      }
    } catch (e) {
      console.warn('[TrackerManager] Error reading cached tracker data:', e);
    }
  }

  public async loadFromDiskAsync(): Promise<void> {
    const storageDir = this.getStorageDir();
    const metaPath = path.join(storageDir, 'tracker_sync.json');
    const blacklistPath = path.join(storageDir, 'blacklist.txt');
    const trackersPath = path.join(storageDir, 'trackers_all.txt');

    try {
      if (fs.existsSync(metaPath)) {
        const raw = await fs.promises.readFile(metaPath, 'utf8');
        const meta: TrackerSyncMetadata = JSON.parse(raw);
        this.lastSyncTime = meta.lastSyncTime || 0;
      }

      if (fs.existsSync(blacklistPath)) {
        const blContent = await fs.promises.readFile(blacklistPath, 'utf8');
        const blItems = this.parseList(blContent);
        this.blacklist = new Set();
        for (const item of blItems) {
          for (const bl of this.parseBlacklistItem(item)) {
            this.blacklist.add(bl);
          }
        }
      }

      if (fs.existsSync(trackersPath)) {
        const trContent = await fs.promises.readFile(trackersPath, 'utf8');
        const trItems = this.parseList(trContent);
        const filtered = this.filterTrackers(trItems);
        if (filtered.length > 0) {
          this.activeTrackers = filtered;
        }
      }
    } catch (e) {
      console.warn('[TrackerManager] Error reading cached tracker data asynchronously:', e);
    }
  }

  public async saveToDiskAsync(trackersRaw: string, blacklistRaw: string): Promise<void> {
    const storageDir = this.getStorageDir();
    try {
      await fs.promises.mkdir(storageDir, { recursive: true });
      await fs.promises.writeFile(path.join(storageDir, 'trackers_all.txt'), trackersRaw, 'utf8');
      await fs.promises.writeFile(path.join(storageDir, 'blacklist.txt'), blacklistRaw, 'utf8');

      const meta: TrackerSyncMetadata = {
        lastSyncTime: this.lastSyncTime,
        trackersCount: this.activeTrackers.length,
        blacklistCount: this.blacklist.size,
        version: '1.0.0',
      };
      await fs.promises.writeFile(path.join(storageDir, 'tracker_sync.json'), JSON.stringify(meta, null, 2), 'utf8');
    } catch (e) {
      console.warn('[TrackerManager] Failed to persist tracker files to disk:', e);
    }
  }

  private fetchTextFile(url: string, timeoutMs: number = 10000): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 5 * 1024 * 1024) {
            req.destroy(new Error('Response exceeded 5MB stream cap'));
          }
        });
        res.on('end', () => resolve(data));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout fetching ${url}`));
      });

      req.on('error', (err) => reject(err));
    });
  }
}

export const trackerManager = new TrackerManager();
