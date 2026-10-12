// The board that doesn't move: one tile per crossroads, each a base plate on
// feet with the junction inlaid in it, four kerbed islands, lampposts and a
// queue meter at each outer entry. Every tile is drawn at the origin and
// placed with a translate, which the isometric camera turns into a shift.
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
const LAMP_TOP = 32;
const SHOP = { x: -106, y: -106, w: 58, d: 58, r: 1.5 };
const SHOP_TOP = 30;
const PIT = { x: 72.5, y: 90, w: 9, d: 9, r: 0.8 };

// What each island carries, written for the near (+x, +y) quadrant and
// mirrored into the others. The first tile keeps its corner shop, car park,
// park and signal controller; later tiles get low plots, so nothing tall
// stands in front of a road.
const PLOTS = {
  lot: {
    bays: { x0: 37, x1: 113, rows: [[37, 57], [93, 113]], step: 9.5 },
    parked: [
      ["car", 99.75, 47, -Math.PI / 2],
      ["car", 61.75, 47, -Math.PI / 2],
      ["van", 80.75, 102.5, Math.PI / 2],
      ["car", 42.25, 103, Math.PI / 2],
    ],
  },
  park: {
    paths: [{ x: 37, y: 72, w: 76, d: 6, r: 3 }],
    benches: [
      [48, 80.8, -1],
      [70, 64.4, 1],
    ],
    trees: [
      [64, 92, 0.9],
      [96, 64, 1],
      [100, 100, 0.75],
    ],
  },
  grove: {
    paths: [
      { x: 37, y: 72, w: 76, d: 6, r: 3 },
      { x: 72, y: 37, w: 6, d: 76, r: 3 },
    ],
    benches: [
      [50, 80.8, -1],
      [84, 64.4, 1],
    ],
    trees: [
      [54, 54, 0.85],
      [96, 52, 0.75],
      [52, 98, 0.95],
      [97, 96, 0.8],
    ],
  },
  control: { trees: [[106, 106, 0.8], [104, 50, 0.85]], pit: true },
  shop: { shop: true },
};
const FIRST = { "-1,-1": "shop", "1,-1": "park", "-1,1": "lot", "1,1": "control" };
const CYCLE = ["park", "lot", "grove"];
export const plotOf = (tile, [sx, sy], q) => (tile.index === 0 ? FIRST[`${sx},${sy}`] : CYCLE[(tile.index + q) % CYCLE.length]);
const flipPlan = ({ x, y, w, d, r }, sx, sy) => ({ x: sx > 0 ? x : -(x + w), y: sy > 0 ? y : -(y + d), w, d, r });
const flipHeading = (th, sx, sy) => Math.atan2(Math.sin(th) * sy, Math.cos(th) * sx);

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

// Which sides of a tile butt against a neighbour: W and E along x, N and S
// along y, matching the approach that enters from that side.
export function joinsOf(tiles, tile) {
  const has = (col, row) => tiles.some((each) => each.col === col && each.row === row);
  return { W: has(tile.col - 1, tile.row), E: has(tile.col + 1, tile.row), N: has(tile.col, tile.row - 1), S: has(tile.col, tile.row + 1) };
}

// The plate's outline: round corners on the outside of the board, near-square
// where two plates butt.
function plateRing(joins, inset = 0) {
  const corner = (a, b) => Math.max(0.3, (joins[a] || joins[b] ? 0.6 : PLATE.r) - inset);
  const x0 = PLATE.x + inset;
  const y0 = PLATE.y + inset;
  const x1 = PLATE.x + PLATE.w - inset;
  const y1 = PLATE.y + PLATE.d - inset;
  return roundRect(x0, y0, x1, y1, [corner("E", "N"), corner("E", "S"), corner("W", "S"), corner("W", "N")], 8);
}

const plateHalo = (joins) => `<path class="iso-halo" d="${k.extrude(plateRing(joins), -PLATE_H - FOOT_H, PLATE_H, P).fill}"/>`;

