// The page: one loop steps the model at 120 Hz, then redraws what moved and
// re-sorts what stands up. Uses k (kit), G (lathe), M (model), PARTS, SCENE, DATA.
const P = DATA.P;
const U = M.UNIT;
const NS = "http://www.w3.org/2000/svg";
const stage = document.querySelector(".tm-stage");
const svg = stage.querySelector("svg");
const sortedLayer = svg.querySelector('[data-layer="sorted"]');
const fxLayer = svg.querySelector('[data-layer="fx"]');
const readout = document.querySelector("[data-readout]");
const hint = document.querySelector('[data-corner="hint"]');
const announcer = document.querySelector(".tm-live");
const pips = [...svg.querySelectorAll(".tm-pip")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const BEST_KEY = "traffic-manager-best";
const NAMES = Object.fromEntries(M.APPROACHES.map((approach) => [approach.id, approach.name]));

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
const fx = [];

const items = new Map();
for (const el of sortedLayer.querySelectorAll("[data-item]")) {
  if (el.dataset.item.startsWith("v")) el.remove();
  else items.set(el.dataset.item, { el, box: JSON.parse(el.dataset.box) });
}
const drawn = new Map();

function demo() {
  game = M.createGame({ seed: DATA.demoSeed, demo: true });
  M.advance(game, DATA.demoLead);
  mode = "demo";
}

function start() {
  for (const entry of drawn.values()) {
    entry.el.remove();
    items.delete(entry.key);
  }
  drawn.clear();
  fx.length = 0;
  game = M.createGame({ seed: Math.floor(Math.random() * 2 ** 31) });
  mode = "play";
  paused = false;
  carry = 0;
  say("Shift started. Every gate is shut.");
}

function say(text) {
  announcer.textContent = text;
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
      const el = document.createElementNS(NS, "g");
      el.setAttribute("class", "tm-vehicle");
      entry = { el, key: `v${vehicle.id}`, th: null, x: null, y: null, wreck: false, alpha: 1 };
      drawn.set(vehicle.id, entry);
      items.set(entry.key, entry);
      sortedLayer.appendChild(el);
    }
    if (vehicle.wreck) {
      if (!entry.wreck || entry.th !== body.th || entry.x !== x || entry.y !== y) {
        entry.el.innerHTML = PARTS.vehicleSvg(vehicle.kind, x, y, body.th, P, { tone: "mid" });
        entry.el.removeAttribute("transform");
        entry.el.classList.add("tm-wreck");
      }
    } else {
      if (entry.th === null) entry.el.innerHTML = PARTS.vehicleSvg(vehicle.kind, 0, 0, body.th, P);
      entry.el.setAttribute("transform", k.translateAlong(P, [x, y, 0]));
    }
    Object.assign(entry, { th: body.th, x, y, wreck: vehicle.wreck, box: PARTS.vehicleBox(vehicle.kind, x, y, body.th) });
    const alpha = Math.round(M.alphaOf(game, vehicle) * 100) / 100;
    if (alpha !== entry.alpha) {
      if (alpha >= 1) entry.el.removeAttribute("opacity");
      else entry.el.setAttribute("opacity", String(alpha));
      entry.alpha = alpha;
    }
  }
  for (const [id, entry] of drawn) {
    if (alive.has(id)) continue;
    entry.el.remove();
    items.delete(entry.key);
    drawn.delete(id);
  }
}

