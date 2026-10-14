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

- **Prologue, "The Tamsin Run"** (the Ashfall): before you own a ship, Rook flies escort for a
  small independent caravan in a borrowed Kite. It starts with an optional flight school (asked
  before launch: Dace walks you through steering, boost, slide, guns, missiles, flares, power and
  the scanner). The first Wake raid is beaten off, Vey's Fangs can be held, and then a Wake
  battlecruiser and carrier jump in with fighters and a cloud of drones. It cannot be won and you
  cannot die in it: the Kite is crippled, the caravan taken, and the Kestrel militia find you
  drifting. You wake on Kestrel with your escort fee and the Kite's insurance, and buy your first
  ship. Skippable from the pause menu.
- **Hangar and shop** between missions. A new campaign starts with 40,000 cr and a choice of
  first ship (light hulls only); whatever it does not cost is yours to spend. Your ship hovers on a turntable in a
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
  | Independent yards | Anyone | Rounded nacelles, rings, hoops, bright paint | Balanced, forgiving | Warden, Kite, Lancer, Corsair (the Wren and Talon are militia and Patrol only) |
  | Helion Combine | Combine pilots | Symmetry, bevelled wedges, crescent blades, ivory and gold | Fast-recharging shields, energy, long guns; thin hulls | Sabre, Halberd |
  | Drift Union | Drift pilots | Asymmetric, exposed frames and rings, bolted-on pods | Heavy armour, deep magazines, many hardpoints; weak shields | Gannet, Bulwark |
  | Red Wake | Wake pilots (no Wake path yet) | Hooked blades, forward fangs, crimson over black | Speed and short, hard-hitting guns; fragile | Fang |
  | Reach Patrol | Nobody | Broad white wedge, outrigger booms, lightbar | Tough all-rounder | Interdictor |

  A faction's yard stays hidden until you work for that faction and have flown a contract for
  it. Faction hulls appear in the database once you have met one. Ships you own keep your
  colours with their yard's trim. The Talon takes after the Babylon 5 Starfury (four slanted
  wings, engine pods that thrust both ways, so it strafes hard); the Wren, Kestrel's tiny
  station-defence fighter, after the Jedi starfighter. Unmanned combat drones are small, fast
  and die to a single burst; every side flies them, and you can carry two in a drone bay.
- **Gunships** are minibosses nobody sells: one per faction, each in its yard's style. The Wake's
  Mawbreaker (Cold Guns, the prologue, bounty jobs), the Combine's Sunspear (long-range guns and
  fast shields; the Bastion and the Gilded Cage), the Drift's Ironbark (an armoured tanker with a
  missile rack; Last Light), the Patrol's Warrant (Okafor's ship) and Kestrel's Bulldog (with the
  militia at the Accord, and on ore guard). The Fang is the Wake's better fighter: it leads their
  hunter packs from the first mission on.
- **Battlecruisers** carry a main battery of four triple-barrelled turrets (a superfiring pair
  forward, one aft, one under the keel) for fighting other capital ships, with point-defence
  guns down both flanks for fighters.
- **Civilian ships:** container ships, hospital ships, cruise liners and asteroid miners (a
  drill cutter with crane arms, ore silos and a smelter stack), built
  with the same bevelled-block language as everything else. They fly the traffic lanes.
- **Ship database** in the hangar: fills in as you meet ships in missions (fighters, gunships,
  capital ships, civilian hulls, installations), with facts, a description, and a turntable model
  you can repaint in each operator's colours.
- **Standard or hardcore.** A new campaign asks. On standard, dying costs 2,500 cr for the tug
  that recovers you and the repairs, and you retry from a checkpoint with the hull, missiles,
  bounties and bonuses you had when you reached it. On hardcore you have one life: die, and the
  campaign is over; a failed mission starts again from the beginning (no checkpoints).
