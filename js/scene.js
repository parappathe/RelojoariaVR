// Oficina do relojoeiro: bancada, painel de pinos, luminária, lupa, poeira, relógio da fase e as
// peças (engrenagens de dentes de verdade, extrudadas de um contorno com poucos pontos).
import * as THREE from '../vendor/three/three.module.js';
import { gearOutline, pieceTeeth } from './gears.js';

export const MOD = 0.0125;                 // 1 módulo em metros: pinos a 15 cm (lado) e 20 cm (cima)
export const BOARD = { z: -0.62, cy: 1.32, w: 1.58, h: 0.98, gridCX: -0.2 };
export const LAYER_Z = [0.018, 0.04];      // centro de cada camada, à frente da madeira
export const GEAR_THICK = 0.012;
export const TRAY = { x: -0.12, y: 0.865, z: -0.34, tilt: 0.62, slotW: 0.2 };
export const LEVER = { x: 0.56, y: 0.83, z: -0.24 };

// Posição (no espaço do mundo) do centro de um pino da fase, na camada pedida.
export function pinWorld(level, pin, layer = 0, out = new THREE.Vector3()) {
  return out.set(
    BOARD.gridCX + (pin[0] - (level.cols - 1) / 2) * 12 * MOD,
    BOARD.cy + (pin[1] - (level.rows - 1) / 2) * 16 * MOD,
    BOARD.z + (layer === null ? 0 : LAYER_Z[layer]));
}

// ---------- Texturas feitas na hora ----------
function woodTexture(base, dark, { w = 256, h = 256, rings = 18, seed = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let k = 0; k < rings * 3; k++) {
    const y0 = rnd() * h, amp = 2 + rnd() * 6, freq = 0.01 + rnd() * 0.03;
    g.strokeStyle = dark; g.globalAlpha = 0.05 + rnd() * 0.12; g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + k) * amp + Math.sin(x * 0.07 + k * 3) * 1.2;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Plaquinha de texto redesenhável (canvas num plano).
export class Card {
  constructor(width, px, py, { transparent = true } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px; this.canvas.height = py;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * py / px),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent }));
    this.key = null;
  }
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    fn(g, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
}

// ---------- Materiais ----------
const phong = (color, spec, shin) => new THREE.MeshPhongMaterial({ color, specular: spec, shininess: shin });
export const MATS = {
  brass: phong(0xc9962f, 0x9a7a3a, 70),
  brassLight: phong(0xdcb44e, 0xa08040, 70),
  copper: phong(0xb8643a, 0x8a4a2a, 55),
  steel: phong(0x9aa4ad, 0xaab0b8, 80),
  bronze: phong(0x8c6a2c, 0x6a5020, 45),
  darkSteel: phong(0x4a4f55, 0x777777, 60),
  enamel: new THREE.MeshLambertMaterial({ color: 0xf2e8d2 }),
  black: new THREE.MeshLambertMaterial({ color: 0x1a1410 }),
  red: phong(0xa8322a, 0x553333, 30),
  felt: new THREE.MeshLambertMaterial({ color: 0x2f4a3a }),
};
// cor por tamanho, para reconhecer de longe
export const SIZE_MAT = { 8: MATS.steel, 12: MATS.copper, 16: MATS.brass, 20: MATS.bronze, 24: MATS.brassLight };

// ---------- Engrenagens ----------
const gearGeoCache = new Map();
export function gearGeometry(T) {
  if (gearGeoCache.has(T)) return gearGeoCache.get(T);
  const pts = gearOutline(T).map(([x, y]) => new THREE.Vector2(x * MOD, y * MOD));
  const shape = new THREE.Shape(pts);
  const ri = (T / 2 - 1.0) * MOD;
  // furos de alívio nas maiores (4 "janelas" redondas) e o furo do eixo
  if (T >= 16) {
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4, rr = ri * 0.58, hr = ri * 0.2;
      const h = new THREE.Path();
      h.absarc(Math.cos(a) * rr, Math.sin(a) * rr, hr, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  const axle = new THREE.Path();
  axle.absarc(0, 0, 0.0045, 0, Math.PI * 2, true);
  shape.holes.push(axle);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: GEAR_THICK, bevelEnabled: false, curveSegments: 5 });
  geo.translate(0, 0, -GEAR_THICK / 2);
  geo.computeVertexNormals();
  gearGeoCache.set(T, geo);
  return geo;
}

