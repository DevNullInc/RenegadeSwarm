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
import os from 'os';
import crypto from 'crypto';
import { cmmDbBridge } from '../cmm/cmmDbBridge';
import { sharingPolicyManager } from '../engine/sharingPolicyManager';

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
  civitaiVersionId?: number;
  hfRepoId?: string;
  sha256?: string;
  isLlm?: boolean;
}

/**
 * Sanitizes incoming HTML text, converts breaks/paragraphs to clean newlines,
 * strips all remaining HTML tags, and thoroughly decodes all HTML entities into plaintext.
 */
export function sanitizeAndDecodeHtml(rawText?: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. Convert common break/block tags to appropriate newlines and list bullets
  text = text
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n\n');

  // 2. Strip all remaining HTML tags
  text = text.replace(/<[^>]*>?/gm, '');

  // 3. Named HTML Entities map
  const namedEntities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&laquo;': '«',
    '&raquo;': '»',
    '&bull;': '•',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
  };

  // Perform multiple decoding passes to resolve doubly encoded entities (e.g., &amp;lt; -> &lt; -> <)
  for (let pass = 0; pass < 3; pass++) {
    let replaced = false;

    for (const [entity, char] of Object.entries(namedEntities)) {
      if (text.includes(entity)) {
        text = text.replaceAll(entity, char);
        replaced = true;
      }
    }

    // Decimal entities: &#60; -> <, &#39; -> '
    if (text.includes('&#')) {
      const nextText = text.replace(/&#(\d+);/g, (_, dec) => {
        try {
          const code = parseInt(dec, 10);
          return String.fromCharCode(code);
        } catch {
          return '';
        }
      });
      if (nextText !== text) {
        text = nextText;
        replaced = true;
      }

      // Hex entities: &#x3c; -> <, &#x27; -> '
      const nextHexText = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try {
          const code = parseInt(hex, 16);
          return String.fromCharCode(code);
        } catch {
          return '';
        }
      });
      if (nextHexText !== text) {
        text = nextHexText;
        replaced = true;
      }
    }

    if (!replaced) break;
  }

  // 4. Clean up excessive consecutive newlines and normalize whitespace
  text = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

