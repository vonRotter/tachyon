# Veil Reach (working title)

A fast, colourful space-combat game in the spirit of *Tachyon: The Fringe*, built with three.js
and TypeScript. Fly contracts, earn credits, and spend them in the hangar on ships, upgrades,
weapons and equipment.

## Play it

Live build: **https://vonrotter.github.io/tachyon/** (deployed by GitHub Actions on every push;
see `.github/workflows/deploy-pages.yml`).

Pages must use **Settings → Pages → Source: GitHub Actions**. "Deploy from a branch" publishes
the raw TypeScript source, which browsers cannot run, and shows a blank page. No custom domain,
Jekyll or static-HTML template is needed.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Requires Node 20+ and a browser with WebGL 2 (any current Chrome, Edge, Firefox or Safari).

## What is in the game

- **Hangar and shop** between missions. A new campaign starts with 80,000 cr and a choice of
  first ship; whatever it does not cost is yours to spend. Your ship hovers on a turntable in a
  station bay (drag to look around). Ships differ in hull, shields, speed, turn rate, weapon
  slots, equipment slots, energy and missile magazine.
  Upgrades (three tiers of six systems) stay with the hull they are installed on. Each weapon
  slot takes a gun or a missile launcher (launchers only on ships with a magazine); weapons you
  remove go to storage and can be fitted to any ship. Hovering anything previews it on the stat
  bars, and a faint bar shows each stat with every upgrade installed.
