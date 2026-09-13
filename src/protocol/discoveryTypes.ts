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

export const RENEGADE_SWARM_DISCOVERY_EXTENSION = 'renegade_swarm_discovery_v1';
export const RENEGADE_SWARM_CLIENT_ID = 'RenegadeSwarm';

export const DiscoveryModelTypeEnum = z.enum([
  'CHECKPOINT',
  'LORA',
  'GGUF_LLM',
  'VAE',
  'TEXT_ENCODER',
  'CONTROLNET',
  'DIFFUSION_MODEL',
  'EMBEDDING',
  'OTHER',
]);

export type DiscoveryModelType = z.infer<typeof DiscoveryModelTypeEnum>;

export const DiscoveredModelEntrySchema = z.object({
  infoHash: z.string().length(40), // 40-char hex
  title: z.string().min(1).max(200),
  version: z.string().default('1.0.0'),
  modelType: DiscoveryModelTypeEnum,
  baseModel: z.string().max(100).default('Unknown'),
  totalSizeBytes: z.number().nonnegative(),
  creator: z.string().max(100).default('Anonymous'),
  creatorPublicKey: z.string().length(64).optional(), // 64-char hex Ed25519
  signature: z.string().optional(),
  sha256: z.string().length(64).optional(),
  tags: z.array(z.string().max(50)).default([]),
  description: z.string().max(2000).default(''),
  publishedAt: z.number().int().nonnegative(),
  urlList: z.array(z.string().url()).default([]),
  previewHash: z.string().length(64).optional(),
  nsfw: z.boolean().default(false),
});

export type DiscoveredModelEntry = z.infer<typeof DiscoveredModelEntrySchema>;

export const DiscoveryCatalogQuerySchema = z.object({
  queryId: z.string().uuid(),
  query: z.string().max(200).default(''),
  modelType: DiscoveryModelTypeEnum.optional(),
  baseModel: z.string().max(100).optional(),
  verifiedOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
});

export type DiscoveryCatalogQuery = z.infer<typeof DiscoveryCatalogQuerySchema>;

export const DiscoveryCatalogResponseSchema = z.object({
  queryId: z.string().uuid(),
  responderPeerId: z.string().max(64).optional(),
  models: z.array(DiscoveredModelEntrySchema).max(100),
});

export type DiscoveryCatalogResponse = z.infer<typeof DiscoveryCatalogResponseSchema>;

export const DiscoveryCatalogAnnounceSchema = z.object({
  models: z.array(DiscoveredModelEntrySchema).max(20),
});

export type DiscoveryCatalogAnnounce = z.infer<typeof DiscoveryCatalogAnnounceSchema>;

export type DiscoveryTrustLevel = 'VerifiedCreator' | 'Community' | 'Untrusted' | 'Blocked';

export interface DiscoveredModelWithTrust extends DiscoveredModelEntry {
  trustLevel: DiscoveryTrustLevel;
  trustScore: number;
  peerCount?: number;
  firstSeenAt: number;
  lastSeenAt: number;
  sourcePeerId?: string;
}
