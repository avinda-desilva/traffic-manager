// The board that doesn't move: a base plate on feet, the crossroads inlaid in
// it, four kerbed islands, lampposts and a queue meter at each entry.
import * as k from "../vendor/anatomy/kit/iso-kit.mjs";
import * as G from "../vendor/anatomy/kit/lathe.mjs";
import * as M from "./model.mjs";
import * as PARTS from "./parts.mjs";

export const WIDTH = 760;
export const HEIGHT = 500;
export const B = M.BOARD * PARTS.U;
export const R = M.ROAD * PARTS.U;
export const PLATE = { x: -B - 6, y: -B - 6, w: 2 * B + 12, d: 2 * B + 12, r: 10 };
export const PLATE_H = 10;
const FOOT_H = 5;
const CORNER_R = 7;
const WALK = 20;
const PLOT_Z = PARTS.ISLAND_H + 0.8;
const LAMP = 21.5;
const LAMPS = [
  [-LAMP, -LAMP, 0],
  [LAMP, -LAMP, (3 * Math.PI) / 4],
  [-LAMP, LAMP, -Math.PI / 4],
  [64, 19.5, -Math.PI / 2],
];
const BAYS = { x0: -113, x1: -37, rows: [[37, 57], [93, 113]], step: 9.5 };
const PARKED = [
  ["car", -99.75, 47, -Math.PI / 2],
  ["car", -61.75, 47, -Math.PI / 2],
  ["van", -80.75, 102.5, Math.PI / 2],
  ["car", -42.25, 103, Math.PI / 2],
];
const PATH = { x: 37, y: -78, w: 76, d: 6, r: 3 };
const BENCHES = [
  [48, -83.2, 1],
  [70, -66.8, -1],
];const LAMP_TOP = 32;
const SHOP = { x: -106, y: -106, w: 58, d: 58, r: 1.5 };
const SHOP_TOP = 30;
const TREES = [
  [64, -92, 0.9],
  [96, -64, 1],
  [100, -100, 0.75],
  [106, 106, 0.8],
  [104, 50, 0.85],
];
const PIT = { x: 72.5, y: 90, w: 9, d: 9, r: 0.8 };

export const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(SHOP, 0, SHOP_TOP + 8)],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: 45, elevation: 38 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = (x, y) => k.depthOf([x, y, 0], P);
const byDepth = (points) => [...points].sort((a, b) => depth2(a[0], a[1]) - depth2(b[0], b[1]));

// A rectangle with its own radius at each corner, as a floor ring.
function roundRect(x0, y0, x1, y1, radii, steps = 6) {
  const corners = [
    [x1, y0, -90, radii[0]],
    [x1, y1, 0, radii[1]],
    [x0, y1, 90, radii[2]],
    [x0, y0, 180, radii[3]],
  ];
  const out = [];
  for (const [cx, cy, start, r] of corners) {
    const ox = cx + (start === -90 || start === 0 ? -r : r);
    const oy = cy + (start === 0 || start === 90 ? -r : r);
    for (let step = 0; step <= steps; step++) {
      const angle = ((start + (90 * step) / steps) * Math.PI) / 180;
      out.push([ox + r * Math.cos(angle), oy + r * Math.sin(angle)]);
    }
  }
  return out;
}

