import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/model.mjs";

const run = (game, seconds, each) => {
  for (let t = 0; t < seconds; t += M.STEP) {
    M.step(game);
    each?.(game);
  }
};

test("a lone car on an open road reaches its desired speed and leaves the board", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, "W", true);
  const car = M.place(game, "W", "car", 5, 0);
  let top = 0;
  run(game, 12, () => (top = Math.max(top, car.v)));
  assert.ok(top > 9.5 && top <= 10.0001, `top speed ${top}`);
  assert.equal(game.cleared, 1);
  assert.equal(game.vehicles.length, 0);
});

test("a car that can stop comfortably stops a metre short of a closed gate", () => {
  const game = M.quiet(M.createGame());
  const car = M.place(game, "N", "car", 4, 10);
  let hardest = 0;
  run(game, 15, () => (hardest = Math.min(hardest, car.acc)));
  assert.equal(car.v, 0);
  const short = M.S_STOP - car.s;
  assert.ok(short > 0.8 && short < 1.3, `stopped ${short.toFixed(2)} m before the line`);
  assert.ok(-hardest <= M.SAFE_BRAKE, `braked at ${(-hardest).toFixed(2)} m/s²`);
  assert.equal(M.armBlocked(game, "N"), false);
  assert.equal(game.arm.N, 0);
});

test("a car too close to stop at 4 m/s² runs the line when the gate closes", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, "E", true);
  const car = M.place(game, "E", "car", M.S_STOP - 6, 10);
  M.setOpen(game, "E", false);
  M.step(game);
  assert.equal(car.obey, false);
  run(game, 3);
  assert.ok(car.s > M.S_STOP + 10, "it carried on through the box");
});

test("the arm stays up while a vehicle is under it, then comes down in 1.4 s", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, "S", true);
  M.place(game, "S", "bus", M.ARM_AT + 2, 0);
  game.arm.S = 1;
  M.setOpen(game, "S", false);
  run(game, 3);
  assert.equal(game.arm.S, 1, "held up over the bus");
  game.vehicles.length = 0;
  run(game, 1.0);
  assert.ok(game.arm.S > 0 && game.arm.S < 0.5);
  run(game, 0.5);
  assert.equal(game.arm.S, 0);
});

test("an impulse conserves linear momentum and pushes the bodies apart", () => {
  const a = { x: 0, y: 0, th: 0, vx: 10, vy: 0, w: 0 };
  const b = { x: 3.2, y: 1.2, th: Math.PI / 2, vx: 0, vy: -9, w: 0 };
  const before = [M.KINDS.car.mass * a.vx + M.KINDS.bus.mass * b.vx, M.KINDS.car.mass * a.vy + M.KINDS.bus.mass * b.vy];
  const hit = M.overlap({ ...a, hl: 2.25, hw: 0.9 }, { ...b, hl: 5.75, hw: 1.25 });
  assert.ok(hit, "the boxes overlap");
  const { impulse } = M.resolve(a, b, "car", "bus", hit);
  assert.ok(impulse > 0);
  const after = [M.KINDS.car.mass * a.vx + M.KINDS.bus.mass * b.vx, M.KINDS.car.mass * a.vy + M.KINDS.bus.mass * b.vy];
  assert.ok(Math.abs(after[0] - before[0]) < 1e-6 && Math.abs(after[1] - before[1]) < 1e-6, "momentum is conserved");
  const closing = (b.vx - a.vx) * hit.normal[0] + (b.vy - a.vy) * hit.normal[1];
  assert.ok(closing >= -1e-6, "no longer closing along the normal");
});

test("two open crossing roads with cars timed to meet make one crash and two wrecks", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, "W", true);
  M.setOpen(game, "N", true);
  const a = M.place(game, "W", "car", M.S_STOP - 2, 10);
  const b = M.place(game, "N", "car", M.S_STOP - 2, 10);
  run(game, 4);
  assert.equal(game.strikes, 1);
  assert.ok(a.wreck && b.wreck);
  assert.ok(game.events.some((event) => event.type === "crash"));
  run(game, 4);
  assert.ok(a.restAt !== null && b.restAt !== null, "the wrecks slide to rest on tyre friction");
});

test("cars queue behind a wreck instead of driving into it", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, "W", true);
  const wreck = M.place(game, "W", "car", M.BOARD + 2, 0);
  wreck.body = M.bodyOf(wreck);
  wreck.wreck = true;
  wreck.wreckAt = -10;
  wreck.restAt = null;
  const car = M.place(game, "W", "car", 4, 10);
  run(game, 6);
  assert.equal(car.wreck, false);
  assert.equal(game.strikes, 0);
});

test("a four-way standoff in the box clears instead of locking up", () => {
  const game = M.quiet(M.createGame());
  for (const id of M.IDS) {
    M.setOpen(game, id, true);
    M.place(game, id, "car", M.S_STOP + 1, 2);
  }
  run(game, 30);
  assert.ok(M.boxClear(game), "the box emptied");
  assert.equal(game.vehicles.length, 0);
});

test("a closed junction under rising demand ends in gridlock", () => {
  const game = M.createGame({ seed: 3 });
  run(game, 240, () => {});
  assert.equal(game.over?.reason, "gridlock");
});

test("the demo plan runs five minutes without a crash", () => {
  const game = M.createGame({ seed: 11, demo: true });
  run(game, 300);
  assert.equal(game.strikes, 0);
  assert.ok(game.cleared > 40, `cleared ${game.cleared}`);
});

test("the same seed plays the same shift", () => {
  const play = () => {
    const game = M.createGame({ seed: 5, demo: true });
    run(game, 60);
    return [game.cleared, game.vehicles.length, game.vehicles.map((v) => v.s.toFixed(6)).join()];
  };
  assert.deepEqual(play(), play());
});
