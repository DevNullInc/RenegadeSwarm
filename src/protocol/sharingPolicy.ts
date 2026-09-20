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

export type SharingMode = 'opt_in_only' | 'filter_blacklist' | 'disabled';

export interface ModelShareCandidate {
  id?: string;
  filePath: string;
  fileName: string;
  modelType?: string;
  baseModel?: string;
  tags?: string[];
  isExplicitlyOptedIn?: boolean;
  isExplicitlyBlocked?: boolean;
  nsfw?: boolean;
}

export const SharingPolicySettingsSchema = z.object({
  mode: z.enum(['opt_in_only', 'filter_blacklist', 'disabled']).default('opt_in_only'),
  autoSeedDownloads: z.boolean().default(false), // STRICT OPT-IN BY DEFAULT
  allowNsfwSharing: z.boolean().default(false),
  excludedFolderPatterns: z.array(z.string()).default([
    'private',
    'personal',
    'drafts',
    'wip',
    'client',
    'custom',
    'internal',
  ]),
  excludedDirectoryPaths: z.array(z.string()).default([]),
  excludedTagPatterns: z.array(z.string()).default([
    'private',
    'personal',
    'wip',
    'draft',
    'internal',
    'proprietary',
    'confidential',
  ]),
  excludedFilePrefixes: z.array(z.string()).default([
    'private_',
    'draft_',
    'wip_',
    'temp_',
    'internal_',
  ]),
  optedInModelIds: z.array(z.string()).default([]),
  blockedModelIds: z.array(z.string()).default([]),
});

export type SharingPolicySettings = z.infer<typeof SharingPolicySettingsSchema>;

export const DEFAULT_SHARING_POLICY: SharingPolicySettings = {
  mode: 'opt_in_only',
  autoSeedDownloads: false, // Default: Never auto-seed without explicit consent
  allowNsfwSharing: false,
  excludedFolderPatterns: [
    'private',
    'personal',
    'drafts',
    'wip',
    'client',
    'custom',
    'internal',
  ],
  excludedDirectoryPaths: [],
  excludedTagPatterns: [
    'private',
    'personal',
    'wip',
    'draft',
    'internal',
    'proprietary',
    'confidential',
  ],
  excludedFilePrefixes: [
    'private_',
    'draft_',
    'wip_',
    'temp_',
    'internal_',
  ],
  optedInModelIds: [],
  blockedModelIds: [],
};

export interface ShareEvaluationResult {
  canShare: boolean;
  reason: string;
}

/**
 * Pure function evaluating if a model file is permitted to be shared/seeded.
 * Enforces strict opt-in by default and defense against accidental data exposure.
 */
export function evaluateModelSharePermission(
  candidate: ModelShareCandidate,
  policy: SharingPolicySettings = DEFAULT_SHARING_POLICY
): ShareEvaluationResult {
  // 1. If global sharing is disabled completely
  if (policy.mode === 'disabled') {
    return {
      canShare: false,
      reason: 'P2P model sharing is globally disabled in privacy settings.',
    };
  }

  const modelId = candidate.id || candidate.fileName;

  // 2. Check explicit blocked list first
  if (candidate.isExplicitlyBlocked || policy.blockedModelIds.includes(modelId)) {
    return {
      canShare: false,
      reason: 'Model has been explicitly blocked from sharing by user.',
    };
  }

  // 3. Check NSFW sharing restriction
  if (candidate.nsfw && !policy.allowNsfwSharing) {
    return {
      canShare: false,
      reason: 'NSFW model sharing is disabled in security settings.',
    };
  }

  // 4. Check excluded file prefixes (e.g. private_lora.safetensors)
  const lowerFileName = candidate.fileName.toLowerCase();
  for (const prefix of policy.excludedFilePrefixes) {
    if (lowerFileName.startsWith(prefix.toLowerCase())) {
      return {
        canShare: false,
        reason: `File name starts with excluded privacy prefix "${prefix}".`,
      };
    }
  }

  // 5. Check excluded folder name patterns (segment match, e.g. /private/ or /wip/)
  const normalizedPath = candidate.filePath.toLowerCase().replace(/\\/g, '/');
  for (const folderPattern of policy.excludedFolderPatterns) {
    const cleanPattern = folderPattern.toLowerCase().trim();
    if (cleanPattern && normalizedPath.includes(`/${cleanPattern}/`)) {
      return {
        canShare: false,
        reason: `File is located in excluded private directory pattern "/${cleanPattern}/".`,
      };
    }
  }

  // 6. Check user-blacklisted absolute directory paths (prefix / hierarchy match)
  for (const excludedDir of policy.excludedDirectoryPaths || []) {
    const normalizedDir = excludedDir.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    if (normalizedDir && (normalizedPath.startsWith(`${normalizedDir}/`) || normalizedPath === normalizedDir)) {
      return {
        canShare: false,
        reason: `File is located inside blacklisted directory path "${excludedDir}".`,
      };
    }
  }

  // 7. Check excluded tags (e.g. ["private", "wip"])
  if (candidate.tags && candidate.tags.length > 0) {
    for (const tag of candidate.tags) {
      const lowerTag = tag.toLowerCase().trim();
      for (const pattern of policy.excludedTagPatterns) {
        if (lowerTag === pattern.toLowerCase().trim()) {
          return {
            canShare: false,
            reason: `Model metadata includes excluded privacy tag "${tag}".`,
          };
        }
      }
    }
  }

  // 8. Mode-Specific Evaluation
  if (policy.mode === 'opt_in_only') {
    const isOptedIn = candidate.isExplicitlyOptedIn || policy.optedInModelIds.includes(modelId);
    if (!isOptedIn) {
      return {
        canShare: false,
        reason: 'Opt-in required: Model has not been explicitly approved for public sharing.',
      };
    }
  }

  // All privacy and opt-in checks passed
  return {
    canShare: true,
    reason: 'Model is approved for P2P swarm sharing.',
  };
}
