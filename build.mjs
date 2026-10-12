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

const first = demo.tiles[0];
const ground = SCENE.tileGroundSvg(demo.tiles, first);
const item = (key, svg, box) => ({ key, svg, box });
const items = [
  ...SCENE.tileProps(first).map((prop) => item(prop.key, prop.svg, prop.box)),
  ...M.IDS.map((id) => item(`gate-0-${id}`, PARTS.gateSvg(id, demo.tiles[0].arm[id], P, { go: demo.tiles[0].open[id] }), PARTS.gateBox(id, demo.tiles[0].arm[id]))),
  item("strikes", PARTS.strikeBoardSvg(0, P), PARTS.strikeBoardBox()),
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
  "A model crossroads on a base plate. Two roads cross between four kerbed islands; a boom gate with a red or green lamp stands at each stop line, and a signal controller cabinet on the near island carries three strike lamps. Cars, vans and buses drive through when their gate is open and queue when it is shut. As vehicles get through, more crossroads tiles join the board and the view pulls back to fit them.";

// Two drawings stacked in one camera: the ground behind, painted once on its
// own layer, and everything that moves or lights in front, repainted per frame.
const back = k
  .figureSvg({
    width: SCENE.WIDTH,
    height: SCENE.HEIGHT,
    label: "",
    className: "tm-back",
    body: [`<g data-layer="ground"><g data-halos><g data-halo="0">${ground.halo}</g></g><g data-tile="0" data-sign='${ground.sign}'>${ground.body}</g></g>`],
  })
  .replace(/ role="img" aria-label=""/, ' aria-hidden="true"');
const front = k.figureSvg({
  width: SCENE.WIDTH,
  height: SCENE.HEIGHT,
  label: LABEL,
  className: "tm-front",
  body: [`<g data-layer="arriving"></g>`, `<g data-layer="pips"><g data-pips="0">${ground.pips}</g></g>`, `<g data-layer="shadows" class="tm-shadows"></g>`, `<g data-layer="sorted">${sorted}</g>`, `<g data-layer="fx"></g>`],
});
const figure = back + front;

// How to play, under the card: each rule with the symbol it refers to, in
// the legend's type. The numbers come from the model.
const ICONS = {
  road: `<path d="M1.5 4.5h13M1.5 11.5h13"/><path class="tm-icon-dash" d="M2.5 8h3M7 8h2M10.5 8h3"/>`,
  lamps: `<circle class="tm-icon-go" cx="4.5" cy="8" r="3"/><circle class="tm-icon-stop" cx="11.5" cy="8" r="3"/>`,
  cross: `<path d="M8 1.5v13M1.5 8h13"/><path class="tm-icon-red" d="M3.5 3.5l3 3M6.5 3.5l-3 3"/>`,
  tile: `<path d="M8 2.5 14.5 6 8 9.5 1.5 6Z"/><path d="M1.5 6v2.5L8 12l6.5-3.5V6"/>`,
  meter: `<rect x="1.5" y="5" width="13" height="6" rx="1"/><circle class="tm-icon-stop" cx="4.5" cy="8" r="1.1"/><circle class="tm-icon-stop" cx="8" cy="8" r="1.1"/><circle cx="11.5" cy="8" r="1.1"/>`,
  arrow: `<path class="tm-icon-arrow" d="M6.5 1.5h3v7h3L8 14.5 3.5 8.5h3Z"/>`,
  touch: `<path d="M5.5 14.5V6.8a1.4 1.4 0 0 1 2.8 0v4.2"/><path d="M8.3 9.3a1.3 1.3 0 0 1 2.6 0v1.5a1.3 1.3 0 0 1 2.6 0v.8c0 1.6-1 2.9-2.4 2.9"/><path d="M3.5 4.5a4.2 4.2 0 0 1 6.8 0"/>`,
  keys: `<rect x="1.5" y="4.5" width="13" height="7" rx="1.2"/><path d="M4 9h8"/>`,
};
const icon = (name) => `<svg class="tm-icon" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;
const strike = `<span class="tm-icon tm-icon-x" aria-hidden="true">X</span>`;
const RULES = [
  ["road", "Tap a road to open or shut its gate."],
  ["lamps", "Green lamp: the gate is open and cars go. Red: shut, and cars stop at the line."],
  ["cross", "Never open two crossing roads at once. Drivers don't look, so they crash."],
  ["tile", `Every car that leaves the board scores. At ${M.TILE_AT.slice(0, 3).join(", ")} and on, a new crossroads joins, up to ${M.GROWTH.length}.`],
  ["meter", `Each road coming in has a meter that lights as cars queue off the board. When all ${M.JAM} are lit, the road is jammed.`],
  ["arrow", `A jam starts a ${M.JAM_TIME} s countdown, and a red arrow marks the gate to open. Every car that gets moving resets it.`],
  [null, `${M.STRIKES} strikes end the shift: each crash, and each countdown that runs out.`],
  ["touch", "Swipe to move, pinch to zoom, double-tap to see the whole board."],
  ["keys", "Space starts a shift or shuts every gate. P pauses."],
];
const guide = `<details class="tm-guide"><summary>How to play</summary><ul class="tm-rules">${RULES.map(([name, text]) => `<li>${name ? icon(name) : strike}<span>${text}</span></li>`).join("")}</ul></details>`;

// The card: score, title and strikes along the top, what's next along the
// bottom, and a bar that blinks over the bottom while a road is jammed.
const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${text}</span>`;
const body = `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", "Score: 0", " data-score")}${corner("title", "Traffic manager")}${corner("strikes", "", " data-strikes")}${corner("readout", "Tap or press Space to start a shift", " data-readout")}</div><div class="tm-stage" tabindex="0" role="application" aria-roledescription="game" aria-label="Traffic manager. Tap a road to open or shut the gate on it. Space starts a shift or shuts every gate. P pauses.">${figure}</div><div class="tm-alert" data-alert hidden></div><p class="tm-live" aria-live="polite"></p></div>${guide}</figure>`;

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
.tm-arrow>.iso-fill,.tm-arrow>.iso-shade{fill:var(--tm-stop)}
.tm-arrow>.iso-shade[data-shade="2"],.tm-arrow>.iso-shade[data-shade="3"]{fill:color-mix(in srgb,var(--tm-stop) 78%,#000)}
.tm-arrow>.iso-top{fill:color-mix(in srgb,var(--tm-stop) 72%,#fff)}
.tm-arrow>.iso-line{stroke:color-mix(in srgb,var(--tm-stop) 55%,var(--anatomy-hi))}
.tm-crash{fill:none;stroke:var(--tm-stop);stroke-width:1.2}
.tm-stage{position:relative;overflow:hidden;--tm-fade:linear-gradient(#0000,#000 22px,#000 calc(100% - 22px),#0000),linear-gradient(90deg,#0000,#000 22px,#000 calc(100% - 22px),#0000);-webkit-mask-image:var(--tm-fade);-webkit-mask-composite:source-in;mask-image:var(--tm-fade);mask-composite:intersect}
.tm-back{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;pointer-events:none}
.tm-front{position:relative}
.tm-shadows{filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.tm-shadows>path{fill:var(--anatomy-halo)}
.tm-stage{outline:none;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.tm-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.tm-stage[data-input="pointer"]:focus-visible{outline:none}
.tm-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
body.iso{background:var(--anatomy-card)}
.iso-plate{overflow:hidden;box-shadow:none;padding-bottom:92px}
.iso-plate-corners{z-index:2}
.iso-plate-corner[data-corner="title"]{left:50%;right:auto;transform:translateX(-50%)}
.iso-plate-corner[data-corner="strikes"]{top:0;right:0;text-transform:uppercase;letter-spacing:.3em;margin-right:-.3em}
.iso-plate-corner[data-corner="readout"]{left:0;right:0;text-align:center;white-space:normal;line-height:1.4}
.tm-alert{position:absolute;z-index:2;left:20px;right:20px;bottom:46px;padding:7px 10px;text-align:center;font-family:var(--anatomy-mono);font-size:10.5px;line-height:1.4;letter-spacing:.06em;text-transform:uppercase;color:var(--tm-stop);border:1px solid color-mix(in srgb,var(--tm-stop) 55%,transparent);background:color-mix(in srgb,var(--tm-stop) 9%,var(--anatomy-card));animation:tm-blink 1s steps(1,end) infinite}
.tm-alert[hidden]{display:none}
@keyframes tm-blink{50%{opacity:.3}}
.tm-guide{margin-top:16px;border-top:1px solid var(--anatomy-faint);color:var(--anatomy-muted);font-size:13px;line-height:1.5}
.tm-guide>summary{display:flex;align-items:center;gap:10px;padding:14px 0;list-style:none;cursor:pointer;color:var(--anatomy-text);font-family:var(--anatomy-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase}
.tm-guide>summary::-webkit-details-marker{display:none}
.tm-guide>summary::before{content:"";width:5px;height:5px;margin:0 2px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(-45deg);transition:transform .2s}
.tm-guide[open]>summary::before{transform:rotate(45deg)}
.tm-guide>summary:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:4px}
.tm-rules{display:grid;gap:10px;margin:0;padding:0 0 16px;list-style:none}
.tm-rules li{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start}
.tm-icon{display:block;width:16px;height:16px;margin-top:2px}
.tm-icon *{fill:none;stroke:var(--anatomy-hi);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.tm-icon .tm-icon-dash{stroke:var(--anatomy-mid)}
.tm-icon .tm-icon-go{fill:var(--tm-go);stroke:var(--anatomy-lo)}
.tm-icon .tm-icon-stop{fill:var(--tm-stop);stroke:var(--anatomy-lo)}
.tm-icon .tm-icon-red{stroke:var(--tm-stop)}
.tm-icon .tm-icon-arrow{fill:var(--tm-stop);stroke:color-mix(in srgb,var(--tm-stop) 55%,var(--anatomy-hi))}
.tm-icon-x{margin-top:0;color:var(--anatomy-text);font-family:var(--anatomy-mono);font-size:11px;line-height:18px;letter-spacing:.1em;text-align:center}
@media (max-width:560px){.iso-plate{padding-bottom:96px}.iso-plate .tm-stage{width:116%;margin:0 -8%}.tm-alert{left:12px;right:12px;bottom:44px}}
@media (prefers-reduced-motion:reduce){.tm-strike,.tm-pip{transition:none}.tm-pip[data-jam],.tm-alert{animation:none}.tm-guide>summary::before{transition:none}}
`;

const data = {
  P,
  demoSeed: DEMO_SEED,
  demoLead: DEMO_LEAD,
  board: SCENE.B,
  road: SCENE.R,
  pitch: M.PITCH * PARTS.U,
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
