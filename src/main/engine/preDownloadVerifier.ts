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
import { SwarmManifest } from '../../protocol/types';
import { verifySwarmManifestSignature } from '../../protocol/crypto';
import { sanitizeAndDecodeHtml } from '../metadata/modelMetadataExtractor';
import { keyringManager } from './keyringManager';
import { PreDownloadVerificationResult, PreDownloadVerifyRequest } from '../../shared/ipcContracts';
import { ALLOWED_MODEL_EXTENSIONS } from '../../shared/cmmTypes';

export class PreDownloadVerifier {
  /**
   * Performs pre-download verification against CivitAI, HuggingFace,
   * or the Custom Model Verifier (for unindexed/custom LoRAs, fine-tunes, checkpoints, GGUFs).
   */
  async verifyPreDownload(req: PreDownloadVerifyRequest): Promise<PreDownloadVerificationResult> {
    const warnings: string[] = [];
    let sha256 = req.sha256 ? req.sha256.trim().toLowerCase() : undefined;
    let fileName = req.fileName ? req.fileName.trim() : undefined;
    let manifest: SwarmManifest | undefined;
    let parsedInfo: any;

    // 1. Extract from Manifest JSON if provided
    if (req.manifestJson) {
      try {
        manifest = typeof req.manifestJson === 'string' ? JSON.parse(req.manifestJson) : req.manifestJson;
        if (manifest?.hashes?.sha256) {
          sha256 = sha256 || manifest.hashes.sha256.toLowerCase();
        }
        if (!fileName && manifest?.files && manifest.files.length > 0) {
          const mainFile = manifest.files.find((f) => f.fileType === 'Model') || manifest.files[0];
          fileName = mainFile.relativePath;
        }
      } catch {
        warnings.push('Manifest JSON could not be parsed.');
      }
    }

    // 2. Extract from Magnet URI if provided
    if (req.magnetUri) {
      const dnMatch = req.magnetUri.match(/dn=([^&]+)/);
      if (dnMatch && !fileName) {
        fileName = decodeURIComponent(dnMatch[1]);
      }
      const shaMatch = req.magnetUri.match(/(?:sha256|so)=([a-fA-F0-9]{64})/i);
      if (shaMatch && !sha256) {
        sha256 = shaMatch[1].toLowerCase();
      }
    }

    // 3. Extract from Companion Info JSON if provided
    if (req.infoJson) {
      try {
        parsedInfo = typeof req.infoJson === 'string' ? JSON.parse(req.infoJson) : req.infoJson;
        if (parsedInfo?.sha256 && !sha256) {
          sha256 = String(parsedInfo.sha256).toLowerCase();
        }
      } catch {
        warnings.push('Companion .info JSON could not be parsed.');
      }
    }

    // 4. Step A: CivitAI Registry Verification
    if (sha256 && /^[a-f0-9]{64}$/.test(sha256)) {
      try {
        const civitaiResult = await this.verifyCivitai(sha256, req.civitaiVersionId);
        if (civitaiResult) {
          return civitaiResult;
        }
      } catch (err: any) {
        warnings.push(`CivitAI registry check offline or unreachable: ${err?.message || err}`);
      }
    }

    // 5. Step B: Hugging Face Registry Verification
    const hfRepo = req.hfRepoId || manifest?.model?.hfRepoId || parsedInfo?.id || parsedInfo?.repoId;
    if (hfRepo && typeof hfRepo === 'string') {
      try {
        const hfResult = await this.verifyHuggingFace(hfRepo, sha256);
        if (hfResult) {
          return hfResult;
        }
      } catch (err: any) {
        warnings.push(`Hugging Face registry check offline or unreachable: ${err?.message || err}`);
      }
    }

    // 6. Step C: Custom Model Verifier Tool (for unindexed LoRAs, fine-tunes, checkpoints, GGUFs)
    return this.verifyCustomModel({
      sha256,
      fileName,
      manifest,
      infoData: parsedInfo,
      warnings,
    });
  }

