// The junctions, their drivers and their crashes, in metres and seconds.
// Pure: no DOM. The page and the tests run this same code.

export const UNIT = 4;
export const GRAVITY = 9.81;
export const BOARD = 30;
export const LANE = 3.75;
export const ROAD = LANE;
export const CROSSWALK = 3;
export const STOP = ROAD + CROSSWALK + 0.5;
export const REACH = BOARD * 2;
export const S_STOP = BOARD - STOP;
export const ARM_AT = S_STOP + 0.2;
export const STOP_SHORT = 1;
export const SAFE_BRAKE = 4;
export const PERCEIVE = 0.6;
export const ARM_TIME = 1.4;
export const STRIKES = 3;
export const JAM = 6;
export const JAM_TIME = 5;
export const TYRE_GRIP = 0.7;
export const ROLLING = 0.25;
export const IMPACT_GRIP = 0.5;
export const RESTITUTION = 0.15;
export const WRECK_REST = 4;
export const WRECK_FADE = 0.8;
export const FADE = 4;
export const STEP = 1 / 120;

// The board is a grid of tiles, each a crossroads on its own plate, one plate
// width apart. Tiles join toward a square: east, south, then fill the 2×2,
// then out to 3×3.
export const PITCH = 2 * BOARD + 3;
export const GROWTH = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 0],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
];
// The vehicles through that bring each tile after the first.
export const TILE_AT = [15, 40, 80, 130, 190, 260, 340, 430];
export const nextTileAt = (game) => (game.tiles.length < GROWTH.length ? TILE_AT[game.tiles.length - 1] : null);

export const KINDS = {
  car: { length: 4.5, width: 1.8, mass: 1300, v0: 10, a: 1.5, b: 2.0, T: 1.2, s0: 2, brake: 8 },
  van: { length: 5.4, width: 2.0, mass: 2300, v0: 9.5, a: 1.1, b: 1.8, T: 1.3, s0: 2, brake: 7 },
  bus: { length: 11.5, width: 2.5, mass: 12000, v0: 8.5, a: 0.8, b: 1.5, T: 1.6, s0: 2.5, brake: 6 },
};
export const MIX = [
  ["car", 0.78],
  ["van", 0.17],
  ["bus", 0.05],
];

export const APPROACHES = [
  { id: "W", name: "west", dir: [1, 0] },
  { id: "N", name: "north", dir: [0, 1] },
  { id: "E", name: "east", dir: [-1, 0] },
  { id: "S", name: "south", dir: [0, -1] },
].map((approach) => {
  const right = [-approach.dir[1], approach.dir[0]];
  const start = [-approach.dir[0] * BOARD + (right[0] * LANE) / 2, -approach.dir[1] * BOARD + (right[1] * LANE) / 2];
  return { ...approach, right, start, heading: Math.atan2(approach.dir[1], approach.dir[0]) };
});
export const BY_ID = Object.fromEntries(APPROACHES.map((approach) => [approach.id, approach]));
export const IDS = APPROACHES.map((approach) => approach.id);
export const AXIS_OF = { W: "EW", E: "EW", N: "NS", S: "NS" };

// A point on an approach (tile-local) or a lane (on the board): both carry a
// start, a direction of travel and a right-hand side.
export const laneAt = (approach, s, lateral = 0) => [
  approach.start[0] + approach.dir[0] * s + approach.right[0] * lateral,
  approach.start[1] + approach.dir[1] * s + approach.right[1] * lateral,
];
export const tileLaneAt = (tile, approach, s, lateral = 0) => {
  const [x, y] = laneAt(approach, s, lateral);
  return [x + tile.x, y + tile.y];
};
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const towardZero = (value, by) => (value > 0 ? Math.max(0, value - by) : Math.min(0, value + by));

