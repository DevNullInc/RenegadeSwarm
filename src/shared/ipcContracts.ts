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
export type ToggleModelShareRequest = z.infer<typeof ToggleModelShareRequestSchema>;
export type KeyringEntryContract = z.infer<typeof KeyringEntrySchema>;
export type UserIdentity = z.infer<typeof UserIdentitySchema>;
export type LockoutStatus = z.infer<typeof LockoutStatusSchema>;
export type OpenExternalUrlRequest = z.infer<typeof OpenExternalUrlRequestSchema>;