  /**
   * Verifies SHA256 against CivitAI model version registry.
   */
  private async verifyCivitai(
    sha256: string,
    expectedVersionId?: number
  ): Promise<PreDownloadVerificationResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${sha256}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.2.0' },
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data || !data.id) return null;

      const warnings: string[] = [];
      if (expectedVersionId && expectedVersionId !== data.id) {
        warnings.push(`Reported version ID ${expectedVersionId} differs from CivitAI registry ID ${data.id}`);
      }

      const rawTags = data.model?.tags || data.tags;
      const tags: string[] = [];
      if (Array.isArray(rawTags)) {
        for (const t of rawTags) {
          const str = typeof t === 'string' ? t : t?.name || t?.tag?.name;
          const clean = sanitizeAndDecodeHtml(str);
          if (clean && !tags.includes(clean)) tags.push(clean);
        }
      }

      const isNsfw = Boolean(
        data.model?.nsfw ||
        (data.images && data.images.some((img: any) => img && (img.nsfw || (img.nsfwLevel && img.nsfwLevel > 1)))) ||
        (data.nsfwLevel && data.nsfwLevel > 1)
      );

      const previewUrl = Array.isArray(data.images) && data.images.length > 0 ? data.images[0]?.url : undefined;

      const modelName = sanitizeAndDecodeHtml(data.model?.name || data.name);
      const versionName = sanitizeAndDecodeHtml(data.name);
      const title = versionName && !modelName.includes(versionName) ? `${modelName} (${versionName})` : modelName;

      return {
        status: 'verified_civitai',
        sha256,
        source: 'civitai',
        isCustomModel: false,
        title,
        creator: sanitizeAndDecodeHtml(data.model?.creator?.username),
        modelType: data.model?.type,
        baseModel: sanitizeAndDecodeHtml(data.baseModel),
        description: sanitizeAndDecodeHtml(data.description || data.model?.description),
        tags,
        nsfw: isNsfw,
        previewUrl,
        civitaiModelId: data.modelId,
        civitaiVersionId: data.id,
        trustScore: 95,
        trustLevel: 'VerifiedCreator',
        warnings,
        canProceed: true,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Verifies repository metadata against Hugging Face API.
   */
  private async verifyHuggingFace(
    repoId: string,
    sha256?: string
  ): Promise<PreDownloadVerificationResult | null> {
    const cleanRepo = repoId.trim();
    if (!cleanRepo) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(cleanRepo)}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'RenegadeSwarm/0.2.0' },
      });

      if (!res.ok) return null;
      const data: any = await res.json();
      if (!data || (!data.id && !data.modelId)) return null;

      const id = data.id || data.modelId;
      const author = data.author || (id.includes('/') ? id.split('/')[0] : 'HuggingFace Author');
      const cleanTags = Array.isArray(data.tags)
        ? data.tags.map((t: string) => sanitizeAndDecodeHtml(t)).filter(Boolean)
        : [];

      let baseModel: string | undefined;
      if (data.cardData?.base_model) {
        const bm = data.cardData.base_model;
        baseModel = sanitizeAndDecodeHtml(Array.isArray(bm) ? bm[0] : bm);
      }

      return {
        status: 'verified_huggingface',
        sha256,
        source: 'huggingface',
        isCustomModel: false,
        title: id.includes('/') ? id.split('/')[1] : id,
        creator: sanitizeAndDecodeHtml(author),
        modelType: data.pipeline_tag ? sanitizeAndDecodeHtml(data.pipeline_tag) : 'LLM',
        baseModel,
        description: sanitizeAndDecodeHtml(data.description),
        tags: cleanTags,
        hfRepoId: id,
        trustScore: 90,
        trustLevel: 'VerifiedCreator',
        warnings: [],
        canProceed: true,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Custom Model Verifier Tool:
   * Validates unindexed models (custom LoRAs, fine-tunes, checkpoints, GGUFs)
   * through cryptographic Ed25519 creator signatures, Web of Trust (WoT) keyring status,
   * extension safety checks, and manifest integrity.
   */
  public verifyCustomModel(params: {
    sha256?: string;
    fileName?: string;
    manifest?: SwarmManifest;
    infoData?: any;
    warnings?: string[];
  }): PreDownloadVerificationResult {
    const warnings = [...(params.warnings || [])];
    const manifest = params.manifest;
    const info = params.infoData;

    let title = sanitizeAndDecodeHtml(manifest?.model?.title || info?.name || info?.model?.name || params.fileName || 'Custom Model');
    let creator = sanitizeAndDecodeHtml(manifest?.model?.creator || info?.author || info?.creator || 'Community Creator');
    let modelType = manifest?.model?.modelType || info?.modelType || info?.type || 'LORA';
    let baseModel = sanitizeAndDecodeHtml(manifest?.model?.baseModel || info?.baseModel || 'Flux.1 D');
    let description = sanitizeAndDecodeHtml(manifest?.model?.description || info?.description || '');
    let tags = manifest?.model?.tags || info?.tags || [];

    // 1. File Extension & Name Validation
    if (params.fileName) {
      const ext = path.extname(params.fileName).toLowerCase();
      if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
        warnings.push(`Non-standard model extension detected: ${ext}`);
      }
    }

    // 2. Cryptographic Ed25519 Provenance & Web of Trust Verification
    let trustLevel: 'VerifiedCreator' | 'Community' | 'Untrusted' | 'Blocked' | 'Unknown';
    let trustScore: number;
    let creatorPublicKey: string | undefined;

    if (manifest?.signature && manifest.signature.publicKey && manifest.signature.signature) {
      creatorPublicKey = manifest.signature.publicKey;
      const isSigValid = verifySwarmManifestSignature(manifest);

      if (!isSigValid) {
        return {
          status: 'mismatch',
          sha256: params.sha256 || manifest.hashes.sha256,
          source: 'custom',
          isCustomModel: true,
          title,
          creator,
          modelType,
          baseModel,
          description,
          tags,
          trustScore: 0,
          trustLevel: 'Untrusted',
          warnings: ['Ed25519 signature failed cryptographic verification! Manifest payload may have been tampered with.'],
          canProceed: false,
          reason: 'Cryptographic signature mismatch.',
        };
      }

      // Check against local keyring Web of Trust
      const keyEntry = keyringManager.verifyCreator(creator, manifest.signature.publicKey);
      if (keyEntry.isKnown) {
        trustLevel = keyEntry.trustLevel;
        if (keyEntry.trustLevel === 'VerifiedCreator') {
          trustScore = 98;
        } else if (keyEntry.trustLevel === 'Community') {
          trustScore = 80;
        } else if (keyEntry.trustLevel === 'Blocked') {
          return {
            status: 'rejected',
            sha256: params.sha256 || manifest.hashes.sha256,
            source: 'custom',
            isCustomModel: true,
            title,
            creator,
            trustScore: 0,
            trustLevel: 'Blocked',
            warnings: ['Creator public key is explicitly blocked in your local Web of Trust keyring.'],
            canProceed: false,
            reason: 'Creator is blocked in local keyring.',
          };
        } else {
          trustScore = 50;
        }
      } else {
        trustLevel = 'Community';
        trustScore = 75;
        warnings.push(`Signed by creator key ${manifest.signature.publicKey.slice(0, 12)}... (not yet verified in local keyring)`);
      }
    } else {
      trustLevel = 'Unknown';
      trustScore = 40;
      warnings.push('Unsigned custom model. The model will be isolated and strictly verified in Quarantine before library promotion.');
    }

    const isTrusted = trustScore >= 75;

    return {
      status: isTrusted ? 'verified_custom_trusted' : 'verified_custom_untrusted',
      sha256: params.sha256 || manifest?.hashes?.sha256,
      source: 'custom',
      isCustomModel: true,
      title,
      creator,
      modelType,
      baseModel,
      description,
      tags,
      creatorPublicKey,
      trustScore,
      trustLevel,
      warnings,
      canProceed: true,
    };
  }

  /**
   * Saves companion assets (.sha256, .civitai.info / .huggingface.info / .info, preview image)
   * alongside the promoted model file in destination directory.
   */
  public async saveCompanionAssets(params: {
    targetModelPath: string;
    sha256?: string;
    manifest?: SwarmManifest;
    verificationResult?: PreDownloadVerificationResult;
    previewBuffer?: Buffer;
  }): Promise<void> {
    try {
      if (!fs.existsSync(params.targetModelPath)) return;

      const ext = path.extname(params.targetModelPath);
      const baseWithoutExt = params.targetModelPath.slice(0, -ext.length);

      // 1. Write .sha256 companion plaintext file
      const sha = params.sha256 || params.manifest?.hashes?.sha256 || params.verificationResult?.sha256;
      if (sha && /^[a-fA-F0-9]{64}$/.test(sha.trim())) {
        try {
          const shaFile = `${baseWithoutExt}.sha256`;
          fs.writeFileSync(shaFile, sha.trim().toLowerCase(), 'utf8');
        } catch {}
      }

      // 2. Write companion metadata JSON (.civitai.info, .huggingface.info, or .info)
      const res = params.verificationResult;
      const manifest = params.manifest;
      const host = res?.source === 'huggingface' ? 'huggingface' : res?.source === 'civitai' ? 'civitai' : 'info';
      const infoFileName = host === 'info' ? `${baseWithoutExt}.info` : `${baseWithoutExt}.${host}.info`;

      const infoPayload = {
        name: res?.title || manifest?.model?.title || path.basename(baseWithoutExt),
        title: res?.title || manifest?.model?.title || path.basename(baseWithoutExt),
        version: manifest?.model?.version || '1.0.0',
        creator: res?.creator || manifest?.model?.creator || 'Community',
        modelType: res?.modelType || manifest?.model?.modelType || 'LORA',
        baseModel: res?.baseModel || manifest?.model?.baseModel || 'Flux.1 D',
        description: res?.description || manifest?.model?.description || '',
        tags: res?.tags || manifest?.model?.tags || [],
        sha256: sha,
        civitaiModelId: res?.civitaiModelId || manifest?.model?.civitaiModelId,
        civitaiVersionId: res?.civitaiVersionId || manifest?.model?.civitaiVersionId,
        hfRepoId: res?.hfRepoId || manifest?.model?.hfRepoId,
        source: res?.source || (manifest ? 'swarm' : 'local'),
        downloadedAt: new Date().toISOString(),
        provenance: {
          manifestId: manifest?.manifestId,
          creatorPublicKey: manifest?.signature?.publicKey || res?.creatorPublicKey,
          signature: manifest?.signature?.signature,
          trustScore: res?.trustScore,
        },
      };

      try {
        fs.writeFileSync(infoFileName, JSON.stringify(infoPayload, null, 2), 'utf8');
      } catch {}

      // 3. Save preview image if provided
      if (params.previewBuffer && params.previewBuffer.length > 100) {
        try {
          const imgFile = `${baseWithoutExt}.png`;
          if (!fs.existsSync(imgFile)) {
            fs.writeFileSync(imgFile, params.previewBuffer);
          }
        } catch {}
      }
    } catch {}
  }
}

export const preDownloadVerifier = new PreDownloadVerifier();
