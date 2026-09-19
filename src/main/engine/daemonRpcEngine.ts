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

import http from 'http';
import { EventEmitter } from 'events';
import { SwarmTorrentStatus } from '../../protocol/types';

export interface DaemonConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  rpcPath: string;
  timeoutMs?: number;
}

export interface DaemonTorrentInfo {
  id: number;
  name: string;
  hashString: string;
  status: number; // 0=stopped, 1=check_wait, 2=check, 3=download_wait, 4=download, 5=seed_wait, 6=seed
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  uploadRatio: number;
  downloadDir: string;
  totalSize?: number;
  sizeWhenDone?: number;
  leftUntilDone?: number;
  eta?: number;
  errorString?: string;
}

/**
 * Maps Transmission / rqbit daemon integer status codes to RenegadeSwarm torrent states.
 */
export function mapDaemonStatus(status: number): SwarmTorrentStatus['state'] {
  switch (status) {
    case 0:
      return 'paused'; // TR_STATUS_STOPPED
    case 1:
      return 'queued'; // TR_STATUS_CHECK_WAIT
    case 2:
      return 'verifying'; // TR_STATUS_CHECK
    case 3:
      return 'queued'; // TR_STATUS_DOWNLOAD_WAIT
    case 4:
      return 'downloading'; // TR_STATUS_DOWNLOAD
    case 5:
      return 'queued'; // TR_STATUS_SEED_WAIT
    case 6:
      return 'seeding'; // TR_STATUS_SEED
    default:
      return 'downloading';
  }
}

export class DaemonRpcEngine extends EventEmitter {
  private config: DaemonConfig;
  private sessionId: string = '';

  constructor(config?: Partial<DaemonConfig>) {
    super();
    this.config = {
      host: '127.0.0.1',
      port: 9091,
      rpcPath: '/transmission/rpc',
      timeoutMs: 5000,
      ...(config || {}),
    };
  }

  /**
   * Health check to confirm local BitTorrent daemon (Transmission / rqbit) is responsive.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.executeRpc('session-get');
      return res && res.result === 'success';
    } catch {
      return false;
    }
  }

  /**
   * Executes a JSON-RPC request against the local BitTorrent daemon.
   */
  async executeRpc<T = any>(method: string, args: Record<string, any> = {}): Promise<{ result: string; arguments: T }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        method,
        arguments: args,
        tag: Math.floor(Math.random() * 1000000),
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(payload)),
        'X-Transmission-Session-Id': this.sessionId,
      };

      if (this.config.username && this.config.password) {
        const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const options: http.RequestOptions = {
        hostname: this.config.host,
        port: this.config.port,
        path: this.config.rpcPath,
        method: 'POST',
        headers,
        timeout: this.config.timeoutMs || 5000,
      };

      const req = http.request(options, (res) => {
        // Handle CSRF 409 Conflict with session-id challenge
        if (res.statusCode === 409 && res.headers['x-transmission-session-id']) {
          this.sessionId = res.headers['x-transmission-session-id'] as string;
          // Retry with acquired session token
          return resolve(this.executeRpc<T>(method, args));
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (err: any) {
            reject(new Error(`Failed to parse daemon RPC response: ${err.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Daemon RPC request timed out'));
      });

      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    });
  }

  async addMagnet(magnetUri: string, downloadDir: string): Promise<number> {
    const res = await this.executeRpc('torrent-add', {
      filename: magnetUri,
      'download-dir': downloadDir,
      paused: false,
    });
    const torrent = res.arguments?.['torrent-added'] || res.arguments?.['torrent-duplicate'];
    return torrent?.id || 0;
  }

  async addTorrentBuffer(buffer: Buffer, downloadDir: string): Promise<number> {
    const res = await this.executeRpc('torrent-add', {
      metainfo: buffer.toString('base64'),
      'download-dir': downloadDir,
      paused: false,
    });
    const torrent = res.arguments?.['torrent-added'] || res.arguments?.['torrent-duplicate'];
    return torrent?.id || 0;
  }

  async getTorrents(): Promise<DaemonTorrentInfo[]> {
    const fields = [
      'id',
      'name',
      'hashString',
      'status',
      'percentDone',
      'rateDownload',
      'rateUpload',
      'peersConnected',
      'peersSendingToUs',
      'peersGettingFromUs',
      'uploadRatio',
      'downloadDir',
      'totalSize',
      'sizeWhenDone',
      'leftUntilDone',
      'eta',
      'errorString',
    ];

    const res = await this.executeRpc('torrent-get', { fields });
    return res.arguments?.torrents || [];
  }

  async pauseTorrent(id: number | number[]): Promise<boolean> {
    const ids = Array.isArray(id) ? id : [id];
    const res = await this.executeRpc('torrent-stop', { ids });
    return res.result === 'success';
  }

  async resumeTorrent(id: number | number[]): Promise<boolean> {
    const ids = Array.isArray(id) ? id : [id];
    const res = await this.executeRpc('torrent-start', { ids });
    return res.result === 'success';
  }

  async removeTorrent(id: number | number[], deleteLocalData = false): Promise<boolean> {
    const ids = Array.isArray(id) ? id : [id];
    const res = await this.executeRpc('torrent-remove', {
      ids,
      'delete-local-data': deleteLocalData,
    });
    return res.result === 'success';
  }

  async setSpeedLimits(params: {
    downloadLimitKbps?: number;
    uploadLimitKbps?: number;
    seedRatioLimit?: number;
  }): Promise<boolean> {
    const args: Record<string, any> = {};

    if (params.downloadLimitKbps !== undefined) {
      args['speed-limit-down'] = params.downloadLimitKbps;
      args['speed-limit-down-enabled'] = params.downloadLimitKbps > 0;
    }

    if (params.uploadLimitKbps !== undefined) {
      args['speed-limit-up'] = params.uploadLimitKbps;
      args['speed-limit-up-enabled'] = params.uploadLimitKbps > 0;
    }

    if (params.seedRatioLimit !== undefined) {
      args['seedRatioLimit'] = params.seedRatioLimit;
      args['seedRatioLimited'] = params.seedRatioLimit > 0;
    }

    const res = await this.executeRpc('session-set', args);
    return res.result === 'success';
  }

  /**
   * Configures Transmission session to hold all incomplete/in-progress downloads
   * in the secure quarantine directory prior to hash verification and promotion.
   */
  async configureQuarantineSession(quarantineDir: string): Promise<boolean> {
    try {
      const res = await this.executeRpc('session-set', {
        'incomplete-dir': quarantineDir,
        'incomplete-dir-enabled': true,
      });
      return res && res.result === 'success';
    } catch {
      return false;
    }
  }
}

export const daemonRpcEngine = new DaemonRpcEngine();