// Island in quadrant (sx, sy): its inner corner faces the junction.
export const QUADRANTS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
function islandRing(sx, sy, inset = 0) {
  const lo = R + inset;
  const hi = B - inset;
  const radii = [2, 2, 2, 2].map((r) => Math.max(0.2, r - inset));
  const inner = Math.max(0.5, CORNER_R - inset);
  const ring = roundRect(lo, lo, hi, hi, [radii[0], radii[1], radii[2], inner]);
  return ring.map(([x, y]) => [x * sx, y * sy]);
}

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26))) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 32), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 32), { tone: "mid" }));
  }
  const face = PLATE.y + PLATE.d;
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "lo", inner: L(k.sideSeam(PLATE, -PLATE_H + 2.4, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 3), 0, P), { tone: "faint" }));
  const screws = k.corners(PLATE, 3);
  out.push(k.dotsSvg(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const ticks = k.sideTicks(-B + 8, B - 8, 4, 5, face, 0, [1.6, 3.4], P, "x");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const side = PLATE.x + PLATE.w;
  const label = [
    [side, -34, -2.2],
    [side, 34, -2.2],
    [side, 34, -7.8],
    [side, -34, -7.8],
  ];
  out.push(L(k.pathOf(label.map(at), true), { tone: "lo" }));
  out.push(k.dotsSvg([at([side, -31.5, -5]), at([side, 31.5, -5])], { size: 0.5 }));
  out.push(k.faceTextSvg(k.sideMatrix([side, 0], -6.2, P, "right"), "TRAFFIC MANAGER", { size: 3.3, tone: "mid", anchor: "middle" }));
  return out.join("");
}

function road() {
  const ring = [
    [B, -R],
    [B, R],
    [R, R],
    [R, B],
    [-R, B],
    [-R, R],
    [-B, R],
    [-B, -R],
    [-R, -R],
    [-R, -B],
    [R, -B],
    [R, -R],
  ];
  return S(k.extrude(ring, 0, PARTS.ROAD_H, P, { convex: false }), { tone: "lo", className: "tm-road" });
}

const paint = (plan) => S(k.slabOf(plan, PARTS.ROAD_H, 0.08, P, 2), { tone: "lo", flat: true, className: "tm-paint" });

function markings() {
  const out = [];
  const stopAt = (M.BOARD - M.S_STOP) * PARTS.U;
  for (let c = stopAt + 4; c + 6 <= B - 3; c += 12) {
    for (const from of [c, -c - 6]) {
      out.push(paint({ x: from, y: -0.35, w: 6, d: 0.7, r: 0.3 }));
      out.push(paint({ x: -0.35, y: from, w: 0.7, d: 6, r: 0.3 }));
    }
  }
  for (const approach of M.APPROACHES) {
    const [ax, ay] = M.laneAt(approach, M.S_STOP).map((v) => v * PARTS.U);
    const across = approach.dir[0] === 0;
    const half = R / 2;
    out.push(paint(across ? { x: ax - half, y: ay - 0.6, w: R, d: 1.2, r: 0.2 } : { x: ax - 0.6, y: ay - half, w: 1.2, d: R, r: 0.2 }));
  }
  const walk = [R + 1.5, R + M.CROSSWALK * PARTS.U - 1.5];
  for (const sign of [-1, 1]) {
    for (let index = 0; index < 7; index++) {
      const q = -R + 1 + index * 4.4;
      const along = sign > 0 ? walk[0] : -walk[1];
      out.push(paint({ x: along, y: q, w: walk[1] - walk[0], d: 2.2, r: 0.2 }));
      out.push(paint({ x: q, y: along, w: 2.2, d: walk[1] - walk[0], r: 0.2 }));
    }
  }
  return out.join("");
}

function manhole(x, y) {
  return [
    S(k.cylinder(x, y, 3.2, PARTS.ROAD_H, 0.15, P, 36), { tone: "lo", crease: "none" }),
    L(k.ring(x, y, 2.4, PARTS.ROAD_H + 0.15, P, 32), { tone: "faint" }),
    k.dotsSvg([0, 1, 2, 3].map((i) => at([x + 1.4 * Math.cos((i * Math.PI) / 2 + 0.6), y + 1.4 * Math.sin((i * Math.PI) / 2 + 0.6), PARTS.ROAD_H + 0.15])), { size: 0.35, tone: "lo" }),
  ].join("");
}

function drain(approach) {
  const s = (M.S_STOP - 3) * PARTS.U;
  const [cx, cy] = M.laneAt(approach, s / PARTS.U, M.LANE / 2 - 0.45).map((v) => v * PARTS.U);
  const along = approach.dir[0] !== 0;
  const plan = along ? { x: cx - 3, y: cy - 1, w: 6, d: 2, r: 0.3 } : { x: cx - 1, y: cy - 3, w: 2, d: 6, r: 0.3 };
  const out = [S(k.slabOf(plan, PARTS.ROAD_H, 0.12, P, 2), { tone: "lo", flat: true })];
  for (let index = 0; index < 4; index++) {
    const slot = along ? { x: plan.x + 0.8 + index * 1.2, y: plan.y + 0.45, w: 0.55, d: 1.1, r: 0.25 } : { x: plan.x + 0.45, y: plan.y + 0.8 + index * 1.2, w: 1.1, d: 0.55, r: 0.25 };
    out.push(L(k.planOutline(slot, PARTS.ROAD_H + 0.12, P, 2), { tone: "lo" }));
  }
  return out.join("");
}

function island(sx, sy) {
  const ring = islandRing(sx, sy);
  const kerb = islandRing(sx, sy, 2.4);
  const out = [S(k.extrude(ring, 0, PARTS.ISLAND_H, P, { bevel: 0.5 }), { tone: "mid", className: "tm-kerb" })];
  out.push(L(k.onTop(kerb, PARTS.ISLAND_H, P, true), { tone: "faint" }));
  const lo = R + WALK;
  const hi = B - 5;
  const plot = roundRect(lo, lo, hi, hi, [3, 3, 3, 3], 4).map(([x, y]) => [x * sx, y * sy]);
  const lot = sx < 0 && sy > 0;
  out.push(S(k.extrude(plot, PARTS.ISLAND_H, 0.8, P, { bevel: 0.3 }), { tone: "lo", className: lot ? "tm-plot tm-lot" : "tm-plot" }));
  const bed = roundRect(lo + 2, lo + 2, hi - 2, hi - 2, [1.5, 1.5, 1.5, 1.5], 3).map(([x, y]) => [x * sx, y * sy]);
  out.push(L(k.onTop(bed, PLOT_Z, P, true), { tone: "faint" }));
  if (lot) out.push(bays());
  if (sx > 0 && sy < 0) out.push(S(k.slabOf(PATH, PLOT_Z, 0.1, P, 4), { tone: "lo", flat: true, className: "tm-paint" }));
  if (sx > 0 && sy > 0) out.push(drawPit());
  return out.join("");
}

// The cable pit in front of the signal controller: a lifting cover with two key
// holes, and a run of duct covers from the pit to the cabinet's plinth.
function drawPit() {
  const out = [S(k.slabOf(PIT, PLOT_Z, 0.3, P, 2, 0.1), { tone: "lo" })];
  const top = PLOT_Z + 0.3;
  out.push(L(k.planOutline(k.insetPlan(PIT, 1.1), top, P, 2), { tone: "faint" }));
  out.push(k.dotsSvg([at([PIT.x + 2.6, PIT.y + PIT.d / 2, top]), at([PIT.x + PIT.w - 2.6, PIT.y + PIT.d / 2, top])], { size: 0.4, tone: "lo" }));
  const x = PIT.x + PIT.w / 2 - 1.5;
  const from = PARTS.strikeBoardBox()[3];
  const to = PIT.y;
  const step = (to - from) / 3;
  for (let index = 0; index < 3; index++) out.push(S(k.slabOf({ x, y: from + index * step + 0.15, w: 3, d: step - 0.3, r: 0.3 }, PLOT_Z, 0.2, P, 2), { tone: "lo", flat: true }));
  return out.join("");
}

// Car park bays on the left plot: two rows, each divider ending on the aisle line.
function bays() {
  const lines = [];
  for (const [y0, y1] of BAYS.rows) {
    const aisle = y0 === BAYS.rows[0][0] ? y1 : y0;
    lines.push(k.lineOnTop([BAYS.x0, aisle], [BAYS.x1, aisle], PLOT_Z, P));
    for (let x = BAYS.x0 + BAYS.step - 1; x < BAYS.x1 - 2; x += BAYS.step) lines.push(k.lineOnTop([x, y0], [x, y1], PLOT_Z, P));
  }
  return L(lines.join(""), { tone: "mid" });
}

function meter(approach) {
  const out = [];
  const point = (s, q, z) => [...M.laneAt(approach, s / PARTS.U, (M.LANE / 2) + q / PARTS.U).map((v) => v * PARTS.U), z];
  const corners = [point(5, 2.6, 0), point(30, 2.6, 0), point(30, 7.4, 0), point(5, 7.4, 0)];
  const ring = corners.map(([x, y]) => [x, y]);
  out.push(S(k.extrude(ring, PARTS.ISLAND_H, 0.9, P, { bevel: 0.3 }), { tone: "mid" }));
  const top = PARTS.ISLAND_H + 0.9;
  for (let index = 0; index < M.JAM; index++) {
    const [x, y] = point(8 + index * 4.2, 5, 0);
    out.push(`<path class="tm-pip" data-approach="${approach.id}" data-n="${index}" d="${k.ring(x, y, 1.15, top, P, 18)}"/>`);
  }
  return out.join("");
}

export function groundSvg() {
  const out = [plate(), road(), markings()];
  out.push(manhole(-72, 7.5), manhole(52, -7.5), manhole(-7.5, -76), manhole(7.5, 56));
  M.APPROACHES.forEach((approach) => out.push(drain(approach)));
  const islands = [...QUADRANTS].sort((a, b) => depth2(a[0], a[1]) - depth2(b[0], b[1]));
  for (const [sx, sy] of islands) out.push(island(sx, sy));
  M.APPROACHES.forEach((approach) => out.push(meter(approach)));
  return out.join("");
}

function lamppost([x, y, toward], index) {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 2.2, y: y - 2.2, w: 4.4, d: 4.4, r: 2.2 }, PARTS.ISLAND_H, 0.1, P)}"/>`);
  out.push(S(k.cylinder(x, y, 1.9, PARTS.ISLAND_H, 1.6, P, 24), { tone: "mid" }));
  out.push(k.dotsSvg([0, 1, 2, 3].map((i) => at([x + 1.45 * Math.cos(i * Math.PI / 2 + 0.78), y + 1.45 * Math.sin(i * Math.PI / 2 + 0.78), PARTS.ISLAND_H + 1.6])), { size: 0.3, tone: "mid" }));
  out.push(S(k.cylinder(x, y, 0.8, PARTS.ISLAND_H + 1.6, LAMP_TOP - PARTS.ISLAND_H - 1.6, P, 20), { tone: "mid", crease: "none", inner: L(k.sideArc(x, y, 0.8, 14, P, 12), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 1.05, 12, 1, P, 20), { tone: "mid" }));
  const arm = PARTS.rotate(k.roundedPlan({ x: 0, y: -0.45, w: 6.4, d: 0.9, r: 0.4 }, 2), x, y, toward);
  out.push(S(k.extrude(arm, LAMP_TOP - 1.4, 1, P), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 1, LAMP_TOP, 0.8, P, 20), { tone: "mid" }));
  const head = PARTS.rotate(k.roundedPlan({ x: 4.6, y: -1.5, w: 4.8, d: 3, r: 1 }, 3), x, y, toward);
  out.push(S(k.extrude(head, LAMP_TOP - 2.6, 1.6, P, { bevel: 0.3 }), { tone: "hi" }));
  return { key: `lamp${index}`, svg: out.join(""), box: [Math.min(x, x + 9.5 * Math.cos(toward)) - 2, Math.max(x, x + 9.5 * Math.cos(toward)) + 2, Math.min(y, y + 9.5 * Math.sin(toward)) - 2, Math.max(y, y + 9.5 * Math.sin(toward)) + 2, 0, LAMP_TOP + 1] };
}