export function rngOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Arrivals per second on each approach. Demand grows through the shift and
// swings between the two roads every 80 s, so a fixed plan falls behind.
export const PEAK_RATE = 0.36;
export function demandAt(t) {
  const total = Math.min(0.72, 0.26 + 0.002 * t);
  const ew = 0.5 + 0.3 * Math.sin((2 * Math.PI * t) / 80);
  return { W: (total * ew) / 2, E: (total * ew) / 2, N: (total * (1 - ew)) / 2, S: (total * (1 - ew)) / 2 };
}

export function createGame({ seed = 7, demo = false } = {}) {
  const game = {
    t: 0,
    demo,
    seed,
    rng: rngOf(seed),
    nextId: 1,
    vehicles: [],
    events: [],
    tiles: [],
    lanes: {},
    backlog: {},
    next: {},
    jam: {},
    cleared: 0,
    strikes: 0,
    over: null,
    quiet: false,
  };
  addTile(game);
  return game;
}

const arrivalAfter = (game, t) => t - Math.log(1 - game.rng()) / PEAK_RATE;

// Each row carries an eastbound lane (W) and a westbound lane (E), each column
// a southbound lane (N) and a northbound lane (S), straight through every tile
// on it. A vehicle meets one stop line per tile, PITCH metres apart.
export const lineOf = (tile, id) => `${id}${AXIS_OF[id] === "EW" ? tile.row : tile.col}`;
export const laneOf = (game, index, id) => game.lanes[lineOf(game.tiles[index], id)];
export const laneList = (game) => Object.values(game.lanes);

// Places the next tile with its gates shut and lays every lane through it. A
// lane whose entry moves outward carries its vehicles along by the same
// distance, so they stay where they are on the board; its queue moves with it.
export function addTile(game) {
  const index = game.tiles.length;
  if (index >= GROWTH.length) return null;
  const [col, row] = GROWTH[index];
  const tile = { index, col, row, x: col * PITCH, y: row * PITCH, open: {}, epoch: {}, arm: {}, pilot: null };
  for (const id of IDS) {
    tile.open[id] = false;
    tile.epoch[id] = 0;
    tile.arm[id] = 0;
  }
  game.tiles.push(tile);
  for (const approach of APPROACHES) {
    const id = lineOf(tile, approach.id);
    const along = (each) => each.x * approach.dir[0] + each.y * approach.dir[1];
    const tiles = game.tiles.filter((each) => lineOf(each, approach.id) === id).sort((a, b) => along(a) - along(b));
    const start = [tiles[0].x + approach.start[0], tiles[0].y + approach.start[1]];
    let lane = game.lanes[id];
    if (lane) {
      const shift = (lane.start[0] - start[0]) * approach.dir[0] + (lane.start[1] - start[1]) * approach.dir[1];
      if (shift) for (const vehicle of game.vehicles) if (vehicle.lane === lane) vehicle.s += shift;
    } else {
      lane = game.lanes[id] = { id, approach: approach.id, dir: approach.dir, right: approach.right, heading: approach.heading };
      game.backlog[id] = [];
      game.next[id] = game.quiet ? Infinity : arrivalAfter(game, game.t);
    }
    Object.assign(lane, { tiles: tiles.map((each) => each.index), start, length: REACH + (tiles.length - 1) * PITCH });
  }
  if (index > 0) pushEvent(game, { type: "tile", index });
  return tile;
}

// The next stop line on a vehicle's lane and the tile whose gate guards it. A
// driver keeps watching a line until 0.2 m past it.
export function gateAhead(game, vehicle) {
  const lane = vehicle.lane;
  const index = Math.max(0, Math.floor((vehicle.s - 0.2 - S_STOP) / PITCH) + 1);
  if (index >= lane.tiles.length) return null;
  return { tile: game.tiles[lane.tiles[index]], line: S_STOP + index * PITCH };
}

function kindOf(game) {
  let pick = game.rng();
  for (const [name, share] of MIX) {
    if (pick < share) return name;
    pick -= share;
  }
  return MIX[0][0];
}