- **Star map and travel.** The Reach is eight systems joined by jump gates (hangar, *Star map*
  tab). Some gates are closed to you: the Red Wake keep the Gallows shut, Drift pickets turn
  Combine pilots away from Haven, and Bastion's gate flags Drift transponders. Some are
  temporary: a contract in a closed system opens a fleet jump corridor for that contract, and the
  Rookery's gate opens only when the Baron invites you. When a contract is in another system,
  launching asks whether to *fly there* (each leg is a short flight from the station to the gate;
  about one in three has Wake gate-jackers waiting, with bounties) or *jump straight in*. After a
  mission you stay docked in that system, unless every gate out is closed to you, in which case
  you are ferried back to Kestrel.
- **Changing sides by flying away.** Between chapters, the star map offers a flight to the other
  side's home (Haven or Bastion) to ask them in. They let you through their gate, your old side
  takes back every hull its yards built, and there is no way back. The dramatic switch during
  the Accord still exists too.
- **Carrier ride.** The finales start with you parked in your flagship's hangar as she comes out
  of the jump and closes on the target, the system sliding past the hangar mouth while the
  briefing plays; then the catapult throws you out.
- **Story contracts are flown once.** Odd jobs come from a job board of three that is dealt
  again after each story chapter, and you have time for two side activities (odd jobs or the
  Baron's arc) before the next chapter will not wait.
- **Scanner** (N): steps through everyone in the system, ships, capital ships and stations alike,
  nearest first, with an info card (class, faction and stance, distance, speed, hull and
  shields, bounty). It is separate from the combat target, but **Y** targets the scanned ship
  (friend or foe) and **Z** matches its speed while the scanner is on it. Killing your target
  moves your lock to the next hostile.
- **Enemies leave for a reason.** When a fight ends, the losers break off, burn out and jump
  rather than vanishing.
- **Docking** picks the open bay you are facing; press the dock key again on the approach to
  switch to another open bay.
- **Difficulty** (Options): Easy, Normal or Hard scales the damage you take and how sharply
  hostile pilots and gunners fly.
- **Test cheat:** Ctrl+P toggles unlimited credits, opens every yard, lists every contract and
  adds a side switch above the contracts so both campaign paths can be tried.
- **Credits** come from contract pay plus a bounty per kill. Repeat runs of a mission pay 40%.
  The campaign (credits, ships, fits, faction choice) is saved in `localStorage`.
- **Weapons.** Pulse, rapid, mass driver and scatter guns. Seeker missiles, unguided rocket
  pods, swarm packs and slow, heavy torpedoes.
- **Hulls come unarmed.** A ship you buy has empty weapon slots; the guns salvaged from the
  prologue Kite are fitted to your first ship. You cannot launch without a weapon. Slow hulls get
  more hull, shields and missiles (up to +50%) to make up for what speed and turn rate give the
  nimble ones.
- **Flares.** Every ship has two built-in flares that come back every 20 s; the flare dispenser
  adds ten. AI missiles have a narrower seeker than yours: a hard break across the nose at the
  last moment shakes them.
- **Equipment.** Flares, an emergency shield cell, repair drones, an afterburner tank, an
  extended magazine, a targeting computer, a docking computer and a drone bay (two combat drones
  fly on your wing, attack your target and anything shooting at you, and are replaced each sortie).
- **Power routing.** Send spare power to shields, guns or engines.
- **Docking.** Request clearance and fly the holographic gates into a bay; the clamps take over
  once you are inside and slow enough. Kestrel Station has a hangar on its hub, and the Combine
  carrier lands you inside its hangar tunnel.
- **Campaign.** Eleven chapters per side. The hangar shows the chapters you have flown and the next
  one, never what lies ahead, and announces the final mission when it comes. Shaped after the
  old campaign games (TIE Fighter's loyalty missions with a traitor underneath, FreeSpace 2's
  beacons and broadsides): first you prove yourself while things do not quite add up, then you
  are told the plan, then you are the one who makes it possible.

  | # | Combine | Drift Union |
  |---|---|---|
  | 1 | Cold Guns (Kestrel) | Cold Guns (Kestrel) |
  | 2 | *Credentials*: relief transports for the Dawn; a Drift salvager wants a look inside | *Credentials*: ore haulers through the Ashfall; Combine customs want a look inside |
  | 3 | Launch Order (the Gallows) | Flotsam (the Ashfall) |
  | 4 | *Loose Ends*: kill the Wake courier carrying a copy of the records | *Loose Ends*: get the Wake courier to a Drift frigate |
  | 5 | *Free Port*: a sealed case for the Combine trade office at Saltmarket | *Free Port*: fever vaccine for the Saltmarket clinic |
  | 6 | Open Channel (Vantage) | Open Channel (Vantage) |
  | 7 | *Sealed Orders*: hold Bastion's drydock against a Drift raid, then hear the plan | *Sealed Orders*: hold Haven's water tugs against a Combine raid, then hear the plan |
  | 8 | *Keys to the Door*: tap Kestrel's defence relays unseen | *Keys to the Door*: copy the Sovereign Dawn's hangar codes unseen |
  | 9 | The Accord (Kestrel) | The Accord (Kestrel) |
  | 10 | *Lantern*: lay jump beacons at Haven and hold them for the fleet | *Lantern*: lay jump beacons at Bastion and hold them for the Long Patience |
  | 11 | Last Light (Haven) | The Bastion |

  Story contracts are flown once. In *Credentials* you wave inspectors off by flying in their
  faces; shooting them is an incident.
- **Side jobs** for anyone, whichever side you fly for, paid in full every time: a Reach Patrol
  bounty hunt in the Ashfall alongside two Patrol Interdictors, a convoy run bringing container
  ships in to Vantage, and guarding Kestrel's ore barges from Wake strip-miners.
- **Side arc: "The Scarlet Baron".** Baron Rafe Delacourt is a former Combine ace turned gentleman
  pirate who flies a crimson fighter with a lopsided X of wings and engine pods at the
  tips. He announces himself, never fires on the helpless or on ejected pilots, and robs
  only those who can afford it. He transmits on an old set that crackles like a gramophone,
  with his wing of Rosebuds and the irrepressible Petal. Four parts, each ending on a choice:
  1. *A Rose for the Lady* (Vantage): he robs the liner you escort. Hold your fire and watch a
     civilised robbery, or fight him off.
  2. *Pistols at Dawn* (Ashfall): a duel at the dead destroyer, guns only, or the Reach Patrol's
     trap. Fly to the one you choose. Beat him fairly and he yields: spare him or shoot him down.
  3. *The Gilded Cage* (Bastion): his heist on a Combine treasury barge. Fire on the escorts to
     ride with him, on his Rosebuds to stop him, or just watch. If you trapped him, he comes for
     the barge, and for you.
  4. *Last Dance* (the Rookery, his hideout in a broken liner with a chapel on its back): as his
     friend you defend it against the Red Wake and he gives you his spare fighter, the Scarlet
     Rose; as his enemy you break his defences with the Patrol and duel him, then decide whether
     he lives.
- **Odd jobs**, civilian one-shots for cash with no story consequences: *The Ring Run*, the dock
  crews' race round Kestrel against three rivals (over and under the spinning habitat ring,
  through the rocks, through the battlecruiser's hangar tunnel and a loop over her back; paid by
  finishing position), a search for escape pods drifting in the
  Ashfall before their air runs out (hooked pods trail behind you on cables and slow you down,
  until you deliver them to a Patrol transport), and a salvage race against Wake scavenger tugs in Vantage's
  rock ring. The hangar groups contracts into story, side arcs and odd jobs.
