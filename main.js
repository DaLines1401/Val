const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindow = null;
let isGhostMode = false;
let isHoveringInteractive = true;

const DATA_DIR = path.join(__dirname, 'data');
const USER_LINEUPS_FILE = path.join(DATA_DIR, 'user-lineups.json');
const DEFAULT_LINEUPS_FILE = path.join(DATA_DIR, 'default-lineups.json');
const RIOT_PROFILE_FILE = path.join(DATA_DIR, 'riot-profile.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadAllLineups() {
  ensureDataDir();
  let defaults = [];
  let userLineups = [];
  try {
    if (fs.existsSync(DEFAULT_LINEUPS_FILE)) {
      defaults = JSON.parse(fs.readFileSync(DEFAULT_LINEUPS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read default lineups:', err);
  }
  try {
    if (fs.existsSync(USER_LINEUPS_FILE)) {
      userLineups = JSON.parse(fs.readFileSync(USER_LINEUPS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read user lineups:', err);
  }
  return { defaults, userLineups };
}

function saveUserLineups(lineups) {
  ensureDataDir();
  fs.writeFileSync(USER_LINEUPS_FILE, JSON.stringify(lineups, null, 2), 'utf-8');
  return true;
}

function loadRiotProfile() {
  ensureDataDir();
  try {
    if (fs.existsSync(RIOT_PROFILE_FILE)) {
      return JSON.parse(fs.readFileSync(RIOT_PROFILE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Failed to read riot profile:', err);
  }
  return {
    riotId: 'SovaMain#TH1',
    shard: 'ap',
    apiKey: '',
    puuid: null,
    mapStats: {
      Ascent: { wins: 8, losses: 3 },
      Bind: { wins: 5, losses: 2 },
      Haven: { wins: 6, losses: 2 },
      Sunset: { wins: 4, losses: 2 }
    }
  };
}

function saveRiotProfile(profile) {
  ensureDataDir();
  fs.writeFileSync(RIOT_PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf-8');
  return true;
}

function httpsGetJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: { raw } });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

// Query Official Riot Games API endpoints (ACCOUNT-V1 + VAL-STATUS-V1 + VAL-MATCH-V1)
async function queryRiotApi({ riotId, shard = 'ap', apiKey = '' }) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return {
      ok: false,
      mode: 'LOCAL_ONLY',
      message: 'โหมด Local Mastery (ใส่ RGAPI Key จาก developer.riotgames.com เพื่อดึง PUUID และ VAL-STATUS-V1 จริง)'
    };
  }

  const [gameName, tagLine] = (riotId || 'Player#AP').split('#');
  const regionalCluster =
    shard === 'na' || shard === 'br' || shard === 'latam'
      ? 'americas'
      : shard === 'eu'
      ? 'europe'
      : 'asia';

  try {
    const headers = { 'X-Riot-Token': cleanKey };

    // 1. ACCOUNT-V1: Resolve Riot ID (gameName#tagLine) -> PUUID
    const accountUrl = `https://${regionalCluster}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName || 'Sova'
    )}/${encodeURIComponent(tagLine || 'TH1')}`;
    const accRes = await httpsGetJson(accountUrl, headers);

    // 2. VAL-STATUS-V1: Get Valorant Platform Status for shard (e.g., ap)
    const statusUrl = `https://${shard}.api.riotgames.com/val/status/v1/platform-data`;
    const statusRes = await httpsGetJson(statusUrl, headers);

    if (accRes.status === 200 && accRes.data.puuid) {
      // 3. Optional VAL-MATCH-V1 (Requires Production Key; gracefully handle 403 on Dev Key)
      const matchUrl = `https://${shard}.api.riotgames.com/val/match/v1/matchlists/by-puuid/${accRes.data.puuid}`;
      const matchRes = await httpsGetJson(matchUrl, headers);

      const incidents = statusRes.data?.incidents?.length || 0;
      const maintenances = statusRes.data?.maintenances?.length || 0;

      return {
        ok: true,
        mode: 'RIOT_LIVE',
        puuid: accRes.data.puuid,
        gameName: accRes.data.gameName,
        tagLine: accRes.data.tagLine,
        serverStatus:
          incidents === 0 && maintenances === 0
            ? `เซิร์ฟเวอร์ ${shard.toUpperCase()} ปกติ (Online ✓)`
            : `แจ้งเตือนเซิร์ฟเวอร์ (${incidents} incidents)`,
        matchApiAccess:
          matchRes.status === 200
            ? `ดึงประวัติแมตช์สำเร็จ (${(matchRes.data.history || []).length} แมตช์)`
            : 'Verified Account PUUID ✓ (VAL-MATCH-V1 ต้องใช้ Production Key)'
      };
    }

    return {
      ok: false,
      mode: 'API_ERROR',
      message: `Riot API ตอบกลับรหัส ${accRes.status}: ตรวจสอบชื่อ#แท็ก หรือวันหมดอายุของ RGAPI Key`
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'NETWORK_ERROR',
      message: `ไม่สามารถเชื่อมต่อ Riot API: ${err.message}`
    };
  }
}

function updateMousePassthrough() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isGhostMode) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    if (isHoveringInteractive) {
      mainWindow.setIgnoreMouseEvents(false);
    } else {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  updateMousePassthrough();
}

function registerShortcuts() {
  // Toggle 2D Map Planner Modal
  globalShortcut.register('Alt+L', () => {
    if (!mainWindow) return;
    if (isGhostMode) {
      isGhostMode = false;
      updateMousePassthrough();
      mainWindow.webContents.send('shortcut:ghost-mode', isGhostMode);
    }
    mainWindow.webContents.send('shortcut:toggle-planner');
  });

  // Toggle Ghost / Click-through Mode
  globalShortcut.register('Alt+G', () => {
    if (!mainWindow) return;
    isGhostMode = !isGhostMode;
    updateMousePassthrough();
    mainWindow.webContents.send('shortcut:ghost-mode', isGhostMode);
  });

  // Trigger Anti-Flash Eye-Care Screen Dimmer
  globalShortcut.register('Alt+F', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:anti-flash');
  });

  // Toggle On-Screen Pitch Sky-Ruler
  globalShortcut.register('Alt+R', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:toggle-ruler');
  });

  // Trigger Double Shock Sync Timer / Audio Metronome
  globalShortcut.register('Alt+T', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:sync-timer');
  });

  // Trigger Buy-Phase (30s) & Riot Fair-Play Auto-Hide Mode
  globalShortcut.register('Alt+B', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:buy-phase');
  });

  // Spike Planting Start (4.0s -> auto transitions to 45.0s Spike Planted)
  globalShortcut.register('Alt+P', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:spike-planting');
  });

  // Spike Planted Immediately (45.0s Countdown)
  globalShortcut.register('Alt+S', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:spike-planted');
  });

  // Spike Defuse Sound Heard (7.0s Full / 3.5s Half Defuse Counter)
  globalShortcut.register('Alt+D', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('shortcut:spike-defuse');
  });

  // Quick Slots Alt+1 to Alt+5
  for (let i = 1; i <= 5; i++) {
    globalShortcut.register(`Alt+${i}`, () => {
      if (!mainWindow) return;
      mainWindow.webContents.send('shortcut:quick-slot', i - 1);
    });
  }
}

app.whenReady().then(() => {
  createOverlayWindow();
  registerShortcuts();

  ipcMain.handle('lineups:load', () => loadAllLineups());
  ipcMain.handle('lineups:save-user', (_event, userLineups) => saveUserLineups(userLineups));

  ipcMain.handle('riot:load-profile', () => loadRiotProfile());
  ipcMain.handle('riot:save-profile', (_event, profile) => saveRiotProfile(profile));
  ipcMain.handle('riot:query-api', (_event, payload) => queryRiotApi(payload));

  ipcMain.on('overlay:set-hover-interactive', (_event, hovering) => {
    isHoveringInteractive = Boolean(hovering);
    updateMousePassthrough();
  });

  ipcMain.on('overlay:set-ghost-mode', (_event, ghost) => {
    isGhostMode = Boolean(ghost);
    updateMousePassthrough();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shortcut:ghost-mode', isGhostMode);
    }
  });

  ipcMain.on('app:quit', () => {
    app.quit();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
