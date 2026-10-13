import './style.css';
import { Game } from './game/game';
import { defect, fitShip, migrateCampaign, missionPayout, newCampaign, type Campaign, type Side } from './game/loadout';
import { missionById, type MissionDef } from './game/missions';
import { SHIP_CLASSES } from './entities/shipClasses';
import { Shop } from './ui/shop';
import { detectQuality, type QualityLevel } from './core/quality';
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
  glow: 1,
  invertMouse: false,
  invertPad: false,
  sensitivity: 1,
  quality: 'auto',
  mouseMode: 'aim',
});
// the old browser-TTS toggle is now `tts`
delete (settings as Partial<Settings> & { voice?: boolean }).voice;
let campaign: Campaign = migrateCampaign(load<Partial<Campaign> | null>('veil.campaign', null));
const saveCampaign = () => save('veil.campaign', campaign);

const game = new Game($('game'), $<HTMLCanvasElement>('hud'));
let mission: MissionDef = missionById('cold-guns');
(window as unknown as { __game: Game }).__game = game;
(window as unknown as { __classes: typeof SHIP_CLASSES }).__classes = SHIP_CLASSES;
game.input.setBindings({ ...DEFAULT_BINDINGS, ...load<Partial<Bindings>>('veil.bindings', {}) });

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
  save('veil.settings', settings);
}

// --- Options form ---------------------------------------------------------------------------
const bindCheck = (id: string, key: 'radioVoice' | 'tts' | 'invertMouse' | 'invertPad') => {
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
bindRange('opt-music-vol', 'musicVolume');
bindRange('opt-sfx-vol', 'sfxVolume');
bindRange('opt-voice-vol', 'voiceVolume');
bindRange('opt-glow', 'glow');
bindRange('opt-sens', 'sensitivity');
const mouseModeSelect = $<HTMLSelectElement>('opt-mouse-mode');
mouseModeSelect.value = settings.mouseMode;
mouseModeSelect.addEventListener('change', () => {
  settings.mouseMode = mouseModeSelect.value as MouseMode;
  applySettings();
});

// URL overrides for testing: ?quality=high&dynres=0
const params = new URLSearchParams(location.search);
const urlQuality = params.get('quality') as QualityLevel | null;
if (params.get('dynres') === '0') game.dynamicResolution.enabled = false;
const applyQuality = () => {
  const level = urlQuality ?? (settings.quality === 'auto' ? detectQuality(game.renderer) : settings.quality);
  game.applyQuality(level);
};
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
shop.onLaunch = (id) => begin(missionById(id), 0);

function startAudio(): void {
  game.audio.init();
  game.audio.music.start();
  applySettings();
}

function openHangar(): void {
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
  startAudio();
  closeAllMenus();
  show('title', false);
  show('pause', false);
  show('debrief', false);
  show('hangar', false);
  game.loadLocation(m.map);
  const c = campaign;
  game.missionRunner = (g, cp) => m.run(g, cp, c);
  game.playerFit = fitShip(campaign.activeShip, campaign.fits[campaign.activeShip]);
  game.startMission(checkpoint);
  game.input.requestPointerLock();
}

$('launch').addEventListener('click', () => openHangar());
$('new-campaign').addEventListener('click', () => {
  if (campaign.started && !window.confirm('Start a new campaign? Your ships, credits and story progress will be lost.')) return;
  campaign = newCampaign();
  saveCampaign();
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
$('to-hangar').addEventListener('click', () => openHangar());
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
  const p = game.player;
  const kills = p ? p.kills : 0;
  const acc = p && p.shotsFired ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
  const minutes = Math.floor(game.missionTime / 60);
  const seconds = Math.floor(game.missionTime % 60)
    .toString()
    .padStart(2, '0');
  // bounties are paid either way; the contract only on success, reduced on repeat runs
  const pay = missionPayout(campaign, mission.id, result === 'victory' ? mission.pay + game.bonusPay : 0, game.bounties);
  campaign.credits += pay.total;
  for (const id of game.seenClasses) if (!campaign.seen.includes(id)) campaign.seen.push(id);
  let confiscated: string[] = [];
  const flewFor = mission.faction === 'current' ? campaign.allegiance : mission.faction;
  if (result === 'victory') {
    campaign.completed[mission.id] = (campaign.completed[mission.id] ?? 0) + 1;
    for (const [k, v] of Object.entries(game.missionFlags)) {
      if (k === 'allegiance') campaign.allegiance = v as Campaign['allegiance'];
      else if (k === 'defect') confiscated = defect(campaign, v as Side);
      else campaign.flags[k] = v;
    }
    if (flewFor && flewFor === campaign.allegiance && !game.missionFlags.defect) {
      campaign.standing[flewFor] = (campaign.standing[flewFor] ?? 0) + 1;
    }
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
  };
  const outcome = Object.entries(game.missionFlags)
    .map(([k, v]) => outcomeTitles[`${k}:${v}`])
    .find(Boolean);
  $('debrief-title').textContent = result === 'victory' ? (outcome ?? mission.victoryTitle) : 'Signal lost';
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
  $('retry').style.display = result === 'victory' ? 'none' : '';
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
  note.textContent = `${side ? `${sides[side]} ` : ''}${defected ? `${turned[defected]}${lost} ` : ''}Credits: ${campaign.unlimited ? '∞ (test mode)' : `${campaign.credits.toLocaleString()} cr`}.`;
  choice.appendChild(note);
  show('debrief', true);
};

let last = performance.now();
const fpsEl = $('fps');
function loop(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  game.frame(dt);
  fpsEl.textContent = `${Math.round(game.fps)} fps`;
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
