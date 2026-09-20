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

import { describe, it, expect } from 'vitest';
import {
  evaluateModelSharePermission,
  DEFAULT_SHARING_POLICY,
  SharingPolicySettings,
} from '../src/protocol/sharingPolicy';
import { SharingPolicyManager } from '../src/main/engine/sharingPolicyManager';

describe('Sharing Policy & Opt-In Filter (Rule 11 & Privacy Defense)', () => {
  it('rejects sharing by default when model is not explicitly opted in', () => {
    const candidate = {
      id: 'flux_dev_1',
      filePath: 'D:/ComfyUI/models/checkpoints/flux1_dev.safetensors',
      fileName: 'flux1_dev.safetensors',
      modelType: 'Checkpoint',
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('Opt-in required');
  });

  it('allows sharing when model is explicitly opted in', () => {
    const candidate = {
      id: 'flux_dev_1',
      filePath: 'D:/ComfyUI/models/checkpoints/flux1_dev.safetensors',
      fileName: 'flux1_dev.safetensors',
      modelType: 'Checkpoint',
      isExplicitlyOptedIn: true,
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(true);
    expect(result.reason).toContain('approved');
  });

  it('rejects sharing if model resides in excluded private folder', () => {
    const candidate = {
      id: 'secret_lora',
      filePath: 'D:/ComfyUI/models/loras/private/secret_lora.safetensors',
      fileName: 'secret_lora.safetensors',
      modelType: 'LORA',
      isExplicitlyOptedIn: true, // Even if opted-in, folder blacklist takes precedence
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('excluded private directory');
  });

  it('rejects sharing if filename starts with excluded privacy prefix', () => {
    const candidate = {
      id: 'priv_model',
      filePath: 'D:/ComfyUI/models/checkpoints/private_model.safetensors',
      fileName: 'private_model.safetensors',
      modelType: 'Checkpoint',
      isExplicitlyOptedIn: true,
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('privacy prefix');
  });

  it('rejects sharing if metadata contains excluded tags', () => {
    const candidate = {
      id: 'wip_model',
      filePath: 'D:/ComfyUI/models/checkpoints/test_model.safetensors',
      fileName: 'test_model.safetensors',
      tags: ['cyberpunk', 'wip', 'v1'],
      isExplicitlyOptedIn: true,
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('excluded privacy tag "wip"');
  });

  it('rejects sharing if model is explicitly blocked by user', () => {
    const candidate = {
      id: 'bad_model',
      filePath: 'D:/ComfyUI/models/checkpoints/model.safetensors',
      fileName: 'model.safetensors',
      isExplicitlyOptedIn: true,
      isExplicitlyBlocked: true,
    };

    const result = evaluateModelSharePermission(candidate, DEFAULT_SHARING_POLICY);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('explicitly blocked');
  });

  it('rejects all sharing when global mode is disabled', () => {
    const customPolicy: SharingPolicySettings = {
      ...DEFAULT_SHARING_POLICY,
      mode: 'disabled',
    };

    const candidate = {
      id: 'public_model',
      filePath: 'D:/ComfyUI/models/checkpoints/public.safetensors',
      fileName: 'public.safetensors',
      isExplicitlyOptedIn: true,
    };

    const result = evaluateModelSharePermission(candidate, customPolicy);
    expect(result.canShare).toBe(false);
    expect(result.reason).toContain('globally disabled');
  });

  it('manages opt-in state transitions via SharingPolicyManager', () => {
    const manager = new SharingPolicyManager();

    expect(manager.isModelOptedIn('model_abc')).toBe(false);

    // Opt-in model
    manager.toggleModelOptIn('model_abc', true);
    expect(manager.isModelOptedIn('model_abc')).toBe(true);
    expect(manager.isModelBlocked('model_abc')).toBe(false);

    // Evaluate permission via manager
    const evalResult = manager.evaluatePermission({
      id: 'model_abc',
      filePath: 'D:/ComfyUI/models/checkpoints/model_abc.safetensors',
      fileName: 'model_abc.safetensors',
    });
    expect(evalResult.canShare).toBe(true);

    // Revoke opt-in (block)
    manager.toggleModelOptIn('model_abc', false);
    expect(manager.isModelOptedIn('model_abc')).toBe(false);
    expect(manager.isModelBlocked('model_abc')).toBe(true);

    const blockedResult = manager.evaluatePermission({
      id: 'model_abc',
      filePath: 'D:/ComfyUI/models/checkpoints/model_abc.safetensors',
      fileName: 'model_abc.safetensors',
    });
    expect(blockedResult.canShare).toBe(false);
  });

  it('rejects sharing if model resides inside an explicit blacklisted directory path (prefix match)', () => {
    const customPolicy: SharingPolicySettings = {
      ...DEFAULT_SHARING_POLICY,
      excludedFolderPatterns: [], // Clear patterns to isolate directory path check
      excludedDirectoryPaths: ['D:/clients/Acme/final'],
    };

    // 1. File inside blacklisted hierarchy -> REJECTED
    const insideCandidate = {
      id: 'acme_model',
      filePath: 'D:/clients/Acme/final/subfolder/model.safetensors',
      fileName: 'model.safetensors',
      isExplicitlyOptedIn: true,
    };
    const insideResult = evaluateModelSharePermission(insideCandidate, customPolicy);
    expect(insideResult.canShare).toBe(false);
    expect(insideResult.reason).toContain('blacklisted directory path');

    // 2. File in different folder that happens to contain the name token "final" -> ALLOWED
    const outsideCandidate = {
      id: 'other_final',
      filePath: 'C:/ComfyUI/models/checkpoints/final/model.safetensors',
      fileName: 'model.safetensors',
      isExplicitlyOptedIn: true,
    };
    const outsideResult = evaluateModelSharePermission(outsideCandidate, customPolicy);
    expect(outsideResult.canShare).toBe(true);

    // 3. File in parent folder of blacklisted path -> ALLOWED
    const parentCandidate = {
      id: 'parent_model',
      filePath: 'D:/clients/Acme/other/model.safetensors',
      fileName: 'model.safetensors',
      isExplicitlyOptedIn: true,
    };
    const parentResult = evaluateModelSharePermission(parentCandidate, customPolicy);
    expect(parentResult.canShare).toBe(true);
  });

  it('manages directory blacklist additions, removals, and restoration via SharingPolicyManager', () => {
    const manager = new SharingPolicyManager();

    // Add directory
    manager.addBlacklistDirectory('D:\\work\\confidential_models');
    expect(manager.getPolicy().excludedDirectoryPaths).toContain('D:\\work\\confidential_models');

    // Duplicate addition should be idempotent
    manager.addBlacklistDirectory('D:/work/confidential_models');
    expect(manager.getPolicy().excludedDirectoryPaths.length).toBe(1);

    // Remove directory
    manager.removeBlacklistDirectory('D:/work/confidential_models');
    expect(manager.getPolicy().excludedDirectoryPaths.length).toBe(0);

    // Remove pattern
    manager.removeBlacklistPattern('drafts');
    expect(manager.getPolicy().excludedFolderPatterns).not.toContain('drafts');

    // Restore defaults
    manager.addBlacklistDirectory('C:/test/path');
    manager.restoreDefaultBlacklist();
    expect(manager.getPolicy().excludedFolderPatterns).toContain('drafts');
    expect(manager.getPolicy().excludedDirectoryPaths.length).toBe(0);
  });
});
