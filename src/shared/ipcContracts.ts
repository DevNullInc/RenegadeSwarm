import { z } from 'zod';

// 1. Swarm Action Schemas
export const AddMagnetRequestSchema = z.object({
  magnetUri: z.string().min(1).regex(/^magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/i, 'Invalid BitTorrent magnet link'),
  customDestination: z.string().optional(),
  autoOrganizeComfy: z.boolean().default(true),
});

export const TorrentControlRequestSchema = z.object({
  infoHash: z.string().length(40),
});

export const CreateSwarmPackageRequestSchema = z.object({
  modelFilePath: z.string().min(1),
  previewFilePath: z.string().optional(),
  title: z.string().min(1).max(250),
  version: z.string().default('1.0.0'),
  modelType: z.string(),
  baseModel: z.string().optional(),
  creator: z.string().optional(),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  license: z.string().default('Unknown'),
  civitaiModelId: z.number().int().positive().optional(),
  civitaiVersionId: z.number().int().positive().optional(),
  hfRepoId: z.string().optional(),
  hfCommitSha: z.string().optional(),
});

export const BandwidthSettingsSchema = z.object({
  maxDownloadSpeedKbps: z.number().int().nonnegative().default(0), // 0 = unlimited
  maxUploadSpeedKbps: z.number().int().nonnegative().default(0),
  maxActiveDownloads: z.number().int().positive().default(3),
  maxActiveSeeds: z.number().int().positive().default(10),
  seedingRatioLimit: z.number().nonnegative().default(2.0),
  backgroundSeedingEnabled: z.boolean().default(true),
  listenPort: z.number().int().min(1024).max(65535).default(6881),
  enableDht: z.boolean().default(true),
});

export const CmmSyncConfigRequestSchema = z.object({
  cmmDbPath: z.string().min(1),
  comfyModelsRoot: z.string().min(1),
  autoImportDownloaded: z.boolean().default(true),
});

// Response Types
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export type AddMagnetRequest = z.infer<typeof AddMagnetRequestSchema>;
export type TorrentControlRequest = z.infer<typeof TorrentControlRequestSchema>;
export type CreateSwarmPackageRequest = z.infer<typeof CreateSwarmPackageRequestSchema>;
export type BandwidthSettings = z.infer<typeof BandwidthSettingsSchema>;
export type CmmSyncConfigRequest = z.infer<typeof CmmSyncConfigRequestSchema>;
