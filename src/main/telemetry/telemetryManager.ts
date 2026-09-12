/**
 * RenegadeSwarm - Privacy-First Anonymous Swarm Telemetry (Opt-in)
 * Zero tracking of IPs, file paths, model names, or personal identities.
 */

export interface AnonymousTelemetryStats {
  clientVersion: string;
  uptimeSeconds: number;
  totalCompletedDownloads: number;
  totalFailedValidations: number;
  averagePeersPerSwarm: number;
  uploadRatioAggregate: number;
  bandwidthTier: string; // e.g. '10-25MB/s'
}

export class TelemetryManager {
  private isOptedIn: boolean = false;
  private startTime: number = Date.now();
  private completedCount: number = 0;
  private failedValidationCount: number = 0;

  setOptIn(enabled: boolean) {
    this.isOptedIn = enabled;
  }

  getOptInStatus(): boolean {
    return this.isOptedIn;
  }

  recordCompletion() {
    if (!this.isOptedIn) return;
    this.completedCount++;
  }

  recordFailedValidation() {
    if (!this.isOptedIn) return;
    this.failedValidationCount++;
  }

  getSnapshot(avgPeers = 12, avgUploadRatio = 1.8): AnonymousTelemetryStats | null {
    if (!this.isOptedIn) return null;

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    return {
      clientVersion: '0.1.0',
      uptimeSeconds: uptime,
      totalCompletedDownloads: this.completedCount,
      totalFailedValidations: this.failedValidationCount,
      averagePeersPerSwarm: avgPeers,
      uploadRatioAggregate: parseFloat(avgUploadRatio.toFixed(2)),
      bandwidthTier: 'High-Speed (>10MB/s)',
    };
  }
}

export const telemetryManager = new TelemetryManager();
