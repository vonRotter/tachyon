import * as THREE from 'three';
import './style.css';
import { Game, type Difficulty } from './game/game';
import { DEATH_FEE, defect, fitShip, migrateCampaign, missionPayout, newCampaign, newFit, type Campaign, type Side } from './game/loadout';
import { dealBoard, isFinale, isSide, mapOf, missionById, nextStory, type MissionDef } from './game/missions';
import { GATES, HOMES, gateState, route, systemById } from './game/starmap';
import { runAsylum, runTransit } from './game/missionTravel';
import { SHIP_CLASSES } from './entities/shipClasses';
import { Shop } from './ui/shop';
import { detectQuality, type QualityLevel, type QualityOverrides } from './core/quality';
import { BIND_LABELS, DEFAULT_BINDINGS, keyLabel, type BindAction, type Bindings, type MouseMode } from './core/input';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Settings {
  /** Recorded radio dialogue. */
  radioVoice: boolean;
  /** Browser text-to-speech for lines without a recording. */
  tts: boolean;
  voiceVolume: number;
  musicVolume: number;
  sfxVolume: number;
  glow: number;
  invertMouse: boolean;
  invertPad: boolean;
  sensitivity: number;
  quality: 'auto' | QualityLevel;
  mouseMode: MouseMode;
  difficulty: Difficulty;
  /** Graphics overrides on top of the preset ('preset' keeps the preset's choice). */
  aa: 'preset' | '0' | '2' | '4';
  shadows: 'preset' | 'on' | 'off';
  detail: 'preset' | 'on' | 'off';
  resolution: 'preset' | string;
  dynres: boolean;
  traffic: 'normal' | 'reduced';
  showFps: boolean;
}

const load = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
};

const settings = load<Settings>('veil.settings', {
  radioVoice: true,
  tts: false,
  voiceVolume: 1,
  musicVolume: 0.6,
  sfxVolume: 0.9,
  glow: 0.7,
  invertMouse: false,
  invertPad: false,
  sensitivity: 1,
  quality: 'auto',
  mouseMode: 'aim',
  difficulty: 'normal',
  aa: 'preset',
  shadows: 'preset',
  detail: 'preset',
  resolution: 'preset',
  dynres: true,
  traffic: 'normal',
  showFps: true,
});
// the old browser-TTS toggle is now `tts`
delete (settings as Partial<Settings> & { voice?: boolean }).voice;
// the glare default came down; settings still on the old default follow it
const glowDefaults = settings as Settings & { glowV2?: boolean };
if (!glowDefaults.glowV2) {
  if (settings.glow === 1) settings.glow = 0.7;
  glowDefaults.glowV2 = true;
}
let campaign: Campaign = migrateCampaign(load<Partial<Campaign> | null>('veil.campaign', null));
const saveCampaign = () => save('veil.campaign', campaign);

const game = new Game($('game'), $<HTMLCanvasElement>('hud'));
let mission: MissionDef = missionById('cold-guns');
(window as unknown as { __game: Game }).__game = game;
(window as unknown as { __classes: typeof SHIP_CLASSES }).__classes = SHIP_CLASSES;
const savedBindings = load<Partial<Bindings>>('veil.bindings', {});
// older builds had 1 = shields ... 4 = balanced; the HUD shows balanced first, so 1 is balanced now
if (savedBindings.powerShields?.[0] === 'Digit1' && savedBindings.powerBalanced?.[0] === 'Digit4') {
  savedBindings.powerBalanced = ['Digit1'];
  savedBindings.powerShields = ['Digit2'];
  savedBindings.powerGuns = ['Digit3'];
  savedBindings.powerEngines = ['Digit4'];
}
game.input.setBindings({ ...DEFAULT_BINDINGS, ...savedBindings });

