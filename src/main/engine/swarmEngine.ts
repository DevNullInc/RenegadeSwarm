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
import {
  SwarmTorrentStatus,
  SwarmManifest,
} from '../../protocol/types';
import {
  AddMagnetRequest,
  CreateSwarmPackageRequest,
} from '../../shared/ipcContracts';
import path from 'path';
import { cmmFolderRouter } from '../cmm/cmmFolderRouter';
import { cmmDbBridge } from '../cmm/cmmDbBridge';
import { buildSwarmManifest } from './manifestBuilder';
import { bandwidthScheduler } from './bandwidthScheduler';
import { sharingPolicyManager } from './sharingPolicyManager';

export class SwarmEngine extends EventEmitter {
  private activeSwarms: Map<string, SwarmTorrentStatus> = new Map();
  private manifests: Map<string, SwarmManifest> = new Map();
  private isInitialized = false;

  async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    setInterval(() => this.tick(), 1000);
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

    const destination = req.customDestination || (cmmFolderRouter as any).config.rootPath || './models';

    const newTorrent: SwarmTorrentStatus = {
      infoHash,
      manifestId: 'unresolved',
      title,
      modelType: 'Checkpoint',
      state: 'downloading',
      queueState: 'Active',
      totalBytes: 1024 * 1024 * 1024 * 2,
      downloadedBytes: 0,
      uploadedBytes: 0,
      downloadSpeedBps: 22 * 1024 * 1024,
      uploadSpeedBps: 0,
      progressRatio: 0.0,
      peersConnected: 16,
      seedersConnected: 10,
      ratio: 0.0,
      etaSeconds: 93,
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
      uploadSpeedBps: 8 * 1024 * 1024,
      progressRatio: 1.0,
      peersConnected: 8,
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
    const torrent = this.activeSwarms.get(infoHash.toLowerCase());
    if (torrent) {
      torrent.state = 'paused';
      torrent.downloadSpeedBps = 0;
      torrent.uploadSpeedBps = 0;
      this.emit('torrent:updated', torrent);
      return true;
    }
    return false;
  }

  resumeTorrent(infoHash: string): boolean {
    const torrent = this.activeSwarms.get(infoHash.toLowerCase());
    if (torrent) {
      torrent.state = torrent.progressRatio >= 1 ? 'seeding' : 'downloading';
      this.emit('torrent:updated', torrent);
      return true;
    }
    return false;
  }

  removeTorrent(infoHash: string): boolean {
    const deleted = this.activeSwarms.delete(infoHash.toLowerCase());
    if (deleted) {
      this.emit('torrent:removed', infoHash.toLowerCase());
    }
    return deleted;
  }

  private async tick() {
    let totalDl = 0;
    let totalUl = 0;
    let dlCount = 0;
    let seedCount = 0;

    for (const [infoHash, torrent] of this.activeSwarms.entries()) {
      if (torrent.state === 'downloading') {
        dlCount++;
        const increment = Math.min(torrent.downloadSpeedBps, torrent.totalBytes - torrent.downloadedBytes);
        torrent.downloadedBytes += increment;
        totalDl += increment;
        torrent.progressRatio = torrent.downloadedBytes / torrent.totalBytes;

        if (torrent.downloadedBytes >= torrent.totalBytes) {
          torrent.progressRatio = 1.0;
          torrent.downloadSpeedBps = 0;
          this.handleDownloadCompleted(infoHash, torrent);
        } else {
          const remainingBytes = torrent.totalBytes - torrent.downloadedBytes;
          torrent.etaSeconds = torrent.downloadSpeedBps > 0 ? Math.ceil(remainingBytes / torrent.downloadSpeedBps) : null;
        }
      } else if (torrent.state === 'seeding') {
        // Evaluate if seeding is still permitted under active policy
        const isOptedIn = sharingPolicyManager.isModelOptedIn(infoHash);
        const isBlocked = sharingPolicyManager.isModelBlocked(infoHash);
        const policy = sharingPolicyManager.getPolicy();

        if (policy.mode === 'disabled' || isBlocked || (policy.mode === 'opt_in_only' && !isOptedIn)) {
          torrent.state = 'paused';
          torrent.uploadSpeedBps = 0;
        } else {
          seedCount++;
          const ulIncrement = torrent.uploadSpeedBps;
          torrent.uploadedBytes += ulIncrement;
          totalUl += ulIncrement;
          torrent.ratio = torrent.downloadedBytes > 0 ? torrent.uploadedBytes / torrent.downloadedBytes : 1.0;
        }
      }
    }

    bandwidthScheduler.recordTransfer(totalDl, totalUl);
    this.emit('stats:updated', bandwidthScheduler.getStats(dlCount, seedCount));
  }

  private async handleDownloadCompleted(infoHash: string, torrent: SwarmTorrentStatus) {
    const manifest = this.manifests.get(infoHash);
    let targetPath = torrent.savePath;

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
      torrent.uploadSpeedBps = 4 * 1024 * 1024;
    } else {
      // By default: stay completed / paused without uploading
      torrent.state = 'paused';
      torrent.uploadSpeedBps = 0;
    }

    this.emit('torrent:completed', torrent);
  }
}

export const swarmEngine = new SwarmEngine();
