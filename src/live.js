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
const scoreboard = document.querySelector("[data-score]");
const strikeboard = document.querySelector("[data-strikes]");
const alarm = document.querySelector("[data-alert]");
const header = document.querySelector(".tm-bar");
const help = document.querySelector(".tm-overlay");
const info = document.querySelector(".tm-info");
const announcer = document.querySelector(".tm-live");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const BEST_KEY = "traffic-manager-best";
const NAMES = Object.fromEntries(M.APPROACHES.map((approach) => [approach.id, approach.name]));
const START = [0, 0, SCENE.WIDTH, SCENE.HEIGHT];
const ZOOM = 3;
const ARRIVE = 1.2;
const CAMERA = 0.28;
const ARROW = PARTS.arrowSvg(P);

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
let view = [...START];
let aim = [...START];
let width = 1;
let fit = [...START];
let warned = new Set();
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
// tile covers the plate edge of the one behind it. A tile that faded in on
// the front drawing keeps its copy there until the ground has been
// rasterised with it, so it never blinks out.
function land(tile, board) {
  haloLayer.appendChild(board.halo);
  const depth = tile.col + tile.row;
  const after = [...groundLayer.querySelectorAll("[data-tile]")].find((el) => {
    const other = game.tiles[Number(el.dataset.tile)];
    return other && other.col + other.row > depth;
  });
  groundLayer.insertBefore(board.el, after ?? null);
  if (board.ghost) ghosts.push({ els: board.ghost, from: serial + 1 });
  board.ghost = null;
  dirty = true;
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
      ghost: null,
      sign: null,
    };
    boards.set(tile.index, board);
    pipLayer.appendChild(board.pips);
    if (since === null) land(tile, board);
    else {
      board.ghost = [node("g", { transform: place }), node("g", { transform: place })];
      arrivingLayer.append(...board.ghost);
      arriving.push({ el: board.ghost[1], since, land: () => land(tile, board) }, { el: board.ghost[0], since }, { el: board.pips, since });
    }
    const offset = SCENE.offsetOf(tile);
    for (const prop of SCENE.tileProps(tile)) addItem(prop.key, prop.svg, SCENE.shiftBox(prop.box, offset), tile, since);
    for (const id of M.IDS) addItem(`gate-${tile.index}-${id}`, "", SCENE.shiftBox(PARTS.gateBox(id, 0), offset), tile, since);
  }
  if (board.sign === ground.sign) return;
  board.el.innerHTML = ground.body;
  board.halo.innerHTML = ground.halo;
  board.pips.innerHTML = ground.pips;
  if (board.ghost) [board.ghost[0].innerHTML, board.ghost[1].innerHTML] = [ground.halo, ground.body];
  board.sign = ground.sign;
  dirty = true;
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
  arrivingLayer.replaceChildren();
  ghosts.length = 0;
  order = [];
  drawTile(game.tiles[0]);
  dirty = true;
  aimAt(refit());
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

// The camera. The front drawing takes the view as its viewBox; it repaints
// with the traffic on every frame anyway. The ground is rasterised into a
// canvas over the whole board at one zoom, and the compositor slides and
// scales that bitmap to follow the view. A canvas is one whole bitmap, so a
// swipe or a pinch never uncovers ground that wasn't painted, which a large
// moving SVG layer does in Safari, painting its tiles only as they come into
// view. The ground is rasterised again, sharp, once the camera rests at a new
// zoom or the board changes; the old bitmap shows until the new one is ready.
// Line weights hold because the kit's strokes don't scale, and the bitmap's
// strokes are scaled to its pixel density to match.
const MARGIN = 30;
const boxText = (box) => box.map((value) => Math.round(value * 100) / 100).join(" ");
const same = (a, b) => a.every((value, index) => value === b[index]);
const unitOf = (box) => width / box[2];
const SHEET = [...document.querySelectorAll("style")].map((el) => el.textContent).join("\n") + ".iso-halo{filter:none}.tm-soft{filter:url(#tm-soft)}";
const sheetAt = (density) =>
  SHEET.replace(/(stroke-width:\s*)([\d.]+)/g, (_, key, value) => `${key}${+(value * density).toFixed(3)}`).replace(/(--anatomy-weight:\s*)([\d.]+)px/g, (_, key, value) => `${key}${+(value * density).toFixed(3)}px`);
let raster = null;
let rendering = null;
let broken = false;
let dirty = true;
let serial = 0;
const ghosts = [];

function showView() {
  svg.setAttribute("viewBox", boxText(view));
  if (!raster) {
    back.setAttribute("viewBox", boxText(view));
    return;
  }
  const unit = unitOf(view);
  const [x, y] = raster.box;
  raster.canvas.style.transform = `translate(${((x - view[0]) * unit).toFixed(2)}px, ${((y - view[1]) * unit).toFixed(2)}px) scale(${(unit / raster.unit).toFixed(5)})`;
}

