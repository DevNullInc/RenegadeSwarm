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

import { z } from 'zod';
import { SwarmManifestSchema } from '../protocol/validation';

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

export const PackageJobPhaseSchema = z.enum([
  'idle',
  'hashing',
  'validating',
  'generating_manifest',
  'seeding',
  'completed',
  'error',
]);

export const PackageJobProgressSchema = z.object({
  jobId: z.string(),
  phase: PackageJobPhaseSchema,
  modelFilePath: z.string(),
  bytesProcessed: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  percent: z.number().min(0).max(100),
  currentFile: z.string().optional(),
  error: z.string().optional(),
  manifest: SwarmManifestSchema.optional(),
  request: CreateSwarmPackageRequestSchema.optional(),
  createdAt: z.number().int().positive(),
  completedAt: z.number().int().positive().optional(),
});

export const CancelPackageJobRequestSchema = z.object({
  jobId: z.string().min(1),
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

export interface ModelFolderEntry {
  path: string;
  source: 'cmm' | 'custom';
  isDefault: boolean;
  label?: string;
}

export const CmmSyncConfigRequestSchema = z.object({
  cmmDbPath: z.string().min(1),
  comfyModelsRoot: z.string().optional(),
  modelFolders: z.array(z.string()).optional(),
  defaultDownloadFolder: z.string().optional(),
  autoImportDownloaded: z.boolean().default(true),
});

export const ToggleModelShareRequestSchema = z.object({
  modelId: z.string().min(1),
  optIn: z.boolean(),
});

export const KeyringEntrySchema = z.object({
  creatorName: z.string().min(1).max(100),
  publicKeyHex: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, 'Invalid 64-character Ed25519 public key hex'),
  trustLevel: z.enum(['VerifiedCreator', 'Community', 'Untrusted', 'Blocked']),
  alias: z.string().optional(),
  addedAt: z.number().int().positive(),
  notes: z.string().optional(),
});

export const UserIdentitySchema = z.object({
  creatorName: z.string().min(1).max(100),
  publicKeyHex: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, 'Invalid 64-character Ed25519 public key hex'),
  privateKeyHex: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, 'Invalid 64-character Ed25519 private key hex'),
  createdAt: z.number().int().positive(),
  lastRegeneratedAt: z.number().int().positive().optional(),
});

export const UserIdentityPublicSchema = z.object({
  creatorName: z.string().min(1).max(100),
  publicKeyHex: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, 'Invalid 64-character Ed25519 public key hex'),
  hasPrivateKey: z.boolean().default(true),
  vaultStatus: z.enum(['encrypted_os_vault', 'unencrypted_memory_only', 'software_gcm_test']).default('encrypted_os_vault'),
  createdAt: z.number().int().positive(),
  lastRegeneratedAt: z.number().int().positive().optional(),
});

export const UpdateUserAliasRequestSchema = z.object({
  creatorName: z.string().min(1).max(100),
});

export const LockoutStatusSchema = z.object({
  canGenerate: z.boolean(),
  lockoutRemainingSeconds: z.number().int().nonnegative(),
  nextAllowedAt: z.number().int().positive(),
  lastGeneratedAt: z.number().int().nonnegative(),
  lockoutDurationSeconds: z.number().int().positive(),
});

export const OpenExternalUrlRequestSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith('https://') || u.startsWith('http://'), {
    message: 'Only HTTP and HTTPS URLs are allowed',
  }),
});

export const PreDownloadVerifyRequestSchema = z.object({
  sha256: z.string().optional(),
  magnetUri: z.string().optional(),
  manifestJson: z.string().optional(),
  infoJson: z.string().optional(),
  fileName: z.string().optional(),
  hfRepoId: z.string().optional(),
  civitaiVersionId: z.number().int().positive().optional(),
});

export const DiscoverySearchRequestSchema = z.object({
  query: z.string().default(''),
  modelType: z.string().optional(),
  baseModel: z.string().optional(),
  verifiedOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
});

