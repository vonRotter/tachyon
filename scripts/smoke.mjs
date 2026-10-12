// Headless smoke test: builds nothing, serves dist/ with `vite preview`, loads the game in
// Chromium (SwiftShader), plays the mission on autopilot and saves screenshots to scripts/out.
// Usage: npm run build && npm run smoke
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4179;
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

await waitForServer();
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});

await page.goto(`http://localhost:${PORT}/?quality=${process.env.QUALITY ?? "high"}&dynres=0`);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}01-title.png` });

await page.click('#launch');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}02-launch.png` });

const report = async (label) => {
  const s = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    return {
      state: g.state,
      checkpoint: g.checkpoint,
      missionTime: Math.round(g.missionTime),
      ships: g.ships.filter((s) => s.alive).map((s) => `${s.faction}:${s.name}`),
      player: p ? { hull: Math.round(p.hull), shields: Math.round(p.shields), kills: p.kills, alive: p.alive } : null,
      particles: g.fx.particles.alive,
      fps: Math.round(g.fps),
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

// Fast-forward the intro dialogue, then let the autopilot fight.
await page.evaluate(() => {
  const g = window.__game;
  g.player.invulnerable = true;
  g.enableAutopilot(0.95);
  return g.simulate(40);
});
await report('after intro');
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}03-wave1.png` });

// Play until the debrief screen (or give up after ~10 minutes of game time).
let finalState = null;
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => window.__game.simulate(20));
  await page.waitForTimeout(300);
  finalState = await report(`t+${(i + 1) * 20}s`);
  if (i % 3 === 0) await page.screenshot({ path: `${OUT}04-combat-${i}.png` });
  if (finalState.state === 'debrief') break;
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}06-debrief.png` });
const reachedDebrief = finalState?.state === 'debrief';
console.log(reachedDebrief ? 'mission completed on autopilot' : 'mission did NOT complete on autopilot');

// Restart at the gunship checkpoint for a look at the big ship.
if (reachedDebrief) await page.click('#restart2');
await page.evaluate(() => {
  const g = window.__game;
  g.startMission(3);
  g.player.invulnerable = true;
  g.enableAutopilot(0.95);
  return g.simulate(14);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}07-gunship.png` });

// Fly the player through the lattice tower to eyeball the tunnel run.
await page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  if (!p || !p.alive) return;
  p.ai = null;
  p.placeAt({ x: 0, y: 160, z: 0, clone() { return this; } }, { x: 0, y: 400, z: 0 }, 90);
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}05-tower.png` });

await report('final');
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
stop();
process.exit(errors.some((e) => e.startsWith('pageerror')) ? 1 : 0);
