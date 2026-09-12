import { describe, it, expect } from 'vitest';
import {
  AddMagnetRequestSchema,
  CreateSwarmPackageRequestSchema,
  BandwidthSettingsSchema,
} from '../src/shared/ipcContracts';

describe('IPC Validation Contracts', () => {
  it('should accept valid BitTorrent magnet link', () => {
    const validMagnet = {
      magnetUri: 'magnet:?xt=urn:btih:4a5c88b2e118b6284f18b3ec48866164287d3d2a&dn=FLUX.1-dev.safetensors',
      autoOrganizeComfy: true,
    };
    const result = AddMagnetRequestSchema.safeParse(validMagnet);
    expect(result.success).toBe(true);
  });

  it('should reject invalid or non-BitTorrent URI', () => {
    const invalidMagnet = {
      magnetUri: 'https://civitai.com/api/v1/models/12345',
    };
    const result = AddMagnetRequestSchema.safeParse(invalidMagnet);
    expect(result.success).toBe(false);
  });

  it('should validate CreateSwarmPackageRequestSchema', () => {
    const validReq = {
      modelFilePath: 'D:/models/flux.safetensors',
      title: 'Flux Dev Model',
      modelType: 'Checkpoint',
      baseModel: 'Flux.1 D',
    };
    const result = CreateSwarmPackageRequestSchema.safeParse(validReq);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0.0');
    }
  });

  it('should reject empty title or empty model path', () => {
    const invalidReq = {
      modelFilePath: '',
      title: '',
      modelType: 'Checkpoint',
    };
    const result = CreateSwarmPackageRequestSchema.safeParse(invalidReq);
    expect(result.success).toBe(false);
  });

  it('should enforce bounds on BandwidthSettingsSchema', () => {
    const invalidPort = {
      listenPort: 99999, // out of range
    };
    const result = BandwidthSettingsSchema.safeParse(invalidPort);
    expect(result.success).toBe(false);

    const validSettings = {
      listenPort: 6881,
      maxDownloadSpeedKbps: 5000,
      seedingRatioLimit: 1.5,
    };
    const validResult = BandwidthSettingsSchema.safeParse(validSettings);
    expect(validResult.success).toBe(true);
  });
});
