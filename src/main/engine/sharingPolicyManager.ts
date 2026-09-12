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

import {
  SharingPolicySettings,
  DEFAULT_SHARING_POLICY,
  SharingPolicySettingsSchema,
  ModelShareCandidate,
  ShareEvaluationResult,
  evaluateModelSharePermission,
} from '../../protocol/sharingPolicy';

export class SharingPolicyManager {
  private policy: SharingPolicySettings;

  constructor(initialPolicy?: Partial<SharingPolicySettings>) {
    this.policy = {
      ...DEFAULT_SHARING_POLICY,
      ...(initialPolicy || {}),
    };
  }

  getPolicy(): SharingPolicySettings {
    return { ...this.policy };
  }

  updatePolicy(updates: Partial<SharingPolicySettings>): SharingPolicySettings {
    const merged = {
      ...this.policy,
      ...updates,
    };
    this.policy = SharingPolicySettingsSchema.parse(merged);
    return this.getPolicy();
  }

  toggleModelOptIn(modelId: string, optIn: boolean): boolean {
    const id = modelId.trim();
    if (!id) return false;

    const optedInSet = new Set(this.policy.optedInModelIds);
    const blockedSet = new Set(this.policy.blockedModelIds);

    if (optIn) {
      optedInSet.add(id);
      blockedSet.delete(id);
    } else {
      optedInSet.delete(id);
      blockedSet.add(id);
    }

    this.policy.optedInModelIds = Array.from(optedInSet);
    this.policy.blockedModelIds = Array.from(blockedSet);
    return true;
  }

  isModelOptedIn(modelId: string): boolean {
    return this.policy.optedInModelIds.includes(modelId);
  }

  isModelBlocked(modelId: string): boolean {
    return this.policy.blockedModelIds.includes(modelId);
  }

  evaluatePermission(candidate: ModelShareCandidate): ShareEvaluationResult {
    return evaluateModelSharePermission(candidate, this.policy);
  }
}

export const sharingPolicyManager = new SharingPolicyManager();