- **Mission "Cold Guns"** at Kestrel Station: three Red Wake raider waves ending with a gunship,
  radio drama between the station, the Helion Combine and the Drift Union. You choose a side by
  where you land: Kestrel's bay 1 (Drift Union) or the Sovereign Dawn (Combine). Checkpoints let
  you retry a wave after dying.
- **Mission "Flotsam"** (Drift side) in the Ashfall wreck field: drift into a Combine carrier
  disguised as debris (the stream carries you beside a big rock; keep the throttle at zero), land in its hangar, grab the records, then run
  for the Drift battlecruiser through the wreckage with fighters and the carrier's guns behind
  you. Swap ships on landing, then help hold off the strike.
- **Mission "Open Channel"** (either side) at Vantage, a research station with the only dish
  array that reaches every station in the Reach. The Drift broadcast the Combine's transfer
  records from it: hold the array against drones, Sabres and a frigate until the upload
  finishes, or, flying for the Combine, silence its three transmitters before it does.
- **Mission "Free Port"** (either side) at Saltmarket, the free port of the Reach: three
  stacked octagonal drums with 48 hangar bays, four piers where container ships tie up, and the
  harbourmaster's tower on top. Shuttles, haulers and ore cutters launch from and land in the
  bays all the time, liners circle on the outer lanes, and Reach Patrol flights keep order
  (forty metres a second in the bay lanes, guns cold inside five kilometres, said over the radio
  if you forget). You land your cargo in bay 18; while you are still on the pad the Red Wake
  jump in with two Reavers, salvage cruisers built from captured ore haulers, and the port
  panics: arrivals turn back, every bay launches, the moored ships cast off. Stop three waves of
  boarding craft before they reach the bays while the cruisers shell the port's batteries,
  then silence the cruisers' guns. Lose every battery, or let three boarders in, and the port
  yields.
