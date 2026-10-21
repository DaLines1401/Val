// ============================================================================
// Sova Tactical Lineup, Hybrid Ballistics & Eye-Care Overlay (Renderer Logic)
// Features:
// 1. Compact Lineup Reference HUD + Telemetry
// 2. Interactive 2D Map Lineup Planner powered by Valorant-API.com
// 3. Anti-Flash Eye-Care Screen Dimmer with Auto-Fade (Alt+F)
// 4. Hybrid Ballistics & Angle Simulator (Inverse Target-First & Forward Sliders)
// 5. Double Shock Dart Sync Calculator + Side-Elevation Parabola Graph + Audio Metronome (Alt+T)
// 6. On-Screen Pitch Sky-Ruler Overlay (Alt+R)
// ============================================================================

const STANDARD_MAPS = [
  'Ascent',
  'Bind',
  'Haven',
  'Sunset',
  'Lotus',
  'Split',
  'Icebox',
  'Pearl',
  'Abyss',
  'Corrode'
];

// Sova Projectile Physics Constants (calibrated for 100x100 map % = ~105 meters)
const MAP_SCALE_METERS = 1.05; // 1 map percent unit ≈ 1.05m in Valorant
const GRAVITY = 19.6; // Effective arrow gravity m/s^2
const CHARGE_VELOCITIES = {
  0: 22.0, // Tap (0 bar) -> max range ~24.7m
  1: 31.5, // 1 Bar       -> max range ~50.6m
  2: 42.0, // 2 Bars      -> max range ~90.0m
  3: 56.0  // 3 Bars      -> max range ~160m
};

const state = {
  mapsData: {},
  sovaIcons: { recon: null, shock: null },
  defaultLineups: [],
  userLineups: [],
  selectedMap: 'Ascent',
  filterAbility: 'ALL',
  filterSide: 'ALL',
  selectedLineupId: null,
  plannerVisible: true,
  rulerVisible: false,
  ghostMode: false,

  // Hybrid Ballistics Simulator State
  simStandPos: { x: 76.5, y: 64.0 },
  simLandPos: { x: 71.0, y: 27.5 },
  simYawDeg: 351,
  simPitchDeg: 44.5,
  simCharge: 1,
  simFlightTime: 2.3,
  simDistMeters: 38.7,
  doubleShockPlan: {
    shot1: { charge: 2, pitch: 65, tof: 3.9, maxHeight: 37 },
    shot2: { charge: 1, pitch: 26, tof: 1.9, maxHeight: 9 },
    delaySec: 2.0
  },

  // Custom lineup creation state
  creationMode: null,
  draftPoints: { standPos: null, bouncePos: null, landPos: null, imageDataUrl: null },

  // Anti-Flash Eye-Care Dimmer state
  dimmerActive: false,
  dimmerTimer: null,

  // Sync Metronome state
  syncRunning: false,
  syncIntervals: [],

  // Spike & Defuse Timeline state
  spikeMode: null, // null | 'PLANTING_4S' | 'PLANTED_45S'
  spikeInterval: null,
  spikeTimeouts: [],
  defuseInterval: null,
  defuseTimeouts: [],

  // Official Callouts, Buy-Phase & Riot Profile state
  showCallouts: true,
  standCalloutName: 'A Main',
  landCalloutName: 'A Site',
  buyPhaseInterval: null,
  buyPhaseTimeouts: [],
  riotProfile: {
    riotId: 'SovaMain#TH1',
    shard: 'ap',
    apiKey: '',
    mapStats: {}
  }
};

