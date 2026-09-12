/**
 * RenegadeSwarm - Token Bucket Bandwidth Scheduler & Seeding Ratio Governance (Rules 11 & 14)
 * Enforces hardware/socket byte limits via Token Bucket, caps uplink at 20%, and governs ratio targets.
 */
import { BandwidthSettings } from '../../shared/ipcContracts';

export interface TorrentRatioState {
  infoHash: string;
  totalDownloadedBytes: number;
  totalUploadedBytes: number;
  ratio: number;
  isSeedingHalted: boolean;
  seedingHaltedReason?: string;
}

export interface BandwidthUsageStats {
  currentDownloadSpeedBps: number;
  currentUploadSpeedBps: number;
  totalBytesDownloaded: number;
  totalBytesUploaded: number;
  activeDownloadCount: number;
  activeSeedCount: number;
  availableDownloadTokens: number;
  availableUploadTokens: number;
}

export class BandwidthScheduler {
  private settings: BandwidthSettings;
  private totalDownloaded: number = 0;
  private totalUploaded: number = 0;
  private currentDownloadSpeed: number = 0;
  private currentUploadSpeed: number = 0;

  // Token Bucket State
  private downloadBucketTokens: number = 0;
  private uploadBucketTokens: number = 0;
  private lastTokenRefillTime: number = Date.now();

  // Per-torrent Ratio Tracking
  private torrentRatios: Map<string, TorrentRatioState> = new Map();

  constructor(initialSettings?: Partial<BandwidthSettings>) {
    this.settings = {
      maxDownloadSpeedKbps: 0, // 0 = unlimited
      maxUploadSpeedKbps: 0,
      maxActiveDownloads: 3,
      maxActiveSeeds: 10,
      seedingRatioLimit: 2.0, // 200% default
      backgroundSeedingEnabled: true,
      listenPort: 6881,
      enableDht: true,
      ...(initialSettings || {}),
    };

    const dlCapacityBytes =
      this.settings.maxDownloadSpeedKbps > 0
        ? this.settings.maxDownloadSpeedKbps * 1024
        : 100 * 1024 * 1024;
    const ulCapacityBytes =
      this.settings.maxUploadSpeedKbps > 0
        ? this.settings.maxUploadSpeedKbps * 1024
        : 50 * 1024 * 1024;

    this.downloadBucketTokens = dlCapacityBytes;
    this.uploadBucketTokens = ulCapacityBytes;
  }

  getSettings(): BandwidthSettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<BandwidthSettings>) {
    this.settings = {
      ...this.settings,
      ...newSettings,
    };
  }

  /**
   * Refills the Token Buckets based on elapsed time and configured KB/s limits.
   */
  private refillBuckets() {
    const now = Date.now();
    const elapsedSeconds = Math.max(0.001, (now - this.lastTokenRefillTime) / 1000);
    this.lastTokenRefillTime = now;

    // Refill download bucket (0 = unlimited, use 100MB/s virtual capacity)
    const dlCapacityBytes =
      this.settings.maxDownloadSpeedKbps > 0
        ? this.settings.maxDownloadSpeedKbps * 1024
        : 100 * 1024 * 1024;
    this.downloadBucketTokens = Math.min(
      dlCapacityBytes * 2, // Max burst: 2x capacity
      this.downloadBucketTokens + dlCapacityBytes * elapsedSeconds
    );

    // Refill upload bucket (Rule 11: respect cap)
    const ulCapacityBytes =
      this.settings.maxUploadSpeedKbps > 0
        ? this.settings.maxUploadSpeedKbps * 1024
        : 50 * 1024 * 1024;
    this.uploadBucketTokens = Math.min(
      ulCapacityBytes * 2,
      this.uploadBucketTokens + ulCapacityBytes * elapsedSeconds
    );
  }

  /**
   * Requests permission to send or receive bytes according to Token Bucket limits.
   */
  consumeBandwidth(bytes: number, type: 'download' | 'upload'): { allowed: boolean; grantedBytes: number } {
    this.refillBuckets();

    if (type === 'download') {
      if (this.settings.maxDownloadSpeedKbps === 0) {
        return { allowed: true, grantedBytes: bytes };
      }
      if (this.downloadBucketTokens <= 0) {
        return { allowed: false, grantedBytes: 0 };
      }
      const granted = Math.min(bytes, Math.floor(this.downloadBucketTokens));
      this.downloadBucketTokens -= granted;
      return { allowed: granted > 0, grantedBytes: granted };
    } else {
      if (this.settings.maxUploadSpeedKbps === 0) {
        return { allowed: true, grantedBytes: bytes };
      }
      if (this.uploadBucketTokens <= 0) {
        return { allowed: false, grantedBytes: 0 };
      }
      const granted = Math.min(bytes, Math.floor(this.uploadBucketTokens));
      this.uploadBucketTokens -= granted;
      return { allowed: granted > 0, grantedBytes: granted };
    }
  }

  /**
   * Tracks and updates per-torrent seeding ratio.
   */
  recordTorrentTransfer(infoHash: string, downloadedBytes: number, uploadedBytes: number): TorrentRatioState {
    const key = infoHash.toLowerCase();
    let state = this.torrentRatios.get(key);

    if (!state) {
      state = {
        infoHash: key,
        totalDownloadedBytes: downloadedBytes,
        totalUploadedBytes: uploadedBytes,
        ratio: downloadedBytes > 0 ? uploadedBytes / downloadedBytes : 1.0,
        isSeedingHalted: false,
      };
      this.torrentRatios.set(key, state);
    } else {
      state.totalDownloadedBytes += downloadedBytes;
      state.totalUploadedBytes += uploadedBytes;
      state.ratio =
        state.totalDownloadedBytes > 0
          ? state.totalUploadedBytes / state.totalDownloadedBytes
          : 1.0;
    }

    // Check if seeding ratio threshold reached
    if (
      this.settings.seedingRatioLimit > 0 &&
      state.totalDownloadedBytes > 0 &&
      state.ratio >= this.settings.seedingRatioLimit
    ) {
      state.isSeedingHalted = true;
      state.seedingHaltedReason = `Target ratio reached (${state.ratio.toFixed(2)} >= ${this.settings.seedingRatioLimit})`;
    }

    this.recordTransfer(downloadedBytes, uploadedBytes);
    return state;
  }

  getTorrentRatioState(infoHash: string): TorrentRatioState | undefined {
    return this.torrentRatios.get(infoHash.toLowerCase());
  }

  recordTransfer(downloadedBytes: number, uploadedBytes: number) {
    this.totalDownloaded += downloadedBytes;
    this.totalUploaded += uploadedBytes;
    this.currentDownloadSpeed = downloadedBytes;
    this.currentUploadSpeed = uploadedBytes;
  }

  getStats(activeDownloads = 0, activeSeeds = 0): BandwidthUsageStats {
    this.refillBuckets();
    return {
      currentDownloadSpeedBps: this.currentDownloadSpeed,
      currentUploadSpeedBps: this.currentUploadSpeed,
      totalBytesDownloaded: this.totalDownloaded,
      totalBytesUploaded: this.totalUploaded,
      activeDownloadCount: activeDownloads,
      activeSeedCount: activeSeeds,
      availableDownloadTokens: Math.floor(this.downloadBucketTokens),
      availableUploadTokens: Math.floor(this.uploadBucketTokens),
    };
  }

  shouldHaltSeeding(infoHash: string): boolean {
    const state = this.torrentRatios.get(infoHash.toLowerCase());
    return state ? state.isSeedingHalted : false;
  }
}

export const bandwidthScheduler = new BandwidthScheduler();
