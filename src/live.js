// The page: one loop steps the model at 120 Hz, then redraws what moved and
// re-sorts what stands up. Uses k (kit), G (lathe), M (model), PARTS, SCENE, DATA.
const P = DATA.P;
const U = M.UNIT;
const NS = "http://www.w3.org/2000/svg";
const stage = document.querySelector(".tm-stage");
const back = stage.querySelector(".tm-back");
const svg = stage.querySelector(".tm-front");
const groundLayer = back.querySelector('[data-layer="ground"]');
const haloLayer = groundLayer.querySelector("[data-halos]");
const arrivingLayer = svg.querySelector('[data-layer="arriving"]');
const pipLayer = svg.querySelector('[data-layer="pips"]');
const shadowLayer = svg.querySelector('[data-layer="shadows"]');
const sortedLayer = svg.querySelector('[data-layer="sorted"]');
const fxLayer = svg.querySelector('[data-layer="fx"]');
const readout = document.querySelector("[data-readout]");
const hint = document.querySelector('[data-corner="hint"]');
const announcer = document.querySelector(".tm-live");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const BEST_KEY = "traffic-manager-best";
const NAMES = Object.fromEntries(M.APPROACHES.map((approach) => [approach.id, approach.name]));
const HOME = [0, 0, SCENE.WIDTH, SCENE.HEIGHT];
const ARRIVE = 1.2;
const CAMERA = 0.28;

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeBest = (value) => {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {}
};

let game = null;
let mode = "demo";
let paused = false;
let selected = null;
let best = readBest();
let frame = 0;
let last = 0;
let carry = 0;
let visible = false;
let order = [];
let pips = [...svg.querySelectorAll(".tm-pip")];
let view = [...HOME];
let aim = [...HOME];
const fx = [];

// What stands up, by key: props and gates carry the tile they belong to.
const tileOfKey = (key) => {
  const match = /^(?:t(\d+):|gate-(\d+)-)/.exec(key);
  return match ? Number(match[1] ?? match[2]) : null;
};
const items = new Map();
for (const el of sortedLayer.querySelectorAll("[data-item]")) {
  const key = el.dataset.item;
  if (key.startsWith("v")) el.remove();
  else items.set(key, { el, key, box: JSON.parse(el.dataset.box), tile: tileOfKey(key) });
}
const drawn = new Map();

// The tiles drawn on the board: each one's ground, halo and meter pips, and
// the sides it was drawn joined on, so it is rebuilt only when a neighbour
// arrives.
const boards = new Map();
boards.set(0, {
  el: groundLayer.querySelector('[data-tile="0"]'),
  halo: haloLayer.querySelector('[data-halo="0"]'),
  pips: pipLayer.querySelector('[data-pips="0"]'),
  sign: groundLayer.querySelector('[data-tile="0"]').dataset.sign,
});
const arriving = [];

function demo() {
  game = M.createGame({ seed: DATA.demoSeed, demo: true });
  M.advance(game, DATA.demoLead);
  mode = "demo";
}

function start() {
  for (const entry of drawn.values()) {
    entry.el.remove();
    entry.shadow.remove();
    items.delete(entry.key);
  }
  drawn.clear();
  fx.length = 0;
  game = M.createGame({ seed: Math.floor(Math.random() * 2 ** 31) });
  resetBoard();
  mode = "play";
  paused = false;
  carry = 0;
  say("Shift started. Every gate is shut.");
}

function say(text) {
  announcer.textContent = text;
}

const node = (name, attrs = {}) => {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};

function addItem(key, svgText, box, tile, since) {
  const el = node("g", { "data-item": key });
  if (tile.index) el.setAttribute("transform", SCENE.placeOf(tile));
  el.innerHTML = svgText;
  const entry = { el, key, box, tile: tile.index };
  items.set(key, entry);
  sortedLayer.appendChild(el);
  if (since !== null) arriving.push({ el, since });
}