// DOM Elements
const els = {
  dimmerLayer: document.getElementById('dimmer-layer'),
  dimmerStatusText: document.getElementById('dimmer-status-text'),
  dimmerStrength: document.getElementById('dimmer-strength'),
  dimmerStrengthVal: document.getElementById('dimmer-strength-val'),
  dimmerTone: document.getElementById('dimmer-tone'),
  dimmerDuration: document.getElementById('dimmer-duration'),

  skyRulerOverlay: document.getElementById('sky-ruler-overlay'),
  skyRulerSvg: document.getElementById('sky-ruler-svg'),

  syncCountdownBanner: document.getElementById('sync-countdown-banner'),
  syncPhaseLabel: document.getElementById('sync-phase-label'),
  syncProgressFill: document.getElementById('sync-progress-fill'),
  syncSubMetrics: document.getElementById('sync-sub-metrics'),

  buyPhaseBanner: document.getElementById('buy-phase-banner'),
  buyPhaseClock: document.getElementById('buy-phase-clock'),
  buyProgressFill: document.getElementById('buy-progress-fill'),
  buyPhaseStatus: document.getElementById('buy-phase-status'),

  riotProfileModal: document.getElementById('riot-profile-modal'),
  btnCloseRiotModal: document.getElementById('btn-close-riot-modal'),
  riotIdInput: document.getElementById('riot-id-input'),
  riotShardSelect: document.getElementById('riot-shard-select'),
  riotApikeyInput: document.getElementById('riot-apikey-input'),
  btnSyncRiot: document.getElementById('btn-sync-riot'),
  riotSyncResult: document.getElementById('riot-sync-result'),
  masteryGrid: document.getElementById('mastery-grid'),

  spikeHudBanner: document.getElementById('spike-hud-banner'),
  spikeModeBadge: document.getElementById('spike-mode-badge'),
  spikeClock: document.getElementById('spike-clock'),
  spikeActionCue: document.getElementById('spike-action-cue'),
  spikeTimelineFill: document.getElementById('spike-timeline-fill'),
  marker20s: document.getElementById('marker-20s'),
  marker10s: document.getElementById('marker-10s'),
  marker7s: document.getElementById('marker-7s'),
  markerLaunch: document.getElementById('marker-launch'),
  markerLaunchLabel: document.getElementById('marker-launch-label'),
  defuseSubBar: document.getElementById('defuse-sub-bar'),
  defuseClock: document.getElementById('defuse-clock'),
  defuseFill: document.getElementById('defuse-fill'),
  defuseShootLine: document.getElementById('defuse-shoot-line'),
  defuseShootLabel: document.getElementById('defuse-shoot-label'),

  btnTogglePlanner: document.getElementById('btn-toggle-planner'),
  btnBuyPhase: document.getElementById('btn-buy-phase'),
  btnToggleRuler: document.getElementById('btn-toggle-ruler'),
  btnSyncTimer: document.getElementById('btn-sync-timer'),
  btnSpikePlanting: document.getElementById('btn-spike-planting'),
  btnSpikePlanted: document.getElementById('btn-spike-planted'),
  btnSpikeDefuse: document.getElementById('btn-spike-defuse'),
  btnGhostMode: document.getElementById('btn-ghost-mode'),
  ghostLabel: document.getElementById('ghost-label'),
  btnTriggerDimmer: document.getElementById('btn-trigger-dimmer'),
  btnOpenRiotModal: document.getElementById('btn-open-riot-modal'),
  hudOpacitySlider: document.getElementById('hud-opacity-slider'),
  btnQuit: document.getElementById('btn-quit'),
  calloutRouteBadge: document.getElementById('callout-route-badge'),
  btnToggleCallouts: document.getElementById('btn-toggle-callouts'),

  hudCard: document.getElementById('hud-card'),
  hudMapBadge: document.getElementById('hud-map-badge'),
  hudSideBadge: document.getElementById('hud-side-badge'),
  hudAbilityBadge: document.getElementById('hud-ability-badge'),
  hudQuickSlots: document.getElementById('hud-quick-slots'),
  hudTitle: document.getElementById('hud-title'),
  hudCustomImg: document.getElementById('hud-custom-img'),
  hudDiagramSvg: document.getElementById('hud-diagram-svg'),
  hudAimAlignTag: document.getElementById('hud-aim-align-tag'),
  hudTeleDist: document.getElementById('hud-tele-dist'),
  hudTeleYaw: document.getElementById('hud-tele-yaw'),
  hudTelePitch: document.getElementById('hud-tele-pitch'),
  hudTeleTof: document.getElementById('hud-tele-tof'),
  hudTimingPlant: document.getElementById('hud-timing-plant'),
  hudTimingDefuse: document.getElementById('hud-timing-defuse'),
  hudChargeBars: document.getElementById('hud-charge-bars'),
  hudChargeText: document.getElementById('hud-charge-text'),
  hudBounceDiamonds: document.getElementById('hud-bounce-diamonds'),
  hudBounceText: document.getElementById('hud-bounce-text'),
  hudAimRef: document.getElementById('hud-aim-ref'),
  hudNotes: document.getElementById('hud-notes'),

  plannerModal: document.getElementById('planner-modal'),
  apiStatus: document.getElementById('api-status'),
  mapSelect: document.getElementById('map-select'),
  abilityTabs: document.getElementById('ability-tabs'),
  sideTabs: document.getElementById('side-tabs'),
  iconRecon: document.getElementById('icon-recon'),
  iconShock: document.getElementById('icon-shock'),
  lineupCount: document.getElementById('lineup-count'),
  lineupList: document.getElementById('lineup-list'),

  btnNewLineup: document.getElementById('btn-new-lineup'),
  creationBanner: document.getElementById('creation-banner'),
  creationStepText: document.getElementById('creation-step-text'),
  btnCancelCreate: document.getElementById('btn-cancel-create'),

  mapStage: document.getElementById('map-stage'),
  mapImage: document.getElementById('map-image'),
  mapFallbackSvg: document.getElementById('map-fallback-svg'),
  mapOverlaySvg: document.getElementById('map-overlay-svg'),

  simYaw: document.getElementById('sim-yaw'),
  simYawVal: document.getElementById('sim-yaw-val'),
  simPitch: document.getElementById('sim-pitch'),
  simPitchVal: document.getElementById('sim-pitch-val'),
  simCharge: document.getElementById('sim-charge'),
  simChargeVal: document.getElementById('sim-charge-val'),
  btnPanelSync: document.getElementById('btn-panel-sync'),
  parabolaSvg: document.getElementById('parabola-svg'),
  recipeShot1: document.getElementById('recipe-shot1'),
  recipeShot2: document.getElementById('recipe-shot2'),
  recipeDelayVal: document.getElementById('recipe-delay-val'),

  createFormPanel: document.getElementById('create-form-panel'),
  formMapName: document.getElementById('form-map-name'),
  inputTitle: document.getElementById('input-title'),
  inputAbility: document.getElementById('input-ability'),
  inputSide: document.getElementById('input-side'),
  inputCharges: document.getElementById('input-charges'),
  inputBounces: document.getElementById('input-bounces'),
  inputAimref: document.getElementById('input-aimref'),
  inputNotes: document.getElementById('input-notes'),
  inputImageFile: document.getElementById('input-image-file'),
  pasteImgStatus: document.getElementById('paste-img-status'),
  btnSaveLineup: document.getElementById('btn-save-lineup')
};

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
  setupInteractivePassthrough();
  setupUIEvents();
  setupIPCListeners();

  if (window.overlayAPI) {
    const loaded = await window.overlayAPI.loadLineups();
    state.defaultLineups = loaded.defaults || [];
    state.userLineups = loaded.userLineups || [];

    const profile = await window.overlayAPI.loadRiotProfile();
    if (profile) {
      state.riotProfile = profile;
      els.riotIdInput.value = profile.riotId || 'SovaMain#TH1';
      els.riotShardSelect.value = profile.shard || 'ap';
      els.riotApikeyInput.value = profile.apiKey || '';
    }
  } else {
    // Web / Cloudflare Pages Mode Fallback
    document.body.style.background = 'radial-gradient(circle at center, #0f1923, #060b10)';
    try {
      const res = await fetch('./default-lineups.json');
      if (res.ok) state.defaultLineups = await res.json();
    } catch (e) {
      console.warn('Could not load default-lineups.json:', e);
    }
    try {
      const savedUser = localStorage.getItem('sova_user_lineups');
      if (savedUser) state.userLineups = JSON.parse(savedUser);
      const savedProf = localStorage.getItem('sova_riot_profile');
      if (savedProf) {
        state.riotProfile = JSON.parse(savedProf);
        els.riotIdInput.value = state.riotProfile.riotId || 'SovaMain#TH1';
        els.riotShardSelect.value = state.riotProfile.shard || 'ap';
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  populateMapDropdown();
  await fetchValorantAssets();
  refreshFilteredView();
  renderMasteryGrid();
}

// ============================================================================
// MOUSE PASSTHROUGH MANAGEMENT
// ============================================================================
function setupInteractivePassthrough() {
  window.addEventListener('mousemove', (e) => {
    if (state.ghostMode) return;
    const target = e.target;
    const overInteractive = Boolean(
      target && target.closest && target.closest('.interactive-zone')
    );
    if (window.overlayAPI) {
      window.overlayAPI.setHoverInteractive(overInteractive);
    }
  });
}

// ============================================================================
// FETCH VALORANT-API.COM ASSETS
// ============================================================================
async function fetchValorantAssets() {
  try {
    const [mapsRes, agentsRes] = await Promise.all([
      fetch('https://valorant-api.com/v1/maps'),
      fetch('https://valorant-api.com/v1/agents?isPlayableCharacter=true')
    ]);

    if (mapsRes.ok) {
      const mapsJson = await mapsRes.json();
      (mapsJson.data || []).forEach((m) => {
        if (m.displayName && m.displayIcon) {
          // Convert official Unreal Engine callout coordinates into 0..100% 2D map coordinates
          // Valorant API formula:
          // mapX = (location.y * xMultiplier + xScalarToAdd) * 100
          // mapY = (location.x * yMultiplier + yScalarToAdd) * 100
          const callouts = [];
          if (Array.isArray(m.callouts) && m.xMultiplier && m.yMultiplier) {
            m.callouts.forEach((c) => {
              if (!c.location || !c.regionName) return;
              const cx = (c.location.y * m.xMultiplier + m.xScalarToAdd) * 100;
              const cy = (c.location.x * m.yMultiplier + m.yScalarToAdd) * 100;
              if (cx >= 2 && cx <= 98 && cy >= 2 && cy <= 98) {
                callouts.push({
                  regionName: c.regionName,
                  superRegionName: c.superRegionName || '',
                  fullName: c.superRegionName ? `${c.superRegionName} ${c.regionName}` : c.regionName,
                  x: Number(cx.toFixed(1)),
                  y: Number(cy.toFixed(1))
                });
              }
            });
          }

          state.mapsData[m.displayName] = {
            displayIcon: m.displayIcon,
            splash: m.splash,
            callouts
          };
        }
      });
    }

    if (agentsRes.ok) {
      const agentsJson = await agentsRes.json();
      const sova = (agentsJson.data || []).find(
        (a) => a.displayName && a.displayName.toLowerCase() === 'sova'
      );
      if (sova && Array.isArray(sova.abilities)) {
        const reconAb = sova.abilities.find((ab) => ab.slot === 'Ability2');
        const shockAb = sova.abilities.find((ab) => ab.slot === 'Ability1');
        if (reconAb && reconAb.displayIcon) {
          state.sovaIcons.recon = reconAb.displayIcon;
          els.iconRecon.src = reconAb.displayIcon;
          els.iconRecon.classList.remove('hidden');
        }
        if (shockAb && shockAb.displayIcon) {
          state.sovaIcons.shock = shockAb.displayIcon;
          els.iconShock.src = shockAb.displayIcon;
          els.iconShock.classList.remove('hidden');
        }
      }
    }

    els.apiStatus.textContent = 'Valorant-API เชื่อมต่อแล้ว ✓';
    populateMapDropdown();
    render2DMapStage();
  } catch (err) {
    console.warn('Valorant-API offline, using tactical vector grid fallback:', err);
    els.apiStatus.textContent = 'โหมด Offline (Vector Grid)';
    render2DMapStage();
  }
}

function populateMapDropdown() {
  const allMaps = new Set(STANDARD_MAPS);
  Object.keys(state.mapsData).forEach((m) => {
    if (!m.includes('Range') && !m.includes('Basic')) {
      allMaps.add(m);
    }
  });

  els.mapSelect.innerHTML = '';
  Array.from(allMaps).forEach((mapName) => {
    const opt = document.createElement('option');
    opt.value = mapName;
    opt.textContent = `แผนที่: ${mapName}`;
    if (mapName === state.selectedMap) opt.selected = true;
    els.mapSelect.appendChild(opt);
  });
}

// ============================================================================
// BALLISTICS & DOUBLE SHOCK PHYSICS ENGINE
// ============================================================================
function computeYawAndDist(standPos, landPos) {
  const dx = landPos.x - standPos.x;
  const dy = landPos.y - standPos.y;
  const distUnits = Math.hypot(dx, dy);
  const distMeters = Math.max(2, distUnits * MAP_SCALE_METERS);

  // Compass Yaw: 0° = North (up, -y), 90° = East (+x), 180° = South (+y), 270° = West (-x)
  let yawDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (yawDeg < 0) yawDeg += 360;

  return { distUnits, distMeters, yawDeg };
}

function compassDirectionLabel(yaw) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((yaw %= 360) < 0 ? yaw + 360 : yaw) / 45) % 8;
  return dirs[idx];
}

// Find nearest Official Valorant Map Callout to any (x, y) point on the 2D map
function findNearestCalloutName(pt, fallbackLabel = 'Target') {
  const mapInfo = state.mapsData[state.selectedMap];
  const callouts = mapInfo?.callouts || [];
  if (!callouts.length || !pt) return fallbackLabel;

  let best = callouts[0];
  let bestDist = Infinity;
  callouts.forEach((c) => {
    const d = Math.hypot(c.x - pt.x, c.y - pt.y);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  });
  return best.fullName;
}

function updateCalloutRouteLabels() {
  state.standCalloutName = findNearestCalloutName(state.simStandPos, 'Stand');
  state.landCalloutName = findNearestCalloutName(state.simLandPos, 'Target');
  if (els.calloutRouteBadge) {
    els.calloutRouteBadge.textContent = `📍 ${state.standCalloutName} ➔ ${state.landCalloutName}`;
  }
}

// Solve Pitch Angle (deg) for a given distance R (meters) and charge bar (0..3)
// Prefer High Arc or Low Arc
function solvePitchForDistance(distMeters, charge, preferHighArc = false) {
  const v0 = CHARGE_VELOCITIES[charge] || CHARGE_VELOCITIES[1];
  const ratio = Math.min(0.995, (distMeters * GRAVITY) / (v0 * v0));
  const twoThetaRad = Math.asin(ratio);
  const lowDeg = ((twoThetaRad / 2) * 180) / Math.PI;
  const highDeg = 90 - lowDeg;
  const pitchDeg = preferHighArc ? highDeg : lowDeg;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const tof = (2 * v0 * Math.sin(pitchRad)) / GRAVITY;
  const maxHeight = Math.pow(v0 * Math.sin(pitchRad), 2) / (2 * GRAVITY);

  return {
    reachable: (distMeters * GRAVITY) / (v0 * v0) <= 1.0,
    pitchDeg: Number(pitchDeg.toFixed(1)),
    tof: Number(tof.toFixed(2)),
    maxHeight: Number(maxHeight.toFixed(1)),
    v0
  };
}

// Target-First (Inverse Kinematics): Given Stand & Land positions, compute optimal angles + Double Shock Sync
function recalculateFromStandAndLand(standPos, landPos, preferredCharge = null) {
  state.simStandPos = { ...standPos };
  state.simLandPos = { ...landPos };

  const { distMeters, yawDeg } = computeYawAndDist(standPos, landPos);
  state.simDistMeters = Number(distMeters.toFixed(1));
  state.simYawDeg = Math.round(yawDeg) % 360;

  // Choose charge bar that comfortably reaches distMeters
  let chosenCharge = preferredCharge !== null ? preferredCharge : 1;
  if (preferredCharge === null) {
    for (let c = 1; c <= 3; c++) {
      const v = CHARGE_VELOCITIES[c];
      if ((distMeters * GRAVITY) / (v * v) <= 0.94) {
        chosenCharge = c;
        break;
      }
    }
  }
  state.simCharge = chosenCharge;

  const primarySol = solvePitchForDistance(distMeters, chosenCharge, false);
  state.simPitchDeg = primarySol.pitchDeg;
  state.simFlightTime = primarySol.tof;

  // Compute Double Shock Sync Recipe:
  // Shot 1: High-Arc Lob (usually 2 bars or 3 bars, high pitch 58°..76°)
  // Shot 2: Low-Arc Direct (usually 1 bar or 2 bars, low pitch 14°..36°)
  let shot1Charge = distMeters > 46 ? 3 : 2;
  let shot2Charge = distMeters > 48 ? 2 : 1;
  if ((distMeters * GRAVITY) / Math.pow(CHARGE_VELOCITIES[shot2Charge], 2) > 0.98) {
    shot2Charge = Math.min(3, shot2Charge + 1);
  }

  const s1 = solvePitchForDistance(distMeters, shot1Charge, true);
  const s2 = solvePitchForDistance(distMeters, shot2Charge, false);
  const delaySec = Math.max(0.35, Number((s1.tof - s2.tof).toFixed(2)));

  state.doubleShockPlan = {
    shot1: { charge: shot1Charge, pitch: s1.pitchDeg, tof: s1.tof, maxHeight: s1.maxHeight },
    shot2: { charge: shot2Charge, pitch: s2.pitchDeg, tof: s2.tof, maxHeight: s2.maxHeight },
    delaySec
  };

  syncSimulatorControlsUI();
}