export function setOpen(game, index, id, open) {
  const tile = game.tiles[index];
  if (game.over || !tile || tile.open[id] === open) return false;
  tile.open[id] = open;
  if (!open) tile.epoch[id]++;
  pushEvent(game, { type: "signal", tile: index, id, open });
  return true;
}
export const toggle = (game, index, id) => setOpen(game, index, id, !game.tiles[index].open[id]);

function pushEvent(game, event) {
  game.events.push({ ...event, t: game.t });
  if (game.events.length > 64) game.events.splice(0, game.events.length - 64);
}

// Where a vehicle's body is: centre, heading and velocity, in metres.
export function bodyOf(vehicle) {
  if (vehicle.wreck) return vehicle.body;
  const lane = vehicle.lane;
  const [x, y] = laneAt(lane, vehicle.s - KINDS[vehicle.kind].length / 2);
  return { x, y, th: lane.heading, vx: lane.dir[0] * vehicle.v, vy: lane.dir[1] * vehicle.v, w: 0 };
}

export function cornersOf(body, kind) {
  const { length, width } = KINDS[kind];
  const c = Math.cos(body.th);
  const s = Math.sin(body.th);
  const hl = length / 2;
  const hw = width / 2;
  return [
    [body.x + c * hl - s * hw, body.y + s * hl + c * hw],
    [body.x - c * hl - s * hw, body.y - s * hl + c * hw],
    [body.x - c * hl + s * hw, body.y - s * hl - c * hw],
    [body.x + c * hl + s * hw, body.y + s * hl - c * hw],
  ];
}

// How far a vehicle's corners reach from its centre.
const REACH_OF = Object.fromEntries(Object.entries(KINDS).map(([name, { length, width }]) => [name, Math.hypot(length / 2, width / 2)]));

// Moving vehicles on parallel lanes never meet: the opposite lane is a lane
// width away and the next row or column a whole tile.
const parallel = (a, b) => a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] !== 0;

const boxOf = (body, half) => ({ ...body, hl: half[0], hw: half[1] });
const boxOfVehicle = (vehicle) => {
  const { length, width } = KINDS[vehicle.kind];
  return boxOf(bodyOf(vehicle), [length / 2, width / 2]);
};
const axesOf = (box) => {
  const c = Math.cos(box.th);
  const s = Math.sin(box.th);
  return [
    [c, s],
    [-s, c],
  ];
};
const cornersOfBox = (box) => {
  const [u, n] = axesOf(box);
  return [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([i, j]) => [box.x + u[0] * box.hl * i + n[0] * box.hw * j, box.y + u[1] * box.hl * i + n[1] * box.hw * j]);
};
const inside = (point, box) => {
  const [u, n] = axesOf(box);
  const dx = point[0] - box.x;
  const dy = point[1] - box.y;
  return Math.abs(dx * u[0] + dy * u[1]) <= box.hl + 1e-9 && Math.abs(dx * n[0] + dy * n[1]) <= box.hw + 1e-9;
};

// Separating axis test between two boxes. Returns the contact normal (from a
// to b), the overlap depth and a contact point, or null when they are apart.
export function overlap(a, b) {
  const ca = cornersOfBox(a);
  const cb = cornersOfBox(b);
  let depth = Infinity;
  let normal = null;
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const project = (points) => points.map(([x, y]) => x * axis[0] + y * axis[1]);
    const pa = project(ca);
    const pb = project(cb);
    const amount = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
    if (amount <= 0) return null;
    if (amount < depth) {
      depth = amount;
      normal = axis;
    }
  }
  if ((b.x - a.x) * normal[0] + (b.y - a.y) * normal[1] < 0) normal = [-normal[0], -normal[1]];
  const deep = [...ca.filter((point) => inside(point, b)), ...cb.filter((point) => inside(point, a))];
  const point = deep.length
    ? [deep.reduce((sum, p) => sum + p[0], 0) / deep.length, deep.reduce((sum, p) => sum + p[1], 0) / deep.length]
    : [(a.x + b.x) / 2, (a.y + b.y) / 2];
  return { depth, normal, point };
}