// Lays a tile's ground into the back drawing, in depth order, so a nearer
// tile covers the plate edge of the one behind it.
function land(tile, board) {
  haloLayer.appendChild(board.halo);
  const depth = tile.col + tile.row;
  const after = [...groundLayer.querySelectorAll("[data-tile]")].find((el) => {
    const other = game.tiles[Number(el.dataset.tile)];
    return other && other.col + other.row > depth;
  });
  groundLayer.insertBefore(board.el, after ?? null);
}

// Draws a tile that isn't on the board yet, with its props and gates, and
// rebuilds any tile whose joined sides have changed. A new tile fades in on
// the front drawing (a new tile is always nearer than the ones it joins),
// then lands in the back one.
function drawTile(tile, since = null) {
  const ground = SCENE.tileGroundSvg(game.tiles, tile);
  let board = boards.get(tile.index);
  if (!board) {
    const place = SCENE.placeOf(tile);
    board = {
      el: node("g", { "data-tile": tile.index, transform: place }),
      halo: node("g", { "data-halo": tile.index, transform: place }),
      pips: node("g", { "data-pips": tile.index, transform: place }),
      sign: null,
    };
    boards.set(tile.index, board);
    pipLayer.appendChild(board.pips);
    if (since === null) land(tile, board);
    else {
      arrivingLayer.append(board.halo, board.el);
      arriving.push({ el: board.el, since, land: () => land(tile, board) }, { el: board.halo, since }, { el: board.pips, since });
    }
    const offset = SCENE.offsetOf(tile);
    for (const prop of SCENE.tileProps(tile)) addItem(prop.key, prop.svg, SCENE.shiftBox(prop.box, offset), tile, since);
    for (const id of M.IDS) addItem(`gate-${tile.index}-${id}`, "", SCENE.shiftBox(PARTS.gateBox(id, 0), offset), tile, since);
  }
  if (board.sign === ground.sign) return;
  board.el.innerHTML = ground.body;
  board.halo.innerHTML = ground.halo;
  board.pips.innerHTML = ground.pips;
  board.sign = ground.sign;
  pips = [...svg.querySelectorAll(".tm-pip")];
}

// A new shift starts on one tile: the others come off the board and the view
// eases back in.
function resetBoard() {
  for (const [key, entry] of items) {
    if (!entry.tile) continue;
    entry.el.remove();
    items.delete(key);
  }
  for (const [index, board] of boards) {
    if (!index) continue;
    board.el.remove();
    board.halo.remove();
    board.pips.remove();
    boards.delete(index);
  }
  arriving.length = 0;
  order = [];
  drawTile(game.tiles[0]);
  aim = SCENE.viewFor(game.tiles);
}

function syncVehicles() {
  const alive = new Set();
  for (const vehicle of game.vehicles) {
    alive.add(vehicle.id);
    const body = M.bodyOf(vehicle);
    const x = body.x * U;
    const y = body.y * U;
    let entry = drawn.get(vehicle.id);
    if (!entry) {
      const el = node("g", { class: "tm-vehicle" });
      const shadow = node("path");
      entry = { el, shadow, key: `v${vehicle.id}`, th: null, x: null, y: null, wreck: false, alpha: 1 };
      drawn.set(vehicle.id, entry);
      items.set(entry.key, entry);
      sortedLayer.appendChild(el);
      shadowLayer.appendChild(shadow);
    }
    if (vehicle.wreck) {
      if (!entry.wreck || entry.th !== body.th || entry.x !== x || entry.y !== y) {
        entry.el.innerHTML = PARTS.vehicleSvg(vehicle.kind, x, y, body.th, P, { tone: "mid", halo: false });
        entry.shadow.setAttribute("d", PARTS.vehicleHaloOf(vehicle.kind, x, y, body.th, P));
        for (const el of [entry.el, entry.shadow]) el.removeAttribute("transform");
        entry.el.classList.add("tm-wreck");
      }
    } else {
      if (entry.th === null) {
        entry.el.innerHTML = PARTS.vehicleSvg(vehicle.kind, 0, 0, body.th, P, { halo: false });
        entry.shadow.setAttribute("d", PARTS.vehicleHaloOf(vehicle.kind, 0, 0, body.th, P));
      }
      const move = k.translateAlong(P, [x, y, 0]);
      for (const el of [entry.el, entry.shadow]) el.setAttribute("transform", move);
    }
    if (entry.x !== x || entry.y !== y || entry.th !== body.th) entry.screen = null;
    Object.assign(entry, { th: body.th, x, y, wreck: vehicle.wreck, box: PARTS.vehicleBox(vehicle.kind, x, y, body.th) });
    const alpha = Math.round(M.alphaOf(game, vehicle) * 100) / 100;
    if (alpha !== entry.alpha) {
      for (const el of [entry.el, entry.shadow]) {
        if (alpha >= 1) el.removeAttribute("opacity");
        else el.setAttribute("opacity", String(alpha));
      }
      entry.alpha = alpha;
    }
  }
  for (const [id, entry] of drawn) {
    if (alive.has(id)) continue;
    entry.el.remove();
    entry.shadow.remove();
    items.delete(entry.key);
    drawn.delete(id);
  }
}