// Angle-First (Forward Kinematics): User drags Yaw, Pitch, or Charge slider -> move Landing Point on 2D Map
function recalculateFromAngleSliders() {
  const yawDeg = Number(els.simYaw.value);
  const pitchDeg = Number(els.simPitch.value);
  const charge = Number(els.simCharge.value);

  state.simYawDeg = yawDeg;
  state.simPitchDeg = pitchDeg;
  state.simCharge = charge;

  const v0 = CHARGE_VELOCITIES[charge];
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const rangeMeters = ((v0 * v0) * Math.sin(2 * pitchRad)) / GRAVITY;
  const tof = (2 * v0 * Math.sin(pitchRad)) / GRAVITY;

  state.simDistMeters = Number(rangeMeters.toFixed(1));
  state.simFlightTime = Number(tof.toFixed(2));

  const distUnits = rangeMeters / MAP_SCALE_METERS;
  const yawRad = (yawDeg * Math.PI) / 180;

  const newLandX = Math.max(3, Math.min(97, state.simStandPos.x + Math.sin(yawRad) * distUnits));
  const newLandY = Math.max(3, Math.min(97, state.simStandPos.y - Math.cos(yawRad) * distUnits));
  state.simLandPos = { x: Number(newLandX.toFixed(1)), y: Number(newLandY.toFixed(1)) };

  // Also refresh Double Shock sync for this new distance
  const s1Charge = rangeMeters > 46 ? 3 : 2;
  const s2Charge = rangeMeters > 48 ? 2 : 1;
  const s1 = solvePitchForDistance(rangeMeters, s1Charge, true);
  const s2 = solvePitchForDistance(rangeMeters, s2Charge, false);
  state.doubleShockPlan = {
    shot1: { charge: s1Charge, pitch: s1.pitchDeg, tof: s1.tof, maxHeight: s1.maxHeight },
    shot2: { charge: s2Charge, pitch: s2.pitchDeg, tof: s2.tof, maxHeight: s2.maxHeight },
    delaySec: Math.max(0.35, Number((s1.tof - s2.tof).toFixed(2)))
  };

  // Update active lineup coordinates preview if selected
  const active = getAllLineups().find((item) => item.id === state.selectedLineupId);
  if (active) {
    active.standPos = { ...state.simStandPos };
    active.landPos = { ...state.simLandPos };
    active.charges = state.simCharge;
  }

  syncSimulatorControlsUI();
  renderMapTrajectoriesSVG();
  renderCompactHUD(getFilteredLineups());
}

function syncSimulatorControlsUI() {
  els.simYaw.value = String(state.simYawDeg);
  els.simYawVal.textContent = `${state.simYawDeg}° ${compassDirectionLabel(state.simYawDeg)}`;

  els.simPitch.value = String(Math.round(state.simPitchDeg));
  els.simPitchVal.textContent = `+${state.simPitchDeg}°`;

  els.simCharge.value = String(state.simCharge);
  els.simChargeVal.textContent = `${state.simCharge} ขีด`;

  // Update HUD Telemetry
  els.hudTeleDist.textContent = `${state.simDistMeters} m`;
  els.hudTeleYaw.textContent = `${state.simYawDeg}° ${compassDirectionLabel(state.simYawDeg)}`;
  els.hudTelePitch.textContent = `+${state.simPitchDeg}°`;
  els.hudTeleTof.textContent = `${state.simFlightTime} s`;

  // Update Spike Launch Window Summary inside HUD Card
  const tof = state.simFlightTime;
  const plantWindow = Number((4.0 - tof).toFixed(2));
  if (plantWindow > 0) {
    els.hudTimingPlant.textContent = `ยิงภายใน ${plantWindow}s หลังได้ยินเสียงวาง`;
  } else {
    els.hudTimingPlant.textContent = `ต้องยิงล่วงหน้า ${Math.abs(plantWindow).toFixed(2)}s (TOF ${tof}s)`;
  }

  const defuseFullWindow = Number((7.0 - tof).toFixed(2));
  const defuseHalfWindow = Number((3.5 - tof).toFixed(2));
  els.hudTimingDefuse.textContent =
    defuseHalfWindow > 0
      ? `เต็มหลอด: <${defuseFullWindow}s | ครึ่งหลอด: <${defuseHalfWindow}s`
      : `เต็มหลอด: <${defuseFullWindow}s (ยิงทันทีที่ได้ยิน!)`;

  // Update Double Shock Recipe UI
  const { shot1, shot2, delaySec } = state.doubleShockPlan;
  els.recipeShot1.textContent = `ชาร์จ ${shot1.charge} ขีด • เงย +${shot1.pitch}° • ลอย ${shot1.tof}s`;
  els.recipeShot2.textContent = `ชาร์จ ${shot2.charge} ขีด • เงย +${shot2.pitch}° • ลอย ${shot2.tof}s`;
  els.recipeDelayVal.textContent = `${delaySec.toFixed(2)} วินาที`;

  drawSideParabolaSVG();
  drawSkyRulerSVG();
  updateCalloutRouteLabels();
}

// ============================================================================
// SIDE-ELEVATION PARABOLA SVG GRAPH (Double Shock High Arc vs Low Arc)
// ============================================================================
function drawSideParabolaSVG() {
  const { shot1, shot2, delaySec } = state.doubleShockPlan;
  const dist = state.simDistMeters;

  const startX = 28;
  const endX = 332;
  const groundY = 112;

  const h1Px = Math.min(92, Math.max(36, shot1.maxHeight * 1.9));
  const h2Px = Math.min(54, Math.max(16, shot2.maxHeight * 1.9));

  const ctrl1Y = groundY - h1Px * 1.75;
  const ctrl2Y = groundY - h2Px * 1.75;
  const midX = (startX + endX) / 2;

  els.parabolaSvg.innerHTML = `
    <rect width="360" height="135" fill="#071018"/>
    <!-- Grid lines -->
    <g stroke="rgba(255,255,255,0.07)" stroke-width="1">
      <line x1="0" y1="35" x2="360" y2="35"/>
      <line x1="0" y1="72" x2="360" y2="72"/>
      <line x1="${startX}" y1="${groundY}" x2="${endX}" y2="${groundY}" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
    </g>

    <!-- Shot 1 High Arc Parabola (Amber) -->
    <path d="M ${startX} ${groundY} Q ${midX} ${ctrl1Y} ${endX} ${groundY}"
          fill="none" stroke="#ffbe0b" stroke-width="2" stroke-dasharray="4 2"/>
    <text x="${midX}" y="${Math.max(15, groundY - h1Px - 4)}" fill="#ffbe0b" font-size="9.5" font-weight="bold" text-anchor="middle">
      ดอก 1: +${shot1.pitch}° (${shot1.charge} ขีด | ${shot1.tof}s)
    </text>

    <!-- Shot 2 Low Arc Parabola (Cyan) -->
    <path d="M ${startX} ${groundY} Q ${midX} ${ctrl2Y} ${endX} ${groundY}"
          fill="none" stroke="#00e5ff" stroke-width="2"/>
    <text x="${midX}" y="${Math.min(groundY - 6, groundY - h2Px + 11)}" fill="#00e5ff" font-size="9.5" font-weight="bold" text-anchor="middle">
      ดอก 2: +${shot2.pitch}° (${shot2.charge} ขีด | ${shot2.tof}s)
    </text>

    <!-- Stand & Target Nodes -->
    <circle cx="${startX}" cy="${groundY}" r="4" fill="#00f59b"/>
    <text x="${startX + 4}" y="${groundY + 14}" fill="#00f59b" font-size="9" font-weight="bold">STAND (0m)</text>

    <circle cx="${endX}" cy="${groundY}" r="4.5" fill="#ff4655"/>
    <text x="${endX}" y="${groundY + 14}" fill="#ff858f" font-size="9" font-weight="bold" text-anchor="end">
      💥 ตกพร้อมกัน (${dist}m | รอ ${delaySec}s)
    </text>
  `;
}

