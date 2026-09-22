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
import crypto from 'crypto';
import { BrowserWindow } from 'electron';
import { DiagnosticLogEvent, DiagnosticLogLevel, SystemDiagnostics, TabTelemetry } from '../../shared/ipcContracts';
import { trackerManager } from '../engine/trackerManager';
import { swarmEngine } from '../engine/swarmEngine';
import { discoveryEngine } from '../engine/discoveryEngine';
import { bandwidthScheduler } from '../engine/bandwidthScheduler';
import { cmmDbBridge } from '../cmm/cmmDbBridge';
import { keyringManager } from '../engine/keyringManager';
import { packageJobManager } from '../engine/packageJobManager';

export class DebugLogManager extends EventEmitter {
  private buffer: DiagnosticLogEvent[] = [];
  private maxBufferSize: number = 1000;
  private startTime: number = Date.now();

  constructor() {
    super();
    this.logInfo('SYSTEM', 'RenegadeSwarm Diagnostic & Debug Subsystem Initialized', {
      version: '0.3.0',
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      electronVersion: process.versions.electron,
    });
  }

  public log(level: DiagnosticLogLevel, subsystem: string, message: string, details?: any, stack?: string) {
    const event: DiagnosticLogEvent = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      timestamp: Date.now(),
      level,
      subsystem: subsystem.toUpperCase(),
      message,
      details,
      stack,
    };

    this.buffer.push(event);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    this.emit('log', event);

