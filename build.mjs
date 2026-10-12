// Builds the game as standalone pages: node build.mjs (both themes).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./vendor/anatomy/kit/iso-kit.mjs";
import * as M from "./src/model.mjs";
import * as PARTS from "./src/parts.mjs";
import * as SCENE from "./src/scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(HERE, path), "utf8");
const DEMO_SEED = 1;
const DEMO_LEAD = 24;
const P = SCENE.P;

// Each module becomes one object in the page script, so names can't clash.
function asObject(name, source) {
  const names = [...source.matchAll(/^export (?:async )?(?:function\*?|const|let|class) ([A-Za-z_$][\w$]*)/gm)].map((match) => match[1]);
  const reexports = [...source.matchAll(/^export \{([^}]*)\};?$/gm)].flatMap((match) => match[1].split(",").map((part) => part.trim()).filter(Boolean));
  const body = source
    .replace(/^import \{([^}]*)\} from "[^"]*iso-kit\.mjs";$/gm, "const {$1} = k;")
    .replace(/^import [^;]+;$/gm, "")
    .replace(/^export \{[^}]*\};?$/gm, "")
    .replace(/^export /gm, "");
  return `const ${name} = (() => {\n${body}\nreturn { ${[...names, ...reexports].join(", ")} };\n})();\n`;
}

const demo = M.createGame({ seed: DEMO_SEED, demo: true });
M.advance(demo, DEMO_LEAD);

const item = (key, svg, box) => ({ key, svg, box });
const items = [
  ...SCENE.props().map((prop) => item(prop.key, prop.svg, prop.box)),
  ...M.IDS.map((id) => item(`gate-${id}`, PARTS.gateSvg(id, demo.tiles[0].arm[id], P, { go: demo.tiles[0].open[id] }), PARTS.gateBox(id, demo.tiles[0].arm[id]))),
  item("frame", PARTS.frameSvg(M.IDS.map((id) => (demo.tiles[0].open[id] ? 1 : 0)), P, { go: M.IDS.map((id) => demo.tiles[0].open[id]) }), SCENE.frameBox()),
  ...demo.vehicles.map((vehicle) => {
    const body = M.bodyOf(vehicle);
    const [x, y] = [body.x * PARTS.U, body.y * PARTS.U];
    const alpha = M.alphaOf(demo, vehicle);
    const svg = `<g opacity="${alpha.toFixed(2)}">${PARTS.vehicleSvg(vehicle.kind, x, y, body.th, P)}</g>`;
    return item(`v${vehicle.id}`, svg, PARTS.vehicleBox(vehicle.kind, x, y, body.th));
  }),
];
const sorted = SCENE.paintOrder(items, P)
  .map((entry) => `<g data-item="${entry.key}" data-box="${JSON.stringify(entry.box.map((value) => Math.round(value * 100) / 100))}">${entry.svg}</g>`)
  .join("");

const LABEL =
  "A model crossroads on a base plate. Two roads cross between four kerbed islands; a boom gate with a red or green lamp stands at each stop line, and a lever frame on the near island has one lever per gate. Cars, vans and buses drive through when their gate is open and queue when it is shut.";

const figure = k.figureSvg({
  width: SCENE.WIDTH,
  height: SCENE.HEIGHT,
  label: LABEL,
  body: [`<g data-layer="ground">${SCENE.groundSvg()}</g>`, `<g data-layer="sorted">${sorted}</g>`, `<g data-layer="fx"></g>`],
});