// ============================================================================
// ON-SCREEN PITCH SKY-RULER OVERLAY (Alt+R)
// ============================================================================
function drawSkyRulerSVG() {
  // Maps pitch angles 0° (horizon at y=580) up to +80° (y=40)
  const yForPitch = (deg) => 580 - (deg / 80) * 540;

  let ticks = [];
  for (let deg = 0; deg <= 80; deg += 5) {
    const y = yForPitch(deg);
    const isMajor = deg % 10 === 0;
    const w = isMajor ? 18 : 9;
    ticks.push(`
      <line x1="${130 - w}" y1="${y}" x2="${130 + w}" y2="${y}"
            stroke="rgba(255,255,255,${isMajor ? 0.55 : 0.28})" stroke-width="${isMajor ? 1.5 : 1}"/>
      ${
        isMajor
          ? `<text x="${130 - w - 6}" y="${y + 3.5}" fill="rgba(255,255,255,0.75)" font-size="10" text-anchor="end">+${deg}°</text>`
          : ''
      }
    `);
  }

  const activePitchY = yForPitch(Math.min(80, Math.max(0, state.simPitchDeg)));
  const shot1Y = yForPitch(Math.min(80, Math.max(0, state.doubleShockPlan.shot1.pitch)));
  const shot2Y = yForPitch(Math.min(80, Math.max(0, state.doubleShockPlan.shot2.pitch)));

  els.skyRulerSvg.innerHTML = `
    <!-- Central vertical axis -->
    <line x1="130" y1="30" x2="130" y2="590" stroke="rgba(0, 229, 255, 0.35)" stroke-width="1.2" stroke-dasharray="3 3"/>
    ${ticks.join('\n')}

    <!-- Primary Lineup Pitch Marker -->
    <g transform="translate(0, ${activePitchY})">
      <polygon points="130,0 144,-5 144,5" fill="#00f59b"/>
      <rect x="147" y="-9" width="102" height="18" rx="4" fill="rgba(6, 18, 26, 0.88)" stroke="#00f59b" stroke-width="1"/>
      <text x="198" y="3.5" fill="#00f59b" font-size="10" font-weight="bold" text-anchor="middle">
        🎯 เงย +${state.simPitchDeg}° (${state.simCharge} ขีด)
      </text>
    </g>

    <!-- Double Shock Shot 1 High Arc Marker -->
    <g transform="translate(0, ${shot1Y})">
      <line x1="112" y1="0" x2="148" y2="0" stroke="#ffbe0b" stroke-width="2"/>
      <rect x="6" y="-9" width="96" height="18" rx="4" fill="rgba(24, 16, 6, 0.88)" stroke="#ffbe0b" stroke-width="1"/>
      <text x="54" y="3.5" fill="#ffbe0b" font-size="9.5" font-weight="bold" text-anchor="middle">
        ⚡ ดอก1: +${state.doubleShockPlan.shot1.pitch}° (${state.doubleShockPlan.shot1.charge}ขีด)
      </text>
    </g>

    <!-- Double Shock Shot 2 Low Arc Marker -->
    <g transform="translate(0, ${shot2Y})">
      <line x1="112" y1="0" x2="148" y2="0" stroke="#00e5ff" stroke-width="2"/>
      <rect x="6" y="-9" width="96" height="18" rx="4" fill="rgba(6, 18, 28, 0.88)" stroke="#00e5ff" stroke-width="1"/>
      <text x="54" y="3.5" fill="#00e5ff" font-size="9.5" font-weight="bold" text-anchor="middle">
        ⚡ ดอก2: +${state.doubleShockPlan.shot2.pitch}° (${state.doubleShockPlan.shot2.charge}ขีด)
      </text>
    </g>
  `;
}

// ============================================================================
// DOUBLE SHOCK AUDIO & VISUAL SYNC METRONOME (Alt+T)
// ============================================================================
function playTacticalBeep(freq = 660, durationMs = 110, type = 'sine') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch (e) {
    // Ignore audio context errors
  }
}

function triggerDoubleShockSyncTimer() {
  // Clear any existing sequence
  state.syncIntervals.forEach((id) => clearTimeout(id));
  state.syncIntervals = [];

  if (state.syncRunning) {
    state.syncRunning = false;
    els.syncCountdownBanner.classList.add('hidden');
    return;
  }

  state.syncRunning = true;
  const { shot1, shot2, delaySec } = state.doubleShockPlan;

  els.syncSubMetrics.textContent = `ดอก 1: เงย +${shot1.pitch}° (${shot1.charge} ขีด) ➔ รอ ${delaySec}s ➔ ดอก 2: เงย +${shot2.pitch}° (${shot2.charge} ขีด)`;
  els.syncProgressFill.style.width = '0%';
  els.syncCountdownBanner.classList.remove('hidden');

  // Pre-count: 3.. 2.. 1.. FIRE SHOT 1
  els.syncPhaseLabel.textContent = 'เตรียมเล็งดอกที่ 1 (High Arc)... [อีก 1.0s]';
  playTacticalBeep(520, 90, 'sine');

  const tFire1 = setTimeout(() => {
    els.syncPhaseLabel.textContent = `🔥 ยิงดอกที่ 1 ทันที! (+${shot1.pitch}° | ${shot1.charge} ขีด) — กำลังนับถอยหลัง ${delaySec}s...`;
    playTacticalBeep(880, 160, 'triangle');

    const startWait = performance.now();
    const delayMs = delaySec * 1000;

    const animId = setInterval(() => {
      const elapsed = performance.now() - startWait;
      const pct = Math.min(100, (elapsed / delayMs) * 100);
      els.syncProgressFill.style.width = `${pct}%`;
    }, 30);
    state.syncIntervals.push(animId);

    const tFire2 = setTimeout(() => {
      clearInterval(animId);
      els.syncProgressFill.style.width = '100%';
      els.syncPhaseLabel.textContent = `⚡ ยิงดอกที่ 2 ทันที! (+${shot2.pitch}° | ${shot2.charge} ขีด) — เป้าหมายจะระเบิดพร้อมกันใน ${shot2.tof}s!`;
      playTacticalBeep(1180, 220, 'square');

      const tImpact = setTimeout(() => {
        els.syncPhaseLabel.textContent = '💥 DOUBLE SHOCK IMPACT! (ตกกระทบพร้อมกันสำเร็จ)';
        playTacticalBeep(440, 260, 'sawtooth');
        const tHide = setTimeout(() => {
          state.syncRunning = false;
          els.syncCountdownBanner.classList.add('hidden');
        }, 1600);
        state.syncIntervals.push(tHide);
      }, shot2.tof * 1000);
      state.syncIntervals.push(tImpact);
    }, delayMs);
    state.syncIntervals.push(tFire2);
  }, 1000);

  state.syncIntervals.push(tFire1);
}

// ============================================================================
// 5. SPIKE PLANT (4s) / POST-PLANT (45s) / DEFUSE (7s) TIMELINE ENGINE
// ============================================================================
function clearSpikeTimers() {
  if (state.spikeInterval) {
    clearInterval(state.spikeInterval);
    state.spikeInterval = null;
  }
  state.spikeTimeouts.forEach((t) => clearTimeout(t));
  state.spikeTimeouts = [];
  els.spikeHudBanner.classList.remove('shoot-now-alert');
}

function clearDefuseTimers() {
  if (state.defuseInterval) {
    clearInterval(state.defuseInterval);
    state.defuseInterval = null;
  }
  state.defuseTimeouts.forEach((t) => clearTimeout(t));
  state.defuseTimeouts = [];
}

// Triggered by Alt+P when hearing enemy/teammate start planting Spike (4.0 seconds)
function triggerSpikePlanting4s() {
  clearSpikeTimers();
  clearDefuseTimers();
  els.defuseSubBar.classList.add('hidden');

  state.spikeMode = 'PLANTING_4S';
  els.spikeHudBanner.classList.remove('hidden');
  els.spikeModeBadge.textContent = '🔊 กำลังกดวาง SPIKE (4.0s)';

  // Hide 45s markers during 4s plant phase
  els.marker20s.classList.add('hidden');
  els.marker10s.classList.add('hidden');
  els.marker7s.classList.add('hidden');

  const tof = state.simFlightTime;
  const launchDelay = Math.max(0, Number((4.0 - tof).toFixed(2)));
  const launchPct = Math.min(96, Math.max(4, (launchDelay / 4.0) * 100));
  els.markerLaunch.style.left = `${launchPct}%`;
  els.markerLaunchLabel.textContent = `🏹 ยิงดักวาง (${launchDelay}s)`;

  playTacticalBeep(600, 100, 'sine');

  const startMs = performance.now();
  const totalMs = 4000;

  if (launchDelay > 0 && launchDelay < 4.0) {
    const tShoot = setTimeout(() => {
      els.spikeHudBanner.classList.add('shoot-now-alert');
      els.spikeActionCue.textContent = `🔥 ยิงทันที! ลูกธนูจะตกตอนวางเสร็จพอดี (TOF ${tof}s)`;
      playTacticalBeep(1040, 190, 'square');
    }, launchDelay * 1000);
    state.spikeTimeouts.push(tShoot);
  } else {
    els.spikeActionCue.textContent = `⚡ ยิงทันที! (เวลาลอย ${tof}s)`;
  }

  state.spikeInterval = setInterval(() => {
    const elapsed = (performance.now() - startMs) / 1000;
    const remain = Math.max(0, 4.0 - elapsed);
    const pct = Math.min(100, (elapsed / 4.0) * 100);

    els.spikeClock.textContent = `${remain.toFixed(1)}s`;
    els.spikeTimelineFill.style.width = `${pct}%`;

    if (remain <= 0) {
      clearSpikeTimers();
      // Automatically transition into 45.0s Spike Planted countdown!
      triggerSpikePlanted45s();
    }
  }, 40);
}

// Triggered by Alt+S (or automatically after 4.0s plant finishes) -> 45.0s Post-Plant Countdown
function triggerSpikePlanted45s() {
  // If already in 45s mode and pressed again without defuse, toggle off
  if (state.spikeMode === 'PLANTED_45S' && state.spikeInterval) {
    clearSpikeTimers();
    clearDefuseTimers();
    state.spikeMode = null;
    els.spikeHudBanner.classList.add('hidden');
    return;
  }

  clearSpikeTimers();
  state.spikeMode = 'PLANTED_45S';
  els.spikeHudBanner.classList.remove('hidden');
  els.spikeModeBadge.textContent = '💣 SPIKE PLANTED (45.0s)';

  els.marker20s.classList.remove('hidden');
  els.marker10s.classList.remove('hidden');
  els.marker7s.classList.remove('hidden');

  // Calculate when to fire so arrow lands right at the 7.0s Point-of-No-Return (elapsed = 38.0s)
  const { shot1, shot2 } = state.doubleShockPlan;
  const tof1 = shot1.tof;
  const fireRemainingSec = Number((7.0 + tof1).toFixed(1)); // e.g., 7.0 + 3.9 = 10.9s remaining
  const fireElapsedSec = Math.max(1, 45.0 - fireRemainingSec);
  const launchPct = Math.min(92, Math.max(8, (fireElapsedSec / 45.0) * 100));

  els.markerLaunch.style.left = `${launchPct}%`;
  els.markerLaunchLabel.textContent = `🏹 ยิงดักเส้นตาย (${fireRemainingSec}s)`;
  els.spikeActionCue.textContent = `ยิงช็อตคู่ตอนเหลือ ${fireRemainingSec}s เพื่อระเบิดตรงเส้นตาย 7.0s พอดี!`;

  playTacticalBeep(520, 140, 'triangle');

  const startMs = performance.now();

  // Schedule audio cues for 20s, 10s, Launch Window (7s + TOF), and 7s Point of No Return
  const tLaunch = setTimeout(() => {
    els.spikeHudBanner.classList.add('shoot-now-alert');
    els.spikeActionCue.textContent = `🔥 ยิงดอก 1 ทันที! (เหลือ ${fireRemainingSec}s ➔ ตกตรงเส้นตาย 7.0s พอดี)`;
    playTacticalBeep(1120, 220, 'square');
  }, fireElapsedSec * 1000);
  state.spikeTimeouts.push(tLaunch);

  const t7s = setTimeout(() => {
    els.spikeActionCue.textContent = '⚠️ เหลือต่ำกว่า 7.0s! (ถ้าศัตรูยังไม่ได้แตะกู้ = กู้ไม่ทันแล้ว)';
    playTacticalBeep(880, 260, 'sawtooth');
  }, 38000);
  state.spikeTimeouts.push(t7s);

  state.spikeInterval = setInterval(() => {
    const elapsed = (performance.now() - startMs) / 1000;
    const remain = Math.max(0, 45.0 - elapsed);
    const pct = Math.min(100, (elapsed / 45.0) * 100);

    els.spikeClock.textContent = `${remain.toFixed(1)}s`;
    els.spikeTimelineFill.style.width = `${pct}%`;

    if (remain <= 0) {
      clearSpikeTimers();
      clearDefuseTimers();
      els.spikeActionCue.textContent = '💥 SPIKE DETONATED!';
      setTimeout(() => {
        state.spikeMode = null;
        els.spikeHudBanner.classList.add('hidden');
      }, 2200);
    }
  }, 50);
}

