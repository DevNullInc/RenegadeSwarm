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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmEngine } from '../src/main/engine/swarmEngine';
import { DaemonRpcEngine, DaemonTorrentInfo } from '../src/main/engine/daemonRpcEngine';
import { sharingPolicyManager } from '../src/main/engine/sharingPolicyManager';

describe('SwarmEngine (Live Daemon Integration & Lifecycle)', () => {
  let mockDaemonRpc: DaemonRpcEngine;
  let swarm: SwarmEngine;
  let torrentsData: DaemonTorrentInfo[] = [];

  const sampleHash = 'abcdef0123456789abcdef0123456789abcdef01';
  const magnetUri = `magnet:?xt=urn:btih:${sampleHash}&dn=SDXL-Base-1.0`;

  beforeEach(() => {
    torrentsData = [];
    mockDaemonRpc = new DaemonRpcEngine();

    // Mock RPC calls
    vi.spyOn(mockDaemonRpc, 'addMagnet').mockImplementation(async (uri, dir) => {
      torrentsData.push({
        id: 42,
        name: 'SDXL-Base-1.0',
        hashString: sampleHash,
        status: 4, // downloading
        percentDone: 0.1,
        rateDownload: 10 * 1024 * 1024,
        rateUpload: 0,
        peersConnected: 10,
        peersSendingToUs: 5,
        peersGettingFromUs: 0,
        uploadRatio: 0,
        downloadDir: dir,
        totalSize: 6 * 1024 * 1024 * 1024,
      });
      return 42;
    });

    vi.spyOn(mockDaemonRpc, 'getTorrents').mockImplementation(async () => {
      return torrentsData;
    });

    vi.spyOn(mockDaemonRpc, 'pauseTorrent').mockImplementation(async (id) => {
      const t = torrentsData.find((item) => item.id === (Array.isArray(id) ? id[0] : id));
      if (t) t.status = 0; // stopped
      return true;
    });

    vi.spyOn(mockDaemonRpc, 'resumeTorrent').mockImplementation(async (id) => {
      const t = torrentsData.find((item) => item.id === (Array.isArray(id) ? id[0] : id));
      if (t) t.status = 4; // downloading
      return true;
    });

    vi.spyOn(mockDaemonRpc, 'removeTorrent').mockImplementation(async (id) => {
      torrentsData = torrentsData.filter((item) => item.id !== (Array.isArray(id) ? id[0] : id));
      return true;
    });

    swarm = new SwarmEngine(mockDaemonRpc);
  });

  afterEach(() => {
    swarm.stop();
    vi.restoreAllMocks();
  });

  it('should add magnet, register in active swarms, and dispatch to daemon', async () => {
    const status = await swarm.addMagnet({
      magnetUri,
      customDestination: '/custom/models',
    });

    expect(status.infoHash).toBe(sampleHash);
    expect(status.title).toBe('SDXL-Base-1.0');
    expect(status.savePath).toBe('/custom/models');
    expect(mockDaemonRpc.addMagnet).toHaveBeenCalledWith(magnetUri, '/custom/models');
  });

  it('should update torrent states and transfer speeds on daemon poll', async () => {
    await swarm.addMagnet({ magnetUri });

    // Trigger daemon polling
    await swarm.pollDaemon();

    const active = swarm.getTorrent(sampleHash);
    expect(active).toBeDefined();
    expect(active!.state).toBe('downloading');
    expect(active!.downloadSpeedBps).toBe(10 * 1024 * 1024);
    expect(active!.progressRatio).toBe(0.1);
    expect(active!.peersConnected).toBe(10);
    expect(active!.seedersConnected).toBe(5);
  });

  it('should pause and resume torrents by delegating to daemon', async () => {
    await swarm.addMagnet({ magnetUri });
    await swarm.pollDaemon();

    const pauseOk = swarm.pauseTorrent(sampleHash);
    expect(pauseOk).toBe(true);
    expect(mockDaemonRpc.pauseTorrent).toHaveBeenCalledWith(42);

    const paused = swarm.getTorrent(sampleHash);
    expect(paused!.state).toBe('paused');
    expect(paused!.downloadSpeedBps).toBe(0);

    const resumeOk = swarm.resumeTorrent(sampleHash);
    expect(resumeOk).toBe(true);
    expect(mockDaemonRpc.resumeTorrent).toHaveBeenCalledWith(42);
  });

  it('should remove torrent and notify daemon', async () => {
    await swarm.addMagnet({ magnetUri });
    await swarm.pollDaemon();

    const removeOk = swarm.removeTorrent(sampleHash);
    expect(removeOk).toBe(true);
    expect(mockDaemonRpc.removeTorrent).toHaveBeenCalledWith(42, false);
    expect(swarm.getTorrent(sampleHash)).toBeUndefined();
  });

  it('should handle download completion and enforce opt-in sharing policy', async () => {
    await swarm.addMagnet({ magnetUri });
    await swarm.pollDaemon();

    // Simulate completion on next daemon update
    torrentsData[0].percentDone = 1.0;
    torrentsData[0].status = 6; // seeding

    let completedEventFired = false;
    swarm.on('torrent:completed', (t) => {
      completedEventFired = true;
      expect(t.infoHash).toBe(sampleHash);
    });

    await swarm.pollDaemon();

    expect(completedEventFired).toBe(true);
    const completed = swarm.getTorrent(sampleHash);
    expect(completed!.progressRatio).toBe(1.0);
  });

  it('should register seeding manifest and configure sharing opt-in', () => {
    const manifest: any = {
      manifestId: 'test-manifest-1',
      swarmSpecVersion: '1.0.0',
      createdAt: Date.now(),
      createdBy: 'TheStygianRenegade',
      pieceLength: 1048576,
      totalSizeBytes: 2048576,
      model: {
        title: 'Cyberpunk LoRA',
        version: '1.0',
        modelType: 'LORA',
        baseModel: 'SD 1.5',
        creator: 'TheStygianRenegade',
        nsfw: false,
        description: 'Test LoRA',
        tags: ['cyberpunk'],
        license: 'GPL-3.0',
      },
      hashes: {
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        infoHash: '9876543210fedcba9876543210fedcba98765432',
      },
      files: [],
      announceList: [],
      urlList: [],
    };

    const status = swarm.registerSeedingManifest(manifest, '/models/loras/cyberpunk.safetensors');
    expect(status.state).toBe('seeding');
    expect(status.title).toBe('Cyberpunk LoRA');
    expect(status.cmmSynced).toBe(true);
    expect(sharingPolicyManager.isModelOptedIn('9876543210fedcba9876543210fedcba98765432')).toBe(true);
  });
});
