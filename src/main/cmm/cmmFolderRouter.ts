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
import os from 'os';
import {
  ModelType,
  FileType,
  DEFAULT_FOLDER_MAP,
  COMFYUI_STANDARD_MODEL_SUBFOLDERS,
  FORBIDDEN_EXTENSIONS,
} from '../../shared/cmmTypes';
import { ModelFolderEntry } from '../../shared/ipcContracts';

export interface FolderRouterConfig {
  rootPath: string;
  cmmFolders: string[];
  customFolders: string[];
  defaultDownloadFolder: string;
  separateByBaseModel: boolean;
  separateByCreator: boolean;
  folderMappings: Record<string, string>;
}

// Windows reserved device names that cause OS hangs / driver errors when opened
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export function sanitizePathSegment(name: string): string {
  if (!name) return '';
  let cleaned = name
    .replace(/\0/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim();

  // Neutralize Windows reserved device names (e.g. CON -> _RS_CON, NUL.safetensors -> _RS_NUL.safetensors)
  const baseName = cleaned.split('.')[0].toLowerCase();
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(baseName)) {
    cleaned = `_RS_${cleaned}`;
  }

  return cleaned;
}

export function normalizeFolderPath(dirPath: string): string {
  if (!dirPath) return '';
  // Disallow UNC paths
  if (dirPath.startsWith('\\\\') || dirPath.startsWith('//')) {
    return '';
  }
  const resolved = path.resolve(dirPath);
  return resolved;
}

export class CmmFolderRouter {
  private config: FolderRouterConfig;
  private sessionDialogPaths: Set<string> = new Set();

  constructor(config?: Partial<FolderRouterConfig>) {
    this.config = {
      rootPath: config?.rootPath || '',
      cmmFolders: config?.cmmFolders || [],
      customFolders: config?.customFolders || [],
      defaultDownloadFolder: config?.defaultDownloadFolder || '',
      separateByBaseModel: config?.separateByBaseModel ?? false,
      separateByCreator: config?.separateByCreator ?? false,
      folderMappings: { ...DEFAULT_FOLDER_MAP, ...(config?.folderMappings || {}) },
    };
  }

  getConfig(): FolderRouterConfig {
    return { ...this.config };
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

    if (newConfig.rootPath && !this.config.defaultDownloadFolder) {
      this.config.defaultDownloadFolder = newConfig.rootPath;
    }
  }

  /**
   * Registers a path selected by the user via native Electron dialog in the active session.
   */
  recordSessionDialogPath(selectedPath: string): void {
    if (!selectedPath) return;
    const norm = normalizeFolderPath(selectedPath);
    if (norm) {
      this.sessionDialogPaths.add(norm.toLowerCase());
    }
  }