// The ground as one standalone SVG: shadows blurred as two groups (under the
// plates, and over the ground under everything that stands) instead of one
// filter per shadow, which keeps a rasterisation quick.
function groundMarkup(box, pixels, density) {
  const tiles = [];
  const shadows = [];
  for (const el of groundLayer.querySelectorAll(":scope > [data-tile]")) {
    const copy = el.cloneNode(true);
    const shade = copy.querySelector("[data-shadows]");
    shade?.remove();
    tiles.push(copy.outerHTML);
    if (shade) shadows.push(`<g transform="${el.getAttribute("transform") ?? ""}">${shade.innerHTML}</g>`);
  }
  const theme = document.body.dataset.theme ?? "dark";
  const soft = `<filter id="tm-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="iso" data-theme="${theme}" width="${pixels[0]}" height="${pixels[1]}" viewBox="${boxText(box)}" preserveAspectRatio="none" style="--anatomy-paper:var(--anatomy-card)"><style>${sheetAt(density)}</style><defs>${soft}</defs><g class="iso-svg"><g class="tm-soft">${haloLayer.innerHTML}</g>${tiles.join("")}<g class="tm-soft">${shadows.join("")}</g></g></svg>`;
}

// Rasterises the ground at a zoom, at the screen's pixel density but never
// past the canvas sizes phones allow. Results that a newer request has
// overtaken are dropped.
async function rasterise(unit) {
  const id = ++serial;
  dirty = false;
  rendering = { id, unit };
  const [left, up, right, down] = SCENE.boundsOf(game.tiles);
  const box = [left - MARGIN, up - MARGIN, right - left + 2 * MARGIN, down - up + 2 * MARGIN];
  const size = [box[2] * unit, box[3] * unit];
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const density = dpr * Math.min(1, 4096 / (size[0] * dpr), 4096 / (size[1] * dpr), Math.sqrt(16e6 / (size[0] * size[1] * dpr * dpr)));
  const pixels = [Math.max(1, Math.round(size[0] * density)), Math.max(1, Math.round(size[1] * density))];
  const url = URL.createObjectURL(new Blob([groundMarkup(box, pixels, density)], { type: "image/svg+xml" }));
  const image = new Image();
  try {
    await new Promise((done, fail) => {
      image.onload = done;
      image.onerror = fail;
      image.src = url;
    });
  } catch {
    broken = true;
    return;
  } finally {
    URL.revokeObjectURL(url);
  }
  // Drawing the bitmap holds the page for a moment, so it waits for any
  // touch in progress to end.
  while (gesture.points.size && id === serial) await new Promise((done) => setTimeout(done, 50));
  if (id !== serial) return;
  const canvas = document.createElement("canvas");
  canvas.className = "tm-ground";
  canvas.width = pixels[0];
  canvas.height = pixels[1];
  canvas.getContext("2d").drawImage(image, 0, 0, pixels[0], pixels[1]);
  canvas.style.width = `${size[0].toFixed(2)}px`;
  canvas.style.height = `${size[1].toFixed(2)}px`;
  if (raster) {
    raster.canvas.replaceWith(canvas);
    raster.canvas.width = 0;
  } else {
    stage.insertBefore(canvas, svg);
    stage.classList.add("tm-rastered");
  }
  raster = { box, unit, canvas };
  rendering = null;
  for (let index = ghosts.length - 1; index >= 0; index--) {
    if (ghosts[index].from > id) continue;
    ghosts[index].els.forEach((el) => el.remove());
    ghosts.splice(index, 1);
  }
  showView();
}

// Asks for a raster at a zoom unless one is ready or on its way. Without a
// raster (or if rasterising fails) the back SVG follows the view itself.
function rasteriseAt(unit) {
  if (broken) {
    for (const ghost of ghosts.splice(0)) ghost.els.forEach((el) => el.remove());
    return;
  }
  const target = rendering?.unit ?? raster?.unit;
  if (!dirty && target && Math.abs(unit / target - 1) < 1e-4) return;
  rasterise(unit);
}

// Eases to a box, exponentially, so a new tile pulls the view back calmly.
// The ground is rasterised once the camera rests, so drawing the bitmap
// never holds up a move.
function aimAt(box) {
  aim = box;
  if (still.matches) rasteriseAt(unitOf(box));
}
function moveCamera(dt) {
  if (gesture.points.size) return;
  if (same(view, aim)) {
    rasteriseAt(unitOf(view));
    return;
  }
  const share = still.matches ? 1 : 1 - Math.exp(-dt / CAMERA);
  view = view.map((value, index) => {
    const next = value + (aim[index] - value) * share;
    return Math.abs(aim[index] - next) < 0.25 ? aim[index] : next;
  });
  showView();
}

