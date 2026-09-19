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

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { cmmFolderRouter } from '../src/main/cmm/cmmFolderRouter';

describe('Path Confinement & Jail Policy', () => {
  beforeEach(() => {
    cmmFolderRouter.updateConfig({
      rootPath: path.resolve('./test_models'),
      customFolders: [path.resolve('./custom_models')],
      defaultDownloadFolder: path.resolve('./test_models'),
    });
  });

  it('should reject paths with directory traversal sequences', () => {
    expect(cmmFolderRouter.isPathAllowed(path.resolve('./test_models/../../secret.txt'))).toBe(false);
    expect(cmmFolderRouter.isPathAllowed('../outside/model.safetensors')).toBe(false);
  });

  it('should reject sensitive operating system directories', () => {
    if (process.platform === 'win32') {
      expect(cmmFolderRouter.isPathAllowed('C:\\Windows\\System32\\cmd.exe')).toBe(false);
      expect(cmmFolderRouter.isPathAllowed('C:\\Program Files\\app.dll')).toBe(false);
    } else {
      expect(cmmFolderRouter.isPathAllowed('/etc/passwd')).toBe(false);
      expect(cmmFolderRouter.isPathAllowed('/root/secret')).toBe(false);
      expect(cmmFolderRouter.isPathAllowed('/usr/bin/bash')).toBe(false);
    }
  });

  it('should allow paths located within configured model roots and custom folders', () => {
    const validModelPath = path.resolve('./test_models/checkpoints/flux.safetensors');
    expect(cmmFolderRouter.isPathAllowed(validModelPath)).toBe(true);

    const validCustomPath = path.resolve('./custom_models/loras/cyberpunk.safetensors');
    expect(cmmFolderRouter.isPathAllowed(validCustomPath)).toBe(true);
  });

  it('should allow dynamically recorded session dialog paths', () => {
    const dialogPickedPath = path.resolve('./arbitrary_user_folder/special_model.safetensors');
    expect(cmmFolderRouter.isPathAllowed(dialogPickedPath)).toBe(false);

    cmmFolderRouter.recordSessionDialogPath(dialogPickedPath);
    expect(cmmFolderRouter.isPathAllowed(dialogPickedPath)).toBe(true);
  });
});