const isSelected = (index, id) => selected?.tile === index && selected.id === id;

function syncGates() {
  for (const tile of game.tiles) {
    for (const id of M.IDS) {
      const entry = items.get(`gate-${tile.index}-${id}`);
      if (!entry) continue;
      const share = tile.arm[id];
      const lit = isSelected(tile.index, id);
      const sign = `${share.toFixed(4)}|${tile.open[id]}|${lit}`;
      if (entry.sign === sign) continue;
      entry.el.innerHTML = PARTS.gateSvg(id, share, P, { go: tile.open[id], lit });
      entry.box = SCENE.shiftBox(PARTS.gateBox(id, share), SCENE.offsetOf(tile));
      entry.screen = null;
      entry.sign = sign;
    }
  }
  const board = items.get("strikes");
  const strikes = mode === "demo" ? 0 : Math.min(M.STRIKES, game.strikes);
  if (board.sign !== strikes) {
    board.el.innerHTML = PARTS.strikeBoardSvg(strikes, P);
    board.sign = strikes;
  }
  for (const pip of pips) {
    const lane = pip.dataset.lane;
    const backlog = game.backlog[lane];
    if (!backlog) continue;
    const on = backlog.length > Number(pip.dataset.n);
    const jam = mode === "play" && Boolean(game.jam[lane]);
    if (on !== pip.hasAttribute("data-on")) pip.toggleAttribute("data-on", on);
    if (jam !== pip.hasAttribute("data-jam")) pip.toggleAttribute("data-jam", jam);
  }
}

function sortLayer() {
  const list = [...items.values()];
  for (const item of list) item.screen ??= SCENE.screenBoxOf(item.box, P);
  const next = SCENE.paintOrder(list, P);
  if (next.length === order.length && next.every((item, index) => item === order[index])) return;
  // Move only what is out of place: every move repaints what it covers.
  let cursor = sortedLayer.firstChild;
  for (const item of next) {
    if (item.el === cursor) cursor = cursor.nextSibling;
    else sortedLayer.insertBefore(item.el, cursor);
  }
  order = next;
}

// The camera follows its aim exponentially, so a new tile pulls the view back
// calmly; line weights hold because the kit's strokes don't scale. The front
// drawing takes each step as a viewBox. The back one is painted once at the
// aim and carried there by a compositor transform, so the ground isn't
// repainted on every frame of the move.
function moveCamera(dt) {
  if (view.every((value, index) => value === aim[index])) return;
  const share = still.matches ? 1 : 1 - Math.exp(-dt / CAMERA);
  view = view.map((value, index) => {
    const next = value + (aim[index] - value) * share;
    return Math.abs(aim[index] - next) < 0.25 ? aim[index] : next;
  });
  const text = (box) => box.map((value) => Math.round(value * 100) / 100).join(" ");
  svg.setAttribute("viewBox", text(view));
  if (back.getAttribute("viewBox") !== text(aim)) back.setAttribute("viewBox", text(aim));
  const settled = view.every((value, index) => value === aim[index]);
  back.style.transform = settled ? "" : `translate(${(((aim[0] - view[0]) / view[2]) * 100).toFixed(3)}%, ${(((aim[1] - view[1]) / view[3]) * 100).toFixed(3)}%) scale(${(aim[2] / view[2]).toFixed(5)})`;
}

