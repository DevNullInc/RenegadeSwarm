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
import { cmmDbBridge } from '../cmm/cmmDbBridge';

export interface ExtractedModelMetadata {
  modelFilePath: string;
  fileName: string;
  fileSizeBytes: number;
  previewFilePath?: string;
  title: string;
  version: string;
  modelType: string;
  baseModel: string;
  creator: string;
  description: string;
  tags: string[];
  civitaiModelId?: number;
  hfRepoId?: string;
  sha256?: string;
}

export class ModelMetadataExtractor {
  /**
   * Extracts metadata from local file headers, RenegadeCMM DB, and online registries (CivitAI/HuggingFace).
   */
  async extractMetadata(filePath: string): Promise<ExtractedModelMetadata> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    const stat = fs.statSync(resolvedPath);
    const fileName = path.basename(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const dir = path.dirname(resolvedPath);

    let title = '';
    let version = '1.0.0';
    let modelType = this.guessModelTypeFromPath(resolvedPath);
    let baseModel = '';
    let creator = '';
    let description = '';
    let tags: string[] = [];
    let civitaiModelId: number | undefined;
    let hfRepoId: string | undefined;
    let previewFilePath = this.findSiblingPreviewImage(dir, fileName);

    // 1. Try extracting embedded metadata from .safetensors header
    if (ext === '.safetensors') {
      try {
        const headerMeta = await this.readSafetensorsMetadata(resolvedPath);
        if (headerMeta) {
          if (headerMeta.title) title = headerMeta.title;
          if (headerMeta.author) creator = headerMeta.author;
          if (headerMeta.version) version = headerMeta.version;
          if (headerMeta.architecture || headerMeta.baseModel) baseModel = headerMeta.architecture || headerMeta.baseModel;
          if (headerMeta.description) description = headerMeta.description;
          if (headerMeta.tags && Array.isArray(headerMeta.tags)) tags = headerMeta.tags;
          if (headerMeta.modelType) modelType = headerMeta.modelType;
        }
      } catch {
        // Fall through on corrupt or partial headers
      }
    }

    // 2. Query RenegadeCMM local SQLite database for existing model record
    try {
      const cmmModels = await cmmDbBridge.getLocalModels();
      const matched = cmmModels.find(
        (m) => path.resolve(m.file_path).toLowerCase() === resolvedPath.toLowerCase() || m.file_name === fileName
      );

      if (matched) {
        if (!title && matched.civitai_name) title = matched.civitai_name;
        if (matched.civitai_model_id) civitaiModelId = matched.civitai_model_id;
        if (matched.hf_repo_id) hfRepoId = matched.hf_repo_id;
        if (matched.model_type) modelType = this.normalizeModelType(matched.model_type);
      }
    } catch {
      // CMM DB not available
    }

    // 3. Fallback: Format clean title from filename if title still empty
    if (!title) {
      title = this.formatTitleFromFileName(fileName);
    }

    // 4. Compute SHA256 (or fast hash) and query CivitAI if online and missing creator/details
    let sha256: string | undefined;
    try {
      // Compute full sha256 if file is <= 2GB, or fast first 16MB digest
      if (stat.size <= 2 * 1024 * 1024 * 1024) {
        sha256 = await this.computeFileSha256(resolvedPath);
      }
    } catch {
      // Ignore hash computation errors
    }

    if ((!creator || !civitaiModelId) && sha256) {
      try {
        const civitaiInfo = await this.fetchCivitaiMetadataByHash(sha256);
        if (civitaiInfo) {
          if (civitaiInfo.modelName) {
            title = civitaiInfo.versionName ? `${civitaiInfo.modelName} (${civitaiInfo.versionName})` : civitaiInfo.modelName;
          }
          if (civitaiInfo.creator) creator = civitaiInfo.creator;
          if (civitaiInfo.baseModel && !baseModel) baseModel = civitaiInfo.baseModel;
          if (civitaiInfo.modelType) modelType = this.normalizeModelType(civitaiInfo.modelType);
          if (civitaiInfo.modelId) civitaiModelId = civitaiInfo.modelId;
          if (civitaiInfo.description && !description) description = civitaiInfo.description;
        }
      } catch {
        // Network query timed out or unavailable
      }
    }

    return {
      modelFilePath: resolvedPath,
      fileName,
      fileSizeBytes: stat.size,
      previewFilePath,
      title: title || this.formatTitleFromFileName(fileName),
      version: version || '1.0.0',
      modelType: modelType || 'Checkpoint',
      baseModel: baseModel || this.guessBaseModel(fileName),
      creator: creator || '',
      description: description || '',
      tags,
      civitaiModelId,
      hfRepoId,
      sha256,
    };
  }

