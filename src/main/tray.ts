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

import { app, Menu, Tray, nativeImage, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

const FALLBACK_TRAY_ICON_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABjklEQVR4nO2XyW7CMBCG8w7N4jgJAQrk0r2l+7639P1PfY2epwIR6jgzztgQqkq1NBcO+T55xr+N5/2vZdYnwKLWDmyqdYD9eA/8eB8CedCiiPbBDbEDvtitwAN5CEFyBGEyhjAdr1CiAt5mwcP0GMLsBKLsdEmJEhxtOcGjzhlEnXMQ+YWDhAb3vsC6SrjIL0HkVxYSyLa7CKjwuHtt0Q6k524CP/C4ewNx75YhQEy7CaT2vCpQhcveHWMXiKNm7LUycOrvOlz270H2H3gC+rSbh02Z9opAHZ5sPjIFtKPmMgMY3CxAwKfn3EUAgyeDJ0gGz4TEQqAeMk4CBDwdvpgF0GwnQsYsgMPT4WtzG/R4pUKmaRfs4IqAnu1UyHBaocLT0RtTQL/VagLzeGUIqPBs9M4TmEkQCaeHTLMAAufEMZVwWMgYBebwrJjYXUYzCWLa0YQjBGpwmyuZmnYqZFCBYgJZ8eH+KMFuNVPIqD13hyPtcIGv/GE6LQ689ad5WWjC/cYflPbBHKG/ur4BFEOU0IoBS0QAAAAASUVORK5CYII=';

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;

  init(window: BrowserWindow) {
    this.mainWindow = window;

    try {
      // Resolve tray icon from candidate build paths or use crisp embedded placeholder
      const candidatePaths = [
        path.join(__dirname, '../../build/tray-icon.png'),
        path.join(__dirname, '../build/tray-icon.png'),
        path.join(__dirname, 'build/tray-icon.png'),
        path.join(process.cwd(), 'build/tray-icon.png'),
      ];

      let icon = nativeImage.createEmpty();
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          const loaded = nativeImage.createFromPath(p);
          if (!loaded.isEmpty()) {
            icon = loaded;
            break;
          }
        }
      }

      if (icon.isEmpty()) {
        icon = nativeImage.createFromDataURL(FALLBACK_TRAY_ICON_DATA);
      }

      this.tray = new Tray(icon.resize({ width: 16, height: 16 }));
      this.tray.setToolTip('RenegadeSwarm - Seeding AI Models');
      this.updateContextMenu('0 active downloads | 0 seeding');

      this.tray.on('double-click', () => {
        this.toggleWindow();
      });
      this.tray.on('click', () => {
        this.toggleWindow();
      });
    } catch (err: any) {
      console.warn('[TrayManager] Could not initialize system tray icon:', err?.message || err);
    }
  }

  updateContextMenu(statusText: string, speedText?: string, ratioText?: string) {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      { label: `RenegadeSwarm Status: ${statusText}`, enabled: false },
      ...(speedText ? [{ label: `Network: ${speedText}`, enabled: false }] : []),
      ...(ratioText ? [{ label: `Ratio Progress: ${ratioText}`, enabled: false }] : []),
      { type: 'separator' },
      {
        label: 'Open RenegadeSwarm Window',
        click: () => this.showWindow(),
      },
      {
        label: 'Pause All Transfers',
        click: () => {},
      },
      {
        label: 'Halt Seeding on Completed (Ratio Cap)',
        click: () => {},
      },
      { type: 'separator' },
      {
        label: 'Quit Application',
        click: () => {
          (app as any).isQuitting = true;
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  toggleWindow() {
    if (!this.mainWindow) return;
    if (this.mainWindow.isVisible()) {
      this.mainWindow.hide();
    } else {
      this.showWindow();
    }
  }

  showWindow() {
    if (!this.mainWindow) return;
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export const trayManager = new TrayManager();