function applySettings(): void {
  game.input.settings.invertMouseY = settings.invertMouse;
  game.input.settings.invertPadY = settings.invertPad;
  game.input.settings.mouseSensitivity = settings.sensitivity;
  game.input.settings.mouseMode = settings.mouseMode;
  game.comms.voiceEnabled = settings.radioVoice;
  game.comms.ttsEnabled = settings.tts;
  game.audio.music.enabled = settings.musicVolume > 0;
  game.audio.setVolumes(settings.sfxVolume, settings.musicVolume * 0.5, settings.voiceVolume);
  game.setGlow(settings.glow);
  game.difficulty = settings.difficulty;
  game.trafficScale = settings.traffic === 'reduced' ? 0.45 : 1;
  $('fps').style.display = settings.showFps ? '' : 'none';
  save('veil.settings', settings);
}

// --- Options form ---------------------------------------------------------------------------
const bindCheck = (id: string, key: 'radioVoice' | 'tts' | 'invertMouse' | 'invertPad' | 'showFps') => {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    applySettings();
  });
};
const bindRange = (id: string, key: 'musicVolume' | 'sfxVolume' | 'voiceVolume' | 'glow' | 'sensitivity') => {
  const el = $<HTMLInputElement>(id);
  el.value = String(settings[key]);
  el.addEventListener('input', () => {
    settings[key] = Number(el.value);
    applySettings();
  });
};
bindCheck('opt-voice', 'radioVoice');
bindCheck('opt-tts', 'tts');
bindCheck('opt-invert-mouse', 'invertMouse');
bindCheck('opt-invert-pad', 'invertPad');
bindCheck('opt-fps', 'showFps');
bindRange('opt-music-vol', 'musicVolume');
bindRange('opt-sfx-vol', 'sfxVolume');
bindRange('opt-voice-vol', 'voiceVolume');
bindRange('opt-glow', 'glow');
bindRange('opt-sens', 'sensitivity');
const difficultySelect = $<HTMLSelectElement>('opt-difficulty');
difficultySelect.value = settings.difficulty;
difficultySelect.addEventListener('change', () => {
  settings.difficulty = difficultySelect.value as Difficulty;
  save('veil.settings', settings);
  applySettings();
});
const mouseModeSelect = $<HTMLSelectElement>('opt-mouse-mode');
mouseModeSelect.value = settings.mouseMode;
mouseModeSelect.addEventListener('change', () => {
  settings.mouseMode = mouseModeSelect.value as MouseMode;
  applySettings();
});

// URL overrides for testing: ?quality=high&dynres=0
const params = new URLSearchParams(location.search);
const urlQuality = params.get('quality') as QualityLevel | null;
const applyQuality = () => {
  const level = urlQuality ?? (settings.quality === 'auto' ? detectQuality(game.renderer) : settings.quality);
  const o: QualityOverrides = {};
  if (settings.aa !== 'preset') o.msaa = Number(settings.aa);
  if (settings.shadows !== 'preset') o.shadows = settings.shadows === 'on';
  if (settings.detail !== 'preset') o.surfaceDetail = settings.detail === 'on';
  if (settings.resolution !== 'preset') o.pixelRatioCap = Number(settings.resolution);
  game.dynamicResolution.enabled = settings.dynres && params.get('dynres') !== '0';
  game.applyQuality(level, o);
};
// the per-setting graphics overrides re-apply the preset with the change on top
const bindGraphics = (id: string, key: 'aa' | 'shadows' | 'detail' | 'resolution' | 'traffic') => {
  const el = $<HTMLSelectElement>(id);
  el.value = settings[key];
  el.addEventListener('change', () => {
    (settings as unknown as Record<string, string>)[key] = el.value;
    save('veil.settings', settings);
    applySettings();
    applyQuality();
  });
};
bindGraphics('opt-aa', 'aa');
bindGraphics('opt-shadows', 'shadows');
bindGraphics('opt-detail', 'detail');
bindGraphics('opt-resolution', 'resolution');
bindGraphics('opt-traffic', 'traffic');
const dynresBox = $<HTMLInputElement>('opt-dynres');
dynresBox.checked = settings.dynres;
dynresBox.addEventListener('change', () => {
  settings.dynres = dynresBox.checked;
  save('veil.settings', settings);
  applyQuality();
});
const qualitySelect = $<HTMLSelectElement>('opt-quality');
qualitySelect.value = settings.quality;
qualitySelect.addEventListener('change', () => {
  settings.quality = qualitySelect.value as Settings['quality'];
  save('veil.settings', settings);
  applyQuality();
});
applyQuality();
applySettings();