const inertiaOf = (kind) => {
  const { length, width, mass } = KINDS[kind];
  return (mass * (length * length + width * width)) / 12;
};

// An impulse at the contact point, with restitution and a capped friction
// impulse, then a positional push so the bodies no longer overlap.
export function resolve(a, b, kindA, kindB, hit) {
  const mA = KINDS[kindA].mass;
  const mB = KINDS[kindB].mass;
  const iA = inertiaOf(kindA);
  const iB = inertiaOf(kindB);
  const [nx, ny] = hit.normal;
  const ra = [hit.point[0] - a.x, hit.point[1] - a.y];
  const rb = [hit.point[0] - b.x, hit.point[1] - b.y];
  const velocity = (body, r) => [body.vx - body.w * r[1], body.vy + body.w * r[0]];
  const apply = (body, mass, inertia, r, jx, jy, sign) => {
    body.vx += (sign * jx) / mass;
    body.vy += (sign * jy) / mass;
    body.w += (sign * (r[0] * jy - r[1] * jx)) / inertia;
  };
  const relative = () => {
    const va = velocity(a, ra);
    const vb = velocity(b, rb);
    return [vb[0] - va[0], vb[1] - va[1]];
  };
  const rel = relative();
  const vn = rel[0] * nx + rel[1] * ny;
  let impulse = 0;
  if (vn < 0) {
    const raN = ra[0] * ny - ra[1] * nx;
    const rbN = rb[0] * ny - rb[1] * nx;
    impulse = (-(1 + RESTITUTION) * vn) / (1 / mA + 1 / mB + (raN * raN) / iA + (rbN * rbN) / iB);
    apply(a, mA, iA, ra, nx * impulse, ny * impulse, -1);
    apply(b, mB, iB, rb, nx * impulse, ny * impulse, 1);
    const after = relative();
    const along = after[0] * nx + after[1] * ny;
    const tx = after[0] - along * nx;
    const ty = after[1] - along * ny;
    const slip = Math.hypot(tx, ty);
    if (slip > 1e-6) {
      const t = [tx / slip, ty / slip];
      const raT = ra[0] * t[1] - ra[1] * t[0];
      const rbT = rb[0] * t[1] - rb[1] * t[0];
      const want = slip / (1 / mA + 1 / mB + (raT * raT) / iA + (rbT * rbT) / iB);
      const friction = Math.min(want, IMPACT_GRIP * impulse);
      apply(a, mA, iA, ra, t[0] * friction, t[1] * friction, 1);
      apply(b, mB, iB, rb, t[0] * friction, t[1] * friction, -1);
    }
  }
  const push = (Math.max(0, hit.depth - 0.005) * 0.8) / (1 / mA + 1 / mB);
  a.x -= (nx * push) / mA;
  a.y -= (ny * push) / mA;
  b.x += (nx * push) / mB;
  b.y += (ny * push) / mB;
  return { impulse, closing: Math.max(0, -vn) };
}

function wreck(game, vehicle) {
  if (vehicle.wreck) return;
  vehicle.body = bodyOf(vehicle);
  vehicle.wreck = true;
  vehicle.wreckAt = game.t;
  vehicle.restAt = null;
}

// The Intelligent Driver Model: the acceleration a driver chooses given the
// gap to whatever is ahead and how fast they are closing on it.
export function idm(kind, v, v0, gap = Infinity, dv = 0) {
  const { a, b, T, s0 } = KINDS[kind];
  const free = 1 - Math.pow(v / v0, 4);
  if (gap === Infinity) return a * free;
  const want = s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
  return a * (free - (want / Math.max(gap, 0.05)) ** 2);
}

export const stopsFor = (v, distance) => distance > 0 && (v * v) / (2 * distance) <= SAFE_BRAKE;

function lanesOf(game) {
  const lanes = Object.fromEntries(laneList(game).map((lane) => [lane.id, []]));
  for (const vehicle of game.vehicles) if (!vehicle.wreck) lanes[vehicle.lane.id].push(vehicle);
  for (const id in lanes) lanes[id].sort((a, b) => b.s - a.s);
  return lanes;
}

