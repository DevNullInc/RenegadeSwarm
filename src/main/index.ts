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

import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipcHandlers';
import { trayManager } from './tray';
import { swarmEngine } from './engine/swarmEngine';
import { swarmDaemonServer } from './engine/swarmDaemonServer';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

app.setName('renegadeswarm');
if (process.platform === 'win32') {
  app.setAppUserModelId('net.renegadeinc.renegadeswarm');
}

// Ensure unique userData directory to prevent single-instance lock collisions with sibling Electron apps
try {
  const baseAppData =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(process.env.HOME || '', 'Library', 'Application Support')
      : path.join(process.env.HOME || '', '.config'));
  const userDataDir = path.join(baseAppData, 'RenegadeSwarm');
  app.setPath('userData', userDataDir);
} catch (e) {
  console.warn('[Swarm] Could not set custom userData directory:', e);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.warn('[Swarm] Another instance is already running. Exiting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

async function createWindow() {
  // Disable application and window menu bar completely
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0e14',
    title: 'RenegadeSwarm - P2P AI Model Distribution',
    frame: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const isHeadless = process.env.HEADLESS === 'true' || process.argv.includes('--headless');

  if (!isHeadless) {
    mainWindow.once('ready-to-show', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  }

  registerIpcHandlers();
  await swarmEngine.init();

  // Configure and start Swarm HTTP Daemon Server on 127.0.0.1:5180
  swarmDaemonServer.setMainWindow(mainWindow);
  await swarmDaemonServer.start().catch((err) => {
    console.warn('[Swarm] Daemon server could not start on port 5180:', err.message);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Ensure window is shown if ready-to-show already fired during initial file load
  if (!isHeadless && mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', async (event) => {
    if (isQuitting) return;

    event.preventDefault();

    if (!mainWindow) return;

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Minimize to Tray', 'Exit Application', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'RenegadeSwarm',
      message: 'Close Window Options',
      detail: 'Would you like to keep RenegadeSwarm running in the system tray for seeding and downloads, or exit the application completely?',
    });

    if (response === 0) {
      // Minimize to Tray
      mainWindow.hide();
    } else if (response === 1) {
      // Exit Application
      isQuitting = true;
      app.quit();
    }
    // If response === 2 (Cancel), do nothing and keep window open
  });

  trayManager.init(mainWindow);
}

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  isQuitting = true;
  swarmDaemonServer.stop().catch(() => {});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.show();
  }
});
