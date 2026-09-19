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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SwarmManifest,
  SwarmFileEntry,
} from '../../protocol/types';
import { SwarmManifestSchema } from '../../protocol/validation';
import { CreateSwarmPackageRequest } from '../../shared/ipcContracts';
import { FORBIDDEN_EXTENSIONS } from '../../shared/cmmTypes';
import { calculateOptimalPieceLength } from '../../protocol/crypto';

import { contentInspector } from './contentInspector';

export async function computeFileSha256(
  filePath: string,
  onProgress?: (bytesRead: number, totalBytes: number) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error('Operation aborted'));
    }
    const stat = fs.statSync(filePath);
    const totalBytes = stat.size;
    let bytesRead = 0;
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });

    const onAbort = () => {
      stream.destroy();
      reject(new Error('Operation aborted'));
    };
    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }

    stream.on('data', (chunk) => {
      bytesRead += chunk.length;
      hash.update(chunk);
      if (onProgress) {
        onProgress(bytesRead, totalBytes);
      }
    });
    stream.on('end', () => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      resolve(hash.digest('hex'));
    });
    stream.on('error', (err) => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      reject(err);
    });
  });
}

export function computeBitTorrentInfoHash(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

export interface BuildSwarmManifestOptions {
  pieceLength?: number;
  announceList?: string[][];
  urlList?: string[];
  precomputedModelSha256?: string;
  precomputedPreviewSha256?: string;
  onProgress?: (bytesRead: number, totalBytes: number) => void;
  abortSignal?: AbortSignal;
}

export async function buildSwarmManifest(
  req: CreateSwarmPackageRequest,
  options?: BuildSwarmManifestOptions
): Promise<SwarmManifest> {
  if (!fs.existsSync(req.modelFilePath)) {
    throw new Error(`Model file not found: ${req.modelFilePath}`);
  }

  const ext = path.extname(req.modelFilePath).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new Error(`Security Exception: Cannot package forbidden file type ${ext}`);
  }

  // Deep Content Inspection: Reject masquerading executables or non-AI files
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

  const modelStats = fs.statSync(req.modelFilePath);
  const modelSha256 = options?.precomputedModelSha256 || await computeFileSha256(req.modelFilePath, options?.onProgress, options?.abortSignal);
  const modelFileName = path.basename(req.modelFilePath);

  const files: SwarmFileEntry[] = [
    {
      relativePath: modelFileName,
      sizeBytes: modelStats.size,
      fileType: 'Model',
      targetSubfolder: req.modelType.toLowerCase(),
      sha256: modelSha256,
    },
  ];

  let totalSize = modelStats.size;

  if (req.previewFilePath && fs.existsSync(req.previewFilePath)) {
    const previewStats = fs.statSync(req.previewFilePath);
    const previewSha256 = options?.precomputedPreviewSha256 || await computeFileSha256(req.previewFilePath, undefined, options?.abortSignal);
    files.push({
      relativePath: path.basename(req.previewFilePath),
      sizeBytes: previewStats.size,
      fileType: 'Preview',
      targetSubfolder: req.modelType.toLowerCase(),
      sha256: previewSha256,
    });
    totalSize += previewStats.size;
  }

  const pieceLength = options?.pieceLength || calculateOptimalPieceLength(totalSize);

  // Generate deterministic InfoHash
  const infoHashPayload = `${modelSha256}:${req.title}:${req.version}:${totalSize}:${pieceLength}`;
  const infoHash = computeBitTorrentInfoHash(infoHashPayload);

  // Default web seeds from Hugging Face or CivitAI if provided
  const urlList: string[] = options?.urlList ? [...options.urlList] : [];
  if (req.hfRepoId) {
    urlList.push(`https://huggingface.co/${req.hfRepoId}/resolve/main/${encodeURIComponent(modelFileName)}`);
  }

  const rawManifest = {
    swarmSpecVersion: '1.0.0' as const,
    manifestId: crypto.randomUUID(),
    createdAt: Date.now(),
    createdBy: 'RenegadeSwarm/0.3.0',
    pieceLength,
    totalSizeBytes: totalSize,
    model: {
      title: req.title,
      version: req.version,
      modelType: req.modelType,
      baseModel: req.baseModel,
      creator: req.creator,
      nsfw: false,
      description: req.description,
      tags: req.tags,
      license: req.license,
      civitaiModelId: req.civitaiModelId,
      civitaiVersionId: req.civitaiVersionId,
      hfRepoId: req.hfRepoId,
      hfCommitSha: req.hfCommitSha,
    },
    hashes: {
      sha256: modelSha256,
      infoHash,
    },
    files,
    announceList: options?.announceList || [
      ['udp://tracker.opentrackr.org:1337/announce'],
      ['wss://tracker.webtorrent.dev'],
      ['udp://tracker.openbittorrent.com:6969/announce'],
    ],
    urlList,
  };

  return SwarmManifestSchema.parse(rawManifest);
}