// Anything that is not this vehicle's leader but sits across its lane ahead:
// a wreck, or a vehicle from the other road stopped in the box. Drivers react
// only after it has been there for PERCEIVE seconds, and only yield to
// crossing traffic that arrived before them, so a standoff in the box can't
// hold forever: the first to arrive pushes on.
function blockersAhead(game, vehicle, lane) {
  const { width, length } = KINDS[vehicle.kind];
  const half = width / 2 + 0.4;
  const seen = (vehicle.seen ??= {});
  const found = [];
  const still = {};
  for (const other of game.vehicles) {
    if (other === vehicle || (!other.wreck && (parallel(other.lane, lane) || other.id > vehicle.id))) continue;
    const body = bodyOf(other);
    const cx = body.x - lane.start[0];
    const cy = body.y - lane.start[1];
    const middle = cx * lane.right[0] + cy * lane.right[1] - LANE / 2;
    const reach = REACH_OF[other.kind];
    if (middle + reach < -half || middle - reach > half || cx * lane.dir[0] + cy * lane.dir[1] < vehicle.s - length * 0.5) continue;
    let near = Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of cornersOf(body, other.kind)) {
      const dx = x - lane.start[0];
      const dy = y - lane.start[1];
      const along = dx * lane.dir[0] + dy * lane.dir[1];
      const across = dx * lane.right[0] + dy * lane.right[1] - LANE / 2;
      near = Math.min(near, along);
      lo = Math.min(lo, across);
      hi = Math.max(hi, across);
    }
    if (hi < -half || lo > half || near < vehicle.s - length * 0.5) continue;
    still[other.id] = seen[other.id] ?? game.t;
    if (game.t - still[other.id] < PERCEIVE) continue;
    found.push({ gap: near - vehicle.s, speed: Math.max(0, body.vx * lane.dir[0] + body.vy * lane.dir[1]) });
  }
  vehicle.seen = still;
  return found;
}

// A driver watches one gate at a time: the next on their lane. Reaching a new
// one, they decide afresh whether to stop for it, as a new arrival does.
function drive(game, lanes, dt) {
  for (const lane of laneList(game)) {
    const id = lane.approach;
    const queue = lanes[lane.id];
    queue.forEach((vehicle, index) => {
      const kind = KINDS[vehicle.kind];
      const ahead = gateAhead(game, vehicle);
      if (ahead && vehicle.gate !== ahead.tile.index) {
        vehicle.gate = ahead.tile.index;
        vehicle.epoch = -1;
        vehicle.obey = true;
      }
      const shut = Boolean(ahead) && !ahead.tile.open[id];
      const toLine = ahead ? ahead.line - vehicle.s : Infinity;
      if (shut && vehicle.epoch !== ahead.tile.epoch[id]) {
        vehicle.epoch = ahead.tile.epoch[id];
        vehicle.obey = stopsFor(vehicle.v, toLine - STOP_SHORT);
      }
      let acc = idm(vehicle.kind, vehicle.v, vehicle.v0);
      const leader = queue[index - 1];
      if (leader) acc = Math.min(acc, idm(vehicle.kind, vehicle.v, vehicle.v0, leader.s - KINDS[leader.kind].length - vehicle.s, vehicle.v - leader.v));
      if (shut && vehicle.obey) {
        const room = Math.max(0.05, toLine - STOP_SHORT);
        acc = Math.min(acc, Math.max(idm(vehicle.kind, vehicle.v, vehicle.v0, toLine - STOP_SHORT + kind.s0, vehicle.v), -Math.max(kind.b, (1.05 * vehicle.v * vehicle.v) / (2 * room))));
      }
      for (const blocker of blockersAhead(game, vehicle, lane)) acc = Math.min(acc, idm(vehicle.kind, vehicle.v, vehicle.v0, blocker.gap, vehicle.v - blocker.speed));
      acc = Math.max(acc, -kind.brake);
      const next = vehicle.v + acc * dt;
      if (next > 0) {
        vehicle.s += vehicle.v * dt + 0.5 * acc * dt * dt;
        vehicle.v = next;
      } else {
        if (acc < 0) vehicle.s += (vehicle.v * vehicle.v) / (-2 * acc);
        vehicle.v = 0;
      }
      vehicle.acc = acc;
    });
  }
}