// --- Menu stack -----------------------------------------------------------------------------
const show = (id: string, on: boolean) => $(id).classList.toggle('visible', on);
/** Open sub-menus on top of the title or pause screen; Back / Esc pops them. */
const menuStack: string[] = [];

function openMenu(id: string): void {
  const top = menuStack[menuStack.length - 1] ?? baseMenu();
  if (top) show(top, false);
  menuStack.push(id);
  show(id, true);
  if (id === 'controls') renderBindings();
}

function closeMenu(): void {
  const id = menuStack.pop();
  if (!id) return;
  cancelCapture();
  show(id, false);
  const below = menuStack[menuStack.length - 1] ?? baseMenu();
  if (below) show(below, true);
}

function baseMenu(): string | null {
  if (game.state === 'title') return 'title';
  if (game.state === 'hangar') return 'hangar';
  if (game.state === 'paused') return 'pause';
  return null;
}

function closeAllMenus(): void {
  cancelCapture();
  while (menuStack.length) show(menuStack.pop() as string, false);
}

for (const el of document.querySelectorAll<HTMLElement>('[data-open]')) {
  el.addEventListener('click', () => openMenu(el.dataset.open as string));
}
for (const el of document.querySelectorAll<HTMLElement>('[data-back]')) {
  el.addEventListener('click', () => closeMenu());
}

// --- Key bindings ---------------------------------------------------------------------------
let capture: { action: BindAction; slot: number; button: HTMLButtonElement } | null = null;

function renderBindings(): void {
  const root = $('bindings');
  root.innerHTML = '';
  for (const [action, name] of BIND_LABELS) {
    const label = document.createElement('div');
    label.className = 'name';
    label.textContent = name;
    root.appendChild(label);
    for (const slot of [0, 1]) {
      const code = game.input.bindings[action][slot];
      const b = document.createElement('button');
      b.textContent = code ? keyLabel(code) : 'unbound';
      b.classList.toggle('empty', !code);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelCapture();
        capture = { action, slot, button: b };
        b.textContent = 'press a key…';
        b.classList.add('capturing');
        game.input.suspended = true;
      });
      root.appendChild(b);
    }
  }
}

function cancelCapture(): void {
  if (!capture) return;
  capture = null;
  game.input.suspended = false;
  renderBindings();
}

function assign(code: string | null): void {
  if (!capture) return;
  const { action, slot } = capture;
  const b = game.input.bindings;
  if (code) {
    // a key drives one action only: remove it wherever else it was bound
    for (const k of Object.keys(b) as BindAction[]) b[k] = b[k].filter((c) => c !== code);
  }
  const list = [...b[action]];
  if (code) list[slot] = code;
  else list.splice(slot, 1);
  b[action] = list.filter(Boolean);
  game.input.setBindings(b);
  save('veil.bindings', game.input.bindings);
  capture = null;
  // keep gameplay input off until the key that was just bound is released
  window.setTimeout(() => (game.input.suspended = false), 150);
  renderBindings();
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!capture) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') cancelCapture();
    else if (e.code === 'Backspace' || e.code === 'Delete') assign(null);
    else assign(e.code);
  },
  true,
);
window.addEventListener(
  'mousedown',
  (e) => {
    if (!capture) return;
    // clicking another slot just moves the capture; any other click binds that button
    if ((e.target as HTMLElement).closest('.bindings button')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    assign(`Mouse${e.button}`);
  },
  true,
);

$('bind-reset').addEventListener('click', () => {
  game.input.setBindings(DEFAULT_BINDINGS);
  save('veil.bindings', game.input.bindings);
  renderBindings();
});

// Esc steps back through menus before it resumes the game
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || capture) return;
  if (menuStack.length) {
    closeMenu();
    game.input.consume('pause');
  }
});