// Número de dentes gravado: disco escuro com o número em latão.
const labelTexCache = new Map();
function labelTex(T) {
  if (labelTexCache.has(T)) return labelTexCache.get(T);
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2a1c10'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e6c26a'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#ffe39a'; g.font = 'bold 66px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(T), 64, 68);
  });
  labelTexCache.set(T, t);
  return t;
}
const labelGeo = new THREE.CircleGeometry(1, 20);
const labelMatCache = new Map();
function makeLabel(T, r) {
  if (!labelMatCache.has(T)) labelMatCache.set(T, new THREE.MeshBasicMaterial({ map: labelTex(T), transparent: true }));
  const m = new THREE.Mesh(labelGeo, labelMatCache.get(T));
  m.scale.setScalar(r);
  return m;
}

// Uma roda: engrenagem + número (+ ponto vermelho para enxergar o giro). Origem no centro.
export function makeWheel(T, { mat = SIZE_MAT[T] || MATS.brass, labelAt = 0, labelR = 0.02 } = {}) {
  const grp = new THREE.Group();
  const gear = new THREE.Mesh(gearGeometry(T), mat);
  gear.castShadow = true;
  grp.add(gear);
  const lab = makeLabel(T, labelR);
  lab.position.set(labelAt, 0, GEAR_THICK / 2 + 0.0008);
  grp.add(lab);
  grp.userData = { T, gear, label: lab };
  return grp;
}

// Peça completa (simples ou dupla). Cada roda num "pivô" que gira; a peça fica na origem do pino
// (z da madeira) e as rodas vão para a camada certa com setPieceLayer.
export function makePiece(type) {
  const teeth = pieceTeeth(type);
  const grp = new THREE.Group();
  const wheels = [];
  teeth.forEach((T, k) => {
    let labelAt = 0, labelR = Math.min(0.022, (T / 2 - 1) * MOD * 0.5);
    if (teeth.length === 2 && k === 0) {
      // número da roda grande fora da pequena, no anel entre as duas
      const inner = (teeth[1] / 2 + 0.8) * MOD, outer = (T / 2 - 1) * MOD;
      labelAt = (inner + outer) / 2;
      labelR = Math.min(0.02, (outer - inner) / 2 * 0.9);
    }
    const w = makeWheel(T, { labelAt, labelR });
    grp.add(w);
    wheels.push(w);
  });
  // eixo de latão que liga as duas rodas da dupla
  if (teeth.length === 2) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, LAYER_Z[1] - LAYER_Z[0], 10), MATS.darkSteel);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = (LAYER_Z[0] + LAYER_Z[1]) / 2;
    grp.add(hub);
  }
  grp.userData = { type, wheels, teeth };
  setPieceLayer(grp, 0);
  return grp;
}
export function setPieceLayer(grp, layer) {
  const { wheels } = grp.userData;
  wheels[0].position.z = LAYER_Z[layer];
  if (wheels[1]) wheels[1].position.z = LAYER_Z[1 - layer];
  grp.userData.layer = layer;
}