function slide(game, dt) {
  for (const vehicle of game.vehicles) {
    if (!vehicle.wreck) continue;
    const body = vehicle.body;
    const { length, width } = KINDS[vehicle.kind];
    const c = Math.cos(body.th);
    const s = Math.sin(body.th);
    const along = towardZero(body.vx * c + body.vy * s, ROLLING * GRAVITY * dt);
    const across = towardZero(-body.vx * s + body.vy * c, TYRE_GRIP * GRAVITY * dt);
    body.vx = along * c - across * s;
    body.vy = along * s + across * c;
    body.w = towardZero(body.w, ((3 * TYRE_GRIP * GRAVITY * length) / (length * length + width * width)) * dt);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.th += body.w * dt;
    const moving = Math.hypot(body.vx, body.vy) > 0.05 || Math.abs(body.w) > 0.05;
    if (moving) vehicle.restAt = null;
    else vehicle.restAt ??= game.t;
  }
}

function collide(game) {
  const list = game.vehicles;
  const boxes = list.map(boxOfVehicle);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a.wreck && !b.wreck && parallel(a.lane, b.lane)) continue;
      const boxA = boxes[i];
      const boxB = boxes[j];
      const reach = REACH_OF[a.kind] + REACH_OF[b.kind];
      const dx = boxA.x - boxB.x;
      const dy = boxA.y - boxB.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const hit = overlap(boxA, boxB);
      if (!hit) continue;
      const fresh = !a.wreck && !b.wreck;
      wreck(game, a);
      wreck(game, b);
      const { closing } = resolve(a.body, b.body, a.kind, b.kind, hit);
      boxes[i] = boxOfVehicle(a);
      boxes[j] = boxOfVehicle(b);
      if (fresh) {
        game.strikes++;
        game.struck = "crash";
        pushEvent(game, { type: "crash", x: hit.point[0], y: hit.point[1], speed: closing, ids: [a.id, b.id] });
      }
    }
  }
}

// Bodies further apart than this can't touch a box of the given half-size.
const within = (box, body, reach) => Math.abs(box.x - body.x) < reach && Math.abs(box.y - body.y) < reach;

const zoneOf = (tile, approach) => {
  const [x, y] = tileLaneAt(tile, approach, ARM_AT);
  return { x, y, th: approach.heading, hl: 0.45, hw: LANE / 2 + 0.2 };
};
export const armBlocked = (game, index, id, bodies = game.vehicles.map(bodyOf)) => {
  const zone = zoneOf(game.tiles[index], BY_ID[id]);
  return game.vehicles.some((vehicle, at) => within(zone, bodies[at], 9) && overlap(zone, boxOfVehicle(vehicle)));
};

function gates(game, dt) {
  const bodies = game.vehicles.map(bodyOf);
  for (const tile of game.tiles) {
    for (const id of IDS) {
      const target = tile.open[id] || armBlocked(game, tile.index, id, bodies) ? 1 : 0;
      const by = dt / ARM_TIME;
      tile.arm[id] = target > tile.arm[id] ? Math.min(target, tile.arm[id] + by) : Math.max(target, tile.arm[id] - by);
    }
  }
}

export function entryClear(game, id, kind) {
  const { length, s0 } = KINDS[kind];
  const lane = game.lanes[id];
  const [x, y] = laneAt(lane, length / 2);
  const entry = { x, y, th: lane.heading, hl: length / 2 + s0, hw: LANE / 2 };
  return !game.vehicles.some((vehicle) => {
    if (!vehicle.wreck && vehicle.lane === lane) return vehicle.s - KINDS[vehicle.kind].length < length + s0 + 0.5;
    return vehicle.wreck && Boolean(overlap(entry, boxOfVehicle(vehicle)));
  });
}

