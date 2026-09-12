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
});
