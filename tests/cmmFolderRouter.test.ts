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

import { describe, it, expect } from 'vitest';
import { CmmFolderRouter, sanitizePathSegment } from '../src/main/cmm/cmmFolderRouter';
import path from 'path';

describe('CMM Compatible Folder Router', () => {
  const router = new CmmFolderRouter({
    rootPath: 'C:/ComfyUI/models',
    separateByBaseModel: true,
    separateByCreator: true,
  });

  it('should map Checkpoint to checkpoints subfolder', () => {
    const dest = router.computeDestination({
      fileName: 'epicRealism.safetensors',
      modelType: 'Checkpoint',
      baseModel: 'SD 1.5',
      creator: 'JohnDoe',
    });

    expect(dest.isValid).toBe(true);
    expect(dest.folderName).toBe('checkpoints');
    expect(dest.relativePath).toBe(path.join('checkpoints', 'SD 1.5', 'JohnDoe', 'epicRealism.safetensors'));
  });

  it('should map LORA to loras subfolder', () => {
    const dest = router.computeDestination({
      fileName: 'cyberpunk_v2.safetensors',
      modelType: 'LORA',
      baseModel: 'SDXL 1.0',
    });

    expect(dest.isValid).toBe(true);
    expect(dest.folderName).toBe('loras');
    expect(dest.relativePath).toBe(path.join('loras', 'SDXL 1.0', 'cyberpunk_v2.safetensors'));
  });

  it('should prioritize secondary fileType overrides (VAE, Text Encoder, Config)', () => {
    const dest = router.computeDestination({
      fileName: 'clip_l.safetensors',
      modelType: 'Checkpoint',
      fileType: 'Text Encoder',
    });

    expect(dest.folderName).toBe('text_encoders');
  });

  it('should reject dangerous executable files', () => {
    const dest = router.computeDestination({
      fileName: 'malicious_installer.exe',
      modelType: 'Checkpoint',
    });

    expect(dest.isValid).toBe(false);
    expect(dest.reason).toContain('Forbidden executable');
  });

  it('should prevent path traversal attempts', () => {
    const dest = router.computeDestination({
      fileName: '../../../../Windows/System32/calc.safetensors',
      modelType: 'Checkpoint',
      baseModel: 'SDXL',
    });

    expect(dest.isValid).toBe(true);
    const resolvedRoot = path.resolve('C:/ComfyUI/models');
    expect(dest.fullPath.startsWith(resolvedRoot)).toBe(true);
  });

  it('should sanitize illegal characters in path segments', () => {
    expect(sanitizePathSegment('Model: Flux <Special> | "Test"')).toBe('Model_ Flux _Special_ _ _Test_');
  });

  it('should support synchronizing multiple CMM model folders and custom folders', () => {
    const multiRouter = new CmmFolderRouter();
    multiRouter.syncCmmFolders(['D:/AI/ComfyUI/models', 'E:/SecondaryModels'], 'D:/AI/ComfyUI/models');

    let entries = multiRouter.getModelFolderEntries();
    expect(entries.length).toBe(2);
    expect(entries[0].source).toBe('cmm');
    expect(entries[0].isDefault).toBe(true);
    expect(entries[1].source).toBe('cmm');

    // Add custom folder
    const added = multiRouter.addCustomFolder('F:/ExtraCustomModels');
    expect(added).toBe(true);
    entries = multiRouter.getModelFolderEntries();
    expect(entries.length).toBe(3);
    expect(entries.some((e) => e.source === 'custom')).toBe(true);

    // Set default download folder
    multiRouter.setDefaultDownloadFolder('E:/SecondaryModels');
    entries = multiRouter.getModelFolderEntries();
    const sec = entries.find((e) => e.path === path.resolve('E:/SecondaryModels'));
    expect(sec?.isDefault).toBe(true);

    // Compute destination targeting a specific custom folder
    const dest = multiRouter.computeDestination({
      fileName: 'dreamshaper.safetensors',
      modelType: 'Checkpoint',
      targetRoot: 'F:/ExtraCustomModels',
    });
    expect(dest.fullPath.startsWith(path.resolve('F:/ExtraCustomModels'))).toBe(true);

    // Remove folder
    const removed = multiRouter.removeModelFolder('F:/ExtraCustomModels');
    expect(removed).toBe(true);
    expect(multiRouter.getModelFolderEntries().length).toBe(2);
  });
});