export class ModelMetadataExtractor {
  /**
   * Identifies whether a given model file or specification is an LLM (Large Language Model)
   * rather than an image/diffusion generation model.
   */
  isLlmModel(filePath: string, modelType?: string, fileName?: string): boolean {
    const resolvedFileName = fileName || path.basename(filePath);
    const lowerName = resolvedFileName.toLowerCase();
    const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');
    const ext = path.extname(resolvedFileName).toLowerCase();
    const lowerType = (modelType || '').toLowerCase();

    if (
      lowerType.includes('llm') ||
      lowerType.includes('text-generation') ||
      lowerType.includes('chat') ||
      lowerType.includes('instruct') ||
      lowerType.includes('language')
    ) {
      return true;
    }

    // LLM keyword indicators in filename or path
    const llmKeywords = [
      'llama',
      'alpaca',
      'vicuna',
      'mistral',
      'mixtral',
      'qwen',
      'gemma',
      'deepseek',
      'phi-2',
      'phi-3',
      'phi-4',
      'phi2',
      'phi3',
      'phi4',
      'wizardlm',
      'starcoder',
      'codellama',
      'granite',
      'command-r',
      'openchat',
      'zephyr',
      'smollm',
      'nemotron',
      'hermes',
      'falcon',
      'solar',
      'internlm',
      'yi-34b',
      'yi-9b',
      'yi-6b',
      'exl2',
      'gptq',
      'awq',
      'text-generation',
      'llm',
    ];

    for (const kw of llmKeywords) {
      if (lowerName.includes(kw) || lowerPath.includes(`/${kw}`) || lowerPath.includes(`\\${kw}`)) {
        return true;
      }
    }

    // GGUF files are predominantly LLMs unless explicitly marked with diffusion architecture tokens
    if (ext === '.gguf') {
      const isImageDiffusion =
        lowerName.includes('flux') ||
        lowerName.includes('sdxl') ||
        lowerName.includes('sd15') ||
        lowerName.includes('sd1.5') ||
        lowerName.includes('sd3') ||
        lowerName.includes('pony') ||
        lowerName.includes('diffusion') ||
        lowerName.includes('unet') ||
        lowerName.includes('vae') ||
        lowerName.includes('lora');

      if (!isImageDiffusion) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts metadata from local file headers, RenegadeCMM DB, and online registries (CivitAI/HuggingFace).
   * Automatically checks SHA256 against CivitAI for non-LLM models and pulls creator, tags, and SFW preview images.
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
    let civitaiVersionId: number | undefined;
    let hfRepoId: string | undefined;
    let sha256: string | undefined;
    let previewFilePath = this.findSiblingPreviewImage(dir, fileName);

    // 1. Try extracting embedded metadata from .safetensors header
    if (ext === '.safetensors') {
      try {
        const headerMeta = await this.readSafetensorsMetadata(resolvedPath);
        if (headerMeta) {
          if (headerMeta.title) title = sanitizeAndDecodeHtml(headerMeta.title);
          if (headerMeta.author) creator = sanitizeAndDecodeHtml(headerMeta.author);
          if (headerMeta.version) version = headerMeta.version;
          if (headerMeta.architecture || headerMeta.baseModel) {
            baseModel = sanitizeAndDecodeHtml(headerMeta.architecture || headerMeta.baseModel);
          }
          if (headerMeta.description) description = sanitizeAndDecodeHtml(headerMeta.description);
          if (headerMeta.tags && Array.isArray(headerMeta.tags)) {
            tags = headerMeta.tags.map((t: string) => sanitizeAndDecodeHtml(t)).filter(Boolean);
          }
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
        if (!title && matched.civitai_name) title = sanitizeAndDecodeHtml(matched.civitai_name);
        if (matched.civitai_model_id) civitaiModelId = matched.civitai_model_id;
        if (matched.civitai_version_id) civitaiVersionId = matched.civitai_version_id;
        if (matched.hf_repo_id) hfRepoId = matched.hf_repo_id;
        if (matched.model_type) modelType = this.normalizeModelType(matched.model_type);
        if (matched.sha256) sha256 = matched.sha256.toLowerCase();
      }
    } catch {
      // CMM DB not available
    }

    // 3. Check whether the target model is an LLM
    const isLlm = this.isLlmModel(resolvedPath, modelType, fileName);
    if (isLlm && (modelType === 'Checkpoint' || !modelType)) {
      modelType = 'LLM';
    }

    // 4. Compute SHA256 if not already cached from CMM database (up to 4GB files)
    if (!sha256) {
      try {
        if (stat.size <= 4 * 1024 * 1024 * 1024) {
          sha256 = await this.computeFileSha256(resolvedPath);
        }
      } catch {
        // Ignore hash computation errors
      }
    }

    // 5. If NOT an LLM and SHA256 hash is available, check CivitAI registry
    if (!isLlm && sha256) {
      try {
        const allowNsfw = sharingPolicyManager.getPolicy().allowNsfwSharing;
        const civitaiInfo = await this.fetchCivitaiMetadataByHash(sha256, allowNsfw);

        if (civitaiInfo) {
          if (civitaiInfo.modelName) {
            title =
              civitaiInfo.versionName && !civitaiInfo.modelName.includes(civitaiInfo.versionName)
                ? `${civitaiInfo.modelName} (${civitaiInfo.versionName})`
                : civitaiInfo.modelName;
            title = sanitizeAndDecodeHtml(title);
          }
          if (civitaiInfo.creator && !creator) creator = sanitizeAndDecodeHtml(civitaiInfo.creator);
          if (civitaiInfo.baseModel && !baseModel) baseModel = sanitizeAndDecodeHtml(civitaiInfo.baseModel);
          if (civitaiInfo.modelType) modelType = this.normalizeModelType(civitaiInfo.modelType);
          if (civitaiInfo.modelId) civitaiModelId = civitaiInfo.modelId;
          if (civitaiInfo.versionId) civitaiVersionId = civitaiInfo.versionId;
          if (civitaiInfo.description && !description) description = civitaiInfo.description;

          if (civitaiInfo.tags && civitaiInfo.tags.length > 0) {
            tags = Array.from(new Set([...tags, ...civitaiInfo.tags]));
          }

          // Auto-pull preview image only if SFW (or allowed) and no local sibling preview exists
          if (civitaiInfo.previewImageUrl && !previewFilePath) {
            const cachedPreview = await this.downloadAndCachePreview(civitaiInfo.previewImageUrl, sha256);
            if (cachedPreview) {
              previewFilePath = cachedPreview;
            }
          }
        }
      } catch {
        // Online lookup failed or network offline
      }
    }

    // 6. Fallback: Format clean title from filename if title still empty
    if (!title) {
      title = this.formatTitleFromFileName(fileName);
    }

    return {
      modelFilePath: resolvedPath,
      fileName,
      fileSizeBytes: stat.size,
      previewFilePath,
      title: title || this.formatTitleFromFileName(fileName),
      version: version || '1.0.0',
      modelType: modelType || (isLlm ? 'LLM' : 'Checkpoint'),
      baseModel: baseModel || this.guessBaseModel(fileName),
      creator: creator || '',
      description: description || '',
      tags,
      civitaiModelId,
      civitaiVersionId,
      hfRepoId,
      sha256,
      isLlm,
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
          tags: meta['modelspec.tags']
            ? typeof meta['modelspec.tags'] === 'string'
              ? meta['modelspec.tags']
                  .split(',')
                  .map((t: string) => t.trim())
                  .filter(Boolean)
              : meta['modelspec.tags']
            : undefined,
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
    if (t.includes('llm') || t.includes('chat') || t.includes('instruct')) return 'LLM';
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
  async computeFileSha256(filePath: string): Promise<string> {
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
   * Filters preview images to strictly SFW unless allowNsfw is enabled.
   */
  async fetchCivitaiMetadataByHash(
    hash: string,
    allowNsfw: boolean = false
  ): Promise<{
    modelId?: number;
    versionId?: number;
    modelName?: string;
    versionName?: string;
    creator?: string;
    modelType?: string;
    baseModel?: string;
    description?: string;
    tags?: string[];
    trainedWords?: string[];
    previewImageUrl?: string;
  } | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${hash}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.1.0' },
      });

      if (!response.ok) return null;

      const data: any = await response.json();

      // Extract and sanitize tags
      const rawTags = data.model?.tags || data.tags;
      const extractedTags: string[] = [];
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          let tagStr = '';
          if (typeof t === 'string') tagStr = t;
          else if (t && typeof t.name === 'string') tagStr = t.name;
          else if (t && t.tag && typeof t.tag.name === 'string') tagStr = t.tag.name;

          const cleanTag = sanitizeAndDecodeHtml(tagStr);
          if (cleanTag) extractedTags.push(cleanTag);
        }
      }

      // Extract and sanitize trained / trigger words
      const rawTrained = data.trainedWords || data.model?.trainedWords;
      const trainedWords: string[] = [];
      if (Array.isArray(rawTrained)) {
        for (const w of rawTrained) {
          if (typeof w === 'string') {
            const cleanWord = sanitizeAndDecodeHtml(w);
            if (cleanWord) trainedWords.push(cleanWord);
          }
        }
      }

      // Extract and sanitize description / generation notes
      let cleanDesc = sanitizeAndDecodeHtml(data.description);
      if (!cleanDesc && data.model?.description) {
        cleanDesc = sanitizeAndDecodeHtml(data.model.description);
      }

      // Prepend trained words if available and not already in description text
      let finalDescription = cleanDesc;
      if (trainedWords.length > 0) {
        const triggerLine = trainedWords.join(', ');
        if (!finalDescription || !finalDescription.includes(trainedWords[0])) {
          finalDescription = finalDescription ? `${triggerLine}\n\n${finalDescription}` : triggerLine;
        }
      }

      // Extract Preview Image URL with strict SFW policy
      let previewImageUrl: string | undefined;
      if (Array.isArray(data.images) && data.images.length > 0) {
        if (allowNsfw) {
          previewImageUrl = data.images[0]?.url;
        } else {
          // Look for strictly SFW images (nsfw === false and nsfwLevel is 1 or None)
          const sfwImage = data.images.find((img: any) => {
            if (!img || img.nsfw === true) return false;
            if (typeof img.nsfwLevel === 'number') return img.nsfwLevel <= 1;
            if (typeof img.nsfwLevel === 'string') {
              const lvl = img.nsfwLevel.toLowerCase();
              return lvl === 'none' || lvl === 'pg' || lvl === 'sfw';
            }
            return img.nsfw === false || img.nsfw === undefined;
          });

          if (sfwImage) {
            previewImageUrl = sfwImage.url;
          }
        }
      }

      return {
        modelId: data.modelId,
        versionId: data.id,
        modelName: sanitizeAndDecodeHtml(data.model?.name),
        versionName: sanitizeAndDecodeHtml(data.name),
        creator: sanitizeAndDecodeHtml(data.model?.creator?.username),
        modelType: data.model?.type,
        baseModel: sanitizeAndDecodeHtml(data.baseModel),
        description: finalDescription,
        tags: extractedTags,
        trainedWords,
        previewImageUrl,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Downloads and caches remote preview image to local storage.
   */
  async downloadAndCachePreview(imageUrl: string, hash: string): Promise<string | undefined> {
    try {
      const previewDir = path.join(os.homedir(), '.renegadeswarm', 'previews');
      if (!fs.existsSync(previewDir)) {
        fs.mkdirSync(previewDir, { recursive: true });
      }

      const localPath = path.join(previewDir, `${hash.slice(0, 16)}.jpg`);
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 200) {
        return localPath;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.1.0' },
      });
      clearTimeout(timeoutId);

      if (!res.ok) return undefined;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 200) return undefined;

      await fs.promises.writeFile(localPath, buffer);
      return localPath;
    } catch {
      return undefined;
    }
  }
}

export const modelMetadataExtractor = new ModelMetadataExtractor();
