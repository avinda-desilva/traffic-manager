// The junction, its drivers and its crashes, in metres and seconds.
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
export const GRIDLOCK = 6;
export const TYRE_GRIP = 0.7;
export const ROLLING = 0.25;
export const IMPACT_GRIP = 0.5;
export const RESTITUTION = 0.15;
export const WRECK_REST = 4;
export const WRECK_FADE = 0.8;
export const FADE = 4;
export const STEP = 1 / 120;

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

export const laneAt = (approach, s, lateral = 0) => [
  approach.start[0] + approach.dir[0] * s + approach.right[0] * lateral,
  approach.start[1] + approach.dir[1] * s + approach.right[1] * lateral,
];
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
    open: {},
    epoch: {},
    arm: {},
    backlog: {},
    next: {},
    cleared: 0,
    strikes: 0,
    over: null,
    pilot: null,
  };
  for (const id of IDS) {
    game.open[id] = false;
    game.epoch[id] = 0;
    game.arm[id] = 0;
    game.backlog[id] = [];
    game.next[id] = arrivalAfter(game, 0);
  }
  return game;
}

const arrivalAfter = (game, t) => t - Math.log(1 - game.rng()) / PEAK_RATE;

function kindOf(game) {
  let pick = game.rng();
  for (const [name, share] of MIX) {
    if (pick < share) return name;
    pick -= share;
  }
  return MIX[0][0];
}

export function setOpen(game, id, open) {
  if (game.over || game.open[id] === open) return false;
  game.open[id] = open;
  if (!open) game.epoch[id]++;
  pushEvent(game, { type: "signal", id, open });
  return true;
}
export const toggle = (game, id) => setOpen(game, id, !game.open[id]);

function pushEvent(game, event) {
  game.events.push({ ...event, t: game.t });
  if (game.events.length > 64) game.events.splice(0, game.events.length - 64);
}

// Where a vehicle's body is: centre, heading and velocity, in metres.
export function bodyOf(vehicle) {
  if (vehicle.wreck) return vehicle.body;
  const approach = BY_ID[vehicle.approach];
  const [x, y] = laneAt(approach, vehicle.s - KINDS[vehicle.kind].length / 2);
  return { x, y, th: approach.heading, vx: approach.dir[0] * vehicle.v, vy: approach.dir[1] * vehicle.v, w: 0 };
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
  const lanes = Object.fromEntries(IDS.map((id) => [id, []]));
  for (const vehicle of game.vehicles) if (!vehicle.wreck) lanes[vehicle.approach].push(vehicle);
  for (const id of IDS) lanes[id].sort((a, b) => b.s - a.s);
  return lanes;
}

// Anything that is not this vehicle's leader but sits across its lane ahead:
// a wreck, or a vehicle from the other road stopped in the box. Drivers react
// only after it has been there for PERCEIVE seconds, and only yield to
// crossing traffic that arrived before them, so a standoff in the box can't
// hold forever: the first to arrive pushes on.
function blockersAhead(game, vehicle, approach) {
  const { width, length } = KINDS[vehicle.kind];
  const half = width / 2 + 0.4;
  const seen = (vehicle.seen ??= {});
  const found = [];
  const still = {};
  for (const other of game.vehicles) {
    if (other === vehicle || (!other.wreck && (other.approach === vehicle.approach || other.id > vehicle.id))) continue;
    let near = Infinity;
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, y] of cornersOf(bodyOf(other), other.kind)) {
      const dx = x - approach.start[0];
      const dy = y - approach.start[1];
      const along = dx * approach.dir[0] + dy * approach.dir[1];
      const across = dx * approach.right[0] + dy * approach.right[1] - LANE / 2;
      near = Math.min(near, along);
      lo = Math.min(lo, across);
      hi = Math.max(hi, across);
    }
    if (hi < -half || lo > half || near < vehicle.s - length * 0.5) continue;
    still[other.id] = seen[other.id] ?? game.t;
    if (game.t - still[other.id] < PERCEIVE) continue;
    const body = bodyOf(other);
    found.push({ gap: near - vehicle.s, speed: Math.max(0, body.vx * approach.dir[0] + body.vy * approach.dir[1]) });
  }
  vehicle.seen = still;
  return found;
}

