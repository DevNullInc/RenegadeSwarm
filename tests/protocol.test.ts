import { describe, it, expect } from 'vitest';
import {
  parseSwarmManifest,
  serializeSwarmManifest,
  generateMagnetUri,
} from '../src/protocol/manifest';
import { SwarmManifestSchema } from '../src/protocol/validation';
import { calculateOptimalPieceLength } from '../src/protocol/crypto';

describe('Pure Swarm Protocol Layer (No Node APIs)', () => {
  const validManifest = {
    swarmSpecVersion: '1.0.0' as const,
    manifestId: 'a4b88950-8b9f-4df0-94e8-ec5ef4a67e10',
    createdAt: 1723456789,
    createdBy: 'RenegadeSwarm/0.1.0',
    pieceLength: 4194304,
    totalSizeBytes: 2400000000,
    model: {
      title: 'FLUX.1-Dev Cyberpunk',
      version: '1.0.0',
      modelType: 'LoRA',
      baseModel: 'Flux.1 D',
      creator: 'TheStygianRenegade',
      nsfw: false,
      description: 'High detail LoRA',
      tags: ['cyberpunk', 'flux'],
      license: 'MIT',
    },
    hashes: {
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      infoHash: '4a5c88b2e118b6284f18b3ec48866164287d3d2a',
    },
    files: [
      {
        relativePath: 'cyberpunk.safetensors',
        sizeBytes: 2400000000,
        fileType: 'Model' as const,
        targetSubfolder: 'loras',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    ],
    announceList: [
      ['udp://tracker.opentrackr.org:1337/announce'],
      ['wss://tracker.webtorrent.dev'],
    ],
    urlList: ['https://huggingface.co/DevNullInc/models/resolve/main/cyberpunk.safetensors'],
  };

  it('should serialize and parse manifest idempotently', () => {
    const serialized = serializeSwarmManifest(validManifest);
    expect(serialized).toBeTypeOf('string');

    const parsed = parseSwarmManifest(serialized);
    expect(parsed.manifestId).toBe(validManifest.manifestId);
    expect(parsed.model.title).toBe('FLUX.1-Dev Cyberpunk');
    expect(parsed.urlList.length).toBe(1);
  });

  it('should reject manifest files with directory traversal in relativePath', () => {
    const maliciousManifest = {
      ...validManifest,
      files: [
        {
          relativePath: '../../../etc/passwd',
          sizeBytes: 100,
          fileType: 'Model' as const,
          targetSubfolder: 'checkpoints',
        },
      ],
    };

    const result = SwarmManifestSchema.safeParse(maliciousManifest);
    expect(result.success).toBe(false);
  });

  it('should generate valid magnet URI with trackers and web seeds', () => {
    const magnet = generateMagnetUri(validManifest);
    expect(magnet.startsWith('magnet:?xt=urn:btih:4a5c88b2e118b6284f18b3ec48866164287d3d2a')).toBe(true);
    expect(magnet).toContain('&tr=');
    expect(magnet).toContain('&ws=https%3A%2F%2Fhuggingface.co');
  });

  it('should calculate optimal piece sizes for multi-GB AI models', () => {
    expect(calculateOptimalPieceLength(50 * 1024 * 1024 * 1024)).toBe(32 * 1024 * 1024); // 32MB for 50GB
    expect(calculateOptimalPieceLength(15 * 1024 * 1024 * 1024)).toBe(16 * 1024 * 1024); // 16MB for 15GB
    expect(calculateOptimalPieceLength(3 * 1024 * 1024 * 1024)).toBe(8 * 1024 * 1024);   // 8MB for 3GB
    expect(calculateOptimalPieceLength(200 * 1024 * 1024)).toBe(2 * 1024 * 1024);        // 2MB for 200MB
  });
});