// A new tile fades in as the camera pulls back. Opacity is written as an
// attribute because the painter's sort moves nodes, which restarts CSS
// animations.
function fadeIn(now) {
  for (let index = arriving.length - 1; index >= 0; index--) {
    const { el, since, land: settle } = arriving[index];
    const alpha = still.matches ? 1 : M.smooth(0, ARRIVE, (now - since) / 1000);
    if (alpha >= 1) {
      el.removeAttribute("opacity");
      arriving.splice(index, 1);
      settle?.();
    } else el.setAttribute("opacity", alpha.toFixed(3));
  }
}

const burst = (age, rise, fall) => (age < 0 ? 0 : M.smooth(0, rise, age) * (age > rise ? Math.exp(-(age - rise) / fall) : 1));

function drawFx(now) {
  const out = [];
  for (let index = fx.length - 1; index >= 0; index--) {
    const age = (now - fx[index].at) / 1000;
    if (age > 1.8) {
      fx.splice(index, 1);
      continue;
    }
    const { x, y, size } = fx[index];
    const grow = 1 - Math.exp(-age / 0.22);
    const alpha = burst(age, 0.06, 0.32);
    out.push(`<path class="tm-crash" opacity="${alpha.toFixed(3)}" d="${k.ring(x, y, 3 + size * grow, PARTS.ROAD_H + 0.2, P, 40)}"/>`);
    out.push(`<path class="tm-crash" opacity="${(alpha * 0.5).toFixed(3)}" d="${k.ring(x, y, 2 + size * 0.55 * grow, PARTS.ROAD_H + 0.2, P, 40)}"/>`);
  }
  const html = out.join("");
  if (fxLayer.innerHTML !== html) fxLayer.innerHTML = html;
}

// Roads are named by the side they come in from, and numbered from the north
// or the west once the board has more than one row or column.
function entryName(lane) {
  const lines = M.laneList(game).filter((each) => each.approach === lane.approach).length;
  return lines > 1 ? `${NAMES[lane.approach]} entry ${Number(lane.id.slice(1)) + 1}` : `${NAMES[lane.approach]} road`;
}
const gateName = ({ tile, id }) => (game.tiles.length > 1 ? `tile ${tile + 1} ${NAMES[id]}` : NAMES[id]);

function handleEvents(now) {
  while (game.events.length) {
    const event = game.events.shift();
    if (mode !== "play") continue;
    if (event.type === "crash") {
      if (!still.matches) fx.push({ x: event.x * U, y: event.y * U, size: 10 + Math.min(22, event.speed * 2.2), at: now });
      say(`Crash, strike ${game.strikes} of ${M.STRIKES}.`);
    }
    if (event.type === "jam") say(`The ${entryName(game.lanes[event.lane])} jammed, strike ${game.strikes} of ${M.STRIKES}.`);
    if (event.type === "tile") {
      for (const tile of game.tiles) drawTile(tile, tile.index === event.index ? now : null);
      aim = SCENE.viewFor(game.tiles);
      say(`Tile ${event.index + 1} joins the board with every gate shut.`);
    }
    if (event.type === "over") {
      mode = "over";
      if (game.cleared > best) {
        best = game.cleared;
        writeBest(best);
      }
      say(`${overText()}. Press Space for a new shift.`);
    }
  }
}

const overText = () => `${M.STRIKES} strikes · ${game.cleared} through`;

const HELP = "Tap a road · Space shuts all";