// --- Hangar ---------------------------------------------------------------------------------
const shop = new Shop(campaign);
shop.onChange = saveCampaign;
shop.onShowShip = (id) => game.hangar.showShip(SHIP_CLASSES[id], campaign.ships.includes(id));
shop.onShowEntry = (entry, faction) => {
  if (entry.show.kind === 'capital') game.hangar.showCapital(entry.show.capital, faction);
  else game.hangar.showShipAs(SHIP_CLASSES[entry.show.classId], faction);
};
shop.onLaunch = (id) => launch(missionById(id));
shop.onDefect = (to) => {
  const home = HOMES[to];
  const way = route(campaign, campaign.at, home, undefined, home);
  if (!way) return;
  travel(way, () => begin(asylumMission(to, way[way.length - 2] ?? 'kestrel'), 0));
};

// --- travel -----------------------------------------------------------------------------------
/** A leg of travel: fly from the station to the gate and jump. Not a contract. */
const transitMission = (from: string, to: string, ambush: boolean): MissionDef => ({
  id: 'transit',
  name: `Transit to ${systemById(to).name}`,
  location: systemById(from).name,
  map: from,
  briefing: '',
  pay: 0,
  run: (g) => runTransit(g, from, to, ambush),
  available: () => false,
  victoryTitle: 'Jumped',
});
const asylumMission = (to: 'combine' | 'drift', from: string): MissionDef => ({
  id: 'asylum',
  name: to === 'drift' ? 'Sanctuary' : 'New colours',
  location: systemById(HOMES[to]).name,
  map: HOMES[to],
  briefing: '',
  pay: 0,
  run: (g) => runAsylum(g, to, from),
  available: () => false,
  victoryTitle: to === 'drift' ? 'You fly with the Drift Union now' : 'You fly for the Helion Combine now',
});
/** Where you end up after a mission there: in that system, unless every gate out is closed to you, in which case you are ferried back to Kestrel. */
function dockAfter(system: string): string {
  return GATES.some((g) => (g.a === system || g.b === system) && gateState(g, campaign).state !== 'closed') ? system : 'kestrel';
}
/** Travel in progress: the systems still to fly through, and what happens on arrival. */
let journey: { path: string[]; leg: number; then: () => void } | null = null;
let arrivedFrom: string | null = null;

function travel(path: string[], then: () => void): void {
  journey = { path, leg: 0, then };
  nextLeg();
}

function nextLeg(): void {
  const j = journey;
  if (!j) return;
  if (j.leg >= j.path.length - 1) {
    journey = null;
    campaign.at = j.path[j.path.length - 1];
    arrivedFrom = j.path[j.path.length - 2] ?? null;
    saveCampaign();
    j.then();
    return;
  }
  const from = j.path[j.leg];
  const to = j.path[j.leg + 1];
  j.leg++;
  // the Wake work the gates: about one leg in three has company
  begin(transitMission(from, to, Math.random() < 0.35), 0);
}

/** Launching a contract somewhere else: fly there through the gates, or jump straight in. */
function launch(m: MissionDef): void {
  const dest = mapOf(m, campaign);
  const way = route(campaign, campaign.at, dest, dest);
  if (!way || way.length < 2) {
    begin(m, 0);
    return;
  }
  $('travel-text').textContent = `${m.name} is at ${systemById(dest).name}. You are docked at ${systemById(campaign.at).name}: ${way.length - 1} ${way.length === 2 ? 'jump' : 'jumps'} by gate (${way.map((s) => systemById(s).name).join(' → ')}).`;
  $('travel-fly').textContent = `Fly there (${way.length - 1} ${way.length === 2 ? 'jump' : 'jumps'})`;
  show('travel-ask', true);
  $('travel-fly').onclick = () => {
    show('travel-ask', false);
    travel(way, () => begin(m, 0));
  };
  $('travel-jump').onclick = () => {
    show('travel-ask', false);
    campaign.at = dest;
    saveCampaign();
    begin(m, 0);
  };
}
$('travel-cancel').addEventListener('click', () => show('travel-ask', false));

