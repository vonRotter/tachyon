# Veil Reach (working title)

A fast, colourful space-combat game in the spirit of *Tachyon: The Fringe*, built with three.js
and TypeScript. This is the first vertical slice: one mission, one flyable ship, a station and a
carrier to dodge through, AI pursuers and the slide mechanic.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Requires Node 20+ and a browser with WebGL 2 (any current Chrome, Edge, Firefox or Safari).

## What is in the slice

- **Mission "Cold Guns"** at Kestrel Station: three Red Wake raider waves ending with a gunship,
  radio drama between the station, the Helion Combine carrier and the Drift Union, and a closing
  choice of which faction to meet. The choice and earned credits are saved in `localStorage`.
  Checkpoints let you retry a wave after dying.
- **Arcade flight with slide.** Hold slide to keep your momentum while you spin to aim anywhere.
  The velocity marker on the HUD shows where you are actually going.
- **Flying through structures.** The station has a habitat ring, braced spokes, solar wings and
  two hollow lattice towers you can fly *inside*. The carrier has a broadside hangar tunnel and
  an open cargo spine. Collision uses swept spheres against analytic shapes, so fast ships do not
  tunnel through thin struts.
- **Pursuers fly the same geometry.** AI uses sphere-cast obstacle avoidance under the same flight
  model as you, and missiles explode on structures. Dragging either through a tower works.
- **Procedural everything.** Ship models, station, nebula sky, ringed gas giant, every sound
  effect and the synthwave score are generated in code. No asset files.
- **Controls:** mouse and keyboard, plus Xbox and PlayStation gamepads (standard mapping).
  Optional spoken radio uses the browser's built-in text-to-speech. It is off by default and the
  voice quality depends on the operating system.

## Controls

| Action | Mouse & keyboard | Gamepad |
|---|---|---|
| Pitch / yaw | Mouse (virtual stick, **X** recentres) | Right stick |
| Roll | Q / E | Left stick X |
| Throttle | W / S (**Z** matches target speed) | Left stick Y (L3 matches speed) |
| Strafe | A / D, R / F | D-pad |
| Boost | Shift | A / Cross |
| Slide | Space (hold) | LT / L2 (hold) |
| Guns | Left click | RT / R2 |
| Missile (needs lock) | Right click or G | RB / R1 |
| Target nearest / next | T / Tab | Y (Triangle) / LB (L1) |
| Camera | C | View/Share or R3 |
| Pause | Esc / P | Start/Options |

## Code layout

```
src/
  core/      math helpers, input (mouse/keyboard/gamepad), procedural audio and music
  world/     analytic colliders + spatial hash, structure builder, station/carrier/asteroids, sky
  entities/  ships (flight model), ship classes (data), models, factions, weapons, AI
  fx/        particle system, explosions, sparks, trails, flashes
  ui/        canvas HUD, comms panel with portraits and optional speech
  game/      Game (loop, collisions, camera, mission API) and the mission script
scripts/
  smoke.mjs  headless Chromium run of the whole mission on autopilot, with screenshots
```

Ship stats live in `src/entities/shipClasses.ts` as plain data, ready for a hangar and shop.
Mission scripts are `async` functions that `await g.say(...)`, `g.wait(...)` and
`g.until(...)` (see `src/game/mission.ts`).

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

- Hangar and shop between missions: buy the Lancer heavy fighter, upgrade guns, shields, engines
- Branching campaign that follows the Combine or Drift choice, with consequences carried forward
- Countermeasures, more weapon types, energy routing between shields, guns and engines
- More locations: derelicts, a mining rig, a Combine shipyard
- Floating origin, needed once maps grow beyond about 10 km
