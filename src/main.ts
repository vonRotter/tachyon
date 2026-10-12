import './style.css';
import { Game } from './game/game';
import { runKestrelMission } from './game/mission';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Settings {
  voice: boolean;
  music: boolean;
  invertMouse: boolean;
  invertPad: boolean;
  sensitivity: number;
}

interface Campaign {
  credits: number;
  allegiance: 'combine' | 'drift' | null;
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
  voice: false,
  music: true,
  invertMouse: false,
  invertPad: false,
  sensitivity: 1,
});
const campaign = load<Campaign>('veil.campaign', { credits: 0, allegiance: null });

const game = new Game($('game'), $<HTMLCanvasElement>('hud'));
game.missionRunner = runKestrelMission;
(window as unknown as { __game: Game }).__game = game;

function applySettings(): void {
  game.input.settings.invertMouseY = settings.invertMouse;
  game.input.settings.invertPadY = settings.invertPad;
  game.input.settings.mouseSensitivity = settings.sensitivity;
  game.comms.voiceEnabled = settings.voice;
  game.audio.music.enabled = settings.music;
  game.audio.setVolumes(0.9, settings.music ? 0.32 : 0);
  save('veil.settings', settings);
}

const bindCheck = (id: string, key: 'voice' | 'music' | 'invertMouse' | 'invertPad') => {
  const el = $<HTMLInputElement>(id);
  el.checked = settings[key];
  el.addEventListener('change', () => {
    settings[key] = el.checked;
    applySettings();
  });
};
bindCheck('opt-voice', 'voice');
bindCheck('opt-music', 'music');
bindCheck('opt-invert-mouse', 'invertMouse');
bindCheck('opt-invert-pad', 'invertPad');
const sens = $<HTMLInputElement>('opt-sens');
sens.value = String(settings.sensitivity);
sens.addEventListener('input', () => {
  settings.sensitivity = Number(sens.value);
  applySettings();
});
applySettings();

const show = (id: string, on: boolean) => $(id).classList.toggle('visible', on);

function begin(checkpoint: number): void {
  game.audio.init();
  game.audio.music.start();
  applySettings();
  show('title', false);
  show('pause', false);
  show('debrief', false);
  game.startMission(checkpoint);
  game.input.requestPointerLock();
}

$('launch').addEventListener('click', () => begin(0));
$('resume').addEventListener('click', () => game.resume());
$('restart').addEventListener('click', () => begin(0));
$('restart2').addEventListener('click', () => begin(0));
$('retry').addEventListener('click', () => begin(game.checkpoint));

game.onPauseChange = (paused) => show('pause', paused);

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
  const pay = result === 'victory' ? 8000 + kills * 1500 : 0;
  $('debrief-title').textContent = result === 'victory' ? 'Kestrel Station holds' : 'Signal lost';
  $('debrief-stats').innerHTML = [
    ['KILLS', String(kills)],
    ['ACCURACY', `${acc}%`],
    ['TIME', `${minutes}:${seconds}`],
    ['PAYMENT', `${pay.toLocaleString()} cr`],
  ]
    .map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v}</div></div>`)
    .join('');
  const choice = $('debrief-choice');
  choice.innerHTML = '';
  $('retry').style.display = result === 'victory' ? 'none' : '';
  if (result === 'victory') {
    campaign.credits += pay;
    save('veil.campaign', campaign);
    const options: [Campaign['allegiance'], string, string][] = [
      ['combine', 'Dock with the Sovereign Dawn', 'Commander Tessaine and the Helion Combine. Money, ships and questions you are told not to ask.'],
      ['drift', 'Meet Mother Sorrel', 'The Drift Union. Fewer credits, more friends, and a story about that carrier.'],
    ];
    for (const [id, title, desc] of options) {
      const b = document.createElement('button');
      b.innerHTML = `${title}<small>${desc}</small>`;
      if (campaign.allegiance === id) b.classList.add('chosen');
      b.addEventListener('click', () => {
        campaign.allegiance = id;
        save('veil.campaign', campaign);
        for (const el of choice.querySelectorAll('button')) el.classList.remove('chosen');
        b.classList.add('chosen');
        note.textContent = `Choice recorded. Credits: ${campaign.credits.toLocaleString()} cr. The branching campaign, hangar and shop come next. This build ends here.`;
      });
      choice.appendChild(b);
    }
    const note = document.createElement('p');
    note.textContent = `Credits banked: ${campaign.credits.toLocaleString()} cr. Two offers are waiting.`;
    choice.appendChild(note);
  }
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
game.onTitleConfirm = () => begin(0);