- **Shipyards and faction design.** Each yard builds to its own principle, so a ship's maker
  shows in its silhouette (the idea comes from EVE Online's racial ship lines):

  | Yard | Who can buy | Look | Doctrine | Ships |
  |---|---|---|---|---|
  | Independent yards | Anyone | Rounded nacelles, rings, hoops, bright paint | Balanced, forgiving | Kite, Warden, Lancer, Corsair |
  | Helion Combine | Combine pilots | Symmetry, bevelled wedges, crescent blades, ivory and gold | Fast-recharging shields, energy, long guns; thin hulls | Sabre, Halberd |
  | Drift Union | Drift pilots | Asymmetric, exposed frames and rings, bolted-on pods | Heavy armour, deep magazines, many hardpoints; weak shields | Gannet, Bulwark |
  | Red Wake | Wake pilots (no Wake path yet) | Hooked blades, forward fangs, crimson over black | Speed and short, hard-hitting guns; fragile | Fang |
  | Reach Patrol | Nobody | Broad white wedge, outrigger booms, lightbar | Tough all-rounder | Interdictor |

  Locked hulls can still be browsed and previewed in their yard's paint. Ships you own keep your
  colours with their yard's trim.
- **Test cheat:** Ctrl+P toggles unlimited credits and opens every yard.
- **Credits** come from contract pay plus a bounty per kill. Repeat runs of a mission pay 40%.
  The campaign (credits, ships, fits, faction choice) is saved in `localStorage`.
- **Weapons.** Pulse, rapid, mass driver and scatter guns. Seeker missiles, unguided rocket
  pods, swarm packs and slow, heavy torpedoes.
- **Equipment.** Flares, an emergency shield cell, repair drones, an afterburner tank, an
  extended magazine, a targeting computer and a docking computer.
- **Power routing.** Send spare power to shields, guns or engines.
- **Docking.** Request clearance and fly the holographic gates into a bay; the clamps take over
  once you are inside and slow enough. Kestrel Station has a hangar on its hub, and the Combine
  carrier lands you inside its hangar tunnel.
- **Mission "Cold Guns"** at Kestrel Station: three Red Wake raider waves ending with a gunship,
  radio drama between the station, the Helion Combine and the Drift Union. You choose a side by
  where you land: Kestrel's bay 1 (Drift Union) or the Sovereign Dawn (Combine). Checkpoints let
  you retry a wave after dying.
- **Mission "Flotsam"** (Drift side) in the Ashfall wreck field: drift into a Combine carrier
  disguised as debris without moving too much, land in its hangar, grab the records, then run
  for the Drift battlecruiser through the wreckage with fighters and the carrier's guns behind
  you. Swap ships on landing, then help hold off the strike.
- **Capital ships** built from bevelled blocks: an arrowhead frigate, a hammerhead destroyer
  with a through-bay, a tuning-fork carrier you land inside, and a bladed battlecruiser.
- **Mission "Launch Order"** (Combine side) at the Gallows, a Red Wake base: wait in the
  carrier's hangar tunnel while flights catapult out ahead of you, silence twelve turrets and a
  comms relay, then decide the fate of the habitat module. The surrendered Wake fight again if
  you fire on their homes, and fight beside you if you turn on the Combine.
- **Enemy tactics differ by faction:** the Red Wake swarm you at close range, Combine pilots hold
  off at about 600 m and break away before you can close, and Drift pilots work round to your
  flank.
- **Arcade flight with slide.** Hold slide to keep your momentum while you spin to aim anywhere.
  Pull the throttle below zero to back up at a quarter of top speed.
  The velocity marker on the HUD shows where you are actually going.
- **Flying through structures.** The station has a habitat ring, braced spokes, solar wings and
  two hollow lattice towers you can fly *inside*. The carrier has a broadside hangar tunnel and
  an open cargo spine. Collision uses swept spheres against analytic shapes, so fast ships do not
  tunnel through thin struts.
- **Pursuers fly the same geometry.** AI uses sphere-cast obstacle avoidance under the same flight
  model as you, and missiles explode on structures. Dragging either through a tower works.
- **Procedural everything.** Ship models, station, nebula sky, ringed gas giant, every sound
  effect and the synthwave score are generated in code. No asset files.
- **Moving structures and traffic.** The habitat ring (with its spokes and docking arms) turns
  slowly for spin gravity, the sensor dish sweeps a radar boom, and two bulk haulers fly loops
  through the area. All of it collides.

## Graphics

Pick Auto, Low, Medium or High on the title screen. Auto guesses from the GPU name (integrated
GPUs get Medium, dedicated ones High), and dynamic resolution lowers the render scale when frame
times run long.

| Feature | Low | Medium | High |
|---|---|---|---|
| MSAA (on the post-processing target) | off | 4x | 4x |
| Sun shadows (box follows the player) | off | 2048, 450 m | 4096, 700 m |
| Procedural hull detail (plates, seams, grime, windows) | off | on | on |
| Lens flare | off | on | on |
| Resolution cap (device pixel ratio) | 1.0 | 1.25 | 1.5 |

Always on: reflections from a prefiltered environment map built from the procedural sky, bloom,
gas clouds, a lens pass (vignette, grain, chromatic aberration and radial blur while boosting),
shield ripples at the impact point, fireballs with burning debris, hologram signs.

For testing, `?quality=high&dynres=0` forces a preset and disables dynamic resolution.

Hull detail is generated in a shader (`src/world/hullMaterial.ts`), projected from three sides in
object space so it stays attached to moving ships. No texture files are involved.
- **Controls:** mouse and keyboard, plus Xbox and PlayStation gamepads (standard mapping).
- **Voices:** radio dialogue is pre-recorded with Kokoro-82M, an open-weight speech model, and
  played through a different radio sound per faction (see [Radio voices](#radio-voices)).

## Controls

Press **Esc** in flight for the pause menu (options, controls, restart, quit). Every keyboard
and mouse action can be rebound under **Controls**; bindings are saved in the browser. The
table below lists the defaults.

| Action | Mouse & keyboard | Gamepad |
|---|---|---|
| Pitch / yaw | Mouse aim: point the circle, the ship follows (**X** recentres). Virtual stick available in Options | Right stick |
| Roll (the camera rolls with the ship) | Q / E | Left stick X |
| Throttle | W / S (**Z** matches target speed). Below zero it reverses at a quarter of top speed; it stops at zero first, so press S again to back up | Left stick Y (L3 matches speed) |
| Strafe | A / D, R / F | D-pad |
| Boost | Shift | A / Cross |
| Slide | Space (hold) | LT / L2 (hold) |
| Guns | Left click | RT / R2 |
| Missile (most types need a lock) | Right click or G | RB / R1 |
| Drop flare | V | B / Circle |
| Power to shields / guns / engines / balanced | 1 / 2 / 3 / 4 (press again to balance) | R3 cycles |
| Request docking (again: docking computer) | B | X / Square |
| Target nearest / next | T / Tab | Y (Triangle) / LB (L1) |
| Camera | C | View/Share |
| Pause | Esc / P | Start/Options |

## Code layout

```
src/
  core/      math helpers, input (mouse/keyboard/gamepad), procedural audio, music and radio
  world/     analytic colliders + spatial hash, structure builder, station/carrier/asteroids, sky
  entities/  ships (flight model), ship classes (data), models, factions, weapons, AI
  fx/        particle system, explosions, sparks, trails, flashes
  ui/        canvas HUD, comms panel with portraits and recorded radio voices
  game/      Game (loop, collisions, camera, mission API) and the mission script
scripts/
  smoke.mjs  headless Chromium run of the whole mission on autopilot, with screenshots
  voices/    pre-renders the radio dialogue (Python, Kokoro-82M)
```

Ship stats live in `src/entities/shipClasses.ts` as plain data, ready for a hangar and shop.
Mission scripts are `async` functions that `await g.say(...)`, `g.wait(...)` and
`g.until(...)` (see `src/game/mission.ts`).

## Radio voices

Every `say('speaker', 'text')` line is pre-rendered to `public/voice/<hash>.mp3` and listed in
`src/ui/voiceManifest.json`. Factions differ in accent and in radio sound:

| Faction | Speakers | Voice | Radio sound |
| --- | --- | --- | --- |
| Kestrel Station | Varga, Juno, Pike | American | Plain comms band, two-tone chirp |
| Red Wake | Vey | Deep, slow | Overdriven and crackling, harsh buzz |
| Helion Combine | Tessaine | British | Wide and clean, soft chime, no static |
| Drift Union | Sorrel | British, older | Hissing old set that wavers |

The filters run at playback (`src/core/radio.ts`), so the files are clean speech. Music dips
while someone talks. After adding or changing dialogue, regenerate (needs Python 3 and ffmpeg;
the model files, about 120 MB, download on first run):

```bash
python3 -m venv .venv-voice && .venv-voice/bin/pip install -r scripts/voices/requirements.txt
.venv-voice/bin/python scripts/voices/generate.py
```

Lines without a recording show as text only, or are read by the browser's text-to-speech if
that option is on. Voice casting is the `CAST` table in `scripts/voices/generate.py`.

Model: Kokoro-82M by hexgrad, Apache License 2.0, via the `kokoro-onnx` package (MIT).

## Testing

```bash
npm run typecheck
npm run build && npm run smoke   # writes screenshots to scripts/out/
```

The smoke test runs on software rendering (SwiftShader), so its frame rate says nothing about
real GPU performance.

## Desktop build (later)

The game is a static web app, so a desktop release means wrapping `dist/` with Tauri or Electron.
That adds Steam distribution, file-based saves and a proper window. It is not needed until there
is enough game to ship.

## Next steps

- Branching campaign that follows the Combine or Drift choice, with consequences carried forward
- More locations: derelicts, a mining rig, a Combine shipyard
- Floating origin, needed once maps grow beyond about 10 km
- Optional CC0 photo textures (Poly Haven, ambientCG) as a detail layer on the hull shader