function syncGates() {
  const tile = game.tiles[0];
  for (const id of M.IDS) {
    const entry = items.get(`gate-${id}`);
    const share = tile.arm[id];
    const sign = `${share.toFixed(4)}|${tile.open[id]}|${selected === id}`;
    if (entry.sign === sign) continue;
    entry.el.innerHTML = PARTS.gateSvg(id, share, P, { go: tile.open[id], lit: selected === id });
    entry.box = PARTS.gateBox(id, share);
    entry.sign = sign;
  }
  const board = items.get("strikes");
  const strikes = mode === "demo" ? 0 : Math.min(M.STRIKES, game.strikes);
  if (board.sign !== strikes) {
    board.el.innerHTML = PARTS.strikeBoardSvg(strikes, P);
    board.sign = strikes;
  }
  for (const pip of pips) {
    const lane = `${pip.dataset.approach}0`;
    const on = game.backlog[lane].length > Number(pip.dataset.n);
    const jam = mode === "play" && Boolean(game.jam[lane]);
    if (on !== pip.hasAttribute("data-on")) pip.toggleAttribute("data-on", on);
    if (jam !== pip.hasAttribute("data-jam")) pip.toggleAttribute("data-jam", jam);
  }
}

function sortLayer() {
  const next = SCENE.paintOrder([...items.values()], P);
  if (next.length === order.length && next.every((item, index) => item === order[index])) return;
  const fragment = document.createDocumentFragment();
  for (const item of next) fragment.appendChild(item.el);
  sortedLayer.appendChild(fragment);
  order = next;
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

function handleEvents(now) {
  while (game.events.length) {
    const event = game.events.shift();
    if (event.type === "crash" && mode === "play") {
      if (!still.matches) fx.push({ x: event.x * U, y: event.y * U, size: 10 + Math.min(22, event.speed * 2.2), at: now });
      say(`Crash, strike ${game.strikes} of ${M.STRIKES}.`);
    }
    if (event.type === "jam" && mode === "play") say(`The ${NAMES[game.lanes[event.lane].approach]} road jammed, strike ${game.strikes} of ${M.STRIKES}.`);
    if (event.type === "over" && mode === "play") {
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

const HELP = "Tap a road to swing its gate · Space shuts all";

function words() {
  if (mode === "demo") return [`demo · ${game.cleared} through`, "Tap or press Space to start a shift"];
  if (mode === "over") return [`${overText()} · best ${best}`, "Tap or press Space for a new shift"];
  if (paused) return ["paused · P to resume", HELP];
  const [jam] = M.jamsOf(game);
  if (jam) return [`${NAMES[jam.approach]} road jammed · strike in ${Math.ceil(game.jam[jam.id].left)} s`, HELP];
  if (selected) return [`${NAMES[selected]} gate ${game.tiles[0].open[selected] ? "open" : "shut"} · ${M.queueOf(game, `${selected}0`)} waiting`, HELP];
  return [`${game.cleared} through · ${game.strikes}/${M.STRIKES} strikes · ${M.waitingOf(game)} waiting`, HELP];
}

function render(now, dt) {
  handleEvents(now);
  syncVehicles();
  syncGates();
  sortLayer();
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

function setSelected(id) {
  if (selected === id) return;
  selected = id;
  run();
}

function pointerAt(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

// Only the roads take a tap: the arm of the road a pointer is over names the
// gate on it. The box in the middle, the gate cabinets standing over the
// asphalt and everything off it do nothing.
function approachAt(event) {
  if (event.target.closest?.(".tm-cabinet")) return null;
  const { x: sx, y: sy } = pointerAt(event);
  const { sinA, cosA, sinE, k: scale } = k.cameraOf(P);
  const p = (sx - P.origin[0]) / scale;
  const q = (sy - P.origin[1]) / (sinE * scale);
  const x = p * sinA + q * cosA;
  const y = -p * cosA + q * sinA;
  const edge = DATA.board + 6;
  if (Math.abs(x) > edge || Math.abs(y) > edge) return null;
  if (Math.abs(y) <= DATA.road) return x < -DATA.road ? "W" : x > DATA.road ? "E" : null;
  if (Math.abs(x) <= DATA.road) return y < -DATA.road ? "N" : y > DATA.road ? "S" : null;
  return null;
}

function act(id) {
  if (mode !== "play") start();
  if (id) M.toggle(game, 0, id);
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
    else M.IDS.forEach((each) => M.setOpen(game, 0, each, false));
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
