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

import EventEmitter from 'events';
import path from 'path';
import fs from 'fs';
import {
  SwarmTorrentStatus,
  SwarmManifest,
} from '../../protocol/types';
import {
  AddMagnetRequest,
  CreateSwarmPackageRequest,
} from '../../shared/ipcContracts';
import { cmmFolderRouter } from '../cmm/cmmFolderRouter';
import { cmmDbBridge } from '../cmm/cmmDbBridge';
import { buildSwarmManifest } from './manifestBuilder';
import { bandwidthScheduler } from './bandwidthScheduler';
import { sharingPolicyManager } from './sharingPolicyManager';
import { DaemonRpcEngine, daemonRpcEngine, mapDaemonStatus } from './daemonRpcEngine';
import { contentInspector } from './contentInspector';

export class SwarmEngine extends EventEmitter {
  private activeSwarms: Map<string, SwarmTorrentStatus> = new Map();
  private manifests: Map<string, SwarmManifest> = new Map();
  private torrentIds: Map<string, number> = new Map(); // infoHash -> daemon torrent id
  private daemonRpc: DaemonRpcEngine;
  private pollTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  constructor(daemonRpc: DaemonRpcEngine = daemonRpcEngine) {
    super();
    this.daemonRpc = daemonRpc;
  }

  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.pollTimer = setInterval(() => {
      this.pollDaemon().catch((err) => {
        // Log polling error quietly
      });
    }, 1000);