// Seta curva de sentido (horário em âmbar, anti-horário em verde-água), parada no mundo.
function arrowTex(cw) {
  return canvasTex(128, 128, (g) => {
    const col = cw ? '#ffb43a' : '#4fd6c8';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 9; g.lineCap = 'round';
    const R = 52, a0 = -Math.PI * 0.85, a1 = -Math.PI * 0.15;
    g.beginPath(); g.arc(64, 64, R, a0, a1); g.stroke();
    // ponta: no fim do arco, apontando no sentido do giro
    const end = cw ? a1 : a0, dir = cw ? 1 : -1;
    const ex = 64 + R * Math.cos(end), ey = 64 + R * Math.sin(end);
    const tx = -Math.sin(end) * dir, ty = Math.cos(end) * dir; // tangente
    const nx = Math.cos(end), ny = Math.sin(end);
    g.beginPath();
    g.moveTo(ex + tx * 18, ey + ty * 18);
    g.lineTo(ex + nx * 13 - tx * 4, ey + ny * 13 - ty * 4);
    g.lineTo(ex - nx * 13 - tx * 4, ey - ny * 13 - ty * 4);
    g.closePath(); g.fill();
    // a mesma seta do outro lado (meia-volta)
    g.save(); g.translate(64, 64); g.rotate(Math.PI); g.translate(-64, -64);
    g.beginPath(); g.arc(64, 64, R, a0, a1); g.stroke();
    g.beginPath();
    g.moveTo(ex + tx * 18, ey + ty * 18);
    g.lineTo(ex + nx * 13 - tx * 4, ey + ny * 13 - ty * 4);
    g.lineTo(ex - nx * 13 - tx * 4, ey - ny * 13 - ty * 4);
    g.closePath(); g.fill();
    g.restore();
  });
}
export const ARROW_MATS = {
  cw: new THREE.MeshBasicMaterial({ map: arrowTex(true), transparent: true, depthWrite: false, opacity: 0.9 }),
  ccw: new THREE.MeshBasicMaterial({ map: arrowTex(false), transparent: true, depthWrite: false, opacity: 0.9 }),
};
export const ARROW_GEO = new THREE.PlaneGeometry(2, 2);

// Mostrador de um alvo: esmalte, marcas, letra e ponteiro. Proibido: aro vermelho e um X.
export function makeDial(letter, forbidden = false) {
  const grp = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.05, 28), new THREE.MeshLambertMaterial({
    map: canvasTex(256, 256, (g) => {
      g.fillStyle = forbidden ? '#f0d6cc' : '#f4ead2'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
      g.strokeStyle = forbidden ? '#a8322a' : '#7a5a2a'; g.lineWidth = forbidden ? 14 : 8; g.stroke();
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 5;
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2, r0 = k % 3 === 0 ? 92 : 102;
        g.beginPath(); g.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); g.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); g.stroke();
      }
      g.fillStyle = forbidden ? '#a8322a' : '#5a3a1a'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(forbidden ? '✕' : letter, 128, 172);
    }),
  }));
  grp.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.051, 0.005, 6, 28), forbidden ? MATS.red : MATS.brass);
  grp.add(rim);
  const hand = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.042, 0.003), MATS.black);
  blade.position.y = 0.018;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 0.003), MATS.black);
  tail.position.y = -0.008;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.014, 3), MATS.black);
  tip.position.y = 0.045;
  hand.add(blade, tail, tip);
  hand.position.z = 0.004;
  grp.add(hand);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), MATS.brass);
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.007;
  grp.add(cap);
  grp.userData.hand = hand;
  return grp;
}

// Manivela do motor: braço e pegador, na frente do eixo.
export function makeCrank() {
  const grp = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.075, 0.008), MATS.darkSteel);
  arm.position.y = 0.032;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 12), MATS.brass);
  hub.rotation.x = Math.PI / 2;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.045, 10), new THREE.MeshLambertMaterial({ color: 0x5a2a14 }));
  knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.065, 0.025);
  grp.add(arm, hub, knob);
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}

