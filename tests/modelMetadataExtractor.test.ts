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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ModelMetadataExtractor, sanitizeAndDecodeHtml } from '../src/main/metadata/modelMetadataExtractor';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('ModelMetadataExtractor Engine', () => {
  let tmpDir: string;
  let safetensorsPath: string;
  let previewPath: string;
  let rawGgufPath: string;
  let llamaGgufPath: string;
  let extractor: ModelMetadataExtractor;

  beforeAll(async () => {
    tmpDir = path.join(os.tmpdir(), 'test_metadata_extractor_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    safetensorsPath = path.join(tmpDir, 'flux1-dev-finetune.safetensors');
    previewPath = path.join(tmpDir, 'flux1-dev-finetune.preview.png');
    rawGgufPath = path.join(tmpDir, 'sdxl_cyberpunk_q8.gguf');
    llamaGgufPath = path.join(tmpDir, 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf');

    // Create a mock .safetensors header
    const mockMetadata = {
      __metadata__: {
        'modelspec.title': 'Flux.1 Dev Hyper Realism',
        'modelspec.author': 'TheStygianRenegade',
        'modelspec.version': '2.1.0',
        'modelspec.architecture': 'Flux.1 D',
        'modelspec.description': 'Ultra high-fidelity photorealism fine-tune for Flux.1',
        'modelspec.tags': 'flux, realism, portrait, fine-tune',
        'modelspec.type': 'Checkpoint',
      },
    };

    const headerJsonStr = JSON.stringify(mockMetadata);
    const headerBuf = Buffer.from(headerJsonStr, 'utf8');
    const headerLenBuf = Buffer.alloc(8);
    headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);

    const dummyTensors = Buffer.alloc(1024, 0x42); // 1KB mock tensor payload
    const safetensorsFileContent = Buffer.concat([headerLenBuf, headerBuf, dummyTensors]);

    fs.writeFileSync(safetensorsPath, safetensorsFileContent);
    fs.writeFileSync(previewPath, Buffer.alloc(100)); // dummy preview file
    fs.writeFileSync(rawGgufPath, Buffer.alloc(2048)); // dummy gguf file
    fs.writeFileSync(llamaGgufPath, Buffer.alloc(2048)); // dummy llama gguf file

    extractor = new ModelMetadataExtractor();
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should parse embedded __metadata__ from safetensors header correctly', async () => {
    const meta = await extractor.extractMetadata(safetensorsPath);
    expect(meta.title).toBe('Flux.1 Dev Hyper Realism');
    expect(meta.creator).toBe('TheStygianRenegade');
    expect(meta.version).toBe('2.1.0');
    expect(meta.baseModel).toBe('Flux.1 D');
    expect(meta.description).toBe('Ultra high-fidelity photorealism fine-tune for Flux.1');
    expect(meta.tags).toEqual(['flux', 'realism', 'portrait', 'fine-tune']);
    expect(meta.modelType).toBe('Checkpoint');
  });

  it('should auto-detect sibling preview image files', async () => {
    const meta = await extractor.extractMetadata(safetensorsPath);
    expect(meta.previewFilePath).toBe(previewPath);
  });

  it('should format clean title and infer model type/baseModel from raw filenames when header missing', async () => {
    const meta = await extractor.extractMetadata(rawGgufPath);
    expect(meta.title).toBe('Sdxl Cyberpunk Q8');
    expect(meta.baseModel).toBe('SDXL 1.0');
  });

  it('should accurately detect LLM models and differentiate them from diffusion models', () => {
    // LLMs
    expect(extractor.isLlmModel('Meta-Llama-3.1-8B-Instruct.gguf')).toBe(true);
    expect(extractor.isLlmModel('/models/mistral-7b-v0.1.safetensors')).toBe(true);
    expect(extractor.isLlmModel('qwen2.5-32b-instruct.gguf')).toBe(true);
    expect(extractor.isLlmModel('deepseek-coder-v2.safetensors')).toBe(true);
    expect(extractor.isLlmModel('phi-4-mini.gguf')).toBe(true);
    expect(extractor.isLlmModel('random_weights.gguf')).toBe(true); // GGUF without diffusion tokens is LLM

    // Diffusion / Image generation models (Non-LLMs)
    expect(extractor.isLlmModel('flux1-dev.safetensors')).toBe(false);
    expect(extractor.isLlmModel('sdxl_turbo.safetensors')).toBe(false);
    expect(extractor.isLlmModel('ponyDiffusionV6XL.safetensors')).toBe(false);
    expect(extractor.isLlmModel('flux_lora_cyberpunk.safetensors')).toBe(false);
    expect(extractor.isLlmModel('flux1-dev-q8.gguf')).toBe(false); // GGUF with flux token is Diffusion
    expect(extractor.isLlmModel('sdxl_cyberpunk_q8.gguf')).toBe(false);
  });

  it('should skip CivitAI query for LLM models during extraction', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const meta = await extractor.extractMetadata(llamaGgufPath);

    expect(meta.isLlm).toBe(true);
    expect(meta.modelType).toBe('LLM');
    // Ensure fetch was not called for CivitAI lookup on LLM
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('civitai.com'),
      expect.anything()
    );
    fetchSpy.mockRestore();
  });

  it('should sanitize and thoroughly decode HTML entities in description and prompt text', () => {
    // Exact user case: LoRA trigger format with entities
    const rawLoraNotes = 'rlbtyc1tr0n, &lt;lora:R3alB3auty_ANIMAv1_v2:1.0&gt;,';
    expect(sanitizeAndDecodeHtml(rawLoraNotes)).toBe('rlbtyc1tr0n, <lora:R3alB3auty_ANIMAv1_v2:1.0>,');

    // Rich HTML formatting, paragraphs, breaks, and entities
    const richHtml = '<p>Recommended settings:<br>CFG: 3.5 &amp; Steps: 25</p><div>Trigger: &lt;lora:my_model:0.8&gt; &#39;test&#39;</div>';
    const cleaned = sanitizeAndDecodeHtml(richHtml);
    expect(cleaned).toContain('Recommended settings:\nCFG: 3.5 & Steps: 25');
    expect(cleaned).toContain("Trigger: <lora:my_model:0.8> 'test'");

    // Decimal and Hex numeric entities
    expect(sanitizeAndDecodeHtml('&#60;hello&#62; &#x26; &#34;world&#34;')).toBe('<hello> & "world"');

    // Doubly-encoded entities
    expect(sanitizeAndDecodeHtml('&amp;lt;lora:double_encoded:1.0&amp;gt;')).toBe('<lora:double_encoded:1.0>');
  });

  it('should query CivitAI and sterilize HTML entities in description, title, and trainedWords', async () => {
    const mockCivitaiResponse = {
      modelId: 5555,
      id: 6666,
      name: 'v2.0',
      description: '<p>rlbtyc1tr0n, &lt;lora:R3alB3auty_ANIMAv1_v2:1.0&gt;,</p>',
      trainedWords: ['rlbtyc1tr0n', '&lt;lora:R3alB3auty_ANIMAv1_v2:1.0&gt;'],
      baseModel: 'SDXL 1.0',
      model: {
        name: 'Real &amp; Beauty',
        type: 'LORA',
        creator: { username: 'Stygian &amp; Co' },
        tags: [{ name: 'realism &amp; photo' }],
      },
      images: [
        { url: 'https://civitai.com/preview-sfw.jpg', nsfw: false, nsfwLevel: 1 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCivitaiResponse,
    } as any);

    const res = await extractor.fetchCivitaiMetadataByHash('hash1234567890abcdef', false);
    expect(res).not.toBeNull();
    expect(res?.modelName).toBe('Real & Beauty');
    expect(res?.creator).toBe('Stygian & Co');
    expect(res?.tags).toEqual(['realism & photo']);
    expect(res?.trainedWords).toEqual(['rlbtyc1tr0n', '<lora:R3alB3auty_ANIMAv1_v2:1.0>']);
    // Description should be completely sterilized of HTML tags and &lt; entities
    expect(res?.description).toBe('rlbtyc1tr0n, <lora:R3alB3auty_ANIMAv1_v2:1.0>,');
    expect(res?.description).not.toContain('&lt;');
    expect(res?.description).not.toContain('&gt;');
    expect(res?.description).not.toContain('<p>');

    fetchSpy.mockRestore();
  });

  it('should query CivitAI and filter out NSFW preview images when allowNsfwSharing is false', async () => {
    const mockCivitaiResponse = {
      modelId: 12345,
      id: 67890,
      name: 'v1.0',
      description: '<p>A great photorealistic checkpoint</p>',
      baseModel: 'SDXL 1.0',
      model: {
        name: 'Realistic Vision SDXL',
        type: 'Checkpoint',
        creator: { username: 'AIArtistPro' },
        tags: [{ name: 'photorealism' }, { name: 'portrait' }],
      },
      images: [
        { url: 'https://civitai.com/preview-nsfw.jpg', nsfw: true, nsfwLevel: 4 },
        { url: 'https://civitai.com/preview-sfw.jpg', nsfw: false, nsfwLevel: 1 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockCivitaiResponse,
    } as any);

    const resSfw = await extractor.fetchCivitaiMetadataByHash('abcdef1234567890abcdef1234567890', false);
    expect(resSfw).not.toBeNull();
    expect(resSfw?.creator).toBe('AIArtistPro');
    expect(resSfw?.modelId).toBe(12345);
    expect(resSfw?.versionId).toBe(67890);
    expect(resSfw?.tags).toEqual(['photorealism', 'portrait']);
    expect(resSfw?.previewImageUrl).toBe('https://civitai.com/preview-sfw.jpg');

    fetchSpy.mockRestore();
  });

  it('should return no preview image when only NSFW preview images exist and allowNsfwSharing is false', async () => {
    const mockNsfwOnlyResponse = {
      modelId: 9999,
      id: 8888,
      name: 'NSFW Model v1',
      model: {
        name: 'NSFW Character',
        type: 'LORA',
        creator: { username: 'NsfwCreator' },
        tags: ['character'],
      },
      images: [
        { url: 'https://civitai.com/mature1.jpg', nsfw: true, nsfwLevel: 4 },
        { url: 'https://civitai.com/mature2.jpg', nsfw: true, nsfwLevel: 8 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNsfwOnlyResponse,
    } as any);

    const res = await extractor.fetchCivitaiMetadataByHash('nsfwhash1234567890abcdef', false);
    expect(res?.creator).toBe('NsfwCreator');
    expect(res?.previewImageUrl).toBeUndefined(); // Strictly filtered out

    fetchSpy.mockRestore();
  });

  it('should allow NSFW preview images when allowNsfw is explicitly true in settings', async () => {
    const mockNsfwResponse = {
      modelId: 9999,
      id: 8888,
      name: 'Unfiltered Model',
      model: {
        name: 'Unfiltered Character',
        type: 'LORA',
        creator: { username: 'AnyCreator' },
      },
      images: [
        { url: 'https://civitai.com/mature1.jpg', nsfw: true, nsfwLevel: 4 },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNsfwResponse,
    } as any);

    const res = await extractor.fetchCivitaiMetadataByHash('nsfwhash1234567890abcdef', true);
    expect(res?.previewImageUrl).toBe('https://civitai.com/mature1.jpg');

    fetchSpy.mockRestore();
  });

  it('should query Hugging Face API and extract creator, tags, and baseModel for LLM / HF models', async () => {
    const mockHfResponse = {
      id: 'TheBloke/Llama-2-7B-Chat-GGUF',
      author: 'TheBloke',
      pipeline_tag: 'text-generation',
      tags: ['llama', 'text-generation', 'conversational', 'license:other'],
      cardData: {
        base_model: 'meta-llama/Llama-2-7b-chat-hf',
      },
      description: 'Llama 2 7B Chat GGUF model weights',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockHfResponse,
    } as any);

    const res = await extractor.fetchHuggingFaceMetadata('TheBloke/Llama-2-7B-Chat-GGUF');
    expect(res).not.toBeNull();
    expect(res?.creator).toBe('TheBloke');
    expect(res?.modelName).toBe('Llama-2-7B-Chat-GGUF');
    expect(res?.modelType).toBe('LLM');
    expect(res?.baseModel).toBe('meta-llama/Llama-2-7b-chat-hf');
    expect(res?.tags).toContain('llama');
    expect(res?.tags).toContain('text-generation');
    expect(res?.description).toBe('Llama 2 7B Chat GGUF model weights');

    fetchSpy.mockRestore();
  });

  it('should reject non-existent file paths with descriptive error', async () => {
    await expect(extractor.extractMetadata('/invalid/non_existent_file.safetensors')).rejects.toThrow('File not found');
  });
});