    await this.pollDaemon().catch(() => {});
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isInitialized = false;
  }

  getActiveTorrents(): SwarmTorrentStatus[] {
    return Array.from(this.activeSwarms.values());
  }

  getTorrent(infoHash: string): SwarmTorrentStatus | undefined {
    return this.activeSwarms.get(infoHash.toLowerCase());
  }

  async addMagnet(req: AddMagnetRequest): Promise<SwarmTorrentStatus> {
    const match = req.magnetUri.match(/urn:btih:([a-zA-Z0-9]{32,40})/i);
    if (!match) {
      throw new Error('Invalid magnet link: missing info_hash');
    }

    const infoHash = match[1].toLowerCase();
    if (this.activeSwarms.has(infoHash)) {
      return this.activeSwarms.get(infoHash)!;
    }

    const dnMatch = req.magnetUri.match(/dn=([^&]+)/);
    const title = dnMatch ? decodeURIComponent(dnMatch[1]) : `Model-${infoHash.slice(0, 8)}`;
    const destination = req.customDestination || (cmmFolderRouter as any).config?.rootPath || './models';

    let daemonId = 0;
    try {
      daemonId = await this.daemonRpc.addMagnet(req.magnetUri, destination);
      if (daemonId > 0) {
        this.torrentIds.set(infoHash, daemonId);
      }
    } catch (err: any) {
      // Daemon may be offline in headless or standalone test setups
    }

    const newTorrent: SwarmTorrentStatus = {
      infoHash,
      manifestId: 'unresolved',
      title,
      modelType: 'Checkpoint',
      state: 'queued',
      queueState: 'Active',
      totalBytes: 0,
      downloadedBytes: 0,
      uploadedBytes: 0,
      downloadSpeedBps: 0,
      uploadSpeedBps: 0,
      progressRatio: 0.0,
      peersConnected: 0,
      seedersConnected: 0,
      ratio: 0.0,
      etaSeconds: null,
      savePath: destination,
      cmmSynced: false,
    };

    this.activeSwarms.set(infoHash, newTorrent);
    this.emit('torrent:added', newTorrent);
    return newTorrent;
  }

  registerSeedingManifest(manifest: SwarmManifest, modelFilePath: string): SwarmTorrentStatus {
    const infoHash = manifest.hashes.infoHash.toLowerCase();

    // Mark as explicitly opted-in
    sharingPolicyManager.toggleModelOptIn(infoHash, true);
    this.manifests.set(infoHash, manifest);

    const seedStatus: SwarmTorrentStatus = {
      infoHash,
      manifestId: manifest.manifestId,
      title: manifest.model.title,
      modelType: manifest.model.modelType,
      baseModel: manifest.model.baseModel,
      state: 'seeding',
      queueState: 'Verified',
      totalBytes: manifest.totalSizeBytes,
      downloadedBytes: manifest.totalSizeBytes,
      uploadedBytes: 0,
      downloadSpeedBps: 0,
      uploadSpeedBps: 0,
      progressRatio: 1.0,
      peersConnected: 0,
      seedersConnected: 1,
      ratio: 0.0,
      etaSeconds: null,
      savePath: modelFilePath,
      cmmSynced: true,
    };

    this.activeSwarms.set(infoHash, seedStatus);
    this.emit('torrent:added', seedStatus);
    return seedStatus;
  }

  async createPackageAndSeed(req: CreateSwarmPackageRequest): Promise<SwarmManifest> {
    const shareEvaluation = sharingPolicyManager.evaluatePermission({
      filePath: req.modelFilePath,
      fileName: path.basename(req.modelFilePath),
      modelType: req.modelType,
      baseModel: req.baseModel,
      tags: req.tags,
      isExplicitlyOptedIn: true, // Explicit user package generation
    });

    if (!shareEvaluation.canShare) {
      throw new Error(`Sharing Policy Violation: ${shareEvaluation.reason}`);
    }

    const manifest = await buildSwarmManifest(req);
    this.registerSeedingManifest(manifest, req.modelFilePath);
    return manifest;
  }

  pauseTorrent(infoHash: string): boolean {
    const key = infoHash.toLowerCase();
    const torrent = this.activeSwarms.get(key);
    if (torrent) {
      const daemonId = this.torrentIds.get(key);
      if (daemonId) {
        this.daemonRpc.pauseTorrent(daemonId).catch(() => {});
      }
      torrent.state = 'paused';
      torrent.downloadSpeedBps = 0;
      torrent.uploadSpeedBps = 0;
      this.emit('torrent:updated', torrent);
      return true;
    }
    return false;
  }

  resumeTorrent(infoHash: string): boolean {
    const key = infoHash.toLowerCase();
    const torrent = this.activeSwarms.get(key);
    if (torrent) {
      const daemonId = this.torrentIds.get(key);
      if (daemonId) {
        this.daemonRpc.resumeTorrent(daemonId).catch(() => {});
      }
      torrent.state = torrent.progressRatio >= 1 ? 'seeding' : 'downloading';
      this.emit('torrent:updated', torrent);
      return true;
    }
    return false;
  }

  removeTorrent(infoHash: string, deleteLocalData = false): boolean {
    const key = infoHash.toLowerCase();
    const daemonId = this.torrentIds.get(key);
    if (daemonId) {
      this.daemonRpc.removeTorrent(daemonId, deleteLocalData).catch(() => {});
      this.torrentIds.delete(key);
    }
    const deleted = this.activeSwarms.delete(key);
    if (deleted) {
      this.emit('torrent:removed', key);
    }
    return deleted;
  }

  /**
   * Polls the live BitTorrent daemon for accurate transfer stats and maps them to Swarm states.
   */
  async pollDaemon(): Promise<void> {
    let daemonTorrents: any[] = [];
    try {
      daemonTorrents = await this.daemonRpc.getTorrents();
    } catch {
      // If daemon is not running or unreachable, skip this tick
      return;
    }

    let totalDl = 0;
    let totalUl = 0;
    let dlCount = 0;
    let seedCount = 0;

    for (const dt of daemonTorrents) {
      const infoHash = (dt.hashString || '').toLowerCase();
      if (!infoHash) continue;

      this.torrentIds.set(infoHash, dt.id);
      let torrent = this.activeSwarms.get(infoHash);
      const isNew = !torrent;

      if (!torrent) {
        torrent = {
          infoHash,
          manifestId: 'unresolved',
          title: dt.name || `Model-${infoHash.slice(0, 8)}`,
          modelType: 'Checkpoint',
          state: mapDaemonStatus(dt.status),
          queueState: dt.percentDone >= 1.0 ? 'Verified' : 'Active',
          totalBytes: dt.totalSize || dt.sizeWhenDone || 0,
          downloadedBytes: dt.percentDone >= 1.0 ? (dt.totalSize || dt.sizeWhenDone || 0) : Math.round(dt.percentDone * (dt.totalSize || 0)),
          uploadedBytes: Math.round((dt.uploadRatio || 0) * (dt.totalSize || 0)),
          downloadSpeedBps: dt.rateDownload || 0,
          uploadSpeedBps: dt.rateUpload || 0,
          progressRatio: dt.percentDone || 0.0,
          peersConnected: dt.peersConnected || 0,
          seedersConnected: dt.peersSendingToUs || 0,
          ratio: dt.uploadRatio || 0.0,
          etaSeconds: dt.eta !== undefined && dt.eta >= 0 ? dt.eta : null,
          savePath: dt.downloadDir || './models',
          cmmSynced: false,
        };
        this.activeSwarms.set(infoHash, torrent);
        this.emit('torrent:added', torrent);
      } else {
        const wasCompleted = torrent.progressRatio >= 1.0;
        const mappedState = mapDaemonStatus(dt.status);
        const totalBytes = dt.totalSize || dt.sizeWhenDone || torrent.totalBytes || 0;
        const percentDone = dt.percentDone !== undefined ? dt.percentDone : torrent.progressRatio;

        torrent.state = mappedState;
        torrent.totalBytes = totalBytes;
        torrent.downloadedBytes = percentDone >= 1.0 ? totalBytes : Math.round(percentDone * totalBytes);
        torrent.downloadSpeedBps = dt.rateDownload || 0;
        torrent.uploadSpeedBps = dt.rateUpload || 0;
        torrent.progressRatio = percentDone;
        torrent.peersConnected = dt.peersConnected || 0;
        torrent.seedersConnected = dt.peersSendingToUs || 0;
        torrent.ratio = dt.uploadRatio || 0.0;
        torrent.etaSeconds = dt.eta !== undefined && dt.eta >= 0 ? dt.eta : (
          dt.rateDownload > 0 && totalBytes > torrent.downloadedBytes
            ? Math.ceil((totalBytes - torrent.downloadedBytes) / dt.rateDownload)
            : null
        );

        if (!wasCompleted && percentDone >= 1.0) {
          await this.handleDownloadCompleted(infoHash, torrent);
        }

        this.emit('torrent:updated', torrent);
      }

      if (torrent.state === 'downloading') {
        dlCount++;
        totalDl += torrent.downloadSpeedBps;
      } else if (torrent.state === 'seeding') {
        // Enforce sharing policy
        const isOptedIn = sharingPolicyManager.isModelOptedIn(infoHash);
        const isBlocked = sharingPolicyManager.isModelBlocked(infoHash);
        const policy = sharingPolicyManager.getPolicy();

        if (policy.mode === 'disabled' || isBlocked || (policy.mode === 'opt_in_only' && !isOptedIn)) {
          this.pauseTorrent(infoHash);
        } else {
          seedCount++;
          totalUl += torrent.uploadSpeedBps;
        }
      }
    }

    bandwidthScheduler.recordTransfer(totalDl, totalUl);
    this.emit('stats:updated', bandwidthScheduler.getStats(dlCount, seedCount));
  }

  private async handleDownloadCompleted(infoHash: string, torrent: SwarmTorrentStatus): Promise<void> {
    const manifest = this.manifests.get(infoHash);
    let targetPath = torrent.savePath;

    // Check if target file exists and perform content inspection validation
    const candidateFile = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? targetPath
      : path.join(targetPath, torrent.title);

    if (fs.existsSync(candidateFile)) {
      const inspectRes = await contentInspector.inspectFile(candidateFile);
      if (!inspectRes.isValid) {
        torrent.state = 'error';
        torrent.error = `Quarantine Validation Rejected: ${inspectRes.reason}`;
        this.emit('torrent:updated', torrent);
        return;
      }
    }

    if (manifest) {
      const mainFile = manifest.files.find((f) => f.fileType === 'Model');
      if (mainFile) {
        const dest = cmmFolderRouter.computeDestination({
          fileName: mainFile.relativePath,
          modelType: manifest.model.modelType,
          baseModel: manifest.model.baseModel,
          creator: manifest.model.creator,
        });

        if (dest.isValid) {
          targetPath = dest.fullPath;
          await cmmDbBridge.registerCompletedDownload(manifest, dest.fullPath);
          torrent.cmmSynced = true;
        }
      }
    }

    // Strict Opt-In Policy Check for Seeding
    const policy = sharingPolicyManager.getPolicy();
    const shareCheck = sharingPolicyManager.evaluatePermission({
      id: infoHash,
      filePath: targetPath,
      fileName: path.basename(targetPath),
      modelType: torrent.modelType,
      baseModel: torrent.baseModel,
      tags: manifest?.model?.tags,
      isExplicitlyOptedIn: policy.optedInModelIds.includes(infoHash),
    });

    if (policy.autoSeedDownloads && shareCheck.canShare) {
      torrent.state = 'seeding';
    } else {
      // By default: stop/pause in daemon and keep status completed/paused
      torrent.state = 'paused';
      const daemonId = this.torrentIds.get(infoHash);
      if (daemonId) {
        this.daemonRpc.pauseTorrent(daemonId).catch(() => {});
      }
    }

    this.emit('torrent:completed', torrent);
  }
}

export const swarmEngine = new SwarmEngine();