// Triggered by Alt+D when hearing the enemy tap the Spike to defuse (7.0s full / 3.5s half)
function triggerSpikeDefuse7s() {
  clearDefuseTimers();

  // Ensure main Spike banner is visible
  if (els.spikeHudBanner.classList.contains('hidden')) {
    els.spikeHudBanner.classList.remove('hidden');
    els.spikeModeBadge.textContent = '🔧 ANTI-DEFUSE TIMER (7.0s)';
    els.spikeClock.textContent = 'DEFUSING';
  }

  els.defuseSubBar.classList.remove('hidden');

  const tof = state.simFlightTime;
  // Latest time after tap to fire so arrow lands before 7.0s full defuse completes (with 0.25s safety margin)
  const latestShootSec = Math.max(0.1, Number((6.75 - tof).toFixed(2)));
  const shootPct = Math.min(92, Math.max(5, (latestShootSec / 7.0) * 100));

  els.defuseShootLine.style.left = `${shootPct}%`;
  els.defuseShootLabel.textContent = `🔥 ยิงก่อน ${latestShootSec}s (TOF ${tof}s)`;
  els.spikeActionCue.textContent = `🔧 ศัตรูแตะกู้! ต้องปล่อยธนูภายใน ${latestShootSec}s ก่อนกู้เสร็จ!`;

  playTacticalBeep(740, 120, 'sine');

  const tShootDefuse = setTimeout(() => {
    els.spikeHudBanner.classList.add('shoot-now-alert');
    els.spikeActionCue.textContent = `🔥 ยิงตัดกู้เดี๋ยวนี้! (ลูกธนูใช้เวลาลอย ${tof}s ก่อนครบ 7.0s)`;
    playTacticalBeep(1240, 240, 'square');
  }, latestShootSec * 1000);
  state.defuseTimeouts.push(tShootDefuse);

  const startMs = performance.now();
  state.defuseInterval = setInterval(() => {
    const elapsed = (performance.now() - startMs) / 1000;
    const remain = Math.max(0, 7.0 - elapsed);
    const pct = Math.min(100, (elapsed / 7.0) * 100);

    els.defuseClock.textContent = `${remain.toFixed(1)}s`;
    els.defuseFill.style.width = `${pct}%`;

    if (remain <= 0) {
      clearDefuseTimers();
      els.defuseClock.textContent = '0.0s';
      setTimeout(() => {
        els.defuseSubBar.classList.add('hidden');
        els.spikeHudBanner.classList.remove('shoot-now-alert');
      }, 1500);
    }
  }, 40);
}

// ============================================================================
// FILTERING & LINEUP DATA HELPERS
// ============================================================================
function getAllLineups() {
  return [...state.defaultLineups, ...state.userLineups];
}

function getFilteredLineups() {
  return getAllLineups().filter((item) => {
    if (item.mapName !== state.selectedMap) return false;
    if (state.filterAbility !== 'ALL' && item.ability !== state.filterAbility) return false;
    if (state.filterSide !== 'ALL' && item.side !== state.filterSide) return false;
    return true;
  });
}

function refreshFilteredView() {
  const list = getFilteredLineups();
  els.lineupCount.textContent = list.length;

  if (!list.some((item) => item.id === state.selectedLineupId)) {
    state.selectedLineupId = list.length > 0 ? list[0].id : null;
  }

  const active = list.find((item) => item.id === state.selectedLineupId);
  if (active) {
    recalculateFromStandAndLand(active.standPos, active.landPos, active.charges);
  }

  renderLineupSidebarList(list);
  render2DMapStage();
  renderCompactHUD(list);
}

// ============================================================================
// 1. RENDER COMPACT LINEUP REFERENCE HUD CARD
// ============================================================================
function renderCompactHUD(filteredList) {
  const active = getAllLineups().find((item) => item.id === state.selectedLineupId);

  els.hudQuickSlots.innerHTML = '';
  filteredList.slice(0, 5).forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.className = `slot-btn ${item.id === state.selectedLineupId ? 'active' : ''}`;
    btn.textContent = String(idx + 1);
    btn.title = `[Alt+${idx + 1}] ${item.title}`;
    btn.addEventListener('click', () => {
      state.selectedLineupId = item.id;
      refreshFilteredView();
    });
    els.hudQuickSlots.appendChild(btn);
  });

  if (!active) {
    els.hudTitle.textContent = 'โหมดจำลองวิถีโค้งอิสระ (คลิกบนแผนที่)';
    els.hudAimRef.textContent = `เล็งมุมหัน ${state.simYawDeg}° เงย +${state.simPitchDeg}° (${state.simCharge} ขีด)`;
    els.hudNotes.textContent = 'คลิกซ้ายตั้งจุดยืน คลิกขวาตั้งจุดตกบนแผนที่ 2D เพื่อคำนวณองศาได้ทันที';
    drawSovaCrosshairSVG(null);
    return;
  }

  const isShock = active.ability === 'Shock Bolt';
  els.hudCard.classList.toggle('shock-theme', isShock);

  els.hudMapBadge.textContent = active.mapName;
  els.hudSideBadge.textContent = active.side === 'Attack' ? 'ATTACK (บุก)' : 'DEFENSE (รับ)';
  els.hudSideBadge.className = `badge ${active.side === 'Attack' ? 'badge-attack' : 'badge-defense'}`;

  els.hudAbilityBadge.textContent = isShock ? '⚡ SHOCK DART' : '🏹 RECON BOLT';
  els.hudAbilityBadge.className = `badge ${isShock ? 'badge-shock' : 'badge-recon'}`;

  els.hudTitle.textContent = active.title;
  els.hudAimRef.textContent = `🎯 ${active.aimRef || 'เล็งตามจุดอ้างอิงในภาพ'}`;
  els.hudNotes.textContent = active.notes || '';

  const charges = Number(active.charges ?? state.simCharge);
  const segs = els.hudChargeBars.querySelectorAll('.bar-seg');
  segs.forEach((seg, idx) => {
    seg.classList.toggle('active', idx < charges);
  });
  const chargeLabels = ['แตะยิงทันที (0 Bar)', 'ชาร์จ 1 ขีด (1 Bar)', 'ชาร์จ 2 ขีด (2 Bars)', 'ชาร์จเต็ม 3 ขีด (3 Bars)'];
  els.hudChargeText.textContent = chargeLabels[charges] || `${charges} ขีด`;

  const bounces = Number(active.bounces ?? 0);
  const diamonds = els.hudBounceDiamonds.querySelectorAll('.diamond');
  diamonds.forEach((d, idx) => {
    const activeDiamond = idx < bounces;
    d.classList.toggle('active', activeDiamond);
    d.textContent = activeDiamond ? '◆' : '◇';
  });
  els.hudBounceText.textContent = bounces === 0 ? 'ไม่ชิ่ง (0 Bounce)' : `ชิ่ง ${bounces} ครั้ง`;

  if (active.imageDataUrl) {
    els.hudCustomImg.src = active.imageDataUrl;
    els.hudCustomImg.classList.remove('hidden');
    els.hudDiagramSvg.classList.add('hidden');
  } else {
    els.hudCustomImg.classList.add('hidden');
    els.hudDiagramSvg.classList.remove('hidden');
    drawSovaCrosshairSVG(active);
  }

  const alignHint = active.crosshairHint?.hudAlign || `Pitch +${state.simPitchDeg}° | Yaw ${state.simYawDeg}°`;
  els.hudAimAlignTag.textContent = `จุดทาบ: ${alignHint}`;
}