export interface PreDownloadVerificationResult {
  status:
    | 'verified_civitai'
    | 'verified_huggingface'
    | 'verified_custom_trusted'
    | 'verified_custom_untrusted'
    | 'unverified'
    | 'mismatch'
    | 'rejected';
  sha256?: string;
  source: 'civitai' | 'huggingface' | 'custom' | 'unknown';
  isCustomModel: boolean;
  title?: string;
  creator?: string;
  modelType?: string;
  baseModel?: string;
  description?: string;
  tags?: string[];
  nsfw?: boolean;
  previewUrl?: string;
  civitaiModelId?: number;
  civitaiVersionId?: number;
  hfRepoId?: string;
  creatorPublicKey?: string;
  trustScore: number; // 0 - 100
  trustLevel: 'VerifiedCreator' | 'Community' | 'Untrusted' | 'Blocked' | 'Unknown';
  warnings: string[];
  canProceed: boolean;
  reason?: string;
}

// Response Types
export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export const CmmIngestModelRequestSchema = z.object({
  filePath: z.string().min(1),
  fileName: z.string().optional(),
  sha256: z.string().optional(),
  modelType: z.string().optional(),
  baseModel: z.string().optional(),
  civitaiModelId: z.number().int().positive().optional(),
  civitaiVersionId: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
  timestamp: z.number().optional(),
});

export interface CmmLoopbackHealthResponse {
  status: 'online';
  service: 'RenegadeSwarm';
  version: string;
  peers: number;
  seeding: number;
  activeDownloads: number;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  timestamp: number;
}

export const TrackerStatsSchema = z.object({
  trackersCount: z.number().int().nonnegative(),
  blacklistCount: z.number().int().nonnegative(),
  lastSyncTime: z.number().int().nonnegative(),
  isSyncing: z.boolean(),
});

export type AddMagnetRequest = z.infer<typeof AddMagnetRequestSchema>;
export type TorrentControlRequest = z.infer<typeof TorrentControlRequestSchema>;
export type CreateSwarmPackageRequest = z.infer<typeof CreateSwarmPackageRequestSchema>;
export type PackageJobPhase = z.infer<typeof PackageJobPhaseSchema>;
export type PackageJobProgress = z.infer<typeof PackageJobProgressSchema>;
export type CancelPackageJobRequest = z.infer<typeof CancelPackageJobRequestSchema>;
export type BandwidthSettings = z.infer<typeof BandwidthSettingsSchema>;
export type CmmSyncConfigRequest = z.infer<typeof CmmSyncConfigRequestSchema>;
export type ToggleModelShareRequest = z.infer<typeof ToggleModelShareRequestSchema>;
export type KeyringEntryContract = z.infer<typeof KeyringEntrySchema>;
export type UserIdentity = z.infer<typeof UserIdentitySchema>;
export type UserIdentityPublic = z.infer<typeof UserIdentityPublicSchema>;
export type UpdateUserAliasRequest = z.infer<typeof UpdateUserAliasRequestSchema>;
export type LockoutStatus = z.infer<typeof LockoutStatusSchema>;
export type OpenExternalUrlRequest = z.infer<typeof OpenExternalUrlRequestSchema>;
export type PreDownloadVerifyRequest = z.infer<typeof PreDownloadVerifyRequestSchema>;
export type DiscoverySearchRequest = z.infer<typeof DiscoverySearchRequestSchema>;
export type CmmIngestModelRequest = z.infer<typeof CmmIngestModelRequestSchema>;
export type TrackerStatsContract = z.infer<typeof TrackerStatsSchema>;

// Debug & Diagnostics Types
export type DiagnosticLogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface DiagnosticLogEvent {
  id: string;
  timestamp: number;
  level: DiagnosticLogLevel;
  subsystem: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface SystemDiagnostics {
  appVersion: string;
  platform: string;
  electronVersion: string;
  nodeVersion: string;
  hardwareHashing: string;
  peerId: string;
  listenPort: number;
  uptimeSeconds: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  dhtNodes: number;
  activeTrackersCount: number;
  activeSwarmsCount: number;
  seedingCount: number;
  downloadingCount: number;
  cmmConnected: boolean;
  cmmDbPath: string;
  cmmModelCount: number;
  discoveryStats: {
    connectedPeers: number;
    localCatalogCount: number;
    cachedDiscoveredModels: number;
    totalQueriesProcessed: number;
  };
  bandwidthRates: {
    downBps: number;
    upBps: number;
  };
}

export interface TabTelemetry {
  tabId: string;
  timestamp: number;
  metrics: Record<string, any>;
  recentLogs: DiagnosticLogEvent[];
}
