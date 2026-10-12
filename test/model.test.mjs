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
  M.setOpen(game, 0, "W", true);
  const car = M.place(game, "W0", "car", 5, 0);
  let top = 0;
  run(game, 12, () => (top = Math.max(top, car.v)));
  assert.ok(top > 9.5 && top <= 10.0001, `top speed ${top}`);
  assert.equal(game.cleared, 1);
  assert.equal(game.vehicles.length, 0);
});

test("a car that can stop comfortably stops a metre short of a closed gate", () => {
  const game = M.quiet(M.createGame());
  const car = M.place(game, "N0", "car", 4, 10);
  let hardest = 0;
  run(game, 15, () => (hardest = Math.min(hardest, car.acc)));
  assert.equal(car.v, 0);
  const short = M.S_STOP - car.s;
  assert.ok(short > 0.8 && short < 1.3, `stopped ${short.toFixed(2)} m before the line`);
  assert.ok(-hardest <= M.SAFE_BRAKE, `braked at ${(-hardest).toFixed(2)} m/s²`);
  assert.equal(M.armBlocked(game, 0, "N"), false);
  assert.equal(game.tiles[0].arm.N, 0);
});

test("a car too close to stop at 4 m/s² runs the line when the gate closes", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, 0, "E", true);
  const car = M.place(game, "E0", "car", M.S_STOP - 6, 10);
  M.setOpen(game, 0, "E", false);
  M.step(game);
  assert.equal(car.obey, false);
  run(game, 3);
  assert.ok(car.s > M.S_STOP + 10, "it carried on through the box");
});

test("the arm stays up while a vehicle is under it, then comes down in 1.4 s", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, 0, "S", true);
  M.place(game, "S0", "bus", M.ARM_AT + 2, 0);
  game.tiles[0].arm.S = 1;
  M.setOpen(game, 0, "S", false);
  run(game, 3);
  assert.equal(game.tiles[0].arm.S, 1, "held up over the bus");
  game.vehicles.length = 0;
  run(game, 1.0);
  assert.ok(game.tiles[0].arm.S > 0 && game.tiles[0].arm.S < 0.5);
  run(game, 0.5);
  assert.equal(game.tiles[0].arm.S, 0);
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
  M.setOpen(game, 0, "W", true);
  M.setOpen(game, 0, "N", true);
  const a = M.place(game, "W0", "car", M.S_STOP - 2, 10);
  const b = M.place(game, "N0", "car", M.S_STOP - 2, 10);
  run(game, 4);
  assert.equal(game.strikes, 1);
  assert.ok(a.wreck && b.wreck);
  assert.ok(game.events.some((event) => event.type === "crash"));
  run(game, 4);
  assert.ok(a.restAt !== null && b.restAt !== null, "the wrecks slide to rest on tyre friction");
});

test("cars queue behind a wreck instead of driving into it", () => {
  const game = M.quiet(M.createGame());
  M.setOpen(game, 0, "W", true);
  const wreck = M.place(game, "W0", "car", M.BOARD + 2, 0);
  wreck.body = M.bodyOf(wreck);
  wreck.wreck = true;
  wreck.wreckAt = -10;
  wreck.restAt = null;
  const car = M.place(game, "W0", "car", 4, 10);
  run(game, 6);
  assert.equal(car.wreck, false);
  assert.equal(game.strikes, 0);
});

test("a four-way standoff in the box clears instead of locking up", () => {
  const game = M.quiet(M.createGame());
  for (const id of M.IDS) {
    M.setOpen(game, 0, id, true);
    M.place(game, `${id}0`, "car", M.S_STOP + 1, 2);
  }
  run(game, 30);
  assert.ok(M.boxClear(game, 0), "the box emptied");
  assert.equal(game.vehicles.length, 0);
});

test("a closed junction under rising demand strikes out on jams", () => {
  const game = M.createGame({ seed: 3 });
  run(game, 240);
  assert.equal(game.over?.reason, "strikes");
  assert.equal(game.over.cause, "jam");
  assert.ok(game.events.filter((event) => event.type === "jam").length >= 1);
});

// Holds W0 full up to the entry, so nothing can drive on from its queue.
const blockedQueue = (count) => {
  const game = M.quiet(M.createGame());
  for (const s of [21.5, 15, 8.5]) M.place(game, "W0", "car", s, 0);
  game.backlog.W0.push(...Array(count).fill("car"));
  return game;
};

test("a queue of 6 that doesn't move for 5 s is a strike, and again every 5 s it stays", () => {
  const game = blockedQueue(M.JAM);
  run(game, M.JAM_TIME - 0.1);
  assert.equal(game.strikes, 0);
  assert.ok(game.jam.W0.left < 0.2, "counting down");
  run(game, 0.2);
  assert.equal(game.strikes, 1);
  assert.ok(game.events.some((event) => event.type === "jam" && event.lane === "W0"));
  run(game, M.JAM_TIME);
  assert.equal(game.strikes, 2);
  assert.equal(game.over, null);
  run(game, M.JAM_TIME);
  assert.equal(game.strikes, 3);
  assert.deepEqual([game.over?.reason, game.over?.cause], ["strikes", "jam"]);
});

