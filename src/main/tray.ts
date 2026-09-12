/**
 * RenegadeSwarm - System Tray Manager for Background Seeding
 */
import { app, Menu, Tray, nativeImage, BrowserWindow } from 'electron';
import path from 'path';

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;

  init(window: BrowserWindow) {
    this.mainWindow = window;

    // Create tray icon
    const iconPath = path.join(__dirname, '../../build/tray-icon.png');
    let icon = nativeImage.createEmpty();
    try {
      icon = nativeImage.createFromPath(iconPath);
    } catch {
      // Fallback
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('RenegadeSwarm - Seeding AI Models');
    this.updateContextMenu('0 active downloads | 0 seeding');

    this.tray.on('double-click', () => {
      this.toggleWindow();
    });
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
