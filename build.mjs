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
// The game fills the screen: the board edge to edge, a header floating over
// its top (score, title with the info button, strikes) and a footer over its
// bottom (the jam bar and what comes next). Neither moves with the camera.
// The info button opens How to play over everything; a tap anywhere closes it.
const rules = `<ul class="tm-rules">${RULES.map(([name, text]) => `<li>${name ? icon(name) : strike}<span>${text}</span></li>`).join("")}</ul>`;
const INFO = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.3v4.2"/><circle class="tm-info-dot" cx="8" cy="5" r=".75"/></svg>`;
const header = `<header class="tm-bar"><span class="tm-score" data-score>Score: 0</span><span class="tm-title">Traffic manager<button class="tm-info" type="button" aria-label="How to play" aria-haspopup="dialog" aria-controls="tm-help">${INFO}</button></span><span class="tm-strikes" data-strikes aria-hidden="true"></span></header>`;
const footer = `<footer class="tm-foot"><div class="tm-alert" data-alert hidden></div><span class="tm-next" data-readout>Tap or press Space to start a shift</span></footer>`;
const help = `<div class="tm-overlay" id="tm-help" role="dialog" aria-modal="true" aria-label="How to play" tabindex="-1" hidden><div class="tm-sheet"><div class="tm-sheet-head">How to play</div>${rules}<div class="tm-sheet-foot">Tap anywhere to close</div></div></div>`;
const stageLabel = "Traffic manager. Tap a road to open or shut the gate on it. Space starts a shift or shuts every gate. P pauses.";
const body = `<div class="tm-game"><div class="tm-stage" tabindex="0" role="application" aria-roledescription="game" aria-label="${stageLabel}">${figure}</div>${header}${footer}${help}<p class="tm-live" aria-live="polite"></p></div>`;

const CSS = `
.iso{--tm-asphalt:#171717;--tm-paint:#2e2e2e;--tm-stripe:#3a3a3a;--tm-stop:var(--anatomy-red);--tm-go:var(--anatomy-green);--tm-type:var(--anatomy-mono)}
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
.tm-shadows{filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.tm-shadows>path{fill:var(--anatomy-halo)}
html,body{height:100%;overflow:hidden;overscroll-behavior:none}
body.iso{background:var(--anatomy-card)}
.iso-page{width:auto;margin:0}
.tm-game{position:fixed;inset:0;overflow:hidden;background:var(--anatomy-card);--anatomy-paper:var(--anatomy-card)}
.tm-stage{position:absolute;inset:0;overflow:hidden;outline:none;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.tm-stage .iso-svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}
.tm-back{pointer-events:none}
.tm-rastered .tm-back{visibility:hidden}
.tm-ground{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;pointer-events:none}
.tm-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:-8px}
.tm-stage[data-input="pointer"]:focus-visible{outline:none}
.tm-bar,.tm-foot{position:absolute;left:0;right:0;z-index:3;pointer-events:none;font-family:var(--tm-type);font-size:10.5px;line-height:1;letter-spacing:.04em;color:var(--anatomy-muted)}
.tm-bar{top:0;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:max(18px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) 30px max(20px,env(safe-area-inset-left));background:linear-gradient(var(--anatomy-card) 45%,color-mix(in srgb,var(--anatomy-card) 0%,transparent))}
.tm-score{color:var(--anatomy-text);font-variant-numeric:tabular-nums;white-space:nowrap}
.tm-title{display:inline-flex;align-items:center;text-transform:uppercase;letter-spacing:.1em;white-space:nowrap}
.tm-strikes{justify-self:end;color:var(--anatomy-text);letter-spacing:.3em;margin-right:-.3em;white-space:nowrap}
.tm-info{pointer-events:auto;display:inline-grid;place-items:center;width:36px;height:36px;margin:-12px -12px -12px -4px;padding:0;border:0;border-radius:50%;background:none;color:var(--anatomy-muted);cursor:pointer;-webkit-tap-highlight-color:transparent}
.tm-info svg{width:15px;height:15px}
.tm-info circle,.tm-info path{fill:none;stroke:currentColor;stroke-width:1.1;stroke-linecap:round}
.tm-info .tm-info-dot{fill:currentColor;stroke:none}
.tm-info:hover,.tm-info:focus-visible{color:var(--anatomy-hi);outline:none}
.tm-foot{bottom:0;display:grid;justify-items:center;gap:12px;padding:30px max(16px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:linear-gradient(color-mix(in srgb,var(--anatomy-card) 0%,transparent),var(--anatomy-card) 55%)}
.tm-next{color:var(--anatomy-text);text-align:center;line-height:1.4;font-variant-numeric:tabular-nums}
.tm-alert{width:min(560px,100%);padding:7px 10px;text-align:center;line-height:1.4;letter-spacing:.06em;text-transform:uppercase;color:var(--tm-stop);border:1px solid color-mix(in srgb,var(--tm-stop) 55%,transparent);background:color-mix(in srgb,var(--tm-stop) 9%,var(--anatomy-card));animation:tm-blink 1s steps(1,end) infinite}
.tm-alert[hidden]{display:none}
@keyframes tm-blink{50%{opacity:.3}}
.tm-overlay{position:absolute;inset:0;z-index:10;display:grid;place-items:center;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));background:color-mix(in srgb,var(--anatomy-card) 90%,transparent);cursor:pointer;outline:none;animation:tm-show .2s ease-out}
.tm-overlay[hidden]{display:none}
@keyframes tm-show{from{opacity:0}}
.tm-sheet{width:min(440px,100%);max-height:100%;overflow:auto;padding:20px 22px 18px;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);color:var(--anatomy-muted);font-size:13px;line-height:1.5}
.tm-sheet-head,.tm-sheet-foot{font-family:var(--tm-type);font-size:10.5px;line-height:1;letter-spacing:.1em;text-transform:uppercase}
.tm-sheet-head{margin-bottom:18px;color:var(--anatomy-text)}
.tm-sheet-foot{margin-top:18px;text-align:center}
.tm-rules{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.tm-rules li{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start}
.tm-icon{display:block;width:16px;height:16px;margin-top:2px}
.tm-icon *{fill:none;stroke:var(--anatomy-hi);stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.tm-icon .tm-icon-dash{stroke:var(--anatomy-mid)}
.tm-icon .tm-icon-go{fill:var(--tm-go);stroke:var(--anatomy-lo)}
.tm-icon .tm-icon-stop{fill:var(--tm-stop);stroke:var(--anatomy-lo)}
.tm-icon .tm-icon-red{stroke:var(--tm-stop)}
.tm-icon .tm-icon-arrow{fill:var(--tm-stop);stroke:color-mix(in srgb,var(--tm-stop) 55%,var(--anatomy-hi))}
.tm-icon-x{margin-top:0;color:var(--anatomy-text);font-family:var(--tm-type);font-size:11px;line-height:18px;letter-spacing:.1em;text-align:center}
.tm-live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.tm-strike,.tm-pip{transition:none}.tm-pip[data-jam],.tm-alert,.tm-overlay{animation:none}}
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
  const html = k
    .pageHtml({ title: "Traffic manager", theme, body, script, width: 900 })
    .replace("</style>", `${CSS}</style>`)
    .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"');
  const file = theme === "light" ? "game/traffic-manager.html" : "game/traffic-manager-dark.html";
  writeFileSync(join(HERE, file), html);
  console.log("wrote", file, `${Math.round(html.length / 1024)} KB`);
}