- **Mission "The Accord"** (either side) at Kestrel: the Combine and the Drift sign a
  ceasefire, and each brings something it should not. The Combine's delegation shuttles carry
  marines; the Drift's gift hauler carries mining charge meant for the Sovereign Dawn and the
  dock crews beside it. Halfway through you learn what you are escorting. See it through and
  stay, or turn your guns on your own convoy and change sides in the middle of the fight.
- **Finale, Combine side: "Last Light"** at Haven, the Drift Union's home: an asteroid with old
  hulls driven into it like nails and half-built rings on spokes. Break the Drift screen, then
  silence the Long Patience's guns alongside the Sovereign Dawn's broadsides until Mother
  Sorrel strikes her colours. Partway through, a hospital ship leaves Haven and Tessaine orders
  it burned.
- **Finale, Drift side: "The Bastion"** at the Combine's fortress: a symmetric stepped core in
  ivory and gold, a command spire with a crescent blade, four arms ending in shield pylons and a
  drydock with a destroyer half built inside. Bring down the pylons, then silence the batteries
  with the Long Patience's broadsides behind you. If you freed Kestrel, its militia fly with you.
- **Changing sides** happens only at moments like that (also at the Gallows, if you defend the
  habitat). The faction you leave takes its ships back: weapons fitted to them go to storage,
  upgrades go with the hull, and if nothing is left Kestrel lends you a Kite.
- **Capital ships** built from bevelled blocks: an arrowhead frigate, a hammerhead destroyer
  with a through-bay, a tuning-fork carrier you land inside, and a bladed battlecruiser with triple-barrelled main turrets and point defence.
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
  two hollow lattice towers you can fly *inside*. The battlecruiser has a broadside hangar tunnel
  you can fly through. Collision uses swept spheres against analytic shapes, so fast ships do not
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
| Throttle | W / S (**Z** matches the scanned ship's speed, or the target's). Below zero it reverses at a quarter of top speed; it stops at zero first, so press S again to back up | Left stick Y (L3 matches speed) |
| Strafe | A / D, R / F | D-pad |
| Boost | Shift | A / Cross |
| Slide | Space (hold) | LT / L2 (hold) |
| Guns | Left click | RT / R2 |
| Missile (most types need a lock) | Right click or G | RB / R1 |
| Drop flare | V | B / Circle |
| Scan contacts (everyone in the system, nearest first; info card) | N | |
| Target the scanned ship (friend or foe) | Y | |
| Power: balanced / shields / guns / engines | 1 / 2 / 3 / 4 (press again to balance) | R3 cycles |
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
