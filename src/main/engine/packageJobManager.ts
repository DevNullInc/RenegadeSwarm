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

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  CreateSwarmPackageRequest,
  CreateSwarmPackageRequestSchema,
  PackageJobProgress,
  PackageJobPhase,
} from '../../shared/ipcContracts';
import { SwarmManifest } from '../../protocol/types';
import { FORBIDDEN_EXTENSIONS } from '../../shared/cmmTypes';
import { sharingPolicyManager } from './sharingPolicyManager';
import { contentInspector } from './contentInspector';
import {
  computeFileSha256,
  buildSwarmManifest,
} from './manifestBuilder';
import { swarmEngine } from './swarmEngine';
import { debugLogManager } from '../telemetry/debugLogManager';

export class PackageJobManager extends EventEmitter {
  private currentJob: PackageJobProgress | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    super();
  }

  public getActiveJob(): PackageJobProgress | null {
    return this.currentJob;
  }

  public getJob(jobId: string): PackageJobProgress | null {
    if (this.currentJob && this.currentJob.jobId === jobId) {
      return this.currentJob;
    }
    return null;
  }

  public cancelJob(jobId?: string): boolean {
    if (!this.currentJob) return false;
    if (jobId && this.currentJob.jobId !== jobId) return false;

    if (
      this.currentJob.phase === 'completed' ||
      this.currentJob.phase === 'error' ||
      this.currentJob.phase === 'idle'
    ) {
      return false;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.updateJobState({
      phase: 'error',
      error: 'Packaging job cancelled by user',
    });

    return true;
  }

  public clearJob(): boolean {
    if (
      this.currentJob &&
      (this.currentJob.phase === 'completed' ||
        this.currentJob.phase === 'error' ||
        this.currentJob.phase === 'idle')
    ) {
      this.currentJob = null;
      this.abortController = null;
      this.emit('progress', null);
      return true;
    }
    return false;
  }

  public async startJob(rawReq: CreateSwarmPackageRequest): Promise<PackageJobProgress> {
    if (
      this.currentJob &&
      (this.currentJob.phase === 'hashing' ||
        this.currentJob.phase === 'validating' ||
        this.currentJob.phase === 'generating_manifest' ||
        this.currentJob.phase === 'seeding')
    ) {
      throw new Error(`A packaging job is already in progress (Job ID: ${this.currentJob.jobId})`);
    }

    const req = CreateSwarmPackageRequestSchema.parse(rawReq);

    if (!fs.existsSync(req.modelFilePath)) {
      throw new Error(`Model file not found: ${req.modelFilePath}`);
    }

    const ext = path.extname(req.modelFilePath).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      throw new Error(`Security Exception: Cannot package forbidden file type ${ext}`);
    }

    // Evaluate sharing policy
    const shareEvaluation = sharingPolicyManager.evaluatePermission({
      filePath: req.modelFilePath,
      fileName: path.basename(req.modelFilePath),
      modelType: req.modelType,
      baseModel: req.baseModel,
      tags: req.tags,
      isExplicitlyOptedIn: true,
    });

    if (!shareEvaluation.canShare) {
      throw new Error(`Sharing Policy Violation: ${shareEvaluation.reason}`);
    }

    const modelStats = fs.statSync(req.modelFilePath);
    let totalExpectedBytes = modelStats.size;

    if (req.previewFilePath && fs.existsSync(req.previewFilePath)) {
      const previewStats = fs.statSync(req.previewFilePath);
      totalExpectedBytes += previewStats.size;
    }

    const jobId = crypto.randomUUID();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.currentJob = {
      jobId,
      phase: 'hashing',
      modelFilePath: req.modelFilePath,
      bytesProcessed: 0,
      totalBytes: totalExpectedBytes,
      percent: 0,
      currentFile: path.basename(req.modelFilePath),
      request: req,
      createdAt: Date.now(),
    };

    debugLogManager.logInfo('SEEDER', `Starting packaging job for "${path.basename(req.modelFilePath)}" (${(totalExpectedBytes / (1024 * 1024)).toFixed(1)} MB) [${req.modelType}, base: ${req.baseModel || 'SD 1.5'}]`);

    this.emitProgress();

    // Run async background packaging loop
    this.executePackagingPipeline(req, signal).catch((err) => {
      if (this.currentJob && this.currentJob.jobId === jobId) {
        if (signal.aborted && this.currentJob.phase === 'error') {
          // Already handled by cancelJob
          return;
        }
        this.updateJobState({
          phase: 'error',
          error: err.message || 'Unknown packaging error',
        });
      }
    });

    return this.currentJob;
  }

  private async executePackagingPipeline(
    req: CreateSwarmPackageRequest,
    signal: AbortSignal
  ): Promise<void> {
    const modelStats = fs.statSync(req.modelFilePath);
    let previewStats: fs.Stats | null = null;
    if (req.previewFilePath && fs.existsSync(req.previewFilePath)) {
      previewStats = fs.statSync(req.previewFilePath);
    }
    const totalBytes = modelStats.size + (previewStats ? previewStats.size : 0);

    // 1. Hashing Phase
    this.updateJobState({
      phase: 'hashing',
      currentFile: path.basename(req.modelFilePath),
      bytesProcessed: 0,
      totalBytes,
      percent: 0,
    });

    let lastProgressEmit = Date.now();
    const modelSha256 = await computeFileSha256(
      req.modelFilePath,
      (bytesRead) => {
        if (signal.aborted) return;
        const now = Date.now();
        const currentTotalProcessed = bytesRead;
        const percent = totalBytes > 0 ? Math.min(99, Math.floor((currentTotalProcessed / totalBytes) * 100)) : 0;
        if (now - lastProgressEmit > 75 || bytesRead === modelStats.size) {
          lastProgressEmit = now;
          this.updateJobState({
            bytesProcessed: currentTotalProcessed,
            percent,
          });
        }
      },
      signal
    );

    debugLogManager.logInfo('SEEDER', `Computed SHA-256 hash for "${path.basename(req.modelFilePath)}": ${modelSha256.slice(0, 16)}...`);

    let previewSha256: string | undefined;
    if (req.previewFilePath && fs.existsSync(req.previewFilePath)) {
      if (signal.aborted) throw new Error('Operation aborted');
      this.updateJobState({
        currentFile: path.basename(req.previewFilePath),
      });

      previewSha256 = await computeFileSha256(
        req.previewFilePath,
        (bytesRead) => {
          if (signal.aborted) return;
          const now = Date.now();
          const currentTotalProcessed = modelStats.size + bytesRead;
          const percent = totalBytes > 0 ? Math.min(99, Math.floor((currentTotalProcessed / totalBytes) * 100)) : 0;
          if (now - lastProgressEmit > 75 || (previewStats && bytesRead === previewStats.size)) {
            lastProgressEmit = now;
            this.updateJobState({
              bytesProcessed: currentTotalProcessed,
              percent,
            });
          }
        },
        signal
      );
    }

    if (signal.aborted) throw new Error('Operation aborted');

    // 2. Validation Phase
    this.updateJobState({
      phase: 'validating',
      percent: 95,
      bytesProcessed: totalBytes,
      currentFile: path.basename(req.modelFilePath),
    });

    const inspection = await contentInspector.inspectFile(req.modelFilePath);
    if (!inspection.isValid) {
      throw new Error(`Content Validation Failed: ${inspection.reason}`);
    }

    if (req.previewFilePath && fs.existsSync(req.previewFilePath)) {
      const previewInspection = await contentInspector.inspectFile(req.previewFilePath);
      if (!previewInspection.isValid) {
        throw new Error(`Preview Content Validation Failed: ${previewInspection.reason}`);
      }
    }

    if (signal.aborted) throw new Error('Operation aborted');

    // 3. Manifest Generation Phase
    this.updateJobState({
      phase: 'generating_manifest',
      percent: 98,
    });

    const manifest = await buildSwarmManifest(req, {
      precomputedModelSha256: modelSha256,
      precomputedPreviewSha256: previewSha256,
      abortSignal: signal,
    });

    debugLogManager.logInfo('MANIFEST', `Built signed swarm manifest for "${manifest.model.title}" (infoHash: ${manifest.hashes.infoHash.slice(0, 16)}...)`);

    if (signal.aborted) throw new Error('Operation aborted');

    // 4. Seeding Phase
    this.updateJobState({
      phase: 'seeding',
      percent: 99,
    });

    swarmEngine.registerSeedingManifest(manifest, req.modelFilePath);

    // 5. Completion
    this.updateJobState({
      phase: 'completed',
      percent: 100,
      bytesProcessed: totalBytes,
      manifest,
      completedAt: Date.now(),
    });

    debugLogManager.logInfo('SEEDER', `Packaging pipeline completed successfully for "${manifest.model.title}".`);

    this.abortController = null;
  }

  private updateJobState(updates: Partial<PackageJobProgress>): void {
    if (!this.currentJob) return;
    this.currentJob = {
      ...this.currentJob,
      ...updates,
    };
    this.emitProgress();
  }

  private emitProgress(): void {
    if (this.currentJob) {
      this.emit('progress', { ...this.currentJob });
      if (this.currentJob.phase === 'completed') {
        this.emit('completed', { ...this.currentJob });
      } else if (this.currentJob.phase === 'error') {
        this.emit('jobError', { ...this.currentJob });
      }
    }
  }
}

export const packageJobManager = new PackageJobManager();
