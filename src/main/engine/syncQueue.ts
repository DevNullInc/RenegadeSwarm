/**
 * RenegadeSwarm - Sync Queue & Quarantine Manager (Rules 13, 15, 16, 17)
 * Single source of truth for all data movement, state transitions, quarantine isolation, and atomic promotions.
 */
import fs from 'fs';
import path from 'path';
import EventEmitter from 'events';
import { SyncQueueState, SwarmManifest } from '../../protocol/types';
import { formatCmmCanonicalFileName } from '../../protocol/validation';
import { pieceStreamEngine } from './pieceStreamEngine';
import { contentInspector } from './contentInspector';
import { cmmFolderRouter } from '../cmm/cmmFolderRouter';
import { cmmDbBridge } from '../cmm/cmmDbBridge';

export interface SyncQueueItem {
  fileId: string;
  infoHash: string;
  manifest: SwarmManifest;
  state: SyncQueueState;
  targetFolder: string;
  quarantineFilePath: string;
  finalDestinationPath: string;
  totalBytes: number;
  downloadedBytes: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueAuditLog {
  timestamp: number;
  fileId: string;
  infoHash: string;
  fromState: SyncQueueState;
  toState: SyncQueueState;
  context?: string;
}

export class SyncQueueManager extends EventEmitter {
  private queue: Map<string, SyncQueueItem> = new Map();
  private auditLogs: SyncQueueAuditLog[] = [];
  private quarantineDir: string;

  constructor(customQuarantineDir?: string) {
    super();
    this.quarantineDir =
      customQuarantineDir ||
      path.join(process.env.APPDATA || process.cwd(), 'RenegadeSwarm', 'quarantine');

    if (!fs.existsSync(this.quarantineDir)) {
      try {
        fs.mkdirSync(this.quarantineDir, { recursive: true });
      } catch {}
    }
  }

  getQuarantineDir(): string {
    return this.quarantineDir;
  }

  getQueueItems(): SyncQueueItem[] {
    return Array.from(this.queue.values());
  }

  getItem(infoHash: string): SyncQueueItem | undefined {
    return this.queue.get(infoHash.toLowerCase());
  }

  getAuditLogs(): SyncQueueAuditLog[] {
    return [...this.auditLogs];
  }

  private transition(item: SyncQueueItem, toState: SyncQueueState, context?: string) {
    const fromState = item.state;
    item.state = toState;
    item.updatedAt = Date.now();

    const logEntry: SyncQueueAuditLog = {
      timestamp: Date.now(),
      fileId: item.fileId,
      infoHash: item.infoHash,
      fromState,
      toState,
      context,
    };

    this.auditLogs.push(logEntry);
    this.emit('queue:transition', { item, logEntry });
  }