// A newcomer has seen the first lamp on the way in: if it is red, they arrive
// slow enough to stop for it comfortably, never already in the dilemma zone.
function enter(game, id, kind) {
  const spec = KINDS[kind];
  const lane = game.lanes[id];
  const last = game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.lane === lane).sort((a, b) => a.s - b.s)[0];
  const v0 = spec.v0 * (0.92 + game.rng() * 0.16);
  let v = v0;
  if (last) {
    const gap = last.s - KINDS[last.kind].length - spec.length;
    v = Math.min(v0, Math.max(last.v, Math.sqrt(Math.max(0, 2 * spec.b * (gap - spec.s0)))));
  }
  if (!game.tiles[lane.tiles[0]].open[lane.approach]) v = Math.min(v, Math.sqrt(2 * SAFE_BRAKE * 0.9 * (S_STOP - spec.length - STOP_SHORT)));
  game.vehicles.push({ id: game.nextId++, kind, lane, s: spec.length, v, v0, acc: 0, born: game.t, epoch: -1, obey: true, wreck: false });
}

function arrive(game) {
  const demand = demandAt(game.demo ? 90 + (game.t % 80) : game.t);
  for (const { id, approach } of laneList(game)) {
    while (game.next[id] <= game.t) {
      if (game.rng() < demand[approach] / PEAK_RATE) game.backlog[id].push(kindOf(game));
      game.next[id] = arrivalAfter(game, game.next[id]);
    }
    const queue = game.backlog[id];
    if (queue.length && entryClear(game, id, queue[0])) enter(game, id, queue.shift());
  }
}

export const onBoard = (game, x, y, margin = 0) => game.tiles.some((tile) => Math.abs(x - tile.x) <= BOARD + margin && Math.abs(y - tile.y) <= BOARD + margin);

function retire(game) {
  game.vehicles = game.vehicles.filter((vehicle) => {
    if (vehicle.wreck) {
      const gone = vehicle.restAt !== null && game.t - vehicle.restAt > WRECK_REST + WRECK_FADE;
      return !gone && onBoard(game, vehicle.body.x, vehicle.body.y, 6);
    }
    if (vehicle.s < vehicle.lane.length) return true;
    game.cleared++;
    return false;
  });
}

// Three strikes end the shift. A crash is one. So is a jam: once JAM vehicles
// are queued off the board on a lane, a countdown starts, and every vehicle
// that drives on from the queue winds it back to JAM_TIME. If it runs out,
// that's a strike, and it starts again while the queue is still that long.
function judge(game, dt) {
  if (game.demo || game.over) return;
  for (const { id } of laneList(game)) {
    const count = game.backlog[id].length;
    const jam = game.jam[id];
    if (count < JAM) game.jam[id] = null;
    else if (!jam || count < jam.count) game.jam[id] = { left: JAM_TIME, count };
    else {
      jam.count = count;
      jam.left -= dt;
      if (jam.left > 1e-9) continue;
      jam.left = JAM_TIME;
      game.strikes++;
      game.struck = "jam";
      pushEvent(game, { type: "jam", lane: id });
    }
  }
  if (game.strikes < STRIKES) return;
  game.over = { reason: "strikes", cause: game.struck, t: game.t };
  pushEvent(game, { type: "over", ...game.over });
}

// The gate holding a jammed queue: the first shut one along its lane, or the
// lane's first gate when every gate on it is open and something else is in
// the way.
export function gateFor(game, id) {
  const lane = game.lanes[id];
  const index = lane.tiles.find((each) => !game.tiles[each].open[lane.approach]) ?? lane.tiles[0];
  return { tile: index, id: lane.approach };
}

// The lanes counting down to a jam strike, most urgent first.
export const jamsOf = (game) =>
  laneList(game)
    .filter((lane) => game.jam[lane.id])
    .sort((a, b) => game.jam[a.id].left - game.jam[b.id].left);

