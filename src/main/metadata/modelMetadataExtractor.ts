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
import { inspectImageWorkflowMetadata } from '../../protocol/contentValidator';

export interface ExtractedModelMetadata {
  modelFilePath: string;
  fileName: string;
  fileSizeBytes: number;
  previewFilePath?: string;
  hasWorkflow?: boolean;
  workflowType?: string;
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
 * Strips HTML tags and script/style blocks safely using an AST-free character scanner.
 * Avoids regular expression multi-character sanitization vulnerabilities (CodeQL CWE-116).
 */
function stripHtmlTags(html: string): string {
  let result = '';
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] === '<') {
      const nextChar = html[i + 1];
      // HTML tag names must start with a letter, slash, or exclamation mark (e.g. comments/doctype)
      if (!nextChar || !/^[a-zA-Z\/!]/.test(nextChar)) {
        result += html[i];
        i++;
        continue;
      }

      const tagStart = i;
      const tagEnd = html.indexOf('>', tagStart);
      if (tagEnd === -1) {
        // Unclosed tag at the end of input; discard remaining tag fragment
        break;
      }

      const rawTagContent = html.slice(tagStart + 1, tagEnd).trim().toLowerCase();
      const tagNameMatch = rawTagContent.match(/^\/?([a-z0-9]+)/);
      const tagName = tagNameMatch ? tagNameMatch[1] : '';
      const isClosing = rawTagContent.startsWith('/');

      // Remove entire <script>...</script> and <style>...</style> blocks including inner content
      if (!isClosing && (tagName === 'script' || tagName === 'style')) {
        const closingTag = `</${tagName}>`;
        const closeIdx = html.toLowerCase().indexOf(closingTag, tagEnd + 1);
        if (closeIdx !== -1) {
          i = closeIdx + closingTag.length;
          continue;
        } else {
          // Unclosed script/style block — discard the rest of the string
          break;
        }
      }

      // Convert structural block elements to formatting newlines and bullets
      if (tagName === 'br') {
        result += '\n';
      } else if (tagName === 'p' && isClosing) {
        result += '\n\n';
      } else if ((tagName === 'div' || tagName === 'li') && isClosing) {
        result += '\n';
      } else if (tagName === 'li' && !isClosing) {
        result += '• ';
      } else if (/^h[1-6]$/.test(tagName) && isClosing) {
        result += '\n\n';
      }

      i = tagEnd + 1;
    } else {
      result += html[i];
      i++;
    }
  }

  return result;
}

/**
 * Sanitizes incoming HTML text, converts breaks/paragraphs to clean newlines,
 * strips all remaining HTML tags, and thoroughly decodes all HTML entities into plaintext.
 */