// ---------- A cena ----------
export function buildScene({ hiShadow = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x140d08);
  scene.fog = new THREE.Fog(0x140d08, 3.5, 9);

  const woodBoard = woodTexture('#a8743e', '#5a3410', { seed: 3 });
  const woodBench = woodTexture('#6e4424', '#2e1606', { seed: 7 });
  const woodWall = woodTexture('#4a3020', '#24140a', { seed: 11, rings: 10 });
  woodWall.repeat.set(4, 2);
  const woodFloor = woodTexture('#3e2716', '#1a0d05', { seed: 13 });
  woodFloor.repeat.set(3, 6);

  const boardMat = new THREE.MeshLambertMaterial({ map: woodBoard });
  const benchMat = new THREE.MeshLambertMaterial({ map: woodBench });
  const frameMat = new THREE.MeshLambertMaterial({ map: woodBench, color: 0x9a7a60 });

  // Luz: luminária de bancada (spot com sombra) + ambiente quente bem fraco + um preenchimento.
  scene.add(new THREE.HemisphereLight(0xffe2b8, 0x2a1a10, 0.55));
  const fill = new THREE.PointLight(0xffc890, 0.6, 4, 2);
  fill.position.set(0.6, 1.9, 0.6);
  scene.add(fill);

  // Sala: chão, parede do fundo com lambri, paredes laterais escuras.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ map: woodFloor }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -0.5;
  floor.receiveShadow = true;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshLambertMaterial({ map: woodWall }));
  wall.position.set(0, 1.6, -0.95);
  wall.receiveShadow = true;
  scene.add(wall);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(4, 3.2), new THREE.MeshLambertMaterial({ color: 0x2a1c12 }));
    side.position.set(sx * 2.2, 1.6, 0.6); side.rotation.y = -sx * Math.PI / 2;
    scene.add(side);
  }

  // Bancada
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 0.62), benchMat);
  top.position.set(0, 0.785, -0.42);
  top.receiveShadow = true; top.castShadow = true;
  bench.add(top);
  for (const [x, z] of [[-0.95, -0.15], [0.95, -0.15], [-0.95, -0.7], [0.95, -0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.76, 0.07), benchMat);
    leg.position.set(x, 0.38, z);
    bench.add(leg);
  }
  const apron = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.02), benchMat);
  apron.position.set(0, 0.70, -0.12);
  bench.add(apron);
  scene.add(bench);

  // Painel de pinos (madeira clara com moldura escura)
  const board = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h, 0.03), boardMat);
  panel.position.set(0, BOARD.cy, BOARD.z - 0.015);
  panel.receiveShadow = true;
  board.add(panel);
  const fr = 0.045;
  for (const [w, h, x, y] of [
    [BOARD.w + fr * 2, fr, 0, BOARD.cy + BOARD.h / 2 + fr / 2], [BOARD.w + fr * 2, fr, 0, BOARD.cy - BOARD.h / 2 - fr / 2],
    [fr, BOARD.h, -BOARD.w / 2 - fr / 2, BOARD.cy], [fr, BOARD.h, BOARD.w / 2 + fr / 2, BOARD.cy],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameMat);
    m.position.set(x, y, BOARD.z - 0.005);
    m.castShadow = true; m.receiveShadow = true;
    board.add(m);
  }
  // divisória entre a grade e o quadro de pedidos
  const divider = new THREE.Mesh(new THREE.BoxGeometry(0.012, BOARD.h - 0.06, 0.012), MATS.brass);
  divider.position.set(0.36, BOARD.cy, BOARD.z + 0.006);
  board.add(divider);
  // pés que apoiam o painel na bancada
  for (const sx of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.18), frameMat);
    foot.position.set(sx * (BOARD.w / 2 - 0.05), BOARD.cy - BOARD.h / 2 - 0.02, BOARD.z + 0.02);
    board.add(foot);
  }
  scene.add(board);

  // Plaquinha do nome da fase, na moldura de cima
  const header = new Card(0.62, 1024, 96);
  header.mesh.position.set(BOARD.gridCX, BOARD.cy + BOARD.h / 2 + fr / 2, BOARD.z + 0.022);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.068, 0.006), MATS.brass);
  plate.position.set(BOARD.gridCX, BOARD.cy + BOARD.h / 2 + fr / 2, BOARD.z + 0.017);
  scene.add(plate, header.mesh);

  // Quadro de pedidos (papel preso no painel, à direita)
  const sheetBack = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.86), new THREE.MeshLambertMaterial({ color: 0xe9dcc0 }));
  sheetBack.position.set(0.58, BOARD.cy, BOARD.z + 0.003);
  sheetBack.receiveShadow = true;
  const info = new Card(0.38, 512, 1100);
  info.mesh.position.set(0.58, BOARD.cy, BOARD.z + 0.005);
  for (const sx of [-1, 1]) {
    const tack = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), MATS.red);
    tack.position.set(0.58 + sx * 0.16, BOARD.cy + 0.41, BOARD.z + 0.008);
    scene.add(tack);
  }
  scene.add(sheetBack, info.mesh);

  // Bandeja das peças, inclinada para o jogador
  const tray = new THREE.Group();
  tray.position.set(TRAY.x, TRAY.y, TRAY.z);
  tray.rotation.x = -TRAY.tilt;
  const trayBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.02), benchMat);
  trayBase.position.z = -0.012;
  trayBase.receiveShadow = true;
  const trayFelt = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.26), MATS.felt);
  trayFelt.receiveShadow = true;
  trayFelt.position.z = -0.001;
  tray.add(trayBase, trayFelt);
  for (const [w, h, x, y] of [[1.32, 0.02, 0, 0.15], [1.32, 0.02, 0, -0.15], [0.02, 0.3, -0.66, 0], [0.02, 0.3, 0.66, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat);
    m.position.set(x, y, 0);
    tray.add(m);
  }
  // pé que segura a bandeja inclinada
  const trayLeg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.12), benchMat);
  trayLeg.position.set(0, -0.08, -0.08);
  trayLeg.rotation.x = TRAY.tilt;
  tray.add(trayLeg);
  scene.add(tray);

  // Alavanca do motor na bancada (clicável)
  const lever = new THREE.Group();
  lever.position.set(LEVER.x, LEVER.y, LEVER.z);
  const lbase = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.08), MATS.darkSteel);
  lbase.position.y = 0.02;
  const lrod = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8), MATS.steel);
  rod.position.y = 0.06;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), MATS.red);
  ball.position.y = 0.125;
  lrod.add(rod, ball);
  lrod.position.y = 0.04;
  const leverLabel = new Card(0.13, 256, 64);
  leverLabel.mesh.position.set(0, 0.021, 0.0405);
  lever.add(lbase, lrod, leverLabel.mesh);
  // caixa de clique maior que a alavanca, para mirar fácil
  const leverHit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
  leverHit.position.y = 0.08;
  lever.add(leverHit);
  lever.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(lever);
  function setLever(on, label) {
    lrod.rotation.x = on ? 0.6 : -0.6;
    leverLabel.draw(label + on, (g, w, h) => {
      g.fillStyle = on ? '#2e5a2a' : '#4a2a1a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe39a'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${label}: ${on ? 'LIGADO' : 'desligado'}`, w / 2, h / 2 + 2);
    });
  }
  setLever(false, 'Motor');

  // Luminária articulada à esquerda
  const lamp = new THREE.Group();
  const lbase2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.025, 16), MATS.darkSteel);
  lbase2.position.set(-0.78, 0.82, -0.5);
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.55, 8), MATS.darkSteel);
  arm1.position.set(-0.76, 1.08, -0.42); arm1.rotation.x = 0.35; arm1.rotation.z = -0.1;
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.45, 8), MATS.darkSteel);
  arm2.position.set(-0.67, 1.48, -0.22); arm2.rotation.z = -0.9; arm2.rotation.x = -0.3;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 16, 1, true), new THREE.MeshPhongMaterial({ color: 0x2e4a3a, specular: 0x444444, shininess: 40, side: THREE.DoubleSide }));
  const shadePos = new THREE.Vector3(-0.5, 1.62, -0.12);
  shade.position.copy(shadePos);
  const lookAt = new THREE.Vector3(-0.1, 1.25, BOARD.z);
  const dir = lookAt.clone().sub(shadePos).normalize();
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
  bulb.position.copy(shadePos).addScaledVector(dir, 0.03);
  lamp.add(lbase2, arm1, arm2, shade, bulb);
  scene.add(lamp);
  const spot = new THREE.SpotLight(0xffd9a0, 9, 4, 0.75, 0.55, 1.6);
  spot.position.copy(shadePos).addScaledVector(dir, 0.04);
  spot.target.position.copy(lookAt);
  spot.castShadow = true;
  spot.shadow.mapSize.set(hiShadow ? 1024 : 512, hiShadow ? 1024 : 512);
  spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 2.5;
  spot.shadow.bias = -0.0008;
  spot.shadow.normalBias = 0.01;
  scene.add(spot, spot.target);

  // Lupa decorativa na direita
  const lupa = new THREE.Group();
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 16), MATS.darkSteel);
  lb.position.y = 0.01;
  const lpost = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), MATS.brass);
  lpost.position.y = 0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 8, 28), MATS.brass);
  ring.position.set(0, 0.29, 0);
  ring.rotation.y = 0.5; ring.rotation.x = -0.3;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.073, 24), new THREE.MeshPhongMaterial({
    color: 0xcfe8ff, transparent: true, opacity: 0.18, specular: 0xffffff, shininess: 120, side: THREE.DoubleSide, depthWrite: false }));
  lens.position.copy(ring.position); lens.rotation.copy(ring.rotation);
  lupa.add(lb, lpost, ring, lens);
  lupa.position.set(0.82, 0.81, -0.3);
  scene.add(lupa);

  // Enfeites: prateleira com relógios parados, ferramentas na bancada
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 0.18), benchMat);
  shelf.position.set(0, 2.42, -0.86);
  scene.add(shelf);
  const decoClocks = [];
  [[-0.65, 0.07, 0x7a4a24], [-0.3, 0.05, 0x5a3a20], [0.32, 0.06, 0x80502a], [0.66, 0.045, 0x4a2e18]].forEach(([x, r, col]) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 18), new THREE.MeshLambertMaterial({ color: col }));
    body.rotation.x = Math.PI / 2; body.position.set(x, 2.435 + r, -0.84);
    const face = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 18), MATS.enamel);
    face.position.set(x, 2.435 + r, -0.819);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.004, r * 0.7, 0.002), MATS.black);
    hand.geometry.translate(0, r * 0.33, 0);
    hand.position.set(x, 2.435 + r, -0.817);
    hand.rotation.z = x * 7;
    scene.add(body, face, hand);
    decoClocks.push(hand);
  });
  const tools = new THREE.Group();
  const scr = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x8a2a1a }));
  scr.rotation.z = Math.PI / 2; scr.position.set(0, 0.818, 0);
  const tip2 = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 6), MATS.steel);
  tip2.rotation.z = Math.PI / 2; tip2.position.set(0.1, 0.818, 0);
  const tweez = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.004, 0.01), MATS.steel);
  tweez.position.set(0.05, 0.814, 0.04); tweez.rotation.y = 0.3;
  tools.add(scr, tip2, tweez);
  tools.position.set(-0.72, 0, -0.2);
  scene.add(tools);

  // Poeira no facho da luminária
  const N = 160;
  const dustPos = new Float32Array(N * 3), dustVel = new Float32Array(N * 3);
  const DUST_MIN = new THREE.Vector3(-0.7, 0.9, -0.6), DUST_MAX = new THREE.Vector3(0.5, 1.9, 0.1);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      const a = DUST_MIN.getComponent(k), b = DUST_MAX.getComponent(k);
      dustPos[i * 3 + k] = a + Math.random() * (b - a);
      dustVel[i * 3 + k] = (Math.random() - 0.5) * 0.01;
    }
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustTex = canvasTex(32, 32, (g) => {
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  });
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    map: dustTex, size: 0.006, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2b0 }));
  dust.frustumCulled = false;
  scene.add(dust);
  function updateDust(dt, t) {
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      dustVel[o] += (Math.sin(t * 0.3 + i) * 0.002 - dustVel[o]) * dt;
      dustVel[o + 1] += (Math.cos(t * 0.23 + i * 1.7) * 0.0015 - 0.0004 - dustVel[o + 1]) * dt;
      dustVel[o + 2] += (Math.sin(t * 0.17 + i * 2.3) * 0.002 - dustVel[o + 2]) * dt;
      for (let k = 0; k < 3; k++) {
        dustPos[o + k] += dustVel[o + k] * dt * 4;
        const a = DUST_MIN.getComponent(k), b = DUST_MAX.getComponent(k);
        if (dustPos[o + k] < a) dustPos[o + k] = b; else if (dustPos[o + k] > b) dustPos[o + k] = a;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
    decoClocks.forEach((h, i) => { h.rotation.z -= dt * (0.05 + i * 0.02); });
  }

  const clock = buildClock();
  clock.group.position.set(BOARD.gridCX, BOARD.cy + BOARD.h / 2 + 0.05, BOARD.z + 0.02);
  scene.add(clock.group);

  return { scene, board, tray, header, info, lever, leverHit, setLever, updateDust, clock, spot };
}

// Relógio da fase em cima do painel: casinha de cuco (pássaro sai na vitória) ou relógio de
// carrilhão (dois sininhos com martelinhos). Parado até a fase ser resolvida.
function buildClock() {
  const group = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3418 });
  const woodDark = new THREE.MeshLambertMaterial({ color: 0x3a200e });
  // casinha (cuco)
  const cuco = new THREE.Group();
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.1), wood);
  house.position.y = 0.13;
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.016, 0.12), woodDark);
  roofL.position.set(-0.06, 0.265, 0); roofL.rotation.z = 0.6;
  const roofR = roofL.clone(); roofR.position.x = 0.06; roofR.rotation.z = -0.6;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.006), woodDark);
  door.geometry.translate(0.0225, 0, 0);
  door.position.set(-0.0225, 0.2, 0.053);
  const bird = new THREE.Group();
  const bbody = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe0b030 }));
  bbody.scale.set(1, 0.85, 1.3);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, 6), new THREE.MeshLambertMaterial({ color: 0xd06020 }));
  beak.rotation.x = Math.PI / 2; beak.position.z = 0.024;
  bird.add(bbody, beak);
  bird.position.set(0, 0.2, 0.02);
  cuco.add(house, roofL, roofR, door, bird);
  // carrilhão: dois sinos em cima
  const bells = new THREE.Group();
  const bellGeo = new THREE.SphereGeometry(0.028, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const bellL = new THREE.Mesh(bellGeo, MATS.brassLight), bellR = new THREE.Mesh(bellGeo, MATS.brassLight);
  bellL.position.set(-0.05, 0.27, 0); bellR.position.set(0.05, 0.27, 0);
  const hammer = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), MATS.darkSteel);
  hammer.position.set(0, 0.26, 0);
  const body2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.1), wood);
  body2.position.y = 0.13;
  const cap2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.02, 4, 1), woodDark);
  cap2.rotation.y = Math.PI / 4; cap2.position.y = 0.25; cap2.scale.z = 0.5;
  bells.add(body2, cap2, bellL, bellR, hammer);
  // mostrador comum
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.06, 28), MATS.enamel);
  face.position.set(0, 0.11, 0.0515);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, 6, 28), MATS.brass);
  rim.position.copy(face.position);
  const hourH = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.035, 0.002), MATS.black);
  hourH.geometry.translate(0, 0.016, 0);
  const minH = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.002), MATS.black);
  minH.geometry.translate(0, 0.023, 0);
  hourH.position.set(0, 0.11, 0.054); minH.position.set(0, 0.11, 0.055);
  group.add(cuco, bells, face, rim, hourH, minH);

  let alive = 0, birdT = 0, kind = 'cuco', timeH = 0;
  function setKind(k, seed = 0) {
    kind = k;
    cuco.visible = k === 'cuco';
    bells.visible = k !== 'cuco';
    alive = 0; birdT = 0;
    timeH = (seed * 37 % 12) + 0.3;
    door.rotation.y = 0; bird.position.z = 0.02;
  }
  setKind('cuco');
  function update(dt, isAlive) {
    if (isAlive) { alive += dt; birdT += dt; } else alive = 0;
    const t = timeH + (isAlive ? alive * 0.2 : 0);
    minH.rotation.z = -(t % 1) * Math.PI * 2;
    hourH.rotation.z = -(t / 12) * Math.PI * 2;
    if (kind === 'cuco') {
      // pássaro sai e entra três vezes logo depois de ganhar
      const k = isAlive && birdT < 2.3 ? Math.max(0, Math.sin(birdT / 0.7 * Math.PI * 2 - 0.3)) : 0;
      door.rotation.y = -k * 1.6;
      bird.position.z = 0.02 + k * 0.05;
    } else {
      hammer.position.x = isAlive && alive < 6 ? Math.sin(alive * 9) * 0.035 : 0;
      bellL.rotation.z = isAlive && alive < 6 ? Math.sin(alive * 9) * 0.08 : 0;
      bellR.rotation.z = -bellL.rotation.z;
    }
  }
  return { group, setKind, update };
}
