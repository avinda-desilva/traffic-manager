// Parts that move or change: vehicles, the boom gates and the strike lamps.
// Built by the Node build for the first frame and rebuilt in the page.
import * as k from "../vendor/anatomy/kit/iso-kit.mjs";
import * as G from "../vendor/anatomy/kit/lathe.mjs";
import * as M from "./model.mjs";

export const U = M.UNIT;
export const ISLAND_H = 1.6;
export const ROAD_H = 0.3;

export const rotate = (points, x, y, th) => {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return points.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
};
const byDepth = (list, P, at) => [...list].sort((a, b) => k.depthOf(at(a), P) - k.depthOf(at(b), P));
const metres = (point) => point.map((value) => value * U);

// Vehicle designs in world units, front along +x. Exaggerated a little in
// height so they read at board scale; lengths and widths are true.
const wheels = (axles, lateral, length, height) =>
  axles.flatMap((x) => [-1, 1].map((side) => ({ plan: { x: x - length / 2, y: side * lateral - 0.8, w: length, d: 1.6, r: 0.6 }, z: 0, h: height, tone: "lo", steps: 2, wheel: true })));

export const DESIGNS = {
  car: [
    ...wheels([5.6, -5.6], 3.1, 3.4, 2.6),
    { plan: { x: -9, y: -3.6, w: 18, d: 7.2, r: 1.8 }, z: 1.4, h: 3.2, bevel: 0.5, steps: 4, body: true, across: [6.4, -7.2] },
    { plan: { x: -5.6, y: -3.1, w: 9.6, d: 6.2, r: 1.4 }, z: 4.6, h: 2.2, steps: 4, roof: 1.2, seam: 5.7 },
  ],
  van: [
    ...wheels([7, -6.6], 3.5, 3.6, 2.8),
    { plan: { x: -10.8, y: -4, w: 21.6, d: 8, r: 1.4 }, z: 1.4, h: 4.2, bevel: 0.5, steps: 4, body: true, across: [7.4] },
    { plan: { x: -10.8, y: -3.9, w: 15.6, d: 7.8, r: 1 }, z: 5.6, h: 4, steps: 3, roof: 1.2, seam: 7.8 },
  ],
  bus: [
    ...wheels([15, -10, -14.2], 4.3, 4, 3.4),
    { plan: { x: -23, y: -5, w: 46, d: 10, r: 1.8 }, z: 1.2, h: 10.4, bevel: 0.6, steps: 4, body: true, seams: [6.8, 9.9], roof: 1.4 },
    { plan: { x: -8, y: -3, w: 13, d: 6, r: 1 }, z: 11.6, h: 1.2, steps: 3, tone: "mid" },
  ],
};
export const heightOf = (kind) => Math.max(...DESIGNS[kind].map((part) => part.z + part.h));

export function vehicleSvg(kind, x, y, th, P, { tone = "hi", lit = false } = {}) {
  const parts = DESIGNS[kind];
  const body = parts.find((part) => part.body);
  const out = [`<path class="iso-halo tm-halo" d="${k.extrude(rotate(k.roundedPlan(body.plan, 4), x, y, th), 0, 0.1, P).fill}"/>`];
  const centre = (part) => {
    const [[cx, cy]] = rotate([[part.plan.x + part.plan.w / 2, part.plan.y + part.plan.d / 2]], x, y, th);
    return [cx, cy, part.z];
  };
  const solids = [...byDepth(parts.filter((part) => part.wheel), P, centre), ...parts.filter((part) => !part.wheel)];
  for (const part of solids) {
    const ring = rotate(k.roundedPlan(part.plan, part.steps), x, y, th);
    const top = part.z + part.h;
    const inner = [...(part.seams ?? []), ...(part.seam ? [part.seam] : [])].map((z) => k.lineSvg(k.ringSeam(ring, z, P), { tone: "faint" })).join("");
    out.push(k.solidSvg(k.extrude(ring, part.z, part.h, P, { bevel: part.bevel }), { tone: part.tone ?? tone, crease: part.wheel ? "none" : "faint", lit: lit && !part.wheel, inner }));
    if (part.roof) out.push(k.lineSvg(k.onTop(rotate(k.roundedPlan(k.insetPlan(part.plan, part.roof), part.steps), x, y, th), top, P, true), { tone: "faint" }));
    for (const at of part.across ?? []) {
      const [a, b] = rotate(
        [
          [at, part.plan.y],
          [at, part.plan.y + part.plan.d],
        ],
        x,
        y,
        th,
      );
      out.push(k.lineSvg(k.lineOnTop(a, b, top, P), { tone: "faint" }));
    }
  }
  const [vx, vy] = k.towardViewer(P);
  const facing = Math.cos(th) * vx + Math.sin(th) * vy;
  const lamps = (end, z) =>
    rotate(
      [
        [end, body.plan.y + 1.4],
        [end, body.plan.y + body.plan.d - 1.4],
      ],
      x,
      y,
      th,
    ).map(([px, py]) => k.iso([px, py, z], P));
  if (facing > 0.08) out.push(k.dotsSvg(lamps(body.plan.x + body.plan.w, body.z + 1.6), { size: 0.55, tone: "hi" }));
  if (facing < -0.08) out.push(k.dotsSvg(lamps(body.plan.x, body.z + 1.6), { size: 0.5, tone: "mid" }));
  return out.join("");
}

