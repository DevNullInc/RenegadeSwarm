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

import path from 'path';
import fs from 'fs';
import {
  ModelType,
  FileType,
  DEFAULT_FOLDER_MAP,
  COMFYUI_STANDARD_MODEL_SUBFOLDERS,
  FORBIDDEN_EXTENSIONS,
} from '../../shared/cmmTypes';

export interface FolderRouterConfig {
  rootPath: string;
  separateByBaseModel: boolean;
  separateByCreator: boolean;
  folderMappings: Record<string, string>;
}

export function sanitizePathSegment(name: string): string {
  if (!name) return '';
  return name
    .replace(/\0/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim();
}

export class CmmFolderRouter {
  private config: FolderRouterConfig;

  constructor(config?: Partial<FolderRouterConfig>) {
    this.config = {
      rootPath: config?.rootPath || '',
      separateByBaseModel: config?.separateByBaseModel ?? false,
      separateByCreator: config?.separateByCreator ?? false,
      folderMappings: { ...DEFAULT_FOLDER_MAP, ...(config?.folderMappings || {}) },
    };
  }

  updateConfig(newConfig: Partial<FolderRouterConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
      folderMappings: {
        ...this.config.folderMappings,
        ...(newConfig.folderMappings || {}),
      },
    };
  }

  determineFolder(_fileName: string, modelType: ModelType | string, fileType?: FileType): string {
    if (fileType === 'VAE') return 'vae';
    if (fileType === 'Text Encoder') return 'text_encoders';
    if (fileType === 'Config') return 'configs';

    return this.config.folderMappings[modelType] || 'checkpoints';
  }

  computeDestination(params: {
    fileName: string;
    modelType: ModelType | string;
    baseModel?: string;
    creator?: string;
    fileType?: FileType;
    targetRoot?: string;
  }): { folderName: string; fullPath: string; relativePath: string; isValid: boolean; reason?: string } {
    const { fileName, modelType, baseModel, creator, fileType, targetRoot } = params;

    const ext = path.extname(fileName).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      return {
        folderName: '',
        fullPath: '',
        relativePath: '',
        isValid: false,
        reason: `Forbidden executable extension '${ext}' rejected for security`,
      };
    }

    const baseFolder = this.determineFolder(fileName, modelType, fileType);
    const sanitizedBaseFolder = sanitizePathSegment(baseFolder);
    const sanitizedFileName = sanitizePathSegment(fileName);

    const pathParts: string[] = [sanitizedBaseFolder];

    if (this.config.separateByBaseModel && baseModel) {
      pathParts.push(sanitizePathSegment(baseModel));
    }

    if (this.config.separateByCreator && creator) {
      pathParts.push(sanitizePathSegment(creator));
    }

    const relativePath = path.join(...pathParts, sanitizedFileName);
    const effectiveRoot = targetRoot || this.config.rootPath;

    if (!effectiveRoot) {
      return {
        folderName: baseFolder,
        fullPath: relativePath,
        relativePath,
        isValid: true,
      };
    }

    const resolvedRoot = path.resolve(effectiveRoot);
    let fullPath = path.resolve(path.join(resolvedRoot, relativePath));

    // Security check: Guard against directory traversal attacks
    const rel = path.relative(resolvedRoot, fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      fullPath = path.join(resolvedRoot, sanitizedFileName);
    }

    return {
      folderName: baseFolder,
      fullPath,
      relativePath,
      isValid: true,
    };
  }

  scaffoldComfyFolders(rootPath: string): { created: string[]; existing: string[] } {
    if (!rootPath || !path.isAbsolute(rootPath)) {
      return { created: [], existing: [] };
    }

    const created: string[] = [];
    const existing: string[] = [];

    if (!fs.existsSync(rootPath)) {
      fs.mkdirSync(rootPath, { recursive: true });
    }

    for (const subfolder of COMFYUI_STANDARD_MODEL_SUBFOLDERS) {
      const fullSubPath = path.join(rootPath, subfolder);
      if (!fs.existsSync(fullSubPath)) {
        try {
          fs.mkdirSync(fullSubPath, { recursive: true });
          created.push(subfolder);
        } catch {
          // ignore error
        }
      } else {
        existing.push(subfolder);
      }
    }

    return { created, existing };
  }
}

export const cmmFolderRouter = new CmmFolderRouter();