const kmh = (value) => Math.round(value * 3.6);
const caption = [
  `Every driver follows the Intelligent Driver Model: up to ${M.KINDS.car.a} m/s² away from the line, a ${M.KINDS.car.T} s headway, ${kmh(M.KINDS.car.v0)} km/h in a car.`,
  `When a lamp turns red, drivers who can stop at ${M.SAFE_BRAKE} m/s² or less stop a metre short of the line; the rest run it.`,
  `The arm waits for its detector to clear and takes ${M.ARM_TIME} s to swing. Drivers trust the gates and don't watch the other road, so open both roads at once and they meet:`,
  `crashes are rigid-body impacts that conserve momentum, and wrecks slide on tyre friction (μ ${M.TYRE_GRIP}) until they stop.`,
  `${M.STRIKES} strikes end the shift. A crash is one; so is a queue of ${M.JAM} off the board that doesn't move for ${M.JAM_TIME} s, and again every ${M.JAM_TIME} s it stays. Demand climbs and swings between the roads every 80 s.`,
].join(" ");

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Traffic manager",
  hint: "Tap or press Space to start a shift",
  readout: `demo · ${demo.cleared} through`,
  keys: [
    { mark: "lit", label: "The gate and lever you are pointing at" },
    { mark: "green", label: "Lamp green: gate open" },
    { mark: "red", label: "Lamp red: gate shut, strike lamps lit" },
    { mark: "raised", label: "Car 4.5 m, van 5.4 m, bus 11.5 m" },
  ],
  caption,
  body: `<div class="tm-stage" tabindex="0" role="application" aria-roledescription="game" aria-label="Traffic manager. Arrow keys or 1 to 4 open and shut the west, north, east and south gates. Space starts a shift or shuts every gate. P pauses.">${figure}</div><p class="tm-live" aria-live="polite"></p>`,
});

const CSS = `
.iso{--tm-asphalt:#171717;--tm-paint:#2e2e2e;--tm-stripe:#3a3a3a;--tm-stop:var(--anatomy-red);--tm-go:var(--anatomy-green)}
.iso[data-theme="light"]{--tm-asphalt:#ececea;--tm-paint:#ffffff;--tm-stripe:#c4c4c7}
.tm-road>.iso-top,.tm-lot>.iso-top{fill:var(--tm-asphalt)}
.tm-paint>.iso-fill{fill:var(--tm-paint)}
.tm-stripe>.iso-top,.tm-stripe>.iso-shade{fill:var(--tm-stripe)}
.tm-lamp{fill:var(--tm-stop);stroke:var(--anatomy-lo);stroke-width:.4}
.tm-lamp[data-go]{fill:var(--tm-go)}
.tm-glow{fill:var(--tm-stop);stroke:none;opacity:.28;filter:blur(1.6px)}
.tm-glow[data-go]{fill:var(--tm-go)}
.tm-strike,.tm-pip{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:.4;transition:fill .25s}
.tm-strike[data-on],.tm-pip[data-on]{fill:var(--tm-stop)}
.tm-pip[data-jam]{animation:tm-jam 1s ease-in-out infinite}
@keyframes tm-jam{50%{fill:var(--anatomy-paper)}}
.tm-crash{fill:none;stroke:var(--tm-stop);stroke-width:1.2}
.tm-stage{outline:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.tm-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.tm-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.iso-plate{overflow:hidden}
@media (max-width:560px){.iso-plate .tm-stage .iso-svg{width:116%;margin:0 -8%}.iso-plate-corner[data-corner="hint"]{white-space:normal;max-width:48%;line-height:1.3}}
@media (prefers-reduced-motion:reduce){.tm-strike,.tm-pip{transition:none}.tm-pip[data-jam]{animation:none}}
`;

const data = {
  P,
  demoSeed: DEMO_SEED,
  demoLead: DEMO_LEAD,
  board: SCENE.B,
  road: SCENE.R,
  levers: SCENE.leverTargets(),
  gates: SCENE.gatePivots(),
};

const script = [
  asObject("k", read("vendor/anatomy/kit/iso-kit.mjs")),
  asObject("G", read("vendor/anatomy/kit/lathe.mjs")),
  asObject("M", read("src/model.mjs")),
  asObject("PARTS", read("src/parts.mjs")),
  asObject("SCENE", read("src/scene.mjs")),
  `const DATA = ${JSON.stringify(data)};\n`,
  read("src/live.js"),
].join("\n");

for (const theme of ["light", "dark"]) {
  const html = k.pageHtml({ title: "Traffic manager", theme, body, script, width: 900 }).replace("</style>", `${CSS}</style>`);
  const file = theme === "light" ? "game/traffic-manager.html" : "game/traffic-manager-dark.html";
  writeFileSync(join(HERE, file), html);
  console.log("wrote", file, `${Math.round(html.length / 1024)} KB`);
}