// The corner shop on the far island: plinth, two storeys with windows on the
// two faces you can see, a cornice, awnings over the shopfronts and a roof
// with a plant unit and a tank.
function shop() {
  const out = [];
  const base = PLOT_Z;
  const plinth = k.insetPlan(SHOP, -1.4);
  out.push(`<path class="iso-halo" d="${k.haloOf(plinth, base, 0.1, P)}"/>`);
  out.push(S(k.slabOf(plinth, base, 1.6, P, 3, 0.4), { tone: "lo" }));
  const body = base + 1.6;
  out.push(S(k.slabOf(SHOP, body, SHOP_TOP - body, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(SHOP, 15.4, P, 3), { tone: "faint" }) }));
  const faceX = SHOP.x + SHOP.w;
  const faceY = SHOP.y + SHOP.d;
  const onX = (y, z) => at([faceX, y, z]);
  const onY = (x, z) => at([x, faceY, z]);
  const rect = (map, a0, a1, z0, z1) => k.pathOf([map(a0, z0), map(a1, z0), map(a1, z1), map(a0, z1)], true);
  const rise = (map, a, z0, z1) => k.pathOf([map(a, z0), map(a, z1)]);
  const windows = [];
  const mullions = [];
  for (const [map, from] of [
    [onX, SHOP.y],
    [onY, SHOP.x],
  ]) {
    for (let index = 0; index < 5; index++) {
      const a = from + 5 + index * 10.8;
      windows.push(rect(map, a, a + 6, 18.4, 25));
      mullions.push(rise(map, a + 3, 18.4, 25));
    }
    windows.push(rect(map, from + 6, from + 24, 5.4, 12.2), rect(map, from + 34, from + 52, 5.4, 12.2));
    mullions.push(rise(map, from + 15, 5.4, 12.2), rise(map, from + 43, 5.4, 12.2));
    windows.push(rect(map, from + 27, from + 31, body, 12.2));
  }
  out.push(L(windows.join(""), { tone: "lo" }), L(mullions.join(""), { tone: "faint" }));
  const cornice = k.insetPlan(SHOP, -0.9);
  out.push(S(k.slabOf(cornice, SHOP_TOP, 1.4, P, 3, 0.4), { tone: "mid" }));
  const roof = SHOP_TOP + 1.4;
  out.push(L(k.planOutline(k.insetPlan(cornice, 2), roof, P, 3), { tone: "faint" }));
  const plant = { x: -96, y: -92, w: 14, d: 9, r: 1 };
  out.push(S(k.slabOf(plant, roof, 4.6, P, 3, 0.4), { tone: "mid" }));
  for (let index = 0; index < 4; index++) out.push(L(k.planOutline({ x: plant.x + 2 + index * 3, y: plant.y + 2, w: 1.6, d: 5, r: 0.7 }, roof + 4.6, P, 2), { tone: "lo" }));
  out.push(S(k.cylinder(-70, -76, 5, roof, 1, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(-70, -76, 4.2, roof + 1, 6.4, P, 32), { tone: "mid", inner: L(k.sideArc(-70, -76, 4.2, roof + 4.2, P, 24), { tone: "faint" }) }));
  out.push(L(k.ring(-70, -76, 2.2, roof + 7.4, P, 24), { tone: "faint" }));
  for (const [x0, x1, y0, y1] of [
    [faceX, faceX + 3.6, SHOP.y + 5, SHOP.y + 25],
    [faceX, faceX + 3.6, SHOP.y + 33, SHOP.y + 53],
  ])
    out.push(S(k.slabOf({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r: 0.4 }, 12.8, 0.8, P, 2, 0.3), { tone: "mid", className: "tm-awning" }));
  for (const [x0, x1] of [
    [SHOP.x + 5, SHOP.x + 25],
    [SHOP.x + 33, SHOP.x + 53],
  ])
    out.push(S(k.slabOf({ x: x0, y: faceY, w: x1 - x0, d: 3.6, r: 0.4 }, 12.8, 0.8, P, 2, 0.3), { tone: "mid", className: "tm-awning" }));
  const box = [plinth.x, faceX + 3.6, plinth.y, faceY + 3.6, 0, roof + 7.4];
  return { key: "shop", svg: out.join(""), box };
}