function plate(joins, plaque) {
  const out = [];
  const x0 = PLATE.x;
  const y0 = PLATE.y;
  const x1 = PLATE.x + PLATE.w;
  const y1 = PLATE.y + PLATE.d;
  const feet = k.corners(PLATE, 26).filter((_, index) => !([["W", "N"], ["E", "N"], ["W", "S"], ["E", "S"]][index].every((side) => joins[side])));
  for (const [x, y] of byDepth(feet)) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 32), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 32), { tone: "mid" }));
  }
  const ring = plateRing(joins);
  out.push(S(k.extrude(ring, -PLATE_H, PLATE_H, P, { bevel: 1.6 }), { tone: "lo", inner: L(k.ringSeam(ring, -PLATE_H + 2.4, P), { tone: "faint" }) }));
  out.push(L(k.onTop(plateRing(joins, 3), 0, P, true), { tone: "faint" }));
  const seams = [];
  if (joins.W) seams.push(k.lineOnTop([x0, y0], [x0, y1], 0, P));
  if (joins.N) seams.push(k.lineOnTop([x0, y0], [x1, y0], 0, P));
  if (seams.length) out.push(L(seams.join(""), { tone: "lo" }));
  const screws = k.corners(PLATE, 3);
  out.push(k.dotsSvg(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  if (!joins.S) {
    const ticks = k.sideTicks(-B + 8, B - 8, 4, 5, y1, 0, [1.6, 3.4], P, "x");
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  }
  if (!plaque) return out.join("");
  const side = x1;
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

// Where each arm of the road ends: at the island's end on an outer side, at
// the plate's edge where the road runs on into the next tile.
const reachOf = (joins) => Object.fromEntries(M.IDS.map((id) => [id, joins[id] ? -PLATE.x : B]));

function road(joins) {
  const end = reachOf(joins);
  const ring = [
    [end.E, -R],
    [end.E, R],
    [R, R],
    [R, end.S],
    [-R, end.S],
    [-R, R],
    [-end.W, R],
    [-end.W, -R],
    [-R, -R],
    [-R, -end.N],
    [R, -end.N],
    [R, -R],
  ];
  return S(k.extrude(ring, 0, PARTS.ROAD_H, P, { convex: false }), { tone: "lo", className: "tm-road" });
}

const paint = (plan) => S(k.slabOf(plan, PARTS.ROAD_H, 0.08, P, 2), { tone: "lo", flat: true, className: "tm-paint" });

// The centre dashes repeat every 12 units from each junction, and a tile is
// a whole number of repeats wide, so they run on evenly across a seam.
function markings(joins) {
  const out = [];
  const stopAt = (M.BOARD - M.S_STOP) * PARTS.U;
  const end = reachOf(joins);
  for (let c = stopAt + 4; c + 6 <= Math.max(...Object.values(end)) - 3; c += 12) {
    if (c + 6 <= end.E - 3) out.push(paint({ x: c, y: -0.35, w: 6, d: 0.7, r: 0.3 }));
    if (c + 6 <= end.W - 3) out.push(paint({ x: -c - 6, y: -0.35, w: 6, d: 0.7, r: 0.3 }));
    if (c + 6 <= end.S - 3) out.push(paint({ x: -0.35, y: c, w: 0.7, d: 6, r: 0.3 }));
    if (c + 6 <= end.N - 3) out.push(paint({ x: -0.35, y: -c - 6, w: 0.7, d: 6, r: 0.3 }));
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

function island(sx, sy, kind) {
  const ring = islandRing(sx, sy);
  const kerb = islandRing(sx, sy, 2.4);
  const out = [S(k.extrude(ring, 0, PARTS.ISLAND_H, P, { bevel: 0.5 }), { tone: "mid", className: "tm-kerb" })];
  out.push(L(k.onTop(kerb, PARTS.ISLAND_H, P, true), { tone: "faint" }));
  const lo = R + WALK;
  const hi = B - 5;
  const plot = roundRect(lo, lo, hi, hi, [3, 3, 3, 3], 4).map(([x, y]) => [x * sx, y * sy]);
  const plan = PLOTS[kind];
  out.push(S(k.extrude(plot, PARTS.ISLAND_H, 0.8, P, { bevel: 0.3 }), { tone: "lo", className: plan.bays ? "tm-plot tm-lot" : "tm-plot" }));
  const bed = roundRect(lo + 2, lo + 2, hi - 2, hi - 2, [1.5, 1.5, 1.5, 1.5], 3).map(([x, y]) => [x * sx, y * sy]);
  out.push(L(k.onTop(bed, PLOT_Z, P, true), { tone: "faint" }));
  if (plan.bays) out.push(bays(plan.bays, sx, sy));
  for (const path of plan.paths ?? []) out.push(S(k.slabOf(flipPlan(path, sx, sy), PLOT_Z, 0.1, P, 4), { tone: "lo", flat: true, className: "tm-paint" }));
  if (plan.pit) out.push(drawPit());
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

// Car park bays: two rows, each divider ending on the aisle line.
function bays(plan, sx, sy) {
  const lines = [];
  const line = ([ax, ay], [bx, by]) => k.lineOnTop([ax * sx, ay * sy], [bx * sx, by * sy], PLOT_Z, P);
  for (const [y0, y1] of plan.rows) {
    const aisle = y0 === plan.rows[0][0] ? y1 : y0;
    lines.push(line([plan.x0, aisle], [plan.x1, aisle]));
    for (let x = plan.x1 - plan.step + 1; x > plan.x0 + 2; x -= plan.step) lines.push(line([x, y0], [x, y1]));
  }
  return L(lines.join(""), { tone: "mid" });
}

// A queue meter: the strip on the kerb is ground; its pips light and pulse,
// so the page keeps them with the live parts.
function meter(approach, lane) {
  const out = [];
  const pips = [];
  const point = (s, q, z) => [...M.laneAt(approach, s / PARTS.U, (M.LANE / 2) + q / PARTS.U).map((v) => v * PARTS.U), z];
  const corners = [point(5, 2.6, 0), point(30, 2.6, 0), point(30, 7.4, 0), point(5, 7.4, 0)];
  const ring = corners.map(([x, y]) => [x, y]);
  out.push(S(k.extrude(ring, PARTS.ISLAND_H, 0.9, P, { bevel: 0.3 }), { tone: "mid" }));
  const top = PARTS.ISLAND_H + 0.9;
  for (let index = 0; index < M.JAM; index++) {
    const [x, y] = point(8 + index * 4.2, 5, 0);
    pips.push(`<path class="tm-pip" data-lane="${lane}" data-n="${index}" d="${k.ring(x, y, 1.15, top, P, 18)}"/>`);
  }
  return { strip: out.join(""), pips: pips.join("") };
}

// A tile's ground, at the origin: its halo (drawn under every tile, so no
// shadow falls on a neighbour), its body and its meter pips. The name plaque sits on the
// east face of the first row's last tile.
export function tileGroundSvg(tiles, tile) {
  const joins = joinsOf(tiles, tile);
  const plaque = tile.row === 0 && !joins.E;
  const out = [plate(joins, plaque), road(joins), markings(joins)];
  out.push(manhole(-72, 7.5), manhole(52, -7.5), manhole(-7.5, -76), manhole(7.5, 56));
  M.APPROACHES.forEach((approach) => out.push(drain(approach)));
  const islands = QUADRANTS.map((quadrant, q) => [quadrant, plotOf(tile, quadrant, q)]).sort(([a], [b]) => depth2(a[0], a[1]) - depth2(b[0], b[1]));
  for (const [[sx, sy], kind] of islands) out.push(island(sx, sy, kind));
  const pips = [];
  M.APPROACHES.forEach((approach) => {
    if (joins[approach.id]) return;
    const { strip, pips: lamps } = meter(approach, M.lineOf(tile, approach.id));
    out.push(strip);
    pips.push(lamps);
  });
  out.push(`<g data-shadows>${tileShadowsSvg(tile)}</g>`);
  return { halo: plateHalo(joins), body: out.join(""), pips: pips.join(""), sign: JSON.stringify(joins) };
}

// The soft shadows of everything that stands still on a tile. They lie on the
// ground under every standing part, so they are drawn once with the ground:
// a blurred shadow in the sorted layer would be repainted on every frame.
const HALO = /<path class="iso-halo[^"]*" d="[^"]*"\/>/g;
const splitHalos = (svg) => [(svg.match(HALO) ?? []).join(""), svg.replace(HALO, "")];
function tileShadowsSvg(tile) {
  const out = tileProps(tile).map((prop) => prop.halo);
  out.push(...M.IDS.map((id) => PARTS.gateHaloSvg(id, P)));
  if (tile.index === 0) out.push(PARTS.strikeBoardHaloSvg(P));
  return out.join("");
}

// Where a tile sits on screen relative to the first, as an SVG transform.
export const offsetOf = (tile) => [tile.x * PARTS.U, tile.y * PARTS.U];
export const placeOf = (tile) => k.translateAlong(P, [...offsetOf(tile), 0]);
export const shiftBox = (box, [dx, dy]) => [box[0] + dx, box[1] + dx, box[2] + dy, box[3] + dy, box[4], box[5]];

// Where the board sits in the drawing's own units: the screen box around
// every tile's plate (feet included) and the first tile's shop. The page fits
// its camera to this box, whatever the shape of the screen.
export function boundsOf(tiles) {
  const points = tiles.flatMap((tile) => {
    const [dx, dy] = offsetOf(tile);
    const plate = { ...PLATE, x: PLATE.x + dx, y: PLATE.y + dy };
    const extra = tile.index === 0 ? k.boxCorners(SHOP, 0, SHOP_TOP + 8) : [];
    return [...k.boxCorners(plate, -PLATE_H - FOOT_H, 0), ...extra];
  });
  const flat = points.map(at);
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
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

// The things that stand up on a tile, at the origin, keyed by tile. The signal
// controller is not here: the page redraws it as strikes land.
export function tileProps(tile) {
  const trees = [];
  const cars = [];
  const benches = [];
  const out = LAMPS.map(lamppost);
  QUADRANTS.forEach(([sx, sy], q) => {
    const plan = PLOTS[plotOf(tile, [sx, sy], q)];
    if (plan.shop) out.push(shop());
    for (const [x, y, size] of plan.trees ?? []) trees.push([x * sx, y * sy, size]);
    for (const [kind, x, y, th] of plan.parked ?? []) cars.push([kind, x * sx, y * sy, flipHeading(th, sx, sy)]);
    for (const [x, y, facing] of plan.benches ?? []) {
      const { x: bx, y: by } = flipPlan({ x, y, w: 8, d: 2.4, r: 0 }, sx, sy);
      benches.push([bx, by, facing * sy]);
    }
  });
  out.push(...trees.map(tree), ...cars.map(parked), ...benches.map(bench));
  return out.map((prop) => {
    const [halo, svg] = splitHalos(prop.svg);
    return { ...prop, svg, halo, key: `t${tile.index}:${prop.key}` };
  });
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
  const boxes = items.map((item) => item.screen ?? screenBoxOf(item.box, P0));
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
