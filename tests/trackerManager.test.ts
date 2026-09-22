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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  TrackerManager,
  DEFAULT_BUILTIN_TRACKERS,
  SYNC_INTERVAL_MS,
  MAX_TRACKERS,
} from '../src/main/engine/trackerManager';

describe('Tracker & Blacklist Manager (24-Hour Automated Synchronization)', () => {
  let tempDir: string;
  let manager: TrackerManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-trackers-test-'));
    manager = new TrackerManager(tempDir);
  });

  afterEach(() => {
    manager.stop();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize with default built-in trackers and return tiered announce list', async () => {
    await manager.init({ autoSync: false });

    const stats = manager.getStats();
    expect(stats.trackersCount).toBeGreaterThanOrEqual(DEFAULT_BUILTIN_TRACKERS.length);

    const announceList = manager.getAnnounceList(2);
    expect(announceList.length).toBeGreaterThan(0);
    expect(announceList[0].length).toBeLessThanOrEqual(2);
    expect(announceList[0][0]).toContain('udp://');
  });

  it('should validate tracker URLs and reject invalid formats', () => {
    expect(manager.isValidTracker('udp://tracker.opentrackr.org:1337/announce')).toBe(true);
    expect(manager.isValidTracker('wss://tracker.webtorrent.dev')).toBe(true);
    expect(manager.isValidTracker('http://tracker.example.com:80/announce')).toBe(true);
    expect(manager.isValidTracker('https://tracker.example.com:443/announce')).toBe(true);

    expect(manager.isValidTracker('ftp://invalid.com/announce')).toBe(false);
    expect(manager.isValidTracker('not-a-url')).toBe(false);
    expect(manager.isValidTracker('')).toBe(false);
  });

  it('should correctly identify and filter blacklisted trackers, hosts, and limit to MAX_TRACKERS', () => {
    const rawTrackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      '# This is a comment',
      'http://malicious-tracker.com:8080/announce',
      'udp://dead-tracker.net:6969/announce',
      'wss://tracker.webtorrent.dev',
      'invalid-scheme://something',
      '',
    ];

    // Seed mock blacklist
    const blacklistContent = 'malicious-tracker.com\nhttp://dead-tracker.net:6969/announce\n# blacklisted';
    fs.writeFileSync(path.join(tempDir, 'blacklist.txt'), blacklistContent, 'utf8');
    fs.writeFileSync(path.join(tempDir, 'trackers_all.txt'), rawTrackers.join('\n'), 'utf8');

    const freshManager = new TrackerManager(tempDir);
    const filtered = freshManager.filterTrackers(rawTrackers);

    expect(freshManager.isTrackerBlacklisted('http://malicious-tracker.com:8080/announce')).toBe(true);
    expect(freshManager.isTrackerBlacklisted('http://dead-tracker.net:6969/announce')).toBe(true);
    expect(freshManager.isTrackerBlacklisted('udp://tracker.opentrackr.org:1337/announce')).toBe(false);

    expect(filtered).toContain('udp://tracker.opentrackr.org:1337/announce');
    expect(filtered).toContain('wss://tracker.webtorrent.dev');
    expect(filtered).not.toContain('http://malicious-tracker.com:8080/announce');
    expect(filtered).not.toContain('udp://dead-tracker.net:6969/announce');
    expect(filtered).not.toContain('invalid-scheme://something');
  });

  it('should enforce MAX_TRACKERS ceiling when filtered count exceeds limit', () => {
    const oversizedList: string[] = [];
    for (let i = 0; i < 150; i++) {
      oversizedList.push(`udp://tracker${i}.example.org:1337/announce`);
    }

    const filtered = manager.filterTrackers(oversizedList);
    expect(filtered.length).toBe(MAX_TRACKERS);
    expect(filtered.length).toBeLessThanOrEqual(100);
  });

  it('should persist and reload cached trackers and sync metadata asynchronously from disk', async () => {
    const mockSyncTime = Date.now() - 1000;
    await manager.saveToDiskAsync('udp://custom-tracker.org:1337/announce', 'bad-host.com');

    const freshManager = new TrackerManager(tempDir);
    await freshManager.loadFromDiskAsync();

    const stats = freshManager.getStats();
    expect(stats.trackersCount).toBeGreaterThan(0);
    expect(freshManager.isTrackerBlacklisted('http://bad-host.com/announce')).toBe(true);
  });

  it('should maintain a consistent 20-byte session peer ID starting with -RS0300-', () => {
    const peerId = manager.getPeerId();
    const peerIdBuf = manager.getPeerIdBuffer();

    expect(peerId.length).toBe(20);
    expect(peerIdBuf.length).toBe(20);
    expect(peerId.startsWith('-RS0300-')).toBe(true);
    // Peer ID should be consistent across calls on the same manager instance
    expect(manager.getPeerId()).toBe(peerId);
  });

  it('should accurately decode bencoded integers, strings, lists, dictionaries, and compact peers', async () => {
    const { decodeBencode } = await import('../src/main/engine/trackerManager');

    // Integer
    expect(decodeBencode(Buffer.from('i42e'))).toBe(42);
    expect(decodeBencode(Buffer.from('i-10e'))).toBe(-10);

    // Byte string
    expect(decodeBencode(Buffer.from('4:spam')).toString('utf8')).toBe('spam');

    // List
    const decodedList = decodeBencode(Buffer.from('l4:spami42ee'));
    expect(decodedList.length).toBe(2);
    expect(decodedList[0].toString('utf8')).toBe('spam');
    expect(decodedList[1]).toBe(42);

    // Dictionary with binary compact peers
    const dictBuf = Buffer.concat([
      Buffer.from('d8:intervali300e8:completei5e10:incompletei2e5:peers6:'),
      Buffer.from([127, 0, 0, 1, 26, 225]),
      Buffer.from('e'),
    ]);
    const decodedDict = decodeBencode(dictBuf);
    expect(decodedDict.interval).toBe(300);
    expect(decodedDict.complete).toBe(5);
    expect(decodedDict.incomplete).toBe(2);
    expect(Buffer.isBuffer(decodedDict.peers)).toBe(true);
    expect(decodedDict.peers.length).toBe(6);
  });

  it('should successfully announce via BEP 15 UDP tracker protocol', async () => {
    const dgram = await import('dgram');
    const mockUdpServer = dgram.createSocket('udp4');
    let mockPort = 0;

    await new Promise<void>((resolve) => {
      mockUdpServer.bind(0, '127.0.0.1', () => {
        const addr = mockUdpServer.address();
        mockPort = addr.port;
        resolve();
      });
    });

    mockUdpServer.on('message', (msg, rinfo) => {
      if (msg.length < 16) return;
      const action = msg.readUInt32BE(8); // connect action or announce action

      if (msg.readBigInt64BE(0) === 0x41727101980n) {
        // Connect request
        const txId = msg.readUInt32BE(12);
        const resp = Buffer.allocUnsafe(16);
        resp.writeUInt32BE(0, 0); // action 0
        resp.writeUInt32BE(txId, 4);
        resp.writeBigInt64BE(0x1234567890abcdefn, 8); // connection_id
        mockUdpServer.send(resp, rinfo.port, rinfo.address);
      } else {
        // Announce request
        const annAction = msg.readUInt32BE(8);
        if (annAction === 1) {
          const txId = msg.readUInt32BE(12);
          const annResp = Buffer.concat([
            Buffer.alloc(20),
            Buffer.from([127, 0, 0, 1, 26, 225]), // peer 127.0.0.1:6881
          ]);
          annResp.writeUInt32BE(1, 0); // action 1
          annResp.writeUInt32BE(txId, 4);
          annResp.writeUInt32BE(300, 8); // interval
          annResp.writeUInt32BE(1, 12); // leechers
          annResp.writeUInt32BE(4, 16); // seeders
          mockUdpServer.send(annResp, rinfo.port, rinfo.address);
        }
      }
    });

    try {
      const hashBuf = Buffer.from('a1b2c3d4e5f67890123456789abcdef012345678', 'hex');
      const res = await manager.udpAnnounce(`udp://127.0.0.1:${mockPort}/announce`, hashBuf, 'started', {
        port: 6881,
        downloaded: 0,
        left: 0,
        uploaded: 0,
      });

      expect(res.seeders).toBe(4);
      expect(res.leechers).toBe(1);
      expect(res.interval).toBe(300);
      expect(res.peers?.length).toBe(1);
      expect(res.peers?.[0].ip).toBe('127.0.0.1');
      expect(res.peers?.[0].port).toBe(6881);
    } finally {
      mockUdpServer.close();
    }
  });

  it('should successfully announce via BEP 3/48 HTTP tracker protocol with bencode response', async () => {
    const http = await import('http');
    let mockHttpPort = 0;

    const mockHttpServer = http.createServer((req, res) => {
      const bencodedResponse = Buffer.concat([
        Buffer.from('d8:intervali300e8:completei6e10:incompletei2e5:peers6:'),
        Buffer.from([192, 168, 1, 50, 26, 225]),
        Buffer.from('e'),
      ]);

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(bencodedResponse);
    });

    await new Promise<void>((resolve) => {
      mockHttpServer.listen(0, '127.0.0.1', () => {
        const addr = mockHttpServer.address() as any;
        mockHttpPort = addr.port;
        resolve();
      });
    });

    try {
      const hashBuf = Buffer.from('a1b2c3d4e5f67890123456789abcdef012345678', 'hex');
      const res = await manager.httpAnnounce(`http://127.0.0.1:${mockHttpPort}/announce`, hashBuf, 'started', {
        port: 6881,
        downloaded: 0,
        left: 0,
        uploaded: 0,
      });

      expect(res.seeders).toBe(6);
      expect(res.leechers).toBe(2);
      expect(res.peers?.length).toBe(1);
      expect(res.peers?.[0].ip).toBe('192.168.1.50');
      expect(res.peers?.[0].port).toBe(6881);
    } finally {
      mockHttpServer.close();
    }
  });

  it('should format announce requests, filter observers, and handle announce broadcasts', async () => {
    // Override active trackers with a mock tracker
    const http = await import('http');
    let mockHttpPort = 0;

    const mockHttpServer = http.createServer((req, res) => {
      const bencoded = Buffer.concat([
        Buffer.from('d8:intervali300e8:completei1e10:incompletei0e5:peers6:'),
        Buffer.from([127, 0, 0, 1, 26, 225]),
        Buffer.from('e'),
      ]);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(bencoded);
    });

    await new Promise<void>((resolve) => {
      mockHttpServer.listen(0, '127.0.0.1', () => {
        mockHttpPort = (mockHttpServer.address() as any).port;
        resolve();
      });
    });

    try {
      (manager as any).activeTrackers = [
        `http://127.0.0.1:${mockHttpPort}/announce`,
        'https://swarm.renegadeinc.net/announce', // Observer should be filtered out
      ];

      const res = await manager.announceTorrent('a1b2c3d4e5f67890123456789abcdef012345678', 'started', {
        uploaded: 0,
        downloaded: 1000,
        left: 0,
      });

      expect(res.attempted).toBe(1); // Only the real tracker was attempted, observer was excluded!
      expect(res.succeeded).toBe(1);
      expect(res.peersDiscovered.length).toBe(1);
    } finally {
      mockHttpServer.close();
    }
  });

  it('should ignore invalid infoHashes in announceTorrent', async () => {
    const res = await manager.announceTorrent('invalid-hash', 'started');
    expect(res.attempted).toBe(0);
    expect(res.succeeded).toBe(0);
  });

  it('should enforce 24-hour sync interval constant (86,400,000 ms)', () => {
    expect(SYNC_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