export function sanitizeAndDecodeHtml(rawText?: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  // 1. Strip all HTML tags, script/style blocks, and convert block elements to newlines
  let text = stripHtmlTags(rawText);

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

export interface CompanionFilesDiscovery {
  companionHash?: string;
  companionInfo?: any;
  companionInfoPath?: string;
  localImagePath?: string;
}

/**
 * Discovers companion assets (.sha256, .civitai.info, .info, .huggingface.info, .json, and preview images)
 * located alongside the model file.
 */
export function discoverCompanionFiles(filePath: string): CompanionFilesDiscovery {
  const ext = path.extname(filePath);
  const baseWithoutExt = filePath.slice(0, -ext.length);
  const result: CompanionFilesDiscovery = {};

  // 1. Companion Image Candidates
  const imageExtensions = [
    '.jpeg',
    '.jpg',
    '.png',
    '.webp',
    '.preview.png',
    '.preview.jpg',
    '.preview.jpeg',
    '.preview.webp',
  ];
  for (const imgExt of imageExtensions) {
    const candidate = `${baseWithoutExt}${imgExt}`;
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile() && stat.size > 0) {
          result.localImagePath = candidate;
          break;
        }
      } catch {}
    }
  }

  // 2. Companion Hash (.sha256)
  const shaCandidate = `${baseWithoutExt}.sha256`;
  if (fs.existsSync(shaCandidate)) {
    try {
      const content = fs.readFileSync(shaCandidate, 'utf8').trim();
      const match = content.match(/^[a-fA-F0-9]{64}$/);
      if (match) {
        result.companionHash = match[0].toLowerCase();
      }
    } catch {}
  }

  // 3. Companion Metadata Info (.civitai.info, .info, .huggingface.info, .json)
  const infoCandidates = [
    `${baseWithoutExt}.civitai.info`,
    `${baseWithoutExt}.info`,
    `${baseWithoutExt}.huggingface.info`,
    `${baseWithoutExt}.json`,
  ];
  for (const infoCandidate of infoCandidates) {
    if (fs.existsSync(infoCandidate)) {
      try {
        const raw = fs.readFileSync(infoCandidate, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          result.companionInfo = parsed;
          result.companionInfoPath = infoCandidate;
          break;
        }
      } catch {}
    }
  }

  return result;
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
   * Extracts metadata from local file headers, companion files (.sha256, .civitai.info),
   * RenegadeCMM DB, and online registries (CivitAI/HuggingFace).
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

    // 0. Discover companion files (.sha256, .civitai.info, .info, .huggingface.info, images)
    const companion = discoverCompanionFiles(resolvedPath);
    let previewFilePath = companion.localImagePath || this.findSiblingPreviewImage(dir, fileName);

    if (companion.companionHash) {
      sha256 = companion.companionHash.toLowerCase();
    }

    if (companion.companionInfo) {
      const info = companion.companionInfo;
      const isHf =
        info.source === 'huggingface' ||
        Boolean(info.pipeline_tag) ||
        Boolean(info.cardData) ||
        Boolean(info.repoId) ||
        (typeof info.id === 'string' && (info.id.includes('/') || info.author));

      if (isHf) {
        // Hugging Face format metadata payload
        if (info.id || info.repoId) hfRepoId = info.id || info.repoId;
        if (info.author) creator = sanitizeAndDecodeHtml(info.author);
        if (info.modelName) title = sanitizeAndDecodeHtml(info.modelName);
        if (info.pipeline_tag) modelType = this.normalizeModelType(info.pipeline_tag);
        if (info.cardData?.base_model) {
          const bm = info.cardData.base_model;
          baseModel = sanitizeAndDecodeHtml(Array.isArray(bm) ? bm[0] : bm);
        }
        if (Array.isArray(info.tags)) {
          for (const t of info.tags) {
            const cleanTag = sanitizeAndDecodeHtml(t);
            if (cleanTag && !tags.includes(cleanTag)) tags.push(cleanTag);
          }
        }
        if (info.description) {
          description = sanitizeAndDecodeHtml(info.description);
        }
      } else if (info.modelId || info.id || info.model?.name || info.name) {
        // CivitAI format metadata payload
        if (info.model?.name || info.name) {
          const modelName = info.model?.name || info.name;
          const versionName = info.name && info.name !== modelName ? info.name : '';
          title =
            versionName && !modelName.includes(versionName)
              ? `${modelName} (${versionName})`
              : modelName;
          title = sanitizeAndDecodeHtml(title);
        }
        if (typeof info.id === 'number') civitaiVersionId = info.id;
        if (typeof info.modelId === 'number' || typeof info.model?.id === 'number') {
          civitaiModelId = info.modelId || info.model?.id;
        }
        if (info.model?.creator?.username) {
          creator = sanitizeAndDecodeHtml(info.model.creator.username);
        }
        if (info.baseModel) {
          baseModel = sanitizeAndDecodeHtml(info.baseModel);
        }
        if (info.model?.type || info.type) {
          modelType = this.normalizeModelType(info.model?.type || info.type);
        }
        const rawTags = info.model?.tags || info.tags;
        if (Array.isArray(rawTags)) {
          for (const t of rawTags) {
            const tagStr = typeof t === 'string' ? t : t?.name || t?.tag?.name;
            const cleanTag = sanitizeAndDecodeHtml(tagStr);
            if (cleanTag && !tags.includes(cleanTag)) tags.push(cleanTag);
          }
        }
        const rawTrained = info.trainedWords || info.model?.trainedWords;
        const trainedWords: string[] = [];
        if (Array.isArray(rawTrained)) {
          for (const w of rawTrained) {
            const cleanWord = sanitizeAndDecodeHtml(typeof w === 'string' ? w : '');
            if (cleanWord) {
              trainedWords.push(cleanWord);
              if (!tags.includes(cleanWord)) tags.push(cleanWord);
            }
          }
        }
        let desc = sanitizeAndDecodeHtml(info.description || info.model?.description);
        if (trainedWords.length > 0) {
          const triggerLine = trainedWords.join(', ');
          if (!desc || !desc.includes(trainedWords[0])) {
            desc = desc ? `${triggerLine}\n\n${desc}` : triggerLine;
          }
        }
        if (desc) {
          description = desc;
        }
      }
    }

    // 1. Try extracting embedded metadata from .safetensors header
    if (ext === '.safetensors') {
      try {
        const headerMeta = await this.readSafetensorsMetadata(resolvedPath);
        if (headerMeta) {
          if (headerMeta.title && !title) title = sanitizeAndDecodeHtml(headerMeta.title);
          if (headerMeta.author && !creator) creator = sanitizeAndDecodeHtml(headerMeta.author);
          if (headerMeta.version) version = headerMeta.version;
          if ((headerMeta.architecture || headerMeta.baseModel) && !baseModel) {
            baseModel = sanitizeAndDecodeHtml(headerMeta.architecture || headerMeta.baseModel);
          }
          if (headerMeta.description && !description) description = sanitizeAndDecodeHtml(headerMeta.description);
          if (headerMeta.tags && Array.isArray(headerMeta.tags)) {
            for (const t of headerMeta.tags) {
              const cleanTag = sanitizeAndDecodeHtml(t);
              if (cleanTag && !tags.includes(cleanTag)) tags.push(cleanTag);
            }
          }
          if (headerMeta.modelType && (!modelType || modelType === 'Checkpoint')) modelType = headerMeta.modelType;
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
        if (matched.civitai_model_id && !civitaiModelId) civitaiModelId = matched.civitai_model_id;
        if (matched.civitai_version_id && !civitaiVersionId) civitaiVersionId = matched.civitai_version_id;
        if (matched.hf_repo_id && !hfRepoId) hfRepoId = matched.hf_repo_id;
        if (matched.model_type && (!modelType || modelType === 'Checkpoint')) modelType = this.normalizeModelType(matched.model_type);
        if (matched.sha256 && !sha256) sha256 = matched.sha256.toLowerCase();
      }
    } catch {
      // CMM DB not available
    }

    // 3. Check whether the target model is an LLM
    const isLlm = this.isLlmModel(resolvedPath, modelType, fileName);
    if (isLlm && (modelType === 'Checkpoint' || !modelType)) {
      modelType = 'LLM';
    }

    // 4. Compute SHA256 if not already harvested from companion .sha256 or CMM database
    if (!sha256) {
      try {
        if (stat.size <= 4 * 1024 * 1024 * 1024) {
          sha256 = await this.computeFileSha256(resolvedPath);
        }
      } catch {
        // Ignore hash computation errors
      }
    }

    // 5. If NOT an LLM and SHA256 hash is available, check CivitAI registry if any info is missing
    let civitaiInfo: any = null;
    const needsCivitaiLookup = !title || !creator || !baseModel || !description || tags.length === 0 || !previewFilePath;
    if (!isLlm && sha256 && needsCivitaiLookup) {
      try {
        const allowNsfw = sharingPolicyManager.getPolicy().allowNsfwSharing;
        civitaiInfo = await this.fetchCivitaiMetadataByHash(sha256, allowNsfw);

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
            const cachedPreview = await this.downloadAndCachePreview(civitaiInfo.previewImageUrl, sha256 || '', resolvedPath);
            if (cachedPreview) {
              previewFilePath = cachedPreview;
            }
          }
        }
      } catch {
        // Online lookup failed or network offline
      }
    }

    // 6. If creator or tags are still missing, or if model is an LLM without repo info, check Hugging Face
    const needsHfLookup = !creator || tags.length === 0 || (!hfRepoId && isLlm);
    if (needsHfLookup) {
      try {
        const hfQuery = hfRepoId || path.parse(fileName).name;
        const hfInfo = await this.fetchHuggingFaceMetadata(hfQuery);
        if (hfInfo) {
          if (hfInfo.creator && !creator) creator = hfInfo.creator;
          if (hfInfo.tags && hfInfo.tags.length > 0) {
            tags = Array.from(new Set([...tags, ...hfInfo.tags]));
          }
          if (hfInfo.baseModel && !baseModel) baseModel = hfInfo.baseModel;
          if (hfInfo.description && !description) description = hfInfo.description;
          if (hfInfo.modelType && (!modelType || modelType === 'Checkpoint')) modelType = hfInfo.modelType;
          if (hfInfo.hfRepoId && !hfRepoId) hfRepoId = hfInfo.hfRepoId;
          if (!title || title === this.formatTitleFromFileName(fileName)) {
            if (hfInfo.modelName) title = this.formatTitleFromFileName(hfInfo.modelName);
          }
        }
      } catch {
        // HuggingFace lookup failed or offline
      }
    }

    // 7. Inspect preview image for embedded AI generation workflow (PNG tEXt/iTXt, ComfyUI, WebUI)
    let hasWorkflow = false;
    let workflowType: string | undefined;

    if (previewFilePath && fs.existsSync(previewFilePath)) {
      try {
        const previewStat = fs.statSync(previewFilePath);
        const headerBuf = Buffer.alloc(Math.min(previewStat.size, 65536));
        const fd = fs.openSync(previewFilePath, 'r');
        fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);
        fs.closeSync(fd);

        const workflowData = inspectImageWorkflowMetadata(headerBuf);
        if (workflowData.hasWorkflow) {
          hasWorkflow = true;
          workflowType = workflowData.workflowType;
          if (workflowData.prompt && !description) {
            description = sanitizeAndDecodeHtml(workflowData.prompt);
          }
          if (workflowData.loraTriggers && workflowData.loraTriggers.length > 0) {
            tags = Array.from(new Set([...tags, ...workflowData.loraTriggers.map((t) => sanitizeAndDecodeHtml(t))]));
          }
        }
      } catch {
        // Ignore preview inspection errors
      }
    }

    // 8. Fallback: Format clean title from filename if title still empty
    if (!title) {
      title = this.formatTitleFromFileName(fileName);
    }

    // 9. Auto-synchronize and write-back newly enriched metadata to RenegadeCMM SQLite database
    try {
      await cmmDbBridge.updateModelMetadata({
        filePath: resolvedPath,
        fileName,
        sha256,
        civitaiModelId,
        civitaiVersionId,
        civitaiName: title,
        creator,
        modelType: modelType || (isLlm ? 'LLM' : 'Checkpoint'),
        baseModel: baseModel || this.guessBaseModel(fileName),
        description,
        tags,
        previewUrl: civitaiInfo?.previewImageUrl,
        source: civitaiModelId ? 'civitai' : hfRepoId ? 'huggingface' : undefined,
        hfRepoId,
        rawJson: civitaiInfo ? JSON.stringify(civitaiInfo) : undefined,
      });
    } catch {
      // Gracefully ignore if CMM DB is locked or detached
    }

    return {
      modelFilePath: resolvedPath,
      fileName,
      fileSizeBytes: stat.size,
      previewFilePath,
      hasWorkflow,
      workflowType,
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
    if (t.includes('llm') || t.includes('chat') || t.includes('instruct') || t.includes('text-generation') || t.includes('language')) return 'LLM';
    if (t.includes('lora')) return 'LORA';
    if (t.includes('checkpoint') || t.includes('model')) return 'Checkpoint';
    if (t.includes('unet')) return 'UNet';
    if (t.includes('vae')) return 'VAE';
    if (t.includes('controlnet')) return 'Controlnet';
    if (t.includes('upscaler') || t.includes('upscale')) return 'Upscaler';
    if (t.includes('text_encoder') || t.includes('clip') || t.includes('t5') || t.includes('text')) return 'TextEncoder';
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
        headers: { 'User-Agent': 'RenegadeSwarm/0.3.0' },
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
   * Downloads and caches remote preview image directly in the model's directory alongside the model.
   */
  async downloadAndCachePreview(
    imageUrl: string,
    hash: string,
    modelFilePath?: string
  ): Promise<string | undefined> {
    try {
      if (!imageUrl || typeof imageUrl !== 'string') return undefined;
      const parsedUrl = new URL(imageUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return undefined;

      if (!modelFilePath) return undefined;
      const resolvedModelPath = path.resolve(modelFilePath);
      const modelDir = path.dirname(resolvedModelPath);
      if (!fs.existsSync(modelDir)) return undefined;

      const ext = path.extname(resolvedModelPath);
      const baseWithoutExt = resolvedModelPath.slice(0, -ext.length);

      // Determine file extension from URL or default to .png
      const pathname = parsedUrl.pathname.toLowerCase();
      let imgExt = '.png';
      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
        imgExt = '.jpg';
      } else if (pathname.endsWith('.webp')) {
        imgExt = '.webp';
      } else if (pathname.endsWith('.png')) {
        imgExt = '.png';
      }

      const localPath = `${baseWithoutExt}${imgExt}`;
      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 200) {
        return localPath;
      }

      const previewCandidate = `${baseWithoutExt}.preview${imgExt}`;
      if (fs.existsSync(previewCandidate) && fs.statSync(previewCandidate).size > 200) {
        return previewCandidate;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.3.0' },
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

  /**
   * Queries Hugging Face public API for model repository metadata by repoId or model search term.
   */
  async fetchHuggingFaceMetadata(
    repoIdOrQuery: string
  ): Promise<{
    hfRepoId?: string;
    modelName?: string;
    creator?: string;
    modelType?: string;
    baseModel?: string;
    description?: string;
    tags?: string[];
  } | null> {
    if (!repoIdOrQuery || typeof repoIdOrQuery !== 'string') return null;
    const cleanQuery = repoIdOrQuery.trim();
    if (!cleanQuery) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      let url: string;
      if (cleanQuery.includes('/') && !cleanQuery.includes(' ')) {
        url = `https://huggingface.co/api/models/${encodeURIComponent(cleanQuery)}`;
      } else {
        url = `https://huggingface.co/api/models?search=${encodeURIComponent(cleanQuery)}&limit=1`;
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.3.0' },
      });

      if (!res.ok) return null;

      let data: any = await res.json();
      if (Array.isArray(data)) {
        if (data.length === 0) return null;
        data = data[0];
      }

      const id = data.id || data.modelId || '';
      const author = data.author || (id.includes('/') ? id.split('/')[0] : '');
      const cleanTags = Array.isArray(data.tags)
        ? data.tags.map((t: string) => sanitizeAndDecodeHtml(t)).filter(Boolean)
        : [];

      let modelType: string | undefined;
      if (data.pipeline_tag) {
        modelType = this.normalizeModelType(data.pipeline_tag);
      }

      let baseModel: string | undefined;
      if (data.cardData?.base_model) {
        const bm = data.cardData.base_model;
        baseModel = sanitizeAndDecodeHtml(Array.isArray(bm) ? bm[0] : bm);
      }

      const description = data.description ? sanitizeAndDecodeHtml(data.description) : '';

      return {
        hfRepoId: id,
        modelName: id.includes('/') ? id.split('/')[1] : id,
        creator: author ? sanitizeAndDecodeHtml(author) : undefined,
        modelType,
        baseModel,
        description,
        tags: cleanTags,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const modelMetadataExtractor = new ModelMetadataExtractor();
