/**
 * RenegadeSwarm - Pure Zod Validation Schemas
 * Validates Swarm manifests, Ed25519 Signatures, CMM Canonical Naming, and security boundaries.
 */
import { z } from 'zod';

export const CMM_CANONICAL_FILENAME_REGEX =
  /^[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+\.(safetensors|gguf|bin|pt|onnx|yaml|json|png)$/i;

export function formatCmmCanonicalFileName(title: string, creator: string, extension: string): string {
  const sanitize = (str: string) =>
    str
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

  const safeTitle = sanitize(title) || 'model';
  const safeCreator = sanitize(creator) || 'unknown';
  let cleanExt = extension.startsWith('.') ? extension.slice(1) : extension;
  cleanExt = cleanExt.toLowerCase();

  return `${safeTitle}_${safeCreator}.${cleanExt}`;
}

export function isValidCmmCanonicalFileName(fileName: string): boolean {
  return CMM_CANONICAL_FILENAME_REGEX.test(fileName);
}

export const SwarmSignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  publicKey: z.string().length(64), // 32-byte hex
  signature: z.string().length(128), // 64-byte hex
  signedPayloadHash: z.string().length(64),
});

export const SwarmFileEntrySchema = z.object({
  relativePath: z
    .string()
    .min(1)
    .refine((p) => !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\'), {
      message: 'Path traversal or absolute paths strictly forbidden in manifest file entry',
    }),
  canonicalFileName: z.string().optional(),
  sizeBytes: z.number().nonnegative(),
  fileType: z.enum([
    'Model',
    'Pruned Model',
    'VAE',
    'Text Encoder',
    'Config',
    'Training Data',
    'Negative',
    'Preview',
  ]),
  targetSubfolder: z.string().min(1),
  sha256: z.string().length(64).optional(),
});

export const SwarmModelMetadataSchema = z.object({
  title: z.string().min(1).max(250),
  version: z.string().default('1.0.0'),
  modelType: z.string(),
  baseModel: z.string().optional(),
  creator: z.string().optional(),
  creatorPublicKey: z.string().length(64).optional(),
  nsfw: z.boolean().default(false),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  license: z.string().default('Unknown'),
  civitaiModelId: z.number().int().positive().optional(),
  civitaiVersionId: z.number().int().positive().optional(),
  hfRepoId: z.string().optional(),
  hfCommitSha: z.string().optional(),
  quantization: z.string().optional(),
});

export const SwarmHashesSchema = z.object({
  sha256: z.string().length(64),
  blake3: z.string().optional(),
  infoHash: z.string().length(40),
  pieceSha256List: z.array(z.string().length(64)).optional(),
});

export const SwarmManifestSchema = z.object({
  swarmSpecVersion: z.literal('1.0.0'),
  manifestId: z.string().uuid(),
  createdAt: z.number().int().positive(),
  createdBy: z.string().default('RenegadeSwarm/0.1.0'),
  pieceLength: z.number().int().min(262144).max(33554432), // 256KB to 32MB
  totalSizeBytes: z.number().int().positive(),
  model: SwarmModelMetadataSchema,
  hashes: SwarmHashesSchema,
  files: z.array(SwarmFileEntrySchema).min(1),
  announceList: z.array(z.array(z.string().url())).default([
    ['udp://tracker.opentrackr.org:1337/announce'],
    ['wss://tracker.webtorrent.dev'],
  ]),
  urlList: z.array(z.string().url()).default([]),
  signature: SwarmSignatureSchema.optional(),
});

export const MagnetUriSchema = z
  .string()
  .min(1)
  .regex(/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i, 'Invalid BitTorrent magnet link');