function startAudio(): void {
  game.audio.init();
  game.audio.music.start();
  applySettings();
}

function openHangar(): void {
  // saves from before the job board get one dealt
  if ((campaign.completed['cold-guns'] ?? 0) > 0 && !campaign.board.length) dealBoard(campaign);
  startAudio();
  closeAllMenus();
  show('title', false);
  show('pause', false);
  show('debrief', false);
  game.enterHangar();
  show('hangar', true);
  shop.setCampaign(campaign);
}

// --- Session flow ---------------------------------------------------------------------------
function begin(m: MissionDef, checkpoint: number): void {
  mission = m;
  if (m.id !== 'prologue') game.tutorial = false;
  startAudio();
  closeAllMenus();
  show('title', false);
  show('pause', false);
  show('debrief', false);
  show('hangar', false);
  game.loadLocation(mapOf(m, campaign));
  const c = campaign;
  game.missionRunner = (g, cp) => m.run(g, cp, c);
  // the prologue is flown in a borrowed Kite, before you own anything
  game.playerFit = m.id === 'prologue' ? fitShip('kite', newFit('kite', true)) : fitShip(campaign.activeShip, campaign.fits[campaign.activeShip]);
  game.startMission(checkpoint);
  if (arrivedFrom && m.id !== 'transit' && checkpoint === 0) {
    // you came through the gate: a flash of the jump on arrival
    const p = game.player;
    if (p) game.fx.jumpIn(p.pos, p.forward(new THREE.Vector3()), '#7fe9ff');
    game.hint(`Arrived from ${systemById(arrivedFrom).name}`, 3);
  }
  arrivedFrom = null;
  if (isFinale(m, campaign) && checkpoint === 0) game.hint(`FINAL MISSION · ${m.name}`, 6);
  game.input.requestPointerLock();
}

$('launch').addEventListener('click', () => openHangar());
/** New campaign: pick standard or hardcore, then off to the start. */
function startNewCampaign(): void {
  show('title', true);
  show('new-run', true);
}
$('new-campaign').addEventListener('click', () => {
  if (campaign.started && !campaign.dead && !window.confirm('Start a new campaign? Your ships, credits and story progress will be lost.')) return;
  startNewCampaign();
});
for (const [id, hardcore] of [
  ['run-standard', false],
  ['run-hardcore', true],
] as const) {
  $(id).addEventListener('click', () => {
    campaign = newCampaign();
    campaign.hardcore = hardcore;
    saveCampaign();
    show('new-run', false);
    show('tutorial-ask', true);
  });
}
$('run-cancel').addEventListener('click', () => show('new-run', false));
for (const [id, want] of [
  ['tutorial-yes', true],
  ['tutorial-no', false],
] as const) {
  $(id).addEventListener('click', () => {
    show('tutorial-ask', false);
    game.tutorial = want;
    begin(missionById('prologue'), 0);
  });
}

/** After the prologue: who you are now, and what you have left. */
function showStory(): void {
  $('story-title').textContent = 'Kestrel Station';
  $('story-text').innerHTML = [
    'You wake up in the infirmary on Kestrel Station. The Red Wake took the <i>Tamsin\'s Luck</i> and everything in her hold. The <i>Halcyon</i> burned with her crew. Dace did not make it, and the Kite you borrowed is scrap.',
    'Dockmaster Varga comes by with what is owed to you: the escort fee for the run, and the insurance on the Kite. Forty thousand credits. Enough for a ship of your own, if you choose carefully.',
    'Kestrel is an independent station, caught between the Helion Combine, the Drift Union and the Red Wake. Out here, a pilot who can fly is worth something. Time to get your life back.',
  ]
    .map((t) => `<p>${t}</p>`)
    .join('');
  show('story', true);
}
$('story-go').addEventListener('click', () => {
  show('story', false);
  openHangar();
});

