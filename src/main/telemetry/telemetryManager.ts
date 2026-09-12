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