export function vehicleBox(kind, x, y, th) {
  const body = DESIGNS[kind].find((part) => part.body);
  const ring = rotate(k.roundedPlan(body.plan, 2), x, y, th);
  const xs = ring.map(([px]) => px);
  const ys = ring.map(([, py]) => py);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), 0, heightOf(kind)];
}

// The boom gate on the kerb at each stop line: a cabinet with a lamp, a hub,
// and a striped arm with its counterweight that swings up through 88°.
export const ARM_LEN = 18;
export const ARM_UP = (88 * Math.PI) / 180;
export const PIVOT_Z = 7.4;
const CABINET_TOP = 9.8;

export function gateFrame(id) {
  const approach = M.BY_ID[id];
  const dir = [approach.dir[0], approach.dir[1], 0];
  const right = [approach.right[0], approach.right[1], 0];
  const lateral = M.LANE / 2 + 0.85;
  const at = (s, side) => metres(M.laneAt(approach, M.ARM_AT + s / U, lateral + side / U));
  const pivot = [...at(0, 0), PIVOT_Z];
  return { approach, dir, right, at, pivot };
}

export const armAngle = (share) => M.smooth(0, 1, share) * ARM_UP;

function armParts(id, angle) {
  const { dir, right, pivot } = gateFrame(id);
  const along = G.add3(G.mul3(right, -Math.cos(angle)), [0, 0, Math.sin(angle)]);
  const F = G.frameOf(pivot, along, dir, G.cross3(along, dir));
  const box = (hx, hy) => [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ];
  const stripes = [];
  const cuts = [-1.4, 1.6, 4.4, 7.2, 10, 12.8, 15.6, ARM_LEN];
  for (let index = 0; index < cuts.length - 1; index++) stripes.push({ F, poly: box(0.5, 0.6), s0: cuts[index], s1: cuts[index + 1], dark: index % 2 === 1, mid: (cuts[index] + cuts[index + 1]) / 2 });
  const weight = { F, poly: box(0.5, 1.2), s0: -6, s1: -1.4, mid: -3.7, weight: true };
  return { F, along, list: [...stripes, weight] };
}