export function step(game, dt = STEP) {
  game.t += dt;
  if (!game.over) arrive(game);
  drive(game, lanesOf(game), dt);
  slide(game, dt);
  collide(game);
  gates(game, dt);
  retire(game);
  judge(game, dt);
  if (!game.demo && !game.over) while (nextTileAt(game) !== null && game.cleared >= nextTileAt(game)) addTile(game);
  if (game.demo) autopilot(game);
}

export function advance(game, seconds) {
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(STEP, left);
    step(game, dt);
    left -= dt;
  }
}

// What the reader sees on the board.
export function alphaOf(game, vehicle) {
  if (vehicle.wreck) return vehicle.restAt === null ? 1 : 1 - smooth(WRECK_REST, WRECK_REST + WRECK_FADE, game.t - vehicle.restAt);
  const length = KINDS[vehicle.kind].length;
  return Math.min(smooth(0, FADE, vehicle.s - length), smooth(0, FADE, vehicle.lane.length - vehicle.s));
}
export const waitingOf = (game) =>
  game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.v < 0.5).length + laneList(game).reduce((sum, lane) => sum + game.backlog[lane.id].length, 0);
// Who is held at one gate: stopped short of it, and, on the lane's first
// tile, the queue off the board.
export const waitingAt = (game, index, id) => {
  const lane = laneOf(game, index, id);
  const held = game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.lane === lane && vehicle.v < 0.5 && gateAhead(game, vehicle)?.tile.index === index).length;
  return held + (lane.tiles[0] === index ? game.backlog[lane.id].length : 0);
};
export const queueOf = (game, id) => game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.lane.id === id && vehicle.v < 0.5).length + game.backlog[id].length;

// A tile's box is clear when nothing is inside its stop lines and nobody on
// one of its closed approaches is still committed to running the line.
export function boxClear(game, index) {
  const tile = game.tiles[index];
  const box = { x: tile.x, y: tile.y, th: 0, hl: STOP, hw: STOP };
  return !game.vehicles.some((vehicle) => {
    if (within(box, bodyOf(vehicle), STOP + 7) && overlap(box, boxOfVehicle(vehicle))) return true;
    if (vehicle.wreck || vehicle.obey) return false;
    return gateAhead(game, vehicle)?.tile === tile && !tile.open[vehicle.lane.approach];
  });
}

// The demo plays a safe two-phase plan at each junction: green for one road,
// wait for the box to clear, then green for the other.
export const GREEN = 8;
export const ALL_RED = 1.2;
export function autopilot(game) {
  const members = (axis) => IDS.filter((id) => AXIS_OF[id] === axis);
  for (const tile of game.tiles) {
    const pilot = (tile.pilot ??= { axis: "EW", state: "green", until: game.t + GREEN, since: 0 });
    if (pilot.state === "green") {
      for (const id of IDS) if (tile.open[id] !== (AXIS_OF[id] === pilot.axis)) setOpen(game, tile.index, id, AXIS_OF[id] === pilot.axis);
      if (game.t >= pilot.until) {
        members(pilot.axis).forEach((id) => setOpen(game, tile.index, id, false));
        pilot.state = "clearing";
        pilot.since = game.t;
      }
    } else if (game.t - pilot.since >= ALL_RED && boxClear(game, tile.index)) {
      pilot.axis = pilot.axis === "EW" ? "NS" : "EW";
      pilot.state = "green";
      pilot.until = game.t + GREEN;
    }
  }
}

// Puts a vehicle on a lane by hand, for tests and scripted scenes.
export function place(game, id, kind, s, v = KINDS[kind].v0) {
  const vehicle = { id: game.nextId++, kind, lane: game.lanes[id], s, v, v0: KINDS[kind].v0, acc: 0, born: game.t, epoch: -1, obey: true, wreck: false };
  game.vehicles.push(vehicle);
  return vehicle;
}
export function quiet(game) {
  game.quiet = true;
  for (const id in game.next) game.next[id] = Infinity;
  return game;
}