function drawSovaCrosshairSVG(lineup) {
  const charges = Number(lineup?.charges ?? state.simCharge);
  const bounces = Number(lineup?.bounces ?? 0);
  const isShock = lineup?.ability === 'Shock Bolt';
  const accent = isShock ? '#ffbe0b' : '#00e5ff';
  const targetLabel = lineup?.crosshairHint?.targetLabel || `เงย +${state.simPitchDeg}° / หัน ${state.simYawDeg}°`;
  const hudAlign = lineup?.crosshairHint?.hudAlign || 'Center Crosshair';

  let markerX = 180;
  let markerY = 76;
  if (hudAlign.includes('Left')) {
    markerX = 122;
    markerY = 136;
  } else if (hudAlign.includes('Right Diamond')) {
    markerX = 194;
    markerY = 118;
  } else if (hudAlign.includes('Right Bar')) {
    markerX = 238;
    markerY = 136;
  }

  els.hudDiagramSvg.innerHTML = `
    <defs>
      <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0b1929"/>
        <stop offset="100%" stop-color="#152a3f"/>
      </linearGradient>
    </defs>
    <rect width="360" height="190" fill="url(#skyGrad)" />

    <polygon points="20,190 20,115 95,95 122,136 180,76 238,136 295,88 345,120 345,190"
             fill="rgba(10, 17, 24, 0.78)" stroke="rgba(255,255,255,0.18)" stroke-width="1.2"/>

    <!-- Center In-Game Crosshair -->
    <g stroke="#00f59b" stroke-width="1.8">
      <line x1="172" y1="76" x2="177" y2="76" />
      <line x1="183" y1="76" x2="188" y2="76" />
      <line x1="180" y1="68" x2="180" y2="73" />
      <line x1="180" y1="79" x2="180" y2="84" />
    </g>

    <!-- Sova Bounce Diamonds -->
    <g transform="translate(180, 118)">
      <polygon points="-14,-5 -9,0 -14,5 -19,0"
               fill="${bounces >= 1 ? accent : 'none'}"
               stroke="${bounces >= 1 ? accent : 'rgba(255,255,255,0.45)'}" stroke-width="1.5"/>
      <polygon points="14,-5 19,0 14,5 9,0"
               fill="${bounces >= 2 ? accent : 'none'}"
               stroke="${bounces >= 2 ? accent : 'rgba(255,255,255,0.45)'}" stroke-width="1.5"/>
    </g>

    <!-- Sova Charge Bar (3 Bars) -->
    <g transform="translate(122, 132)">
      <rect x="0" y="0" width="36" height="8" rx="1.5"
            fill="${charges >= 1 ? accent : 'rgba(255,255,255,0.12)'}" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
      <rect x="40" y="0" width="36" height="8" rx="1.5"
            fill="${charges >= 2 ? accent : 'rgba(255,255,255,0.12)'}" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
      <rect x="80" y="0" width="36" height="8" rx="1.5"
            fill="${charges >= 3 ? '#ff4655' : 'rgba(255,255,255,0.12)'}" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
    </g>

    <!-- Alignment Target -->
    <circle cx="${markerX}" cy="${markerY}" r="7" fill="none" stroke="#ff4655" stroke-width="2" stroke-dasharray="3 2"/>
    <circle cx="${markerX}" cy="${markerY}" r="2.5" fill="#ff4655"/>
    <text x="${markerX}" y="${Math.max(18, markerY - 12)}" fill="#ffd166" font-size="10.5" font-weight="bold" text-anchor="middle">
      ▼ ${targetLabel}
    </text>
  `;
}