function cabinetSvg(id, P, { go }) {
  const { at, dir, right } = gateFrame(id);
  const centre = at(-4.8, 0.3);
  const ring = [
    [-2.6, -2.6],
    [2.6, -2.6],
    [2.6, 2.6],
    [-2.6, 2.6],
  ].map(([s, q]) => [centre[0] + dir[0] * s + right[0] * q, centre[1] + dir[1] * s + right[1] * q]);
  const plan = k.roundedPlan({ x: -2.6, y: -2.6, w: 5.2, d: 5.2, r: 0.7 }, 3).map(([s, q]) => [centre[0] + dir[0] * s + right[0] * q, centre[1] + dir[1] * s + right[1] * q]);
  const out = [];
  out.push(`<path class="iso-halo" d="${k.extrude(ring, ISLAND_H, 0.1, P).fill}"/>`);
  out.push(k.solidSvg(k.extrude(plan, ISLAND_H, 1.2, P), { tone: "mid" }));
  const upper = k.roundedPlan({ x: -2.2, y: -2.2, w: 4.4, d: 4.4, r: 0.6 }, 3).map(([s, q]) => [centre[0] + dir[0] * s + right[0] * q, centre[1] + dir[1] * s + right[1] * q]);
  out.push(k.solidSvg(k.extrude(upper, ISLAND_H + 1.2, CABINET_TOP - ISLAND_H - 1.2, P, { bevel: 0.4 }), { tone: "mid", inner: k.lineSvg(k.ringSeam(upper, CABINET_TOP - 1.4, P), { tone: "faint" }) }));
  out.push(k.lineSvg(k.onTop(upper.map(([px, py]) => [centre[0] + (px - centre[0]) * 0.72, centre[1] + (py - centre[1]) * 0.72]), CABINET_TOP, P, true), { tone: "faint" }));
  out.push(k.solidSvg(k.cylinder(centre[0], centre[1], 1.25, CABINET_TOP, 0.9, P, 20), { tone: "mid" }));
  out.push(`<path class="tm-glow" d="${k.ring(centre[0], centre[1], 2.6, CABINET_TOP + 0.9, P, 24)}"${go ? " data-go" : ""}/>`);
  out.push(`<path class="tm-lamp" d="${k.ring(centre[0], centre[1], 0.95, CABINET_TOP + 0.9, P, 20)}"${go ? " data-go" : ""}/>`);
  return `<g class="tm-cabinet">${out.join("")}</g>`;
}

function hubSvg(id, P) {
  const { dir, pivot } = gateFrame(id);
  const F = G.frameAlong(G.add3(pivot, G.mul3(dir, -2.2)), dir);
  return k.solidSvg(G.disc(0, 1.7, 1.35, F, P), { tone: "mid" }) + k.dotsSvg([k.iso(pivot, P)], { size: 0.45, tone: "mid" });
}

function armSvg(id, angle, P, { lit }) {
  const { list } = armParts(id, angle);
  const V = G.viewOf(P);
  const sorted = [...list].sort((a, b) => G.dot3(G.pointOf(a.F, a.mid, 0, 0), V) - G.dot3(G.pointOf(b.F, b.mid, 0, 0), V));
  return sorted
    .map((part) => k.solidSvg(G.prismOf(part.F, part.poly, part.s0, part.s1, P), { tone: part.weight ? "mid" : "hi", lit: lit && !part.weight, className: part.dark ? "tm-stripe" : undefined }))
    .join("");
}

export function gateSvg(id, share, P, { go = false, lit = false } = {}) {
  const angle = armAngle(share);
  const { dir } = gateFrame(id);
  const pieces = [cabinetSvg(id, P, { go }), hubSvg(id, P), armSvg(id, angle, P, { lit })];
  const towardViewer = G.dot3(dir, G.viewOf(P)) > 0;
  return (towardViewer ? pieces : pieces.reverse()).join("");
}

export function gateBox(id, share) {
  const { F, list } = armParts(id, armAngle(share));
  const { at } = gateFrame(id);
  const points = [at(-7.4, -2.3), at(-7.4, 2.9), at(-2.2, -2.3), at(-2.2, 2.9)].map(([x, y]) => [x, y, ISLAND_H]);
  for (const part of list)
    for (const s of [part.s0, part.s1])
      for (const [u, v] of part.poly) points.push(G.add3(G.pointOf(F, s, 0, 0), G.add3(G.mul3(F.u, u), G.mul3(F.v, v))));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), 0, Math.max(CABINET_TOP + 1, ...zs)];
}

// The signal controller on the near island: a cabinet on a concrete plinth,
// two doors with louvres and handles on the faces you can see, a lid, and a
// lamp bar with the three strike lamps. A strike is a crash or a jam.
export const CABINET = { x: 64, y: 68, w: 26, d: 10, r: 0.8 };
const CABINET_Z = ISLAND_H + 0.8;
const CABINET_H = 12;
const PLINTH = { x: 61.5, y: 65.5, w: 31, d: 15, r: 1 };
const LID_Z = CABINET_Z + 1.4 + CABINET_H;
export const STRIKE_LAMPS = [70, 77, 84];