// The whole board, fitted between the header and the footer in the shape of
// the screen: 100% zoom. The view always has the screen's shape, so the
// drawing fills it edge to edge with nothing letterboxed.
function refit() {
  const { width: across, height } = stage.getBoundingClientRect();
  if (!across || !height) return fit;
  width = across;
  const [left, up, right, down] = SCENE.boundsOf(game.tiles);
  const top = header.getBoundingClientRect().height;
  const bottom = height - readout.getBoundingClientRect().top + 44;
  const side = 12;
  const scale = Math.min((width - 2 * side) / (right - left), (height - top - bottom) / (down - up));
  fit = [(left + right) / 2 - width / 2 / scale, (up + down) / 2 - (top + (height - top - bottom) / 2) / scale, width / scale, height / scale];
  return fit;
}

// Touch: one finger swipes the board and two pinch it, about the point
// between them; a touch that barely moves is a tap. Zoom runs from the whole
// board (100%) to ZOOM times closer, and the view stays within the whole
// board's frame, so at 100% the board holds still.
const gesture = { points: new Map(), anchor: null, tap: null, lastTap: null };
const SLOP = 10;
function clampView([x, y, w]) {
  const width = Math.min(Math.max(w, fit[2] / ZOOM), fit[2]);
  const height = (width * fit[3]) / fit[2];
  const h = (w * fit[3]) / fit[2];
  const [left, up, right, down] = SCENE.boundsOf(game.tiles);
  // The middle of the view stays over the board and the view inside the
  // whole board's frame, so a swipe never strands you on empty page.
  const keep = (value, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(value, lo), hi));
  const cx = keep(x + w / 2, Math.max(fit[0] + width / 2, left), Math.min(fit[0] + fit[2] - width / 2, right));
  const cy = keep(y + h / 2, Math.max(fit[1] + height / 2, up), Math.min(fit[1] + fit[3] - height / 2, down));
  return [cx - width / 2, cy - height / 2, width, height];
}
function spreadOf() {
  const list = [...gesture.points.values()];
  const mid = [list.reduce((sum, [x]) => sum + x, 0) / list.length, list.reduce((sum, [, y]) => sum + y, 0) / list.length];
  const spread = list.length > 1 ? Math.hypot(list[0][0] - list[1][0], list[0][1] - list[1][1]) : 0;
  return { mid, spread };
}
function anchor() {
  const rect = svg.getBoundingClientRect();
  const { mid, spread } = spreadOf();
  const per = view[2] / rect.width;
  gesture.anchor = { rect, spread, width: view[2], world: [view[0] + (mid[0] - rect.left) * per, view[1] + (mid[1] - rect.top) * per] };
}
function follow() {
  const { rect, spread: from, width, world } = gesture.anchor;
  const { mid, spread } = spreadOf();
  const w = width * (from && spread ? from / spread : 1);
  const per = w / rect.width;
  view = clampView([world[0] - (mid[0] - rect.left) * per, world[1] - (mid[1] - rect.top) * per, w]);
  aim = [...view];
  showView();
}