// ============================================================================
// 2. RENDER 2D INTERACTIVE MAP & TRAJECTORY OVERLAY
// ============================================================================
function renderLineupSidebarList(list) {
  els.lineupList.innerHTML = '';

  list.forEach((item, index) => {
    const card = document.createElement('div');
    const isSelected = item.id === state.selectedLineupId;
    const isCustom = item.id.startsWith('custom-');
    const isShock = item.ability === 'Shock Bolt';

    card.className = `lineup-item ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="lineup-item-top">
        <span class="lineup-item-title">${index < 5 ? `<kbd>Alt+${index + 1}</kbd> ` : ''}${item.title}</span>
        ${isCustom ? `<button class="btn-delete-lineup" data-del="${item.id}" title="ลบ Lineup นี้">🗑</button>` : ''}
      </div>
      <div class="lineup-item-meta">
        <span class="badge ${isShock ? 'badge-shock' : 'badge-recon'}">${isShock ? 'Shock Dart' : 'Recon'}</span>
        <span>${item.side}</span>
        <span>• ${item.charges} ขีด</span>
        <span>• ${item.bounces} ชิ่ง</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-lineup')) return;
      state.selectedLineupId = item.id;
      refreshFilteredView();
    });

    const delBtn = card.querySelector('.btn-delete-lineup');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        state.userLineups = state.userLineups.filter((u) => u.id !== item.id);
        if (window.overlayAPI) {
          await window.overlayAPI.saveUserLineups(state.userLineups);
        }
        refreshFilteredView();
      });
    }

    els.lineupList.appendChild(card);
  });
}

function render2DMapStage() {
  const mapInfo = state.mapsData[state.selectedMap];
  if (mapInfo && mapInfo.displayIcon) {
    els.mapImage.src = mapInfo.displayIcon;
    els.mapImage.classList.remove('hidden');
    els.mapFallbackSvg.classList.add('hidden');
  } else {
    els.mapImage.classList.add('hidden');
    els.mapFallbackSvg.classList.remove('hidden');
    renderFallbackGridSVG();
  }

  renderMapTrajectoriesSVG();
}

function renderFallbackGridSVG() {
  els.mapFallbackSvg.innerHTML = `
    <rect width="100" height="100" fill="#0d1824"/>
    <g stroke="rgba(0,229,255,0.1)" stroke-width="0.4">
      <line x1="20" y1="0" x2="20" y2="100"/><line x1="40" y1="0" x2="40" y2="100"/>
      <line x1="60" y1="0" x2="60" y2="100"/><line x1="80" y1="0" x2="80" y2="100"/>
      <line x1="0" y1="20" x2="100" y2="20"/><line x1="0" y1="40" x2="100" y2="40"/>
      <line x1="0" y1="60" x2="100" y2="60"/><line x1="0" y1="80" x2="100" y2="80"/>
    </g>
    <rect x="20" y="22" width="16" height="16" fill="rgba(255,70,85,0.18)" stroke="#ff4655" stroke-width="0.6"/>
    <text x="28" y="31" fill="#ff858f" font-size="4" text-anchor="middle">B SITE</text>
    <rect x="64" y="22" width="16" height="16" fill="rgba(0,229,255,0.18)" stroke="#00e5ff" stroke-width="0.6"/>
    <text x="72" y="31" fill="#00e5ff" font-size="4" text-anchor="middle">A SITE</text>
    <text x="50" y="52" fill="rgba(255,255,255,0.3)" font-size="4.5" text-anchor="middle">${state.selectedMap.toUpperCase()} TACTICAL MAP</text>
  `;
}

function renderMapTrajectoriesSVG() {
  const list = getFilteredLineups();
  const active = list.find((item) => item.id === state.selectedLineupId);

  let svgParts = [];

  // Render Official Valorant Map Callouts Layer (if enabled)
  if (state.showCallouts) {
    const callouts = state.mapsData[state.selectedMap]?.callouts || [];
    callouts.forEach((c) => {
      svgParts.push(`
        <g class="callout-label-group" pointer-events="none">
          <circle cx="${c.x}" cy="${c.y}" r="0.7" fill="rgba(255,255,255,0.45)"/>
          <text x="${c.x}" y="${c.y - 1.1}"
                fill="rgba(236, 232, 225, 0.78)"
                font-size="2.1"
                font-weight="600"
                text-anchor="middle"
                style="paint-order: stroke; stroke: rgba(8,15,23,0.92); stroke-width: 0.7px;">
            ${c.regionName}
          </text>
        </g>
      `);
    });
  }

  // Render other lineups landing markers
  list.forEach((item) => {
    if (item.id === state.selectedLineupId) return;
    const isShock = item.ability === 'Shock Bolt';
    const color = isShock ? '#ffbe0b' : '#00e5ff';
    svgParts.push(`
      <g class="map-node" data-lineup-id="${item.id}">
        <circle cx="${item.landPos.x}" cy="${item.landPos.y}" r="2.1"
                fill="${color}" fill-opacity="0.45" stroke="${color}" stroke-width="0.6"/>
      </g>
    `);
  });

  // Render live simulated / active trajectory
  if (!state.creationMode) {
    const stand = state.simStandPos;
    const land = state.simLandPos;
    const bounce = active?.bouncePos || null;
    const isShock = active ? active.ability === 'Shock Bolt' : false;
    const color = isShock ? '#ffbe0b' : '#00e5ff';
    const radius = isShock ? 4.8 : 9.2;

    const pts = [stand];
    if (bounce) pts.push(bounce);
    pts.push(land);

    const pathD = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Compass Protractor Ring around Stand Position
    svgParts.push(`
      <circle cx="${stand.x}" cy="${stand.y}" r="7.5"
              fill="none" stroke="rgba(0, 245, 155, 0.28)" stroke-width="0.35" stroke-dasharray="1 1"/>

      <!-- Scan / Shock Radius -->
      <circle cx="${land.x}" cy="${land.y}" r="${radius}"
              fill="${color}" fill-opacity="0.16"
              stroke="${color}" stroke-width="0.5" stroke-dasharray="1.5 1"/>

      <!-- Trajectory Line -->
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.15" class="trajectory-line"/>

      <!-- Stand Position (Green) -->
      <circle cx="${stand.x}" cy="${stand.y}" r="2.2"
              fill="#00f59b" stroke="#08121a" stroke-width="0.7"/>
      <text x="${stand.x}" y="${stand.y + 5.2}"
            fill="#00f59b" font-size="2.7" font-weight="bold" text-anchor="middle">
        STAND (${state.simYawDeg}°)
      </text>

      <!-- Bounce Position -->
      ${
        bounce
          ? `<polygon points="${bounce.x},${bounce.y - 2.3} ${bounce.x + 2.3},${bounce.y} ${bounce.x},${bounce.y + 2.3} ${bounce.x - 2.3},${bounce.y}"
                      fill="#e879f9" stroke="#08121a" stroke-width="0.5"/>`
          : ''
      }

      <!-- Landing Target -->
      <circle cx="${land.x}" cy="${land.y}" r="2.6"
              fill="${color}" stroke="#ffffff" stroke-width="0.8"/>
      <text x="${land.x}" y="${land.y - 3.6}"
            fill="#ffffff" font-size="2.7" font-weight="bold" text-anchor="middle">
        +${state.simPitchDeg}° (${state.simDistMeters}m | ${state.simFlightTime}s)
      </text>
    `);
  }

  // Render draft markers when creating a new lineup
  if (state.creationMode) {
    const { standPos, bouncePos, landPos } = state.draftPoints;
    if (standPos && landPos) {
      const pts = [standPos];
      if (bouncePos) pts.push(bouncePos);
      pts.push(landPos);
      const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      svgParts.push(`<path d="${pathD}" fill="none" stroke="#00e5ff" stroke-width="1.1" class="trajectory-line"/>`);
    }
    if (standPos) {
      svgParts.push(`<circle cx="${standPos.x}" cy="${standPos.y}" r="2.4" fill="#00f59b" stroke="#fff" stroke-width="0.7"/>`);
    }
    if (bouncePos) {
      svgParts.push(`<circle cx="${bouncePos.x}" cy="${bouncePos.y}" r="2.2" fill="#e879f9" stroke="#fff" stroke-width="0.7"/>`);
    }
    if (landPos) {
      svgParts.push(`<circle cx="${landPos.x}" cy="${landPos.y}" r="2.6" fill="#00e5ff" stroke="#fff" stroke-width="0.8"/>`);
    }
  }

  els.mapOverlaySvg.innerHTML = svgParts.join('\n');

  els.mapOverlaySvg.querySelectorAll('.map-node').forEach((node) => {
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = node.getAttribute('data-lineup-id');
      if (id) {
        state.selectedLineupId = id;
        refreshFilteredView();
      }
    });
  });
}

// ============================================================================
// 3. ANTI-FLASH EYE-CARE SCREEN DIMMER LOGIC
// ============================================================================
function triggerAntiFlashDimmer() {
  if (state.dimmerTimer) {
    clearTimeout(state.dimmerTimer);
    state.dimmerTimer = null;
  }

  const durationMs = Number(els.dimmerDuration.value);

  if (durationMs === 0 && state.dimmerActive) {
    deactivateDimmer();
    return;
  }

  state.dimmerActive = true;
  const strength = Number(els.dimmerStrength.value) / 100;
  const tone = els.dimmerTone.value;

  els.dimmerLayer.className = `dimmer-layer tone-${tone}`;
  els.dimmerLayer.style.opacity = String(strength);
  els.dimmerLayer.classList.remove('hidden');

  if (durationMs > 0) {
    els.dimmerStatusText.textContent = `ANTI-FLASH EYE SHIELD (${(durationMs / 1000).toFixed(1)}s AUTO-FADE)`;
    state.dimmerTimer = setTimeout(() => {
      deactivateDimmer();
    }, durationMs);
  } else {
    els.dimmerStatusText.textContent = 'ANTI-FLASH EYE SHIELD ACTIVE (กด Alt+F อีกครั้งเพื่อปิด)';
  }
}

function deactivateDimmer() {
  state.dimmerActive = false;
  els.dimmerLayer.style.opacity = '0';
  setTimeout(() => {
    if (!state.dimmerActive) {
      els.dimmerLayer.classList.add('hidden');
    }
  }, 320);
}

// ============================================================================
// 6. BUY-PHASE (30s) & RIOT FAIR-PLAY AUTO-HIDE MODE (Alt+B)
// ============================================================================
function clearBuyPhaseTimers() {
  if (state.buyPhaseInterval) {
    clearInterval(state.buyPhaseInterval);
    state.buyPhaseInterval = null;
  }
  state.buyPhaseTimeouts.forEach((t) => clearTimeout(t));
  state.buyPhaseTimeouts = [];
}

function triggerBuyPhase30s() {
  if (state.buyPhaseInterval) {
    clearBuyPhaseTimers();
    els.buyPhaseBanner.classList.add('hidden');
    return;
  }

  clearBuyPhaseTimers();

  // During Buy Phase: Open 2D Map Planner so user can pick their Sova lineup
  if (!state.plannerVisible) {
    state.plannerVisible = true;
    els.plannerModal.classList.remove('hidden');
    els.btnTogglePlanner.classList.add('active');
  }
  if (window.overlayAPI && state.ghostMode) {
    window.overlayAPI.setGhostMode(false);
  }

  els.buyPhaseBanner.classList.remove('hidden');
  els.buyPhaseStatus.textContent =
    'เลือกจุดเล็งบนแผนที่ 2D (เมื่อครบ 30s แผนที่จะพับเก็บ + เปิดโหมดทะลุเมาส์อัตโนมัติ)';
  playTacticalBeep(580, 120, 'sine');

  const startMs = performance.now();

  // 5 seconds before barriers drop: alert player to stand on their lineup spot
  const tWarn5s = setTimeout(() => {
    els.buyPhaseStatus.textContent = `⚠️ อีก 5 วินาทีกำแพงเปิด! เข้าประจำจุดยืน [${state.standCalloutName}] เตรียมเล็ง +${state.simPitchDeg}°`;
    playTacticalBeep(880, 160, 'triangle');
  }, 25000);
  state.buyPhaseTimeouts.push(tWarn5s);

  state.buyPhaseInterval = setInterval(() => {
    const elapsed = (performance.now() - startMs) / 1000;
    const remain = Math.max(0, 30.0 - elapsed);
    const pct = Math.max(0, ((30.0 - elapsed) / 30.0) * 100);

    els.buyPhaseClock.textContent = `${remain.toFixed(1)}s`;
    els.buyProgressFill.style.width = `${pct}%`;

    if (remain <= 0) {
      clearBuyPhaseTimers();
      els.buyPhaseStatus.textContent = '🛡️ ROUND STARTED! พับแผนที่เก็บ + เปิด Ghost Mode ทะลุเมาส์แล้ว';
      playTacticalBeep(1040, 200, 'square');

      // Riot Fair-Play Compliance: Auto-collapse large 2D map & enable click-through Ghost Mode
      state.plannerVisible = false;
      els.plannerModal.classList.add('hidden');
      els.btnTogglePlanner.classList.remove('active');
      if (window.overlayAPI) {
        window.overlayAPI.setGhostMode(true);
      }

      setTimeout(() => {
        els.buyPhaseBanner.classList.add('hidden');
      }, 1800);
    }
  }, 50);
}

// ============================================================================
// 7. RIOT DEVELOPER API & SOVA MAP MASTERY TRACKER
// ============================================================================
function renderMasteryGrid() {
  if (!els.masteryGrid) return;
  els.masteryGrid.innerHTML = '';

  const stats = state.riotProfile.mapStats || {};
  STANDARD_MAPS.forEach((mapName) => {
    const rec = stats[mapName] || { wins: 0, losses: 0 };
    const total = rec.wins + rec.losses;
    const winrate = total > 0 ? Math.round((rec.wins / total) * 100) : 0;
    const mapLineupsCount = getAllLineups().filter((l) => l.mapName === mapName).length;

    const card = document.createElement('div');
    card.className = 'mastery-card';
    card.innerHTML = `
      <div class="mastery-info">
        <span class="mastery-map">${mapName} (${mapLineupsCount} Lineups)</span>
        <span class="mastery-sub">Winrate: <b style="color:#00f59b">${winrate}%</b> (${rec.wins}W - ${rec.losses}L)</span>
      </div>
      <div class="mastery-btns">
        <button class="btn-win" data-map="${mapName}" data-res="win">+W</button>
        <button class="btn-loss" data-map="${mapName}" data-res="loss">+L</button>
      </div>
    `;

    card.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const m = btn.getAttribute('data-map');
        const res = btn.getAttribute('data-res');
        if (!state.riotProfile.mapStats) state.riotProfile.mapStats = {};
        if (!state.riotProfile.mapStats[m]) state.riotProfile.mapStats[m] = { wins: 0, losses: 0 };
        if (res === 'win') state.riotProfile.mapStats[m].wins += 1;
        else state.riotProfile.mapStats[m].losses += 1;

        if (window.overlayAPI) {
          await window.overlayAPI.saveRiotProfile(state.riotProfile);
        }
        renderMasteryGrid();
      });
    });

    els.masteryGrid.appendChild(card);
  });
}

// ============================================================================
// UI EVENTS & INTERACTIONS
// ============================================================================
function setupUIEvents() {
  els.btnTogglePlanner.addEventListener('click', () => togglePlannerModal());
  els.btnBuyPhase.addEventListener('click', () => triggerBuyPhase30s());
  els.btnToggleRuler.addEventListener('click', () => toggleSkyRuler());
  els.btnSyncTimer.addEventListener('click', () => triggerDoubleShockSyncTimer());
  els.btnPanelSync.addEventListener('click', () => triggerDoubleShockSyncTimer());
  els.btnSpikePlanting.addEventListener('click', () => triggerSpikePlanting4s());
  els.btnSpikePlanted.addEventListener('click', () => triggerSpikePlanted45s());
  els.btnSpikeDefuse.addEventListener('click', () => triggerSpikeDefuse7s());

  // Toggle Official Callouts on 2D Map
  els.btnToggleCallouts.addEventListener('click', () => {
    state.showCallouts = !state.showCallouts;
    els.btnToggleCallouts.classList.toggle('active', state.showCallouts);
    els.btnToggleCallouts.textContent = `📍 ป้ายชื่อจุด Callouts: ${state.showCallouts ? 'เปิด' : 'ปิด'}`;
    renderMapTrajectoriesSVG();
  });

  // Open / Close Riot Profile & API Modal
  els.btnOpenRiotModal.addEventListener('click', () => {
    els.riotProfileModal.classList.toggle('hidden');
    renderMasteryGrid();
  });

  els.btnCloseRiotModal.addEventListener('click', () => {
    els.riotProfileModal.classList.add('hidden');
  });

  els.btnSyncRiot.addEventListener('click', async () => {
    state.riotProfile.riotId = els.riotIdInput.value.trim() || 'SovaMain#TH1';
    state.riotProfile.shard = els.riotShardSelect.value;
    state.riotProfile.apiKey = els.riotApikeyInput.value.trim();

    if (window.overlayAPI) {
      await window.overlayAPI.saveRiotProfile(state.riotProfile);
      els.riotSyncResult.textContent = 'กำลังเชื่อมต่อ Riot Developer API...';
      const res = await window.overlayAPI.queryRiotApi({
        riotId: state.riotProfile.riotId,
        shard: state.riotProfile.shard,
        apiKey: state.riotProfile.apiKey
      });

      if (res.ok) {
        els.riotSyncResult.innerHTML = `✅ <b>${res.gameName}#${res.tagLine}</b> | ${res.serverStatus} | ${res.matchApiAccess}`;
      } else {
        els.riotSyncResult.textContent = `ℹ️ ${res.message}`;
      }
    }
  });

  els.btnGhostMode.addEventListener('click', () => {
    if (window.overlayAPI) {
      window.overlayAPI.setGhostMode(!state.ghostMode);
    }
  });

  els.btnTriggerDimmer.addEventListener('click', () => triggerAntiFlashDimmer());

  els.hudOpacitySlider.addEventListener('input', () => {
    const val = Number(els.hudOpacitySlider.value) / 100;
    els.hudCard.style.opacity = String(val);
  });

  els.btnQuit.addEventListener('click', () => {
    if (window.overlayAPI) window.overlayAPI.quitApp();
  });

  els.mapSelect.addEventListener('change', () => {
    state.selectedMap = els.mapSelect.value;
    els.formMapName.textContent = state.selectedMap;
    refreshFilteredView();
  });

  els.abilityTabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.abilityTabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filterAbility = btn.getAttribute('data-ability');
      refreshFilteredView();
    });
  });

  els.sideTabs.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      els.sideTabs.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.filterSide = btn.getAttribute('data-side');
      refreshFilteredView();
    });
  });

  els.dimmerStrength.addEventListener('input', () => {
    els.dimmerStrengthVal.textContent = `${els.dimmerStrength.value}%`;
  });

  // Forward Ballistics Sliders (Yaw / Pitch / Charge)
  els.simYaw.addEventListener('input', () => recalculateFromAngleSliders());
  els.simPitch.addEventListener('input', () => recalculateFromAngleSliders());
  els.simCharge.addEventListener('input', () => recalculateFromAngleSliders());

  // Start Creating New Lineup on 2D Map
  els.btnNewLineup.addEventListener('click', () => {
    state.creationMode = 'PICK_STAND';
    state.draftPoints = { standPos: null, bouncePos: null, landPos: null, imageDataUrl: null };
    els.creationBanner.classList.remove('hidden');
    els.createFormPanel.classList.remove('hidden');
    els.formMapName.textContent = state.selectedMap;
    els.creationStepText.innerHTML = 'ขั้นที่ 1: คลิกบนแผนที่ 2D เพื่อปัก <b>จุดยืนยิง (Stand)</b>';
    renderMapTrajectoriesSVG();
  });

  els.btnCancelCreate.addEventListener('click', () => cancelLineupCreation());

  // Left-Click on Map: either Creation Mode or Set Stand Position in Simulator
  els.mapStage.addEventListener('click', (e) => {
    const rect = els.mapStage.getBoundingClientRect();
    const x = Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(1));
    const y = Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(1));

    if (!state.creationMode) {
      // Hybrid Simulator: Left click moves Stand Position and recalculates angles to current Land Position
      recalculateFromStandAndLand({ x, y }, state.simLandPos, null);
      renderMapTrajectoriesSVG();
      renderCompactHUD(getFilteredLineups());
      return;
    }

    if (state.creationMode === 'PICK_STAND') {
      state.draftPoints.standPos = { x, y };
      state.creationMode = 'PICK_LAND';
      els.creationStepText.innerHTML =
        'ขั้นที่ 2: คลิกจุดตก <b>(Land)</b> บนแผนที่ <i>(หรือกด Shift+คลิก เพื่อปักจุดชิ่งกำแพงก่อน)</i>';
    } else if (state.creationMode === 'PICK_LAND') {
      if (e.shiftKey) {
        state.draftPoints.bouncePos = { x, y };
        els.inputBounces.value = '1';
        els.creationStepText.innerHTML = 'ปักจุดชิ่งแล้ว! คลิกอีกครั้งเพื่อปัก <b>จุดตกสุดท้าย (Land)</b>';
      } else {
        state.draftPoints.landPos = { x, y };
        state.creationMode = 'READY';
        recalculateFromStandAndLand(state.draftPoints.standPos, state.draftPoints.landPos, null);
        els.inputCharges.value = String(state.simCharge);
        els.inputTitle.value = `${state.standCalloutName} ➔ ${state.landCalloutName}`;
        els.inputAimref.value = `หัน ${state.simYawDeg}° • เงย +${state.simPitchDeg}° (${state.simCharge} ขีด)`;
        els.creationStepText.innerHTML = `ตรวจพบจุด <b>${state.standCalloutName} ➔ ${state.landCalloutName}</b> อัตโนมัติ! กด <b>บันทึก Lineup</b> ได้เลย`;
      }
    } else if (state.creationMode === 'READY') {
      state.draftPoints.landPos = { x, y };
      recalculateFromStandAndLand(state.draftPoints.standPos, state.draftPoints.landPos, null);
    }

    renderMapTrajectoriesSVG();
  });

  // Right-Click on Map: Set Target Landing Position & Auto-Compute Angles + Double Shock Sync!
  els.mapStage.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = els.mapStage.getBoundingClientRect();
    const x = Number((((e.clientX - rect.left) / rect.width) * 100).toFixed(1));
    const y = Number((((e.clientY - rect.top) / rect.height) * 100).toFixed(1));

    recalculateFromStandAndLand(state.simStandPos, { x, y }, null);
    renderMapTrajectoriesSVG();
    renderCompactHUD(getFilteredLineups());
  });

  els.inputImageFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.draftPoints.imageDataUrl = reader.result;
      els.pasteImgStatus.textContent = `แนบรูปสำเร็จ: ${file.name} ✓`;
    };
    reader.readAsDataURL(file);
  });

  window.addEventListener('paste', (e) => {
    if (els.createFormPanel.classList.contains('hidden')) return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          state.draftPoints.imageDataUrl = reader.result;
          els.pasteImgStatus.textContent = 'วางรูป Screenshot จาก Clipboard สำเร็จ ✓';
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  });

  els.btnSaveLineup.addEventListener('click', async () => {
    const standPos = state.draftPoints.standPos || state.simStandPos;
    const landPos = state.draftPoints.landPos || state.simLandPos;
    const title = els.inputTitle.value.trim() || `${els.inputAbility.value} (+${state.simPitchDeg}°)`;

    const newItem = {
      id: `custom-${Date.now()}`,
      mapName: state.selectedMap,
      side: els.inputSide.value,
      ability: els.inputAbility.value,
      title,
      standPos,
      bouncePos: state.draftPoints.bouncePos,
      landPos,
      charges: Number(els.inputCharges.value),
      bounces: Number(els.inputBounces.value),
      aimRef:
        els.inputAimref.value.trim() ||
        `หัน ${state.simYawDeg}° • เงย +${state.simPitchDeg}° (${els.inputCharges.value} ขีด)`,
      notes:
        els.inputNotes.value.trim() ||
        `ระยะ ${state.simDistMeters}m | เวลาลอย ${state.simFlightTime}s | Double Shock รอ ${state.doubleShockPlan.delaySec}s`,
      imageDataUrl: state.draftPoints.imageDataUrl || null
    };

    state.userLineups.push(newItem);
    if (window.overlayAPI) {
      await window.overlayAPI.saveUserLineups(state.userLineups);
    } else {
      localStorage.setItem('sova_user_lineups', JSON.stringify(state.userLineups));
    }

    state.selectedLineupId = newItem.id;
    cancelLineupCreation();
    refreshFilteredView();
  });
}