test("a vehicle driving on from a jammed queue winds the countdown back", () => {
  const game = blockedQueue(M.JAM + 2);
  run(game, 0.3);
  assert.ok(game.jam.W0.left < M.JAM_TIME - 0.2, "counting down");
  M.setOpen(game, 0, "W", true);
  let wound = null;
  run(game, 8, () => {
    if (wound === null && game.backlog.W0.length < M.JAM + 2) wound = game.jam.W0.left;
  });
  assert.ok(wound > M.JAM_TIME - 0.02, `wound back to ${wound}`);
  assert.equal(game.strikes, 0, "the queue kept moving, so no strike");
});

test("crashes and jams share the three strikes", () => {
  const game = blockedQueue(M.JAM);
  M.setOpen(game, 0, "S", true);
  M.setOpen(game, 0, "E", true);
  M.place(game, "S0", "car", M.S_STOP - 2, 10);
  M.place(game, "E0", "car", M.S_STOP - 2, 10);
  run(game, 4);
  assert.equal(game.strikes, 1, "the crash");
  run(game, M.JAM_TIME + 1.2);
  assert.equal(game.strikes, 3, "and two jam strikes");
  assert.deepEqual([game.over?.reason, game.over?.cause], ["strikes", "jam"]);
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

test("a car crosses into the next tile and stops a metre short of its shut gate", () => {
  const game = M.quiet(M.createGame());
  M.addTile(game);
  M.setOpen(game, 0, "W", true);
  const car = M.place(game, "W0", "car", 5, 10);
  run(game, 20);
  assert.equal(car.v, 0);
  const short = M.S_STOP + M.PITCH - car.s;
  assert.ok(short > 0.8 && short < 1.3, `stopped ${short.toFixed(2)} m before tile 2's line`);
  assert.equal(game.cleared, 0);
  M.setOpen(game, 1, "W", true);
  run(game, 12);
  assert.equal(game.cleared, 1, "counted once, when it leaves the board");
  assert.equal(game.vehicles.length, 0);
});

test("adding tiles keeps every vehicle where it is on the board", () => {
  const game = M.quiet(M.createGame());
  for (const id of M.IDS) M.place(game, `${id}0`, "car", 20, 0);
  const where = () => game.vehicles.map((vehicle) => M.bodyOf(vehicle)).map(({ x, y }) => [x.toFixed(9), y.toFixed(9)].join());
  const before = where();
  M.addTile(game);
  M.addTile(game);
  assert.deepEqual(where(), before);
  assert.equal(game.lanes.E0.tiles.join(), "1,0", "the westbound lane now enters on the east tile");
  assert.equal(game.lanes.S0.tiles.join(), "2,0", "the northbound lane now enters on the south tile");
  assert.equal(game.lanes.W0.length, M.REACH + M.PITCH);
  assert.ok(game.lanes.W1 && game.lanes.E1, "the new row has its own lanes");
});

test("a safe plan at every junction of a 2×2 board runs five minutes without a crash", () => {
  const game = M.createGame({ seed: 11, demo: true });
  for (let index = 0; index < 3; index++) M.addTile(game);
  run(game, 300);
  assert.equal(game.strikes, 0);
  assert.ok(game.cleared > 80, `cleared ${game.cleared}`);
});

test("tiles join east, south, then fill toward a square as vehicles get through, and stop at nine", () => {
  const game = M.quiet(M.createGame());
  const added = [];
  for (const at of M.TILE_AT) {
    game.cleared = at - 1;
    M.step(game);
    const before = game.tiles.length;
    game.cleared = at;
    M.step(game);
    assert.equal(game.tiles.length, before + 1, `a tile at ${at}`);
    added.push(game.tiles.at(-1));
  }
  assert.deepEqual(added.map((tile) => [tile.col, tile.row]), M.GROWTH.slice(1));
  assert.ok(game.events.filter((event) => event.type === "tile").length >= 1);
  game.cleared = 10_000;
  M.step(game);
  assert.equal(game.tiles.length, M.GROWTH.length);
  assert.equal(M.nextTileAt(game), null);
});

test("the demo never grows", () => {
  const game = M.createGame({ seed: 1, demo: true });
  game.cleared = 10_000;
  run(game, 1);
  assert.equal(game.tiles.length, 1);
});

test("the same seed plays the same shift as the board grows", () => {
  const play = () => {
    const game = M.createGame({ seed: 5 });
    run(game, 90, (each) => {
      M.autopilot(each);
      if (each.t > 30 && each.tiles.length < 4) each.cleared = Math.max(each.cleared, M.nextTileAt(each));
    });
    return [game.tiles.length, game.cleared, game.strikes, game.vehicles.map((v) => `${v.lane.id}:${v.s.toFixed(6)}`).join()];
  };
  const first = play();
  assert.equal(first[0], 4);
  assert.deepEqual(play(), first);
});
