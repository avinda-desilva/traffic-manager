# Traffic Manager

A small physics game in the style of the [Anatomy](https://github.com/wheresryan22/anatomy) skill: a model crossroads on a base plate, drawn as crafted isometric SVG, where you run the boom gates and keep traffic moving without letting the two roads meet.

![The board in demo mode](docs/screenshot.png)

Open `game/traffic-manager.html` in a browser (or `game/traffic-manager-dark.html`). It is one standalone file with no dependencies.

## How to play

The board starts in a demo that runs a safe two-phase plan. Press **Space** or tap the board to start a shift. Every gate starts shut.

| Input | What it does |
|---|---|
| Tap or click a road, a gate or a lever | Swing that road's gate open or shut |
| `←` `↑` `→` `↓` (or `1`–`4`) | West, north, east, south gate |
| `Space` | Start a shift; during a shift, shut every gate |
| `P` | Pause |

The shift ends after **3 crashes**, or when **6 vehicles** are queued off the board on one road (the meter by each entry fills up). The readout counts the vehicles you got through. Demand rises through the shift and swings between the two roads every 80 s, so a fixed rhythm falls behind.

## The physics

Everything the board shows comes from one pure model in `src/model.mjs`, in metres and seconds, stepped at 120 Hz.

- **Drivers** follow the [Intelligent Driver Model](https://en.wikipedia.org/wiki/Intelligent_driver_model): free-road acceleration `a·(1 − (v/v₀)⁴)` and a braking term from the gap to whatever is ahead. Cars, vans and buses have their own length, mass, acceleration, comfortable braking and headway.
- **Red lamp.** When a gate shuts, each driver asks whether they can stop a metre short of the line at 4 m/s² or less. Those who can, stop. Those who can't (the dilemma zone) run the line.
- **The arm** has a detector: it won't come down while anything is under it, and it takes 1.4 s to swing.
- **Drivers trust the gates.** They follow the car ahead, brake for wrecks, and yield to a vehicle stopped across their path only after a 0.6 s reaction time and only if it arrived first. They don't watch the other road, so if you open both roads at once, they meet.
- **Crashes** are oriented-box collisions resolved with an impulse at the contact point: momentum is conserved, with restitution 0.15 and a friction impulse that sets the wrecks spinning. Wrecks slide on tyre friction (μ 0.7 sideways, 0.25 rolling), block the lane, then fade away 4 s after they stop.

`npm test` checks these: stopping distance and braking, the dilemma zone, the arm's detector and timing, momentum conservation, crashes and wrecks, queueing behind a wreck, a four-way standoff in the box clearing, gridlock under demand, a crash-free demo, and determinism per seed.

## Build

Requires Node 20.10 or later. There is nothing to install.

```sh
npm run build   # writes game/traffic-manager.html and game/traffic-manager-dark.html
npm test
```

In the page, `window.trafficManager` exposes the live game and the model, which helps when scripting a scene from the console.

## Layout

| Path | What it is |
|---|---|
| `src/model.mjs` | The simulation: lanes, gates, drivers, collisions, demand, the demo autopilot. No DOM. |
| `src/parts.mjs` | Parts that move or are rebuilt live: vehicles, boom gates, the lever frame. |
| `src/scene.mjs` | The static board (plate, roads, islands, shop, trees, lampposts, meters) and the painter's-order sort. |
| `src/live.js` | The page: game loop, input, redraws and depth re-sorting. |
| `build.mjs` | Inlines the kit and modules into standalone pages, with the first frame pre-rendered. |
| `vendor/anatomy/kit/` | `iso-kit.mjs` and `lathe.mjs` from the Anatomy skill (MIT), unchanged. |
| `.claude/hooks/session-start.sh` | Installs the Anatomy skill into `~/.claude/skills` at the start of each Claude Code cloud session. |

## Ideas to take it further

- **Turning traffic.** Give some drivers a left or right turn through the box (an arc path instead of a straight lane), so a single open road can conflict with itself.
- **Pedestrians** on the crossings, released by a fifth lever.
- **Emergency vehicles** that score double and can't be held for long.
- **Night shifts.** Use the skill's `kit/gl.mjs` to add lamp light and headlight cones as a WebGL layer in the same isometric camera.
- **Levels.** A T-junction, a roundabout, or two linked crossroads with a green wave between them.