export function strikeBoardSvg(strikes, P) {
  const out = [];
  const at = (point) => k.iso(point, P);
  const plinthTop = CABINET_Z + 1.4;
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PLINTH, -1.2), CABINET_Z, 0.1, P)}"/>`);
  out.push(k.solidSvg(k.slabOf(PLINTH, CABINET_Z, 1.4, P, 3, 0.4), { tone: "lo" }));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(PLINTH, 1), plinthTop, P, 3), { tone: "faint" }));
  out.push(k.dotsSvg(k.corners(PLINTH, 1.6).map(([x, y]) => at([x, y, plinthTop])), { size: 0.4, tone: "lo" }));
  out.push(k.solidSvg(k.slabOf(CABINET, plinthTop, CABINET_H, P, 3, 0.4), { tone: "mid", inner: k.lineSvg(k.sideSeam(CABINET, plinthTop + 1.2, P, 3), { tone: "faint" }) }));
  const faceY = CABINET.y + CABINET.d;
  const faceX = CABINET.x + CABINET.w;
  const onY = (x, z) => at([x, faceY, z]);
  const onX = (y, z) => at([faceX, y, z]);
  const rect = (map, a0, a1, z0, z1) => k.pathOf([map(a0, z0), map(a1, z0), map(a1, z1), map(a0, z1)], true);
  const z0 = plinthTop + 2;
  const z1 = plinthTop + CABINET_H - 1.4;
  const doors = [];
  const louvres = [];
  const handles = [];
  for (const [a0, a1] of [
    [CABINET.x + 1.2, CABINET.x + CABINET.w / 2 - 0.4],
    [CABINET.x + CABINET.w / 2 + 0.4, CABINET.x + CABINET.w - 1.2],
  ]) {
    doors.push(rect(onY, a0, a1, z0, z1));
    for (let index = 0; index < 4; index++) louvres.push(rect(onY, a0 + 2, a1 - 2, z1 - 2.2 - index * 1.4, z1 - 1.6 - index * 1.4));
    handles.push(onY(a0 === CABINET.x + 1.2 ? a1 - 1.4 : a0 + 1.4, (z0 + z1) / 2 - 1));
  }
  doors.push(rect(onX, CABINET.y + 1.2, CABINET.y + CABINET.d - 1.2, z0, z1));
  for (let index = 0; index < 4; index++) louvres.push(rect(onX, CABINET.y + 2.6, CABINET.y + CABINET.d - 2.6, z1 - 2.2 - index * 1.4, z1 - 1.6 - index * 1.4));
  out.push(k.lineSvg(doors.join(""), { tone: "lo" }), k.lineSvg(louvres.join(""), { tone: "faint" }), k.dotsSvg(handles, { size: 0.5, tone: "mid" }));
  const lid = k.insetPlan(CABINET, -0.8);
  out.push(k.solidSvg(k.slabOf(lid, LID_Z, 1.2, P, 3, 0.4), { tone: "mid" }));
  const top = LID_Z + 1.2;
  const bar = { x: 66, y: 70.4, w: 22, d: 5.2, r: 1.2 };
  out.push(k.lineSvg(k.planOutline(k.insetPlan(lid, 1.4), top, P, 3), { tone: "faint" }));
  out.push(k.solidSvg(k.slabOf(bar, top, 1.4, P, 4, 0.4), { tone: "mid" }));
  out.push(k.dotsSvg([at([bar.x + 1.4, bar.y + bar.d / 2, top + 1.4]), at([bar.x + bar.w - 1.4, bar.y + bar.d / 2, top + 1.4])], { size: 0.4 }));
  STRIKE_LAMPS.forEach((x, index) => {
    const y = bar.y + bar.d / 2;
    out.push(k.solidSvg(k.cylinder(x, y, 1.8, top + 1.4, 0.9, P, 20), { tone: "mid" }));
    out.push(`<path class="tm-strike" d="${k.ring(x, y, 1.25, top + 2.3, P, 18)}"${index < strikes ? " data-on" : ""}/>`);
  });
  return out.join("");
}

export const strikeBoardBox = () => [PLINTH.x, PLINTH.x + PLINTH.w, PLINTH.y, PLINTH.y + PLINTH.d, 0, LID_Z + 1.2 + 2.3];