function cancelLineupCreation() {
  state.creationMode = null;
  state.draftPoints = { standPos: null, bouncePos: null, landPos: null, imageDataUrl: null };
  els.creationBanner.classList.add('hidden');
  els.createFormPanel.classList.add('hidden');
  els.inputTitle.value = '';
  els.inputAimref.value = '';
  els.inputNotes.value = '';
  els.pasteImgStatus.textContent = 'ยังไม่ได้แนบรูป (จะใช้ไดอะแกรมจำลองอัตโนมัติ)';
  renderMapTrajectoriesSVG();
}

function togglePlannerModal() {
  state.plannerVisible = !state.plannerVisible;
  els.plannerModal.classList.toggle('hidden', !state.plannerVisible);
  els.btnTogglePlanner.classList.toggle('active', state.plannerVisible);
}

function toggleSkyRuler() {
  state.rulerVisible = !state.rulerVisible;
  els.skyRulerOverlay.classList.toggle('hidden', !state.rulerVisible);
  els.btnToggleRuler.classList.toggle('active', state.rulerVisible);
  drawSkyRulerSVG();
}

// ============================================================================
// IPC & WEB KEYBOARD SHORTCUT LISTENERS
// ============================================================================
function setupIPCListeners() {
  // Web Keyboard Fallback (Alt+L, Alt+B, Alt+R, Alt+T, Alt+P, Alt+S, Alt+D, Alt+F, Alt+1..5)
  if (!window.overlayAPI) {
    window.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'l') { e.preventDefault(); togglePlannerModal(); }
      else if (key === 'b') { e.preventDefault(); triggerBuyPhase30s(); }
      else if (key === 'r') { e.preventDefault(); toggleSkyRuler(); }
      else if (key === 't') { e.preventDefault(); triggerDoubleShockSyncTimer(); }
      else if (key === 'p') { e.preventDefault(); triggerSpikePlanting4s(); }
      else if (key === 's') { e.preventDefault(); triggerSpikePlanted45s(); }
      else if (key === 'd') { e.preventDefault(); triggerSpikeDefuse7s(); }
      else if (key === 'f') { e.preventDefault(); triggerAntiFlashDimmer(); }
      else if (['1', '2', '3', '4', '5'].includes(key)) {
        e.preventDefault();
        const idx = Number(key) - 1;
        const list = getFilteredLineups();
        if (list[idx]) {
          state.selectedLineupId = list[idx].id;
          refreshFilteredView();
        }
      }
    });
    return;
  }

  window.overlayAPI.onTogglePlanner(() => togglePlannerModal());
  window.overlayAPI.onBuyPhase(() => triggerBuyPhase30s());
  window.overlayAPI.onToggleRuler(() => toggleSkyRuler());
  window.overlayAPI.onSyncTimer(() => triggerDoubleShockSyncTimer());
  window.overlayAPI.onSpikePlanting(() => triggerSpikePlanting4s());
  window.overlayAPI.onSpikePlanted(() => triggerSpikePlanted45s());
  window.overlayAPI.onSpikeDefuse(() => triggerSpikeDefuse7s());
  window.overlayAPI.onAntiFlash(() => triggerAntiFlashDimmer());

  window.overlayAPI.onGhostModeChange((isGhost) => {
    state.ghostMode = isGhost;
    els.btnGhostMode.classList.toggle('ghost-active', isGhost);
    els.ghostLabel.textContent = isGhost ? '👻 ทะลุเมาส์' : 'คลิกได้';
  });

  window.overlayAPI.onQuickSlot((slotIdx) => {
    const list = getFilteredLineups();
    if (list[slotIdx]) {
      state.selectedLineupId = list[slotIdx].id;
      refreshFilteredView();
    }
  });
}

init();