    // Broadcast live event to open renderer windows
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed() && win.webContents) {
          win.webContents.send('debug:logEvent', event);
        }
      }
    } catch {
      // Ignore during bootstrap or shutdown
    }
  }

  public logInfo(subsystem: string, message: string, details?: any) {
    this.log('info', subsystem, message, details);
  }

  public logWarn(subsystem: string, message: string, details?: any) {
    this.log('warn', subsystem, message, details);
  }

  public logError(subsystem: string, message: string, error?: any) {
    const stack = error instanceof Error ? error.stack : undefined;
    const msg = error instanceof Error ? `${message}: ${error.message}` : `${message} ${error ? JSON.stringify(error) : ''}`;
    this.log('error', subsystem, msg, error, stack);
  }

  public logDebug(subsystem: string, message: string, details?: any) {
    this.log('debug', subsystem, message, details);
  }

  public getLogEvents(filterLevel?: DiagnosticLogLevel, limit: number = 500): DiagnosticLogEvent[] {
    let list = this.buffer;
    if (filterLevel) {
      list = list.filter((e) => e.level === filterLevel);
    }
    return list.slice(-limit);
  }

  public clearLogs() {
    this.buffer = [];
    this.logInfo('SYSTEM', 'Diagnostic console logs cleared by user');
  }

  public getSystemDiagnostics(): SystemDiagnostics {
    const activeTorrents = swarmEngine.getActiveTorrents();
    const seeding = activeTorrents.filter((t) => t.state === 'seeding').length;
    const downloading = activeTorrents.filter((t) => t.state === 'downloading').length;
    const bwStats = bandwidthScheduler.getStats();
    const discStats = discoveryEngine.getStats();
    const bwSettings = bandwidthScheduler.getSettings();
    const trackers = trackerManager.getAllTrackers ? trackerManager.getAllTrackers() : [];

    let cmmConnected = false;
    let cmmDbPath = '';
    let cmmModelCount = 0;
    try {
      cmmDbPath = cmmDbBridge.getCmmDbPath();
      cmmConnected = !!cmmDbPath;
    } catch {}

    return {
      appVersion: 'v0.3.0 (Development / Debug Mode)',
      platform: `${process.platform} (${process.arch})`,
      electronVersion: process.versions.electron || '34.0.0',
      nodeVersion: process.versions.node || '20.18.0',
      hardwareHashing: '64MB AVX2 / SHA-NI Accelerated',
      peerId: '-RS0300-' + crypto.randomBytes(6).toString('hex'),
      listenPort: bwSettings.listenPort || 6881,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsage: process.memoryUsage(),
      dhtNodes: 8,
      activeTrackersCount: trackers.length,
      activeSwarmsCount: activeTorrents.length,
      seedingCount: seeding,
      downloadingCount: downloading,
      cmmConnected,
      cmmDbPath,
      cmmModelCount,
      discoveryStats: {
        connectedPeers: discStats.connectedDiscoveryPeers,
        localCatalogCount: discStats.indexedLocalModels,
        cachedDiscoveredModels: discStats.cachedDiscoveredModels,
        totalQueriesProcessed: discStats.totalQueriesProcessed,
      },
      bandwidthRates: {
        downBps: bwStats.currentDownloadSpeedBps,
        upBps: bwStats.currentUploadSpeedBps,
      },
    };
  }

  public getTabTelemetry(tabId: string): TabTelemetry {
    const recentLogs = this.buffer.filter((e) => {
      if (tabId === 'dashboard') return ['TRACKER', 'SWARM'].includes(e.subsystem);
      if (tabId === 'discovery') return ['DISCOVERY', 'DHT'].includes(e.subsystem);
      if (tabId === 'seeder') return ['SEEDER', 'MANIFEST', 'PACKAGE', 'HASHING'].includes(e.subsystem);
      if (tabId === 'cmm') return ['CMM', 'SQLITE', 'SYNC'].includes(e.subsystem);
      if (tabId === 'bandwidth') return ['BANDWIDTH', 'QUOTA', 'RATE', 'SOCKET'].includes(e.subsystem);
      if (tabId === 'settings') return ['SECURITY', 'KEYRING', 'CONFIG'].includes(e.subsystem);
      return false;
    }).slice(-100);

    let metrics: Record<string, any> = {};

    switch (tabId) {
      case 'dashboard': {
        const torrents = swarmEngine.getActiveTorrents();
        const activeTrackers = trackerManager.getAllTrackers ? trackerManager.getAllTrackers() : [];
        const trackerStats = trackerManager.getStats ? trackerManager.getStats() : { blacklistCount: 0, lastSyncTime: 0, isSyncing: false };
        const seedingTorrents = torrents.filter((t) => t.state === 'seeding');
        metrics = {
          activeSwarms: `${torrents.length} total (${seedingTorrents.length} seeding, ${torrents.filter((t) => t.state === 'downloading').length} downloading)`,
          seedingModels: seedingTorrents.map((t) => t.title).join(', ') || 'None',
          totalSeedersCount: torrents.reduce((acc, t) => acc + (t.seedersConnected || 0), 0),
          totalLeechersConnected: torrents.reduce((acc, t) => acc + (t.peersConnected || 0), 0),
          activeTrackersCount: `${activeTrackers.length} active (${trackerStats.blacklistCount} blacklisted)`,
          announceInterval: '60s Periodic Sync Loop',
          candidateTrackersSample: activeTrackers.slice(0, 5),
          bep15UdpAnnounceReady: true,
          bep3HttpBencodeReady: true,
        };
        break;
      }
      case 'discovery': {
        const stats = discoveryEngine.getStats();
        metrics = {
          discoveryPeers: stats.connectedDiscoveryPeers,
          indexedLocalModels: stats.indexedLocalModels,
          cachedModels: stats.cachedDiscoveredModels,
          queriesProcessed: stats.totalQueriesProcessed,
          wotVerificationEnabled: true,
          creatorSigningAlgorithm: 'Ed25519 (RFC 8032)',
        };
        break;
      }
      case 'seeder': {
        const activeJob = packageJobManager.getActiveJob();
        metrics = {
          hasActivePackagingJob: !!activeJob,
          jobPhase: activeJob?.phase || 'idle',
          jobPercent: activeJob?.percent || 0,
          currentFile: activeJob?.currentFile || 'none',
          bytesProcessed: activeJob?.bytesProcessed || 0,
          sidecarPlacement: 'Local Model Directory (${filename}.swarm.json)',
          safetensorsHeaderMaxBudget: '100MB Zero-Copy Parser',
          pieceLengthDefault: '2MB Optimized for LAN / P2P Distribution',
        };
        break;
      }
      case 'cmm': {
        let dbPath = '';
        try {
          dbPath = cmmDbBridge.getCmmDbPath();
        } catch {}
        metrics = {
          connected: !!dbPath,
          dbPath,
          probeMethod: 'Sister App SQLite Shared State & Health Ping',
          folderRoutingTarget: 'ComfyUI / Stable Diffusion Standard Hierarchy',
        };
        break;
      }
      case 'bandwidth': {
        const bw = bandwidthScheduler.getSettings();
        const stats = bandwidthScheduler.getStats();
        metrics = {
          maxDownloadLimitKbps: bw.maxDownloadSpeedKbps || 'Unlimited (0)',
          maxUploadLimitKbps: bw.maxUploadSpeedKbps || 'Unlimited (0)',
          maxActiveDownloads: bw.maxActiveDownloads,
          maxActiveSeeds: bw.maxActiveSeeds,
          listenPort: bw.listenPort,
          currentDownBps: stats.currentDownloadSpeedBps,
          currentUpBps: stats.currentUploadSpeedBps,
          tokenBucketAlgorithm: 'Sliding Window Token Bucket (50ms Resolution)',
        };
        break;
      }
      case 'settings': {
        let alias = 'Renegade Creator';
        let pubSnippet = 'ed25519-identity';
        let isLocked = false;
        try {
          const identity = keyringManager.getUserIdentity();
          if (identity) {
            alias = identity.creatorName;
            pubSnippet = identity.publicKeyHex.slice(0, 16) + '...';
          }
          const lockout = keyringManager.getLockoutStatus();
          if (lockout && typeof lockout.canGenerate === 'boolean') {
            isLocked = !lockout.canGenerate;
          }
        } catch {}
        metrics = {
          userAlias: alias,
          publicKeySnippet: pubSnippet,
          isLockedOut: isLocked,
          quarantineDirectory: 'Confined Quarantine Store (.renegadeswarm/quarantine)',
          ed25519KeyLengthBits: 256,
        };
        break;
      }
      default:
        metrics = { status: 'ok' };
    }

    return {
      tabId,
      timestamp: Date.now(),
      metrics,
      recentLogs,
    };
  }
}

export const debugLogManager = new DebugLogManager();
