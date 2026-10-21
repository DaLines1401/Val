const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  loadLineups: () => ipcRenderer.invoke('lineups:load'),
  saveUserLineups: (lineups) => ipcRenderer.invoke('lineups:save-user', lineups),
  loadRiotProfile: () => ipcRenderer.invoke('riot:load-profile'),
  saveRiotProfile: (profile) => ipcRenderer.invoke('riot:save-profile', profile),
  queryRiotApi: (payload) => ipcRenderer.invoke('riot:query-api', payload),

  setHoverInteractive: (hovering) => ipcRenderer.send('overlay:set-hover-interactive', hovering),
  setGhostMode: (ghost) => ipcRenderer.send('overlay:set-ghost-mode', ghost),
  quitApp: () => ipcRenderer.send('app:quit'),

  onTogglePlanner: (callback) => ipcRenderer.on('shortcut:toggle-planner', () => callback()),
  onGhostModeChange: (callback) => ipcRenderer.on('shortcut:ghost-mode', (_e, val) => callback(val)),
  onAntiFlash: (callback) => ipcRenderer.on('shortcut:anti-flash', () => callback()),
  onToggleRuler: (callback) => ipcRenderer.on('shortcut:toggle-ruler', () => callback()),
  onSyncTimer: (callback) => ipcRenderer.on('shortcut:sync-timer', () => callback()),
  onBuyPhase: (callback) => ipcRenderer.on('shortcut:buy-phase', () => callback()),
  onSpikePlanting: (callback) => ipcRenderer.on('shortcut:spike-planting', () => callback()),
  onSpikePlanted: (callback) => ipcRenderer.on('shortcut:spike-planted', () => callback()),
  onSpikeDefuse: (callback) => ipcRenderer.on('shortcut:spike-defuse', () => callback()),
  onQuickSlot: (callback) => ipcRenderer.on('shortcut:quick-slot', (_e, slotIdx) => callback(slotIdx))
});