// --- Test cheat: Ctrl+P toggles unlimited credits --------------------------------------------
const toastEl = $('toast');
let toastTimer = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('visible'), 2600);
}
window.addEventListener(
  'keydown',
  (e) => {
    if (!(e.ctrlKey && e.code === 'KeyP')) return;
    // also stops the browser's print dialog and the pause key
    e.preventDefault();
    e.stopImmediatePropagation();
    campaign.unlimited = !campaign.unlimited;
    saveCampaign();
    shop.setCampaign(campaign);
    toast(campaign.unlimited ? 'Test mode: unlimited credits ON (Ctrl+P to turn off)' : 'Test mode: unlimited credits OFF');
  },
  true,
);
$('resume').addEventListener('click', () => game.resume());
$('restart').addEventListener('click', () => begin(mission, 0));
$('restart2').addEventListener('click', () => begin(mission, 0));
$('retry').addEventListener('click', () => begin(mission, game.checkpoint));
$('abandon').addEventListener('click', () => openHangar());
$('to-hangar').addEventListener('click', () => {
  if (campaign.dead) {
    show('debrief', false);
    startNewCampaign();
    return;
  }
  openHangar();
});
$('hangar-title').addEventListener('click', () => {
  show('hangar', false);
  game.quitToTitle();
  show('title', true);
});
$('quit').addEventListener('click', () => {
  closeAllMenus();
  show('pause', false);
  game.quitToTitle();
  show('title', true);
});

game.onPauseChange = (paused) => {
  if (!paused) closeAllMenus();
  show('pause', paused);
};
game.menuOpen = () => menuStack.length > 0 || $('swap').classList.contains('visible');

// mid-mission ship pick (aboard a friendly capital ship)
game.fitFor = (id) => fitShip(id, campaign.fits[id]);
game.onChooseShip = () =>
  new Promise((resolve) => {
    const list = $('swap-list');
    list.innerHTML = '';
    const current = campaign.activeShip;
    for (const id of campaign.ships) {
      const cls = SHIP_CLASSES[id];
      const fit = campaign.fits[id];
      const weapons = fit.weapons.filter(Boolean).length;
      const b = document.createElement('button');
      b.innerHTML = `${cls.name}${id === current ? ' (current)' : ''}<small>${cls.description ?? ''} Weapons fitted: ${weapons} of ${fit.weapons.length}.</small>`;
      if (id === current) b.classList.add('chosen');
      b.addEventListener('click', () => {
        show('swap', false);
        campaign.activeShip = id;
        saveCampaign();
        resolve(id === current ? null : id);
      });
      list.appendChild(b);
    }
    show('swap', true);
  });

// clicking the game view re-captures the mouse
game.renderer.domElement.addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.pointerLocked) game.input.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.state === 'playing' && game.input.device === 'mouse') game.pause();
});