// A tap acts like a click. Two quick taps off the roads frame the whole
// board again.
function tapAt(event) {
  const target = approachAt(event);
  const now = performance.now();
  const before = gesture.lastTap;
  gesture.lastTap = { x: event.clientX, y: event.clientY, t: now };
  if (!target && mode === "play" && before && now - before.t < 350 && Math.hypot(event.clientX - before.x, event.clientY - before.y) < 40) {
    gesture.lastTap = null;
    aimAt(fit);
    run();
    return;
  }
  act(target);
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

// While a road is jammed, a red arrow bobs over the gate holding its queue,
// just short of the stop line: the place to tap.
function arrows(now) {
  if (mode !== "play") return [];
  const bob = still.matches ? 0 : 2.5 * Math.sin((now / 1000) * Math.PI * 1.8);
  return M.jamsOf(game).map((lane) => {
    const gate = M.gateFor(game, lane.id);
    const [x, y] = M.tileLaneAt(game.tiles[gate.tile], M.BY_ID[gate.id], M.S_STOP - 3.5).map((value) => value * U);
    return `<g transform="${k.translateAlong(P, [x, y, PARTS.ARROW_LIFT + bob])}">${ARROW}</g>`;
  });
}

function drawFx(now) {
  const out = arrows(now);
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
      aimAt(refit());
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

// What the card says: the score top left, a cross per strike top right, what
// comes next along the bottom, and the most urgent jam in the blinking bar.
function words() {
  const playing = mode !== "demo";
  const score = `Score: ${playing ? game.cleared : 0}`;
  const strikes = playing ? Array(Math.min(M.STRIKES, game.strikes)).fill("X").join(" ") : "";
  const [jam] = mode === "play" ? M.jamsOf(game) : [];
  const alert = jam ? `${entryName(jam)} jammed · tap under the arrow · ${Math.ceil(game.jam[jam.id].left)} s` : "";
  let bottom;
  if (mode === "demo") bottom = "Tap or press Space to start a shift";
  else if (mode === "over") bottom = `Shift over · best ${best} · tap to play again`;
  else if (paused) bottom = "Paused · P to resume";
  else if (selected && game.tiles[selected.tile]) bottom = `${gateName(selected)} gate ${game.tiles[selected.tile].open[selected.id] ? "open" : "shut"} · ${M.waitingAt(game, selected.tile, selected.id)} waiting`;
  else bottom = M.nextTileAt(game) === null ? "Board full" : `Next tile at ${M.nextTileAt(game)}`;
  return { score, strikes, bottom, alert };
}

const write = (el, text) => {
  if (el.textContent !== text) el.textContent = text;
};

// Says so once when a road starts counting down to a jam strike.
function warn() {
  const now = new Set(mode === "play" ? M.jamsOf(game).map((lane) => lane.id) : []);
  for (const id of now) if (!warned.has(id)) say(`The ${entryName(game.lanes[id])} is jammed. Open the gate under the arrow within ${M.JAM_TIME} seconds.`);
  warned = now;
}

function render(now, dt) {
  handleEvents(now);
  syncVehicles();
  syncGates();
  sortLayer();
  fadeIn(now);
  moveCamera(dt);
  drawFx(now);
  warn();
  const { score, strikes, bottom, alert } = words();
  write(scoreboard, score);
  write(strikeboard, strikes);
  write(readout, bottom);
  write(alarm, alert);
  if (alarm.hidden !== !alert) alarm.hidden = !alert;
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
  if (document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".tm-cabinet")) return null;
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

stage.addEventListener("pointerdown", (event) => {
  stage.dataset.input = "pointer";
  stage.focus({ preventScroll: true });
  if (event.pointerType !== "touch") {
    act(approachAt(event));
    return;
  }
  try {
    stage.setPointerCapture(event.pointerId);
  } catch {}
  gesture.points.set(event.pointerId, [event.clientX, event.clientY]);
  gesture.tap = gesture.points.size === 1 ? [event.clientX, event.clientY] : null;
  anchor();
  run();
});
stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse") setSelected(approachAt(event));
  if (!gesture.points.has(event.pointerId)) return;
  gesture.points.set(event.pointerId, [event.clientX, event.clientY]);
  if (gesture.tap && Math.hypot(event.clientX - gesture.tap[0], event.clientY - gesture.tap[1]) > SLOP) gesture.tap = null;
  if (!gesture.tap) follow();
});
const lift = (event) => {
  if (!gesture.points.has(event.pointerId)) return;
  gesture.points.delete(event.pointerId);
  const tapped = gesture.tap && event.type === "pointerup";
  gesture.tap = null;
  if (gesture.points.size) anchor();
  if (tapped) tapAt(event);
};
stage.addEventListener("pointerup", lift);
stage.addEventListener("pointercancel", lift);
stage.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") setSelected(null);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") delete stage.dataset.input;
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

// How to play opens over everything from the info button; a tap anywhere, or
// Escape, closes it. The shift keeps running behind it.
function showHelp(open) {
  help.hidden = !open;
  if (open) help.focus({ preventScroll: true });
  else stage.focus({ preventScroll: true });
}
info.addEventListener("click", () => showHelp(true));
help.addEventListener("click", () => showHelp(false));
help.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    showHelp(false);
  }
});

// A new screen shape (a turned phone, a browser bar sliding away) gets a
// fresh fit, keeping the zoom and the point in the middle of the view.
addEventListener("resize", () => {
  const zoom = fit[2] / view[2];
  const centre = [view[0] + view[2] / 2, view[1] + view[3] / 2];
  refit();
  const w = fit[2] / zoom;
  view = clampView([centre[0] - w / 2, centre[1] - fit[3] / zoom / 2, w]);
  aim = [...view];
  showView();
  rasteriseAt(unitOf(view));
  run();
});

// For the console and for scripted checks: the live game and the model.
window.trafficManager = { model: M, game: () => game, start, run };

demo();
view = refit();
aim = [...view];
showView();
rasteriseAt(unitOf(view));
render(performance.now(), 0);