  /**
   * Fail-closed path confinement check.
   * Verifies that a target path resides inside configured model roots, discovered CMM folders,
   * or paths explicitly chosen via native dialog during this session.
   */
  isPathAllowed(candidatePath: string): boolean {
    if (!candidatePath || typeof candidatePath !== 'string') {
      return false;
    }

    if (candidatePath.includes('\0')) {
      return false;
    }

    // Security check: Reject UNC network paths to prevent NetNTLM SMB coercion (CWE-359)
    if (candidatePath.startsWith('\\\\') || candidatePath.startsWith('//')) {
      return false;
    }

    const normCandidate = path.resolve(candidatePath);
    const normCandidateLower = normCandidate.toLowerCase();

    // Reject UNC path representations
    if (normCandidateLower.startsWith('\\\\') || normCandidateLower.startsWith('//')) {
      return false;
    }

    // Reject Windows reserved device names
    const candidateBase = path.basename(normCandidateLower).split('.')[0];
    if (WINDOWS_RESERVED_DEVICE_NAMES.has(candidateBase)) {
      return false;
    }

    // Reject OS system directories
    const sysRoots = [
      'c:\\windows',
      'c:\\program files',
      'c:\\program files (x86)',
      'c:\\system volume information',
      '/etc',
      '/usr',
      '/bin',
      '/sbin',
      '/var',
      '/boot',
      '/root',
    ];

    for (const sr of sysRoots) {
      if (normCandidateLower === sr || normCandidateLower.startsWith(sr + path.sep)) {
        return false;
      }
    }

    // Check against session dialog paths
    for (const sdp of this.sessionDialogPaths) {
      if (normCandidateLower === sdp || normCandidateLower.startsWith(sdp + path.sep)) {
        return true;
      }
    }

    // Check against configured roots
    const allowedRoots: string[] = [];
    if (this.config.rootPath) {
      const norm = normalizeFolderPath(this.config.rootPath);
      if (norm) allowedRoots.push(norm);
    }
    if (this.config.defaultDownloadFolder) {
      const norm = normalizeFolderPath(this.config.defaultDownloadFolder);
      if (norm) allowedRoots.push(norm);
    }
    for (const f of this.config.cmmFolders) {
      const norm = normalizeFolderPath(f);
      if (norm) allowedRoots.push(norm);
    }
    for (const f of this.config.customFolders) {
      const norm = normalizeFolderPath(f);
      if (norm) allowedRoots.push(norm);
    }

    // Also permit standard temporary or quarantine directory
    const tempDir = path.resolve(os.tmpdir()).toLowerCase();
    if (normCandidateLower === tempDir || normCandidateLower.startsWith(tempDir + path.sep)) {
      return true;
    }

    for (const root of allowedRoots) {
      if (!root) continue;
      const normRootLower = root.toLowerCase();
      if (normCandidateLower === normRootLower || normCandidateLower.startsWith(normRootLower + path.sep)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Synchronizes model folders auto-discovered from RenegadeCMM.
   */
  syncCmmFolders(cmmFolders: string[], cmmRoot?: string) {
    const cleanedFolders: string[] = [];
    const seen = new Set<string>();

    if (cmmRoot) {
      const normRoot = normalizeFolderPath(cmmRoot);
      if (normRoot && !seen.has(normRoot.toLowerCase())) {
        seen.add(normRoot.toLowerCase());
        cleanedFolders.push(normRoot);
      }
      this.config.rootPath = normRoot;
    }

    for (const f of cmmFolders) {
      const norm = normalizeFolderPath(f);
      if (norm && !seen.has(norm.toLowerCase())) {
        seen.add(norm.toLowerCase());
        cleanedFolders.push(norm);
      }
    }

    this.config.cmmFolders = cleanedFolders;

    if (!this.config.defaultDownloadFolder && cleanedFolders.length > 0) {
      this.config.defaultDownloadFolder = cleanedFolders[0];
    }
  }

  /**
   * Adds a user-selected custom model directory.
   */
  addCustomFolder(folderPath: string): boolean {
    const norm = normalizeFolderPath(folderPath);
    if (!norm) return false;

    // Check if already in CMM or custom folders
    const all = [...this.config.cmmFolders, ...this.config.customFolders];
    if (all.some((f) => f.toLowerCase() === norm.toLowerCase())) {
      return false;
    }

    this.config.customFolders.push(norm);
    if (!this.config.defaultDownloadFolder) {
      this.config.defaultDownloadFolder = norm;
    }
    return true;
  }

  /**
   * Removes a model folder (either custom or marked for exclusion).
   */
  removeModelFolder(folderPath: string): boolean {
    const norm = normalizeFolderPath(folderPath).toLowerCase();
    const initialCustomLen = this.config.customFolders.length;
    this.config.customFolders = this.config.customFolders.filter(
      (f) => f.toLowerCase() !== norm
    );
    this.config.cmmFolders = this.config.cmmFolders.filter(
      (f) => f.toLowerCase() !== norm
    );

    if (this.config.defaultDownloadFolder.toLowerCase() === norm) {
      const remaining = [...this.config.cmmFolders, ...this.config.customFolders];
      this.config.defaultDownloadFolder = remaining.length > 0 ? remaining[0] : '';
    }

    return (
      this.config.customFolders.length !== initialCustomLen ||
      this.config.cmmFolders.length !== initialCustomLen
    );
  }

  /**
   * Sets the primary default download folder.
   */
  setDefaultDownloadFolder(folderPath: string): boolean {
    const norm = normalizeFolderPath(folderPath);
    if (!norm) return false;
    this.config.defaultDownloadFolder = norm;
    this.config.rootPath = norm;
    return true;
  }

  /**
   * Returns all active model folder entries with source metadata and default indicator.
   */
  getModelFolderEntries(): ModelFolderEntry[] {
    const entries: ModelFolderEntry[] = [];
    const seen = new Set<string>();

    const defaultFolderNorm = this.config.defaultDownloadFolder.toLowerCase();

    for (const f of this.config.cmmFolders) {
      const k = f.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        entries.push({
          path: f,
          source: 'cmm',
          isDefault: k === defaultFolderNorm,
          label: f === this.config.rootPath ? 'CMM Primary Root' : 'CMM Extra Folder',
        });
      }
    }

    for (const f of this.config.customFolders) {
      const k = f.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        entries.push({
          path: f,
          source: 'custom',
          isDefault: k === defaultFolderNorm,
          label: 'Custom Folder',
        });
      }
    }

    // If no folders are registered yet, but rootPath exists
    if (entries.length === 0 && this.config.rootPath) {
      entries.push({
        path: this.config.rootPath,
        source: 'custom',
        isDefault: true,
        label: 'Default Root',
      });
    }

    return entries;
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
    const effectiveRoot =
      targetRoot ||
      this.config.defaultDownloadFolder ||
      this.config.rootPath ||
      (this.config.cmmFolders[0] || this.config.customFolders[0] || '');

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
