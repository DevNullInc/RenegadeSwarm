/**
 * RenegadeSwarm - Model Manifest & Swarm Envelope Builder
 * Generates cryptographic hashes, piece hashes, web seeds, and packaging metadata.
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

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export function computeBitTorrentInfoHash(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

export async function buildSwarmManifest(
  req: CreateSwarmPackageRequest,
  options?: { pieceLength?: number; announceList?: string[][]; urlList?: string[] }
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
  const modelSha256 = await computeFileSha256(req.modelFilePath);
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
    const previewSha256 = await computeFileSha256(req.previewFilePath);
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
    createdBy: 'RenegadeSwarm/0.1.0',
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
