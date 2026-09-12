/**
 * RenegadeSwarm - External Daemon JSON-RPC Engine Adapter (Option 1)
 * Controls high-throughput native daemon (e.g. Transmission-daemon / rqbit) via JSON-RPC.
 */
import http from 'http';
import { EventEmitter } from 'events';

export interface DaemonConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  rpcPath: string;
}

export interface DaemonTorrentInfo {
  id: number;
  name: string;
  hashString: string;
  status: number; // 0=stopped, 4=downloading, 6=seeding
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs: number;
  uploadRatio: number;
  downloadDir: string;
  errorString?: string;
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
      ...(config || {}),
    };
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
      };

      const req = http.request(options, (res) => {
        // Handle CSRF 409 Conflict with session-id challenge
        if (res.statusCode === 409 && res.headers['x-transmission-session-id']) {
          this.sessionId = res.headers['x-transmission-session-id'] as string;
          // Retry with acquired session token
          return resolve(this.executeRpc(method, args));
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
    const torrent = res.arguments['torrent-added'] || res.arguments['torrent-duplicate'];
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
}

export const daemonRpcEngine = new DaemonRpcEngine();