function drive(game, lanes, dt) {
  for (const id of IDS) {
    const approach = BY_ID[id];
    const lane = lanes[id];
    lane.forEach((vehicle, index) => {
      const kind = KINDS[vehicle.kind];
      const toLine = S_STOP - vehicle.s;
      if (!game.open[id] && vehicle.epoch !== game.epoch[id]) {
        vehicle.epoch = game.epoch[id];
        vehicle.obey = stopsFor(vehicle.v, toLine - STOP_SHORT);
      }
      let acc = idm(vehicle.kind, vehicle.v, vehicle.v0);
      const leader = lane[index - 1];
      if (leader) acc = Math.min(acc, idm(vehicle.kind, vehicle.v, vehicle.v0, leader.s - KINDS[leader.kind].length - vehicle.s, vehicle.v - leader.v));
      if (!game.open[id] && vehicle.obey && toLine > -0.2) {
        const room = Math.max(0.05, toLine - STOP_SHORT);
        acc = Math.min(acc, Math.max(idm(vehicle.kind, vehicle.v, vehicle.v0, toLine - STOP_SHORT + kind.s0, vehicle.v), -Math.max(kind.b, (1.05 * vehicle.v * vehicle.v) / (2 * room))));
      }
      for (const blocker of blockersAhead(game, vehicle, approach)) acc = Math.min(acc, idm(vehicle.kind, vehicle.v, vehicle.v0, blocker.gap, vehicle.v - blocker.speed));
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
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (!a.wreck && !b.wreck && a.approach === b.approach) continue;
      const boxA = boxOfVehicle(a);
      const boxB = boxOfVehicle(b);
      const reach = Math.hypot(boxA.hl, boxA.hw) + Math.hypot(boxB.hl, boxB.hw);
      if (Math.hypot(boxA.x - boxB.x, boxA.y - boxB.y) > reach) continue;
      const hit = overlap(boxA, boxB);
      if (!hit) continue;
      const fresh = !a.wreck && !b.wreck;
      wreck(game, a);
      wreck(game, b);
      const { closing } = resolve(a.body, b.body, a.kind, b.kind, hit);
      if (fresh) {
        game.strikes++;
        pushEvent(game, { type: "crash", x: hit.point[0], y: hit.point[1], speed: closing, ids: [a.id, b.id] });
      }
    }
  }
}

const zoneOf = (approach) => {
  const [x, y] = laneAt(approach, ARM_AT);
  return { x, y, th: approach.heading, hl: 0.45, hw: LANE / 2 + 0.2 };
};
export const armBlocked = (game, id) => game.vehicles.some((vehicle) => overlap(zoneOf(BY_ID[id]), boxOfVehicle(vehicle)));

function gates(game, dt) {
  for (const id of IDS) {
    const target = game.open[id] || armBlocked(game, id) ? 1 : 0;
    const by = dt / ARM_TIME;
    game.arm[id] = target > game.arm[id] ? Math.min(target, game.arm[id] + by) : Math.max(target, game.arm[id] - by);
  }
}

export function entryClear(game, id, kind) {
  const { length, s0 } = KINDS[kind];
  const approach = BY_ID[id];
  const [x, y] = laneAt(approach, length / 2);
  const entry = { x, y, th: approach.heading, hl: length / 2 + s0, hw: LANE / 2 };
  return !game.vehicles.some((vehicle) => {
    if (!vehicle.wreck && vehicle.approach === id) return vehicle.s - KINDS[vehicle.kind].length < length + s0 + 0.5;
    return vehicle.wreck && Boolean(overlap(entry, boxOfVehicle(vehicle)));
  });
}

function enter(game, id, kind) {
  const spec = KINDS[kind];
  const last = game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.approach === id).sort((a, b) => a.s - b.s)[0];
  const v0 = spec.v0 * (0.92 + game.rng() * 0.16);
  let v = v0;
  if (last) {
    const gap = last.s - KINDS[last.kind].length - spec.length;
    v = Math.min(v0, Math.max(last.v, Math.sqrt(Math.max(0, 2 * spec.b * (gap - spec.s0)))));
  }
  game.vehicles.push({ id: game.nextId++, kind, approach: id, s: spec.length, v, v0, acc: 0, born: game.t, epoch: -1, obey: true, wreck: false });
}