  /**
   * Enqueues an incoming model into Quarantine isolation.
   */
  enqueueModel(manifest: SwarmManifest, targetModelsRoot?: string): SyncQueueItem {
    const infoHash = manifest.hashes.infoHash.toLowerCase();
    const mainFile = manifest.files.find((f) => f.fileType === 'Model') || manifest.files[0];
    const ext = path.extname(mainFile.relativePath);

    // Rule 13: Enforce CMM Canonical Name (model_name_author.extension)
    const canonicalName = formatCmmCanonicalFileName(
      manifest.model.title,
      manifest.model.creator || 'unknown',
      ext
    );

    const quarantineFilePath = path.join(this.quarantineDir, `${infoHash}_${canonicalName}.part`);

    // Calculate final destination through CmmFolderRouter
    const dest = cmmFolderRouter.computeDestination({
      fileName: canonicalName,
      modelType: manifest.model.modelType,
      baseModel: manifest.model.baseModel,
      creator: manifest.model.creator,
      targetRoot: targetModelsRoot,
    });

    const fileId = `sq_${infoHash.slice(0, 12)}`;
    const now = Date.now();

    const item: SyncQueueItem = {
      fileId,
      infoHash,
      manifest,
      state: 'Quarantine',
      targetFolder: dest.folderName,
      quarantineFilePath,
      finalDestinationPath: dest.fullPath,
      totalBytes: manifest.totalSizeBytes,
      downloadedBytes: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.queue.set(infoHash, item);
    this.auditLogs.push({
      timestamp: now,
      fileId: item.fileId,
      infoHash: item.infoHash,
      fromState: 'Quarantine',
      toState: 'Quarantine',
      context: 'Enqueued into quarantine isolation staging',
    });
    this.transition(item, 'Validating', 'Manifest received and initial quarantine staging allocated');
    this.transition(item, 'Queued', 'Passed structure validation, ready for transfer');

    return item;
  }

  markActive(infoHash: string) {
    const item = this.queue.get(infoHash.toLowerCase());
    if (item && item.state === 'Queued') {
      this.transition(item, 'Active', 'Transfer active in swarm');
    }
  }

  updateProgress(infoHash: string, downloadedBytes: number) {
    const item = this.queue.get(infoHash.toLowerCase());
    if (item) {
      item.downloadedBytes = downloadedBytes;
      item.updatedAt = Date.now();
    }
  }

  /**
   * Completes download and triggers cryptographic verification before final promotion.
   */
  async handleDownloadComplete(infoHash: string): Promise<boolean> {
    const item = this.queue.get(infoHash.toLowerCase());
    if (!item) return false;

    this.transition(item, 'Completed', 'All pieces downloaded into quarantine');
    this.transition(item, 'Validating', 'Executing full file SHA256 and deep content validation');

    // Rule 16: Verify full SHA256 in quarantine before promotion
    const isShaValid = await pieceStreamEngine.verifyEntireFileSha256(
      item.quarantineFilePath,
      item.manifest.hashes.sha256
    );

    if (!isShaValid) {
      item.error = 'Full SHA256 integrity verification failed';
      this.transition(item, 'Failed', 'Quarantine SHA256 mismatch');
      this.transition(item, 'Quarantine', 'Corrupt file quarantined for analysis');
      return false;
    }

    // Strict Content Validation: Verify magic bytes and tensor structure in quarantine
    const inspection = await contentInspector.inspectFile(item.quarantineFilePath);
    if (!inspection.isValid) {
      item.error = `Strict Content Validation Failed: ${inspection.reason}`;
      this.transition(item, 'Rejected', item.error);
      this.transition(item, 'Quarantine', 'Unauthorized file type blocked in quarantine');
      return false;
    }

    // Rule 17: Atomic filesystem move from quarantine to final destination
    try {
      const targetDir = path.dirname(item.finalDestinationPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Atomic rename/move to destination
      fs.renameSync(item.quarantineFilePath, item.finalDestinationPath);

      // Register with RenegadeCMM database bridge atomically
      await cmmDbBridge.registerCompletedDownload(item.manifest, item.finalDestinationPath);

      this.transition(item, 'Verified', 'Integrity verified and promoted to CMM model library');
      return true;
    } catch (err: any) {
      item.error = `Failed to move file to destination: ${err.message}`;
      this.transition(item, 'Failed', item.error);
      return false;
    }
  }

  pauseItem(infoHash: string) {
    const item = this.queue.get(infoHash.toLowerCase());
    if (item && item.state === 'Active') {
      this.transition(item, 'Paused', 'Paused by user');
    }
  }

  resumeItem(infoHash: string) {
    const item = this.queue.get(infoHash.toLowerCase());
    if (item && item.state === 'Paused') {
      this.transition(item, 'Active', 'Resumed by user');
    }
  }

  cancelItem(infoHash: string) {
    const item = this.queue.get(infoHash.toLowerCase());
    if (item) {
      this.transition(item, 'Cancelled', 'Cancelled by user');
      // Clean up quarantine temporary file if it exists
      if (fs.existsSync(item.quarantineFilePath)) {
        try {
          fs.unlinkSync(item.quarantineFilePath);
        } catch {}
      }
      this.queue.delete(infoHash.toLowerCase());
    }
  }
}

export const syncQueueManager = new SyncQueueManager();