game.onMissionEnd = (result) => {
  if (mission.id === 'transit' && result === 'victory') {
    // a leg flown: bounties for anything that tried to stop you, then the next gate
    campaign.credits += campaign.unlimited ? 0 : game.bounties;
    for (const id of game.seenClasses) if (!campaign.seen.includes(id)) campaign.seen.push(id);
    saveCampaign();
    nextLeg();
    return;
  }
  if (mission.id === 'transit') journey = null;
  else if (mission.id === 'asylum') campaign.at = mapOf(mission, campaign);
  else if (mission.id !== 'prologue') campaign.at = dockAfter(mapOf(mission, campaign));
  if (mission.id === 'prologue') {
    // no pay, no fee, no debrief: it always ends adrift
    void result;
    for (const id of game.seenClasses) if (!campaign.seen.includes(id)) campaign.seen.push(id);
    campaign.flags.prologue = 'done';
    saveCampaign();
    showStory();
    return;
  }
  const p = game.player;
  const kills = p ? p.kills : 0;
  const acc = p && p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
  const minutes = Math.floor(game.missionTime / 60);
  const seconds = Math.floor(game.missionTime % 60)
    .toString()
    .padStart(2, '0');
  // bounties are paid either way; the contract only on success, reduced on repeat runs
  // bounties carried over from a checkpoint were paid when that attempt failed
  const pay = missionPayout(campaign, mission.id, result === 'victory' ? mission.pay + game.bonusPay : 0, game.bounties - game.bountiesCarried, mission.repeatable);
  campaign.credits += pay.total;
  for (const id of game.seenClasses) if (!campaign.seen.includes(id)) campaign.seen.push(id);
  let confiscated: string[] = [];
  const flewFor = mission.faction === 'current' ? campaign.allegiance : mission.faction;
  if (result === 'victory') {
    campaign.completed[mission.id] = (campaign.completed[mission.id] ?? 0) + 1;
    for (const [k, v] of Object.entries(game.missionFlags)) {
      if (k === 'allegiance') campaign.allegiance = v as Campaign['allegiance'];
      else if (k === 'defect') confiscated = defect(campaign, v as Side);
      else if (k === 'gift') {
        if (!campaign.ships.includes(v)) {
          campaign.ships.push(v);
          campaign.fits[v] = newFit(v, true);
        }
      }
      else campaign.flags[k] = v;
    }
    if (flewFor && flewFor === campaign.allegiance && !game.missionFlags.defect) {
      campaign.standing[flewFor] = (campaign.standing[flewFor] ?? 0) + 1;
    }
    if (isSide(mission)) {
      // side work uses up this chapter's allowance, and a job leaves the board
      campaign.sideDone++;
      campaign.board = campaign.board.filter((id) => id !== mission.id);
      if (!campaign.board.length && !nextStory(campaign)) dealBoard(campaign);
    } else {
      // a story chapter done: the clock resets and the board fills up again
      campaign.sideDone = 0;
      dealBoard(campaign);
    }
  }
  // dying costs: on hardcore it ends the campaign, otherwise a tug recovers you and bills you
  const died = result === 'defeat' && game.playerDied;
  let bill = 0;
  if (died && campaign.hardcore) campaign.dead = true;
  else if (died && !campaign.unlimited) {
    bill = Math.min(DEATH_FEE, campaign.credits);
    campaign.credits -= bill;
  }
  saveCampaign();
  const outcomeTitles: Record<string, string> = {
    'gallows:burned': 'The Gallows burns',
    'gallows:watched': 'The Gallows falls',
    'gallows:defended': 'You stood between them',
    'gallows:lost': 'Too late',
    'kestrel:seized': 'Kestrel under Combine protection',
    'kestrel:held': 'Kestrel holds',
    'kestrel:free': 'Kestrel is free',
    'dawn:burned': 'The east cradle burns',
    'dawn:spared': 'The Dawn survives',
    'dawn:saved': 'Four hundred lives',
    'records:broadcast': 'Every station has it',
    'records:silenced': 'The Reach hears nothing',
    'baron:friend': 'A rose in your hangar',
    'baron:exiled': 'Adieu, Baron',
    'baron:dead': 'A good morning',
    'baron3:joined': 'Half the vault',
    'baron3:betrayed': 'Et tu, Rook',
    'baron2:spared': 'A debt of honour',
    'baron2:downed': 'Well flown',
    'baron2:trapped': 'No honour among contractors',
    'baron1:let': 'A civilised robbery',
    'baron1:fought': 'A waltz',
    'finale:combine': 'The Reach under the Combine',
    'finale:drift': 'The Combine leaves the Reach',
  };
  const outcome = Object.entries(game.missionFlags)
    .map(([k, v]) => outcomeTitles[`${k}:${v}`])
    .find(Boolean);
  $('debrief-title').textContent = result === 'victory' ? (outcome ?? mission.victoryTitle) : game.playerDied ? 'Signal lost' : 'Mission failed';
  const stats: [string, string][] = [
    ['KILLS', String(kills)],
    ['ACCURACY', `${acc}%`],
    ['TIME', `${minutes}:${seconds}`],
    ['CONTRACT', `${pay.base.toLocaleString()} cr`],
    ['BOUNTIES', `${pay.bounties.toLocaleString()} cr`],
    ['PAID', `${pay.total.toLocaleString()} cr${pay.replayFactor < 1 ? ' (repeat run, 40%)' : ''}`],
  ];
  $('debrief-stats').innerHTML = stats.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  const choice = $('debrief-choice');
  choice.innerHTML = '';
  const over = campaign.dead;
  // hardcore has no checkpoints: a failed mission starts over from the beginning
  const travelling = mission.id === 'transit' || mission.id === 'asylum';
  $('retry').style.display = result === 'victory' || over || campaign.hardcore || travelling ? 'none' : '';
  $('restart2').style.display = result === 'victory' || over || travelling ? 'none' : '';
  $('to-hangar').textContent = over ? 'Start a new campaign' : 'Return to hangar';
  if (over) $('debrief-title').textContent = 'Rook is gone';
  if (result === 'defeat') {
    const why = document.createElement('p');
    why.className = 'fail-reason';
    why.textContent = game.failReason || 'The mission could not be completed.';
    choice.appendChild(why);
  }
  const note = document.createElement('p');
  const sides: Record<string, string> = {
    combine: 'You landed on the Sovereign Dawn. You fly for the Helion Combine now.',
    drift: 'You landed at Kestrel and sat down with Mother Sorrel. You fly with the Drift Union now.',
  };
  const side = result === 'victory' ? game.missionFlags.allegiance : undefined;
  const turned: Record<string, string> = {
    combine: 'You turned on the Drift Union. The Helion Combine takes you in.',
    drift: 'You turned on the Helion Combine. The Drift Union takes you in.',
  };
  const defected = result === 'victory' ? game.missionFlags.defect : undefined;
  const lost = confiscated.length ? ` They kept what was theirs: ${confiscated.join(', ')}.` : '';
  const gift = result === 'victory' && game.missionFlags.gift ? `The ${SHIP_CLASSES[game.missionFlags.gift]?.name ?? 'ship'} is waiting in your hangar. ` : '';
  const deathNote = over
    ? 'Hardcore: one life, and it is spent. The campaign ends here. '
    : bill
      ? `A salvage tug pulled you out of the wreck. Recovery and repairs: ${bill.toLocaleString()} cr. `
      : '';
  note.textContent = `${deathNote}${side ? `${sides[side]} ` : ''}${defected ? `${turned[defected]}${lost} ` : ''}${gift}Credits: ${campaign.unlimited ? '∞ (test mode)' : `${campaign.credits.toLocaleString()} cr`}.`;
  choice.appendChild(note);
  show('debrief', true);
};

let last = performance.now();
const fpsEl = $('fps');
function loop(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.frame(dt);
  const scale = game.dynamicResolution.scale;
  fpsEl.textContent = scale < 0.999 ? `${Math.round(game.fps)} fps · ${Math.round(scale * 100)}% res` : `${Math.round(game.fps)} fps`;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// gamepad (A / Cross) or Enter starts from the title screen
game.onTitleConfirm = () => {
  if (!menuStack.length) openHangar();
};

// test hooks
(window as unknown as { __campaign: () => Campaign; __setCampaign: (c: Partial<Campaign>) => void }).__campaign = () => campaign;
(window as unknown as { __setCampaign: (c: Partial<Campaign>) => void }).__setCampaign = (c) => {
  campaign = migrateCampaign({ ...campaign, ...c });
  saveCampaign();
  shop.setCampaign(campaign);
};