function words() {
  if (mode === "demo") return [`demo · ${game.cleared} through`, "Tap or press Space to start a shift"];
  if (mode === "over") return [`${overText()} · best ${best}`, "Tap or press Space for a new shift"];
  if (paused) return ["paused · P to resume", HELP];
  const [jam] = M.jamsOf(game);
  if (jam) return [`${entryName(jam)} jammed · strike in ${Math.ceil(game.jam[jam.id].left)} s`, HELP];
  if (selected && game.tiles[selected.tile]) return [`${gateName(selected)} gate ${game.tiles[selected.tile].open[selected.id] ? "open" : "shut"} · ${M.waitingAt(game, selected.tile, selected.id)} waiting`, HELP];
  const next = M.nextTileAt(game);
  return [`${game.cleared} through · ${next === null ? "board full" : `next tile at ${next}`} · ${game.strikes}/${M.STRIKES} strikes`, HELP];
}

function render(now, dt) {
  handleEvents(now);
  syncVehicles();
  syncGates();
  sortLayer();
  fadeIn(now);
  moveCamera(dt);
  drawFx(now);
  const [text, help] = words();
  if (readout.textContent !== text) readout.textContent = text;
  if (hint.textContent !== help) hint.textContent = help;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const running = !paused && !(mode === "demo" && still.matches);
  if (running) {
    carry += dt;
    while (carry >= M.STEP) {
      M.step(game);
      carry -= M.STEP;
    }
  }
  render(now, dt);
  frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible && !document.hidden) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};

function setSelected(target) {
  if (selected?.tile === target?.tile && selected?.id === target?.id) return;
  selected = target;
  run();
}

function pointerAt(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

// Only the roads take a tap: the arm of the road a pointer is over names the
// tile and the gate on it. The boxes in the middle, the gate cabinets standing
// over the asphalt and everything off it do nothing.
function approachAt(event) {
  if (event.target.closest?.(".tm-cabinet")) return null;
  const { x: sx, y: sy } = pointerAt(event);
  const { sinA, cosA, sinE, k: scale } = k.cameraOf(P);
  const p = (sx - P.origin[0]) / scale;
  const q = (sy - P.origin[1]) / (sinE * scale);
  const wx = p * sinA + q * cosA;
  const wy = -p * cosA + q * sinA;
  const col = Math.round(wx / DATA.pitch);
  const row = Math.round(wy / DATA.pitch);
  const tile = game.tiles.find((each) => each.col === col && each.row === row);
  if (!tile) return null;
  const x = wx - col * DATA.pitch;
  const y = wy - row * DATA.pitch;
  const edge = DATA.board + 6;
  if (Math.abs(x) > edge || Math.abs(y) > edge) return null;
  const at = (id) => (id ? { tile: tile.index, id } : null);
  if (Math.abs(y) <= DATA.road) return at(x < -DATA.road ? "W" : x > DATA.road ? "E" : null);
  if (Math.abs(x) <= DATA.road) return at(y < -DATA.road ? "N" : y > DATA.road ? "S" : null);
  return null;
}

function act(target) {
  if (mode !== "play") start();
  if (target && game.tiles[target.tile]) M.toggle(game, target.tile, target.id);
  run();
}

stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse") setSelected(approachAt(event));
});
stage.addEventListener("pointerleave", () => setSelected(null));
stage.addEventListener("pointerdown", (event) => {
  stage.focus({ preventScroll: true });
  act(approachAt(event));
});
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (mode !== "play") act(null);
    else for (const tile of game.tiles) M.IDS.forEach((id) => M.setOpen(game, tile.index, id, false));
    run();
  }
  if ((event.key === "p" || event.key === "P") && mode === "play") {
    paused = !paused;
    say(paused ? "Paused." : "Resumed.");
    run();
  }
});
stage.addEventListener("focus", () => {
  if (!announcer.textContent) say(mode === "play" ? words()[0] : "Demo running. Press Space to start a shift.");
});
new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);
document.addEventListener("visibilitychange", run);
still.addEventListener("change", run);

// For the console and for scripted checks: the live game and the model.
window.trafficManager = { model: M, game: () => game, start, run };

demo();
render(performance.now(), 0);
