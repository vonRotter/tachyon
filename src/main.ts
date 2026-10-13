import './style.css';
import { Game, type Difficulty } from './game/game';
import { DEATH_FEE, defect, fitShip, migrateCampaign, missionPayout, newCampaign, newFit, type Campaign, type Side } from './game/loadout';
import { dealBoard, isSide, missionById, nextStory, type MissionDef } from './game/missions';
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
  difficulty: Difficulty;
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
  difficulty: 'normal',
});
// the old browser-TTS toggle is now `tts`
delete (settings as Partial<Settings> & { voice?: boolean }).voice;
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
  startAudio();
  closeAllMenus();
  show('title', false);
  show('pause', false);
  show('debrief', false);
  show('hangar', false);
  game.loadLocation(m.map);
  const c = campaign;
  game.missionRunner = (g, cp) => m.run(g, cp, c);
  // the prologue is flown in a borrowed Kite, before you own anything
  game.playerFit = m.id === 'prologue' ? fitShip('kite', newFit('kite')) : fitShip(campaign.activeShip, campaign.fits[campaign.activeShip]);
  game.startMission(checkpoint);
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
    begin(missionById('prologue'), 0);
  });
}
$('run-cancel').addEventListener('click', () => show('new-run', false));

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
  const pay = missionPayout(campaign, mission.id, result === 'victory' ? mission.pay + game.bonusPay : 0, game.bounties, mission.repeatable);
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
          campaign.fits[v] = newFit(v);
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
  const over = campaign.dead;
  $('retry').style.display = result === 'victory' || over ? 'none' : '';
  $('restart2').style.display = result === 'victory' || over ? 'none' : '';
  $('to-hangar').textContent = over ? 'Start a new campaign' : 'Return to hangar';
  if (over) $('debrief-title').textContent = 'Rook is gone';
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