  /**
   * Reads the 8-byte header and __metadata__ block from a Safetensors file.
   */
  private async readSafetensorsMetadata(filePath: string): Promise<Record<string, any> | null> {
    const fd = await fs.promises.open(filePath, 'r');
    try {
      const headerLenBuf = Buffer.alloc(8);
      await fd.read(headerLenBuf, 0, 8, 0);
      const headerLen = Number(headerLenBuf.readBigUInt64LE(0));

      // Limit header parse size to 25MB for safety
      if (headerLen <= 0 || headerLen > 25 * 1024 * 1024) {
        return null;
      }

      const headerBuf = Buffer.alloc(headerLen);
      await fd.read(headerBuf, 0, headerLen, 8);
      const headerJson = JSON.parse(headerBuf.toString('utf8'));

      if (headerJson.__metadata__) {
        const meta = headerJson.__metadata__;
        return {
          title: meta['modelspec.title'] || meta.title || meta.ss_output_name || meta.ss_model_name,
          author: meta['modelspec.author'] || meta.author || meta.creator || meta.ss_author,
          version: meta['modelspec.version'] || meta.version || '1.0.0',
          architecture: meta['modelspec.architecture'] || meta['modelspec.prediction_type'] || meta.ss_base_model_version,
          baseModel: meta.baseModel || meta.ss_base_model_version,
          description: meta['modelspec.description'] || meta.description,
          tags: meta['modelspec.tags'] ? (typeof meta['modelspec.tags'] === 'string' ? meta['modelspec.tags'].split(',').map((t: string) => t.trim()).filter(Boolean) : meta['modelspec.tags']) : undefined,
          modelType: meta['modelspec.type'] || (meta.ss_network_module ? 'LORA' : undefined),
        };
      }
      return null;
    } finally {
      await fd.close();
    }
  }

  /**
   * Discovers sibling preview images (.preview.png, .png, .jpg, .webp).
   */
  private findSiblingPreviewImage(dir: string, fileName: string): string | undefined {
    const baseName = path.parse(fileName).name;
    const candidates = [
      `${baseName}.preview.png`,
      `${baseName}.preview.webp`,
      `${baseName}.preview.jpg`,
      `${baseName}.png`,
      `${baseName}.webp`,
      `${baseName}.jpg`,
      `${baseName}.jpeg`,
    ];

    for (const cand of candidates) {
      const p = path.join(dir, cand);
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return undefined;
  }

  /**
   * Formats a readable title from raw filenames (e.g. "flux1-dev-v2.safetensors" -> "Flux1 Dev V2").
   */
  private formatTitleFromFileName(fileName: string): string {
    const raw = path.parse(fileName).name;
    return raw
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  /**
   * Guesses model type based on directory path or filename conventions.
   */
  private guessModelTypeFromPath(filePath: string): string {
    const normalized = filePath.toLowerCase().replace(/\\/g, '/');
    if (normalized.includes('/loras/') || normalized.includes('lora')) return 'LORA';
    if (normalized.includes('/checkpoints/') || normalized.includes('checkpoint')) return 'Checkpoint';
    if (normalized.includes('/unet/') || normalized.includes('unet')) return 'UNet';
    if (normalized.includes('/vae/') || normalized.includes('vae')) return 'VAE';
    if (normalized.includes('/controlnet/') || normalized.includes('controlnet')) return 'Controlnet';
    if (normalized.includes('/upscale') || normalized.includes('upscaler')) return 'Upscaler';
    if (normalized.includes('/text_encoders/') || normalized.includes('clip')) return 'TextEncoder';
    return 'Checkpoint';
  }

  private normalizeModelType(rawType: string): string {
    const t = rawType.toLowerCase();
    if (t.includes('lora')) return 'LORA';
    if (t.includes('checkpoint') || t.includes('model')) return 'Checkpoint';
    if (t.includes('unet')) return 'UNet';
    if (t.includes('vae')) return 'VAE';
    if (t.includes('controlnet')) return 'Controlnet';
    if (t.includes('upscaler') || t.includes('upscale')) return 'Upscaler';
    if (t.includes('text') || t.includes('clip')) return 'TextEncoder';
    return 'Checkpoint';
  }

  private guessBaseModel(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.includes('flux')) return 'Flux.1 D';
    if (lower.includes('sdxl')) return 'SDXL 1.0';
    if (lower.includes('pony')) return 'Pony';
    if (lower.includes('sd15') || lower.includes('v1-5') || lower.includes('sd1.5')) return 'SD 1.5';
    if (lower.includes('sd3')) return 'SD 3.5';
    return 'Flux.1 D';
  }

  /**
   * Computes streaming SHA256 of the model file.
   */
  private async computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  /**
   * Queries CivitAI public API for model version metadata by SHA256 hash.
   */
  private async fetchCivitaiMetadataByHash(hash: string): Promise<{
    modelId?: number;
    modelName?: string;
    versionName?: string;
    creator?: string;
    modelType?: string;
    baseModel?: string;
    description?: string;
  } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${hash}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.1.0' },
      });

      if (!response.ok) return null;

      const data: any = await response.json();
      return {
        modelId: data.modelId,
        modelName: data.model?.name,
        versionName: data.name,
        creator: data.model?.creator?.username,
        modelType: data.model?.type,
        baseModel: data.baseModel,
        description: data.description ? data.description.replace(/<[^>]*>?/gm, '') : undefined,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const modelMetadataExtractor = new ModelMetadataExtractor();