function arrive(game) {
  const demand = demandAt(game.demo ? 90 + (game.t % 80) : game.t);
  for (const id of IDS) {
    while (game.next[id] <= game.t) {
      if (game.rng() < demand[id] / PEAK_RATE) game.backlog[id].push(kindOf(game));
      game.next[id] = arrivalAfter(game, game.next[id]);
    }
    const queue = game.backlog[id];
    if (queue.length && entryClear(game, id, queue[0])) enter(game, id, queue.shift());
  }
}

function retire(game) {
  game.vehicles = game.vehicles.filter((vehicle) => {
    if (vehicle.wreck) {
      const gone = vehicle.restAt !== null && game.t - vehicle.restAt > WRECK_REST + WRECK_FADE;
      const off = Math.abs(vehicle.body.x) > BOARD + 6 || Math.abs(vehicle.body.y) > BOARD + 6;
      return !gone && !off;
    }
    if (vehicle.s < REACH) return true;
    game.cleared++;
    return false;
  });
}

function judge(game) {
  if (game.demo || game.over) return;
  if (game.strikes >= STRIKES) game.over = { reason: "crashes", t: game.t };
  const jammed = IDS.find((id) => game.backlog[id].length >= GRIDLOCK);
  if (!game.over && jammed) game.over = { reason: "gridlock", id: jammed, t: game.t };
  if (game.over) pushEvent(game, { type: "over", ...game.over });
}

export function step(game, dt = STEP) {
  game.t += dt;
  if (!game.over) arrive(game);
  drive(game, lanesOf(game), dt);
  slide(game, dt);
  collide(game);
  gates(game, dt);
  retire(game);
  judge(game);
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
  return Math.min(smooth(0, FADE, vehicle.s - length), smooth(0, FADE, REACH - vehicle.s));
}
export const waitingOf = (game) =>
  game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.v < 0.5).length + IDS.reduce((sum, id) => sum + game.backlog[id].length, 0);
export const queueOf = (game, id) => game.vehicles.filter((vehicle) => !vehicle.wreck && vehicle.approach === id && vehicle.v < 0.5).length + game.backlog[id].length;

// The box is clear when nothing is inside the stop lines and nobody on a
// closed approach is still committed to running its line.
export function boxClear(game) {
  const box = { x: 0, y: 0, th: 0, hl: STOP, hw: STOP };
  return !game.vehicles.some(
    (vehicle) =>
      overlap(box, boxOfVehicle(vehicle)) ||
      (!vehicle.wreck && !game.open[vehicle.approach] && !vehicle.obey && vehicle.s < S_STOP + 0.5),
  );
}

// The demo plays a safe two-phase plan: green for one road, wait for the box
// to clear, then green for the other.
export const GREEN = 8;
export const ALL_RED = 1.2;
export function autopilot(game) {
  const pilot = (game.pilot ??= { axis: "EW", state: "green", until: GREEN, since: 0 });
  const members = (axis) => IDS.filter((id) => AXIS_OF[id] === axis);
  if (pilot.state === "green") {
    for (const id of IDS) if (game.open[id] !== (AXIS_OF[id] === pilot.axis)) setOpen(game, id, AXIS_OF[id] === pilot.axis);
    if (game.t >= pilot.until) {
      members(pilot.axis).forEach((id) => setOpen(game, id, false));
      pilot.state = "clearing";
      pilot.since = game.t;
    }
  } else if (game.t - pilot.since >= ALL_RED && boxClear(game)) {
    pilot.axis = pilot.axis === "EW" ? "NS" : "EW";
    pilot.state = "green";
    pilot.until = game.t + GREEN;
  }
}

// Puts a vehicle on an approach by hand, for tests and scripted scenes.
export function place(game, id, kind, s, v = KINDS[kind].v0) {
  const vehicle = { id: game.nextId++, kind, approach: id, s, v, v0: KINDS[kind].v0, acc: 0, born: game.t, epoch: -1, obey: true, wreck: false };
  game.vehicles.push(vehicle);
  return vehicle;
}
export function quiet(game) {
  for (const id of IDS) game.next[id] = Infinity;
  return game;
}