function tree([x, y, size], index) {
  const trunk = 9 * size;
  const r = 6.4 * size;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - r * 0.8, y: y - r * 0.8, w: r * 1.6, d: r * 1.6, r: r * 0.8 }, PLOT_Z, 0.1, P)}"/>`];
  out.push(L(k.ring(x, y, 2.6 * size, PLOT_Z, P, 24), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 0.9 * size, PLOT_Z, trunk + r * 0.4, P, 16), { tone: "mid", crease: "none" }));
  out.push(S(G.sphereOf([x, y, PLOT_Z + trunk + r], r, P), { tone: "mid", className: "tm-canopy" }));
  return { key: `tree${index}`, svg: out.join(""), box: [x - r, x + r, y - r, y + r, 0, PLOT_Z + trunk + 2 * r] };
}

function parked([kind, x, y, th], index) {
  return { key: `parked${index}`, svg: PARTS.vehicleSvg(kind, x, y, th, P, { tone: "mid" }), box: PARTS.vehicleBox(kind, x, y, th) };
}

function bench([x, y, facing], index) {
  const out = [];
  for (const lx of [x + 1, x + 6.2]) out.push(S(k.slabOf({ x: lx, y: y + 0.4, w: 0.8, d: 1.6, r: 0.2 }, PLOT_Z, 2.2, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf({ x, y, w: 8, d: 2.4, r: 0.3 }, PLOT_Z + 2.2, 0.6, P, 2, 0.2), { tone: "mid" }));
  out.push(S(k.slabOf({ x, y: facing > 0 ? y : y + 1.8, w: 8, d: 0.6, r: 0.2 }, PLOT_Z + 2.8, 2.6, P, 2), { tone: "mid" }));
  return { key: `bench${index}`, svg: out.join(""), box: [x, x + 8, y, y + 2.4, 0, PLOT_Z + 5.4] };
}

export function props() {
  return [shop(), ...TREES.map(tree), ...LAMPS.map(lamppost), ...PARKED.map(parked), ...BENCHES.map(bench)];
}

// Painter's order for things that stand up: where two items overlap on
// screen, the one wholly behind the other along x, y or z is drawn first;
// otherwise the nearer centre wins. A depth-first walk turns that into order.
export function screenBoxOf(box, P0) {
  const xs = [];
  const ys = [];
  for (const x of [box[0], box[1]])
    for (const y of [box[2], box[3]])
      for (const z of [box[4], box[5]]) {
        const [sx, sy] = k.iso([x, y, z], P0);
        xs.push(sx);
        ys.push(sy);
      }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}

export function paintOrder(items, P0) {
  const eps = 0.01;
  const centre = (box) => k.depthOf([(box[0] + box[1]) / 2, (box[2] + box[3]) / 2, (box[4] + box[5]) / 2], P0);
  const compare = (a, b) => {
    for (let axis = 0; axis < 6; axis += 2) {
      if (a[axis + 1] <= b[axis] + eps) return -1;
      if (b[axis + 1] <= a[axis] + eps) return 1;
    }
    return centre(a) - centre(b);
  };
  const boxes = items.map((item) => screenBoxOf(item.box, P0));
  const behind = items.map(() => []);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a[1] <= b[0] || b[1] <= a[0] || a[3] <= b[2] || b[3] <= a[2]) continue;
      if (compare(items[i].box, items[j].box) < 0) behind[j].push(i);
      else behind[i].push(j);
    }
  }
  const seen = new Uint8Array(items.length);
  const out = [];
  const visit = (index) => {
    if (seen[index]) return;
    seen[index] = 1;
    for (const other of behind[index]) visit(other);
    out.push(items[index]);
  };
  items
    .map((item, index) => [centre(item.box), index])
    .sort((a, b) => a[0] - b[0])
    .forEach(([, index]) => visit(index));
  return out;
}
