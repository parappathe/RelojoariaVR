// Liga o núcleo do jogo (fases, engrenamento) à tela, ao Quest e ao mouse.
import * as THREE from '../vendor/three/three.module.js';
import { LEVELS, MENU_LEVEL } from './levels.js';
import { Game } from './game.js';
import { pieceTeeth, toothPhases, ratioText, senseText, ADDENDUM } from './gears.js';
import { str, toNumber } from './frac.js';
import {
  buildScene, pinWorld, makePiece, setPieceLayer, makeWheel, makeDial, makeCrank,
  ARROW_MATS, ARROW_GEO, BOARD, TRAY, LAYER_Z, MOD, MATS, Card,
} from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { solveLevel } from '../tests/robot.js';

const save = loadSave();
const sfx = new Sfx();
sfx.setOn(save.sound);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const TAU = Math.PI * 2;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildScene({ hiShadow: !IS_QUEST });
const { scene } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.03, 30);
rig.add(camera);

// No PC a câmera fica em pé na frente da bancada, vendo o painel inteiro, a bandeja e o quadro.
const DESK_CAM = new THREE.Vector3(0, 1.45, 0.8);
const DESK_LOOK = new THREE.Vector3(0, 1.2, -0.55);
function fitDeskFov() {
  const aspect = window.innerWidth / window.innerHeight;
  const d = DESK_CAM.z - BOARD.z;
  const h = 2 * Math.atan(Math.tan(Math.atan((BOARD.w / 2 + 0.08) / d)) / aspect);
  camera.fov = THREE.MathUtils.radToDeg(Math.max(THREE.MathUtils.degToRad(54), h));
  camera.updateProjectionMatrix();
}
function deskCamera() {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.copy(DESK_CAM);
  camera.lookAt(DESK_LOOK);
  fitDeskFov();
}
deskCamera();

const panel = new Panel(0.9);
panel.mesh.position.set(0, 1.33, -0.3);
scene.add(panel.mesh);
const fpsLabel = new Label(0.14);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);

// ---------- Estado ----------
let app = 'menu';      // 'menu' | 'playing' | 'paused' | 'won'
let game = null;
let levelIndex = 0;
let level = MENU_LEVEL;
let time = 0;
let wonTimer = 0;
let alive = false;      // relógio da fase "ganhou vida"
let flash = { text: '', t: 0 };
let crankKeys = 0;

const levelGroup = new THREE.Group();   // pinos, motor, mostradores, correias (fixos da fase)
const piecesGroup = new THREE.Group();  // peças postas
const arrowsGroup = new THREE.Group();  // setas de sentido
const slotsGroup = new THREE.Group();   // peças de amostra na bandeja
scene.add(levelGroup, piecesGroup, arrowsGroup);
world.tray.add(slotsGroup);

let fixedMeshes = { motor: null, crank: null, targets: [], forbidden: [], dials: [], fdials: [], pulleys: [] };
let pieceMeshes = [];
let wheelMeshes = [];   // por roda do resultado atual (mesma ordem de game.res.wheels)
let phases = [];
let slots = [];         // { type, hit, display, label }
let pickables = [];

// ---------- Anéis de destaque ----------
const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
function makeRing(color, opacity = 0.85) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 5;
  m.visible = false;
  scene.add(m);
  return m;
}
const snapRings = [makeRing(0x6cff8a), makeRing(0x6cff8a)];
const hoverRing = makeRing(0xffe39a, 0.7);
const conflictRings = [makeRing(0xff3a2a, 0.9), makeRing(0xff3a2a, 0.9)];

// ---------- Montagem da fase na cena ----------
function clearGroup(g) { while (g.children.length) g.remove(g.children[0]); }

const pinGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.058, 8);
pinGeo.rotateX(Math.PI / 2); pinGeo.translate(0, 0, 0.029);
const plugGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.006, 12);
plugGeo.rotateX(Math.PI / 2);
const xBarGeo = new THREE.BoxGeometry(0.03, 0.006, 0.004);
const pulleyGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.008, 18);
pulleyGeo.rotateX(Math.PI / 2);
const beltMat = new THREE.MeshLambertMaterial({ color: 0x3a2214 });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function buildLevel() {
  clearGroup(levelGroup);
  fixedMeshes = { motor: null, crank: null, targets: [], forbidden: [], dials: [], fdials: [], pulleys: [] };
  const L = level;
  const own = new Set([L.motor.pin, ...(L.targets || []).map(t => t.pin), ...(L.forbidden || []).map(f => f.pin)].map(p => p.join()));
  for (let j = 0; j < L.rows; j++) for (let i = 0; i < L.cols; i++) {
    pinWorld(L, [i, j], null, _v);
    if ((L.blocked || []).some(b => b[0] === i && b[1] === j)) {
      const plug = new THREE.Mesh(plugGeo, MATS.darkSteel);
      plug.position.copy(_v).z += 0.003;
      const x1 = new THREE.Mesh(xBarGeo, MATS.red), x2 = new THREE.Mesh(xBarGeo, MATS.red);
      x1.rotation.z = Math.PI / 4; x2.rotation.z = -Math.PI / 4;
      x1.position.copy(_v).z += 0.007; x2.position.copy(x1.position);
      levelGroup.add(plug, x1, x2);
      continue;
    }
    const pin = new THREE.Mesh(pinGeo, own.has(`${i},${j}`) ? MATS.darkSteel : MATS.brass);
    pin.position.copy(_v);
    pin.castShadow = true;
    levelGroup.add(pin);
  }
  // correias: duas polias atrás das camadas e a correia de couro em volta
  for (const b of L.belts || []) {
    const pa = pinWorld(L, b.a, null, new THREE.Vector3()), pb = pinWorld(L, b.b, null, new THREE.Vector3());
    pa.z += 0.007; pb.z += 0.007;
    for (const p of [pa, pb]) {
      const pul = new THREE.Group();
      const disc = new THREE.Mesh(pulleyGeo, MATS.copper);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), MATS.darkSteel);
      pul.add(disc, spoke);
      pul.position.copy(p);
      levelGroup.add(pul);
      fixedMeshes.pulleys.push({ mesh: pul, pin: p === pa ? b.a : b.b });
    }
    const d = pb.clone().sub(pa), len = d.length(), ang = Math.atan2(d.y, d.x);
    const nrm = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).multiplyScalar(0.032);
    for (const s of [1, -1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.006, 0.01), beltMat);
      strip.position.copy(pa).add(pb).multiplyScalar(0.5).addScaledVector(nrm, s);
      strip.rotation.z = ang;
      levelGroup.add(strip);
    }
    for (const [p, a0] of [[pa, ang + Math.PI / 2], [pb, ang - Math.PI / 2]]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.004, 4, 12, Math.PI), beltMat);
      arc.position.copy(p); arc.rotation.z = a0;
      levelGroup.add(arc);
    }
  }
  // motor: engrenagem própria, manivela e um tambor de mola atrás
  {
    const m = L.motor;
    const w = makeWheel(m.T, { mat: MATS.darkSteel });
    pinWorld(L, m.pin, m.layer || 0, w.position);
    levelGroup.add(w);
    const crank = makeCrank();
    pinWorld(L, m.pin, null, crank.position).z += 0.058;
    levelGroup.add(crank);
    fixedMeshes.motor = w; fixedMeshes.crank = crank;
    const tag = new Card(0.11, 256, 64);
    tag.draw('m', (g, W, H) => {
      g.fillStyle = '#3a2412'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffe39a'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`MOTOR · ${m.T}`, W / 2, H / 2 + 2);
    });
    pinWorld(L, m.pin, null, tag.mesh.position);
    tag.mesh.position.y -= (m.T / 2 + ADDENDUM) * MOD + 0.03;
    tag.mesh.position.z += 0.002;
    levelGroup.add(tag.mesh);
    for (const o of [w, crank]) o.traverse(c => { if (c.isMesh) c.userData.pick = { kind: 'motor' }; });
  }
  (L.targets || []).forEach((t, k) => {
    const w = makeWheel(t.T, { mat: MATS.brass });
    pinWorld(L, t.pin, t.layer || 0, w.position);
    const dial = makeDial(String.fromCharCode(65 + k));
    pinWorld(L, t.pin, null, dial.position).z += 0.062;
    levelGroup.add(w, dial);
    fixedMeshes.targets.push(w); fixedMeshes.dials.push(dial);
  });
  (L.forbidden || []).forEach((f) => {
    const w = makeWheel(f.T, { mat: MATS.copper });
    pinWorld(L, f.pin, f.layer || 0, w.position);
    const dial = makeDial('', true);
    pinWorld(L, f.pin, null, dial.position).z += 0.062;
    levelGroup.add(w, dial);
    fixedMeshes.forbidden.push(w); fixedMeshes.fdials.push(dial);
  });
  levelGroup.traverse(o => { if (o.isMesh && o.geometry !== pinGeo) o.castShadow = true; });
  buildSlots();
}

// Bandeja: uma amostra de cada tipo de peça da fase, com a quantidade.
function buildSlots() {
  clearGroup(slotsGroup);
  slots = [];
  const types = Object.keys(level.pieces);
  const n = Math.max(1, types.length);
  const slotW = Math.min(TRAY.slotW, 1.2 / n);
  types.forEach((type, k) => {
    const x = (k - (n - 1) / 2) * slotW;
    const disp = makePiece(type);
    disp.scale.setScalar(0.5);
    disp.position.set(x, 0.015, -0.006);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(slotW * 0.95, 0.26, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, 0, 0.02);
    hit.userData.pick = { kind: 'slot', type };
    const label = new Card(0.11, 256, 72);
    label.mesh.position.set(x, -0.11, 0.003);
    slotsGroup.add(disp, hit, label.mesh);
    slots.push({ type, hit, display: disp, label });
  });
  updateSlots();
}
function updateSlots() {
  for (const s of slots) {
    const n = game ? game.stock[s.type] || 0 : 0;
    s.display.visible = n > 0;
    const t = pieceTeeth(s.type);
    const name = t.length === 2 ? `dupla ${t[0]}+${t[1]}` : `${t[0]} dentes`;
    s.label.draw(name + n, (g, W, H) => {
      g.fillStyle = n > 0 ? 'rgba(40,26,14,0.85)' : 'rgba(40,26,14,0.4)';
      g.fillRect(0, 0, W, H);
      g.fillStyle = n > 0 ? '#ffe39a' : '#8a7a60';
      g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${name} ×${n}`, W / 2, H / 2 + 2);
    });
  }
}

// Peças postas, setas, alinhamento dos dentes: refeito a cada mudança no painel.
let boardVersion = 0;
function syncBoard() {
  boardVersion++;
  clearGroup(piecesGroup);
  pieceMeshes = game.placed.map((pl, k) => {
    const g = makePiece(pl.type);
    setPieceLayer(g, pl.layer);
    pinWorld(level, pl.pin, null, g.position);
    g.traverse(o => { if (o.isMesh) o.userData.pick = { kind: 'piece', index: k }; });
    piecesGroup.add(g);
    return g;
  });
  const res = game.res;
  wheelMeshes = res.wheels.map(w => {
    if (w.role === 'motor') return fixedMeshes.motor;
    if (w.role === 'target') return fixedMeshes.targets[w.index];
    if (w.role === 'forbidden') return fixedMeshes.forbidden[w.index];
    return pieceMeshes[w.piece].userData.wheels[w.part];
  });
  wheelMeshes.forEach(m => { m.userData.base = m.position.clone(); });
  phases = toothPhases(res);
  // setas de sentido nas rodas que giram com o motor
  clearGroup(arrowsGroup);
  if (!res.jammed) {
    res.wheels.forEach((w, i) => {
      const om = res.wheelOmega(i);
      if (!om || om.n === 0) return;
      const a = new THREE.Mesh(ARROW_GEO, om.n > 0 ? ARROW_MATS.cw : ARROW_MATS.ccw);
      const r = w.T / 2 * MOD;
      a.scale.setScalar(r * 0.92);
      pinWorld(level, w.pin, w.layer, a.position);
      a.position.z += 0.0075;
      a.renderOrder = 4;
      arrowsGroup.add(a);
    });
  }
  pickables = [...slots.map(s => s.hit), world.leverHit];
  levelGroup.traverse(o => { if (o.isMesh && o.userData.pick) pickables.push(o); });
  piecesGroup.traverse(o => { if (o.isMesh) pickables.push(o); });
  updateSlots();
}

function newGame(lv, idx) {
  for (const h of hands()) dropHeld(h, true);
  level = lv;
  levelIndex = idx;
  game = new Game(lv);
  buildLevel();
  syncBoard();
  alive = false;
  wonTimer = 0;
  world.clock.setKind(lv.clock || 'cuco', idx + 1);
  flash = { text: '', t: 0 };
}

// ---------- Mãos (mouse e controles) ----------
// Cada "mão" pode segurar uma peça: { type, mesh, pref, snap, mode }.
const mouseHand = { id: 'mouse', held: null, hover: null, point: new THREE.Vector3(), ray: new THREE.Ray(), active: false };
const ctrls = [];
const hands = () => [mouseHand, ...ctrls];
const raycaster = new THREE.Raycaster();
const frontPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(BOARD.z + LAYER_Z[1]));

for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffd76e, transparent: true, opacity: 0.8 }));
  laser.visible = false;
  ctrl.add(laser);
  // "pinça" simples de relojoeiro na mão
  const tool = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.09, 10), MATS.darkSteel);
  body.rotation.x = Math.PI / 2;
  const tipA = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.05), MATS.brass);
  tipA.position.set(0.004, 0, -0.065);
  const tipB = tipA.clone(); tipB.position.x = -0.004;
  tool.add(body, tipA, tipB);
  grip.add(tool);
  const e = {
    id: 'ctrl' + i, ctrl, grip, laser, source: null, side: null, prevButtons: [],
    held: null, hover: null, point: new THREE.Vector3(), ray: new THREE.Ray(), active: false, uiHover: -1,
  };
  ctrls.push(e);
  ctrl.addEventListener('connected', (ev) => { e.source = ev.data; e.side = ev.data.handedness; });
  ctrl.addEventListener('disconnected', () => { dropHeld(e, true); e.source = null; e.side = null; });
  ctrl.addEventListener('selectstart', () => onPress(e, 'ray'));
  ctrl.addEventListener('selectend', () => { if (e.held?.mode === 'ray') release(e); });
  ctrl.addEventListener('squeezestart', () => onPress(e, 'grip'));
  ctrl.addEventListener('squeezeend', () => { if (e.held?.mode === 'grip') release(e); });
}

function pulse(h, v, ms) {
  try { h?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}
function pulseAll(v, ms) { for (const c of ctrls) pulse(c, v, ms); }

// Raio e ponto de cada mão no quadro do mundo.
const _q = new THREE.Quaternion();
function updateHandRay(h) {
  if (h === mouseHand) {
    raycaster.setFromCamera(mouse.ndc, camera);
    h.ray.copy(raycaster.ray);
    h.active = mouse.inside;
  } else {
    h.active = !!h.source;
    if (!h.active) return;
    h.ctrl.getWorldPosition(h.ray.origin);
    h.ctrl.getWorldQuaternion(_q);
    h.ray.direction.set(0, 0, -1).applyQuaternion(_q);
  }
}

// O que está na mira (peça, bandeja, motor, alavanca).
function pickAt(h) {
  raycaster.ray.copy(h.ray);
  raycaster.far = 3;
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) return null;
  const p = hit.object.userData.pick || (hit.object === world.leverHit ? { kind: 'lever' } : null);
  return p ? { ...p, distance: hit.distance, point: hit.point } : null;
}
// Peça mais perto da pinça (pegar com o botão lateral, sem apontar).
function pickNear(h) {
  h.grip.getWorldPosition(_v);
  let best = null, bd = 0.1;
  game.placed.forEach((pl, k) => {
    pinWorld(level, pl.pin, pl.layer, _v2);
    const d = _v.distanceTo(_v2);
    if (d < bd) { bd = d; best = { kind: 'piece', index: k }; }
  });
  for (const s of slots) {
    s.hit.getWorldPosition(_v2);
    const d = _v.distanceTo(_v2);
    if (d < Math.max(bd, 0.12)) { bd = d; best = { kind: 'slot', type: s.type }; }
  }
  return best;
}

function canInteract() { return app === 'playing' && game && game.state === 'play'; }

function grabFrom(h, target, mode) {
  if (!canInteract() || h.held || !target) return false;
  let type = null;
  if (target.kind === 'slot') { if (game.take(target.type)) type = target.type; }
  else if (target.kind === 'piece') {
    type = game.lift(target.index);
    if (type) syncBoard();
  }
  if (!type) return false;
  const mesh = makePiece(type);
  scene.add(mesh);
  h.held = { type, mesh, pref: 0, snap: null, mode, key: '' };
  sfx.pick();
  pulse(h, 0.3, 20);
  updateSlots();
  return true;
}

// Solta: encaixa no pino da mira (se couber) ou volta para a bandeja.
function release(h) {
  const held = h.held;
  if (!held) return;
  const s = held.snap;
  if (s && s.ok && canInteract()) {
    const idx = game.place(held.type, s.pin, s.layer);
    if (idx >= 0) { pulse(h, 0.7, 45); finishHeld(h); syncBoard(); return; }
  }
  if (s && !s.ok) { sfx.reject(); pulse(h, 0.3, 30); showFlash(`Não cabe aí: ${s.reason}.`); }
  dropHeld(h, false);
}
function finishHeld(h) {
  scene.remove(h.held.mesh);
  h.held = null;
  for (const r of snapRings) r.visible = false;
}
// Devolve a peça da mão para a bandeja.
function dropHeld(h, silent) {
  if (!h.held) return;
  if (game) game.giveBack(h.held.type);
  if (!silent) sfx.lift();
  finishHeld(h);
  updateSlots();
}

function onPress(h, mode) {
  sfx.unlock();
  if (panel.visible) {
    const a = panel.actionAt(h.uiHover);
    if (a) { sfx.click(); a(); }
    return;
  }
  if (!canInteract()) return;
  const target = mode === 'grip' ? (pickNear(h) || pickAt(h)) : pickAt(h);
  if (!target) return;
  if (target.kind === 'motor' || target.kind === 'lever') { toggleMotor(); return; }
  grabFrom(h, target, mode);
}

// Atualiza o ponto e o encaixe (ímã) da peça segurada.
const MAGNET = 0.1;
function updateHeld(h) {
  const held = h.held;
  if (!held) return;
  let point = null, near = false;
  if (held.mode === 'grip' && h.grip) {
    h.grip.getWorldPosition(_v);
    point = _v.clone();
    near = Math.abs(point.z - (BOARD.z + LAYER_Z[1])) < 0.16;
    if (near) point.z = BOARD.z + LAYER_Z[1];
  } else {
    // na frente do painel: segue o ponto do raio no painel; fora dele, flutua no raio
    const p = h.ray.intersectPlane(frontPlane, _v);
    const inBoard = p && p.distanceTo(h.ray.origin) < 3 &&
      Math.abs(p.x) < BOARD.w / 2 + 0.05 && Math.abs(p.y - BOARD.cy) < BOARD.h / 2 + 0.05;
    if (inBoard) { point = p.clone(); near = true; }
    else point = h.ray.origin.clone().addScaledVector(h.ray.direction, h === mouseHand ? 1.0 : 0.45);
  }
  // pino mais perto
  let best = null, bd = MAGNET;
  if (near) {
    for (let j = 0; j < level.rows; j++) for (let i = 0; i < level.cols; i++) {
      pinWorld(level, [i, j], 1, _v2);
      const d = Math.hypot(_v2.x - point.x, _v2.y - point.y);
      if (d < bd) { bd = d; best = [i, j]; }
    }
  }
  const key = best ? `${best}|${held.pref}|${boardVersion}` : '';
  if (key !== held.key) {
    held.key = key;
    if (!best) held.snap = null;
    else {
      const opts = game.options(held.type, best);
      if (opts.length) {
        held.snap = { pin: best, layer: opts[held.pref % opts.length], ok: true, multi: opts.length > 1 };
        pulse(h, 0.15, 12);
      } else {
        const c = game.check(held.type, best, held.pref % 2);
        held.snap = { pin: best, layer: held.pref % 2, ok: false, reason: c.reason };
      }
    }
  }
  const m = held.mesh;
  if (held.snap) {
    setPieceLayer(m, held.snap.layer);
    pinWorld(level, held.snap.pin, null, m.position);
    m.position.z += 0.006; // um tiquinho para fora: ainda não encaixou
    m.scale.setScalar(1);
  } else {
    setPieceLayer(m, 0);
    m.position.copy(point).z -= LAYER_Z[0];
    m.scale.setScalar(h === mouseHand ? 1 : 0.9);
  }
  m.rotation.z = time * 0.6;
}

function flipAction(h) {
  if (!canInteract()) return;
  if (h.held) { h.held.pref++; h.held.key = ''; sfx.flip(); return; }
  const t = h.hover;
  if (t?.kind === 'piece') { if (game.flip(t.index)) syncBoard(); }
}

// ---------- Mouse (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, 0), inside: false };
function setMouse(e) {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.inside = true;
}
renderer.domElement.addEventListener('pointermove', setMouse);
renderer.domElement.addEventListener('pointerleave', () => { mouse.inside = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  setMouse(e);
  updateHandRay(mouseHand);
  if (panel.visible) {
    if (e.button !== 0) return;
    raycaster.ray.copy(mouseHand.ray);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (!canInteract()) return;
  if (e.button === 2) {
    if (mouseHand.held) { dropHeld(mouseHand, false); return; }
    const t = pickAt(mouseHand);
    if (t?.kind === 'piece' && game.remove(t.index)) { syncBoard(); }
    return;
  }
  if (e.button !== 0) return;
  const t = pickAt(mouseHand);
  if (!t) return;
  if (t.kind === 'motor' || t.kind === 'lever') { toggleMotor(); return; }
  grabFrom(mouseHand, t, 'ray');
});
window.addEventListener('pointerup', (e) => { if (e.button === 0 && mouseHand.held) release(mouseHand); });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') togglePause();
  else if (k === ' ') { e.preventDefault(); if (!e.repeat) toggleMotor(); }
  else if (k === 'r') flipAction(mouseHand);
  else if (k === 'arrowright') crankKeys = 1;
  else if (k === 'arrowleft') crankKeys = -1;
  else if (k === 'f') { save.fps = !save.fps; storeSave(save); }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if ((k === 'arrowright' && crankKeys > 0) || (k === 'arrowleft' && crankKeys < 0)) crankKeys = 0;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  if (!renderer.xr.isPresenting) fitDeskFov();
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- VR ----------
let recenterIn = 0;
function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  // cabeça em x = 0, z = 0 e na altura de quem está em pé (sentado também alcança o painel)
  rig.position.set(-head.x, clamp(1.62 - camera.position.y, -0.5, 0.5), -head.z);
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5;
  panel.mesh.position.set(0, 1.4, -0.5); // no óculos, um pouco mais longe dos olhos
  dropHeld(mouseHand, true);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  for (const h of ctrls) dropHeld(h, true);
  panel.mesh.position.set(0, 1.33, -0.3);
  deskCamera();
  updateHint();
});

function pollButtons() {
  let crank = 0;
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[4] && !e.prevButtons[4]) flipAction(e);       // A ou X: troca a camada
    if (b[5] && !e.prevButtons[5]) togglePause();       // B ou Y: pausa
    if (b[3] && !e.prevButtons[3]) toggleMotor();       // apertar o thumbstick: liga/desliga
    e.prevButtons = b;
    const x = gp.axes[2] ?? 0;
    if (Math.abs(x) > 0.2 && Math.abs(x) > Math.abs(crank)) crank = (Math.abs(x) - 0.2) / 0.8 * Math.sign(x);
  }
  return crank;
}

// ---------- Ações e menus ----------
function toggleMotor() {
  if (!game || (app !== 'playing' && app !== 'menu')) return;
  const on = game.toggleMotor();
  sfx.motor(on);
  pulseAll(0.2, 20);
}

function startLevel(i) {
  newGame(LEVELS[clamp(i, 0, LEVELS.length - 1)], clamp(i, 0, LEVELS.length - 1));
  app = 'playing';
  panel.hide();
  updateHint();
}
function restartLevel() { startLevel(levelIndex); }

function togglePause() {
  if (app === 'playing') { for (const h of hands()) dropHeld(h, true); app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); }
  updateHint();
}

const unlockedUpTo = () => {
  let n = 0;
  while (n < LEVELS.length && save.done[n]) n++;
  return Math.min(n, LEVELS.length - 1);
};
const GROUPS = ['Aprendiz', 'Oficial', 'Duplas', 'Correias'];

function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  panel.show((p) => {
    if (name === 'main') {
      p.title('Relojoaria', 76);
      p.text('Faça os ponteiros girarem no sentido e na velocidade pedidos.', 512, 140, { size: 28, color: '#b89c7c' });
      const next = unlockedUpTo();
      p.button(save.done[0] ? `Continuar: fase ${next + 1}` : 'Começar', () => startLevel(next), 262, 200, 500, 96, { size: 38 });
      p.button('Escolher fase', () => showScreen('levels'), 262, 316, 500, 80);
      p.button('Como jogar', () => showScreen('help'), 262, 416, 500, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 262, 516, 245, 70, { size: 28 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 517, 516, 245, 70, { size: 28 });
      p.text(vr ? 'Aponte e aperte o gatilho para escolher' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 640, { size: 22, color: '#b89c7c' });
    } else if (name === 'levels') {
      p.title('Fases', 56);
      const up = unlockedUpTo();
      LEVELS.forEach((l, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        const d = save.done[i];
        if (col === 0) p.text(GROUPS[row], 512, 104 + row * 128, { size: 20, color: '#b89c7c' });
        p.tile(42 + col * 190, 116 + row * 128, 176, 106, {
          num: i + 1, name: l.name, stars: d?.stars || 0, done: !!d, locked: i > up, master: i % 5 === 4, action: () => startLevel(i),
        });
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 636, 300, 66, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 64);
      const rows = vr ? [
        'Leve engrenagens da bandeja até os pinos do painel.',
        'Gatilho: aponta e pega (solte para encaixar). Botão lateral:',
        'pega a peça perto da mão. Pegar uma peça do painel tira.',
        'A ou X: troca a camada (frente/fundo) da peça.',
        'Thumbstick para o lado: gira a manivela. Apertar o',
        'thumbstick ou a alavanca: liga/desliga o motor. B ou Y: pausa.',
        'Engrenagens que se tocam giram ao contrário; a menor gira',
        'mais rápido. Laço ímpar ou velocidades que brigam: trava!',
      ] : [
        'Arraste as engrenagens da bandeja até os pinos do painel.',
        'Clique numa peça do painel para tirá-la e levar a outro pino.',
        'Botão direito: devolve a peça para a bandeja.',
        'R: troca a camada (frente/fundo) da peça.',
        'Espaço ou a alavanca: liga/desliga o motor. Setas ←/→: manivela.',
        'Engrenagens que se tocam giram ao contrário; a menor gira',
        'mais rápido. Laço ímpar ou velocidades que brigam: trava!',
        'Esc: pausa.   F: FPS.',
      ];
      rows.forEach((t, i) => p.text(t, 60, 140 + i * 54, { size: 27, align: 'left' }));
      p.button('Voltar', () => showScreen('main'), 362, 600, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 70);
      p.text(`Fase ${levelIndex + 1}: ${level.name}`, 512, 140, { size: 30, color: '#b89c7c' });
      p.button('Continuar', () => togglePause(), 262, 190, 500, 84);
      p.button('Recomeçar a fase', () => restartLevel(), 262, 290, 500, 84);
      p.button('Escolher fase', () => showScreen('levels'), 262, 390, 500, 84);
      p.button('Menu principal', () => goMenu(), 262, 490, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 517, 490, 245, 84, { size: 30, locked: !vr });
    } else if (name === 'won') {
      const d = save.done[levelIndex];
      const used = game.placed.length, st = starsFor(used);
      p.title('O relógio ganhou vida!', 80);
      p.text('★'.repeat(st) + '☆'.repeat(3 - st), 512, 170, { size: 70, color: '#ffd76e' });
      p.text(`Peças usadas: ${used}  (o relojoeiro usou ${level.par})   ·   Tempo: ${game.t.toFixed(0)} s`, 512, 245, { size: 28 });
      if (d) p.text(`Melhor: ${d.pieces} peça(s), ${d.time.toFixed(0)} s`, 512, 290, { size: 24, color: '#b89c7c' });
      if (levelIndex < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(levelIndex + 1), 262, 330, 500, 96, { size: 38 });
      else p.text('Você terminou todas as fases. Mestre relojoeiro!', 512, 378, { size: 32, bold: true, color: '#d9a441' });
      p.button('Repetir', () => restartLevel(), 262, 446, 245, 80);
      p.button('Fases', () => showScreen('levels'), 517, 446, 245, 80);
      p.button('Menu principal', () => goMenu(), 262, 546, 500, 80);
    }
  });
}
const starsFor = (used) => (used <= level.par ? 3 : used <= level.par + 1 ? 2 : 1);

function goMenu() {
  newGame(MENU_LEVEL, -1);
  game.setMotor(true);
  app = 'menu';
  showScreen('main');
  updateHint();
}

function finishLevel() {
  const prev = save.done[levelIndex];
  const used = game.placed.length;
  save.done[levelIndex] = {
    pieces: Math.min(used, prev?.pieces ?? Infinity),
    time: Math.min(game.t, prev?.time ?? Infinity),
    stars: Math.max(starsFor(used), prev?.stars || 0),
  };
  storeSave(save);
  app = 'won';
  showScreen('won');
  updateHint();
}

function showFlash(text) { flash = { text, t: 2.5 }; }

// ---------- Eventos do jogo → som, vibração e efeitos ----------
function handleEvents() {
  for (const ev of game.events) {
    if (ev.type === 'place') sfx.ratchet(ev.meshes);
    else if (ev.type === 'reject') { sfx.reject(); showFlash(`Não cabe aí: ${ev.reason}.`); }
    else if (ev.type === 'lift') sfx.lift();
    else if (ev.type === 'flip') sfx.flip();
    else if (ev.type === 'tick') sfx.tick(ev.tock);
    else if (ev.type === 'jam') { sfx.jam(); pulseAll(0.8, 90); }
    else if (ev.type === 'win' && app === 'playing') {
      alive = true;
      for (const h of hands()) dropHeld(h, true);
      if (level.clock === 'carrilhao') sfx.chime(levelIndex % 5 === 4); else sfx.cuckoo(3);
      pulseAll(0.6, 120);
      wonTimer = 3.2;
    }
  }
  game.events.length = 0;
}

// ---------- Raios e destaque ----------
const _scale = new THREE.Vector3();
function showRing(ring, pos, r) {
  ring.visible = true;
  ring.position.copy(pos);
  ring.scale.setScalar(r);
}
function updatePointers() {
  const vr = renderer.xr.isPresenting;
  scene.updateMatrixWorld();
  let uiHover = -1;
  hoverRing.visible = false;
  snapRings.forEach(r => { r.visible = false; });
  const list = vr ? ctrls : [mouseHand];
  for (const e of ctrls) e.laser.visible = false;
  let si = 0;
  for (const h of list) {
    updateHandRay(h);
    h.uiHover = -1;
    h.hover = null;
    if (!h.active) continue;
    if (panel.visible) {
      raycaster.ray.copy(h.ray);
      const hit = raycaster.intersectObject(panel.mesh)[0];
      h.uiHover = panel.pick(hit?.uv);
      if (h.uiHover >= 0) uiHover = h.uiHover;
      if (h.laser) { h.laser.visible = true; h.laser.scale.z = hit ? hit.distance : 1.5; }
      continue;
    }
    if (h.held) {
      updateHeld(h);
      const s = h.held.snap;
      if (s && si < snapRings.length) {
        const ring = snapRings[si++];
        ring.material.color.set(s.ok ? 0x6cff8a : 0xff4a3a);
        pinWorld(level, s.pin, s.layer, _v);
        _v.z += 0.016;
        showRing(ring, _v, (pieceTeeth(h.held.type)[0] / 2 + ADDENDUM) * MOD + 0.006);
      }
      if (h.laser) { h.laser.visible = h.held.mode === 'ray'; h.laser.scale.z = h.held.mesh.position.distanceTo(h.ray.origin); }
      continue;
    }
    if (canInteract()) {
      h.hover = pickAt(h);
      if (h.hover?.kind === 'piece') {
        const pl = game.placed[h.hover.index];
        pinWorld(level, pl.pin, 1, _v); _v.z += 0.012;
        const T = Math.max(...pieceTeeth(pl.type));
        showRing(hoverRing, _v, (T / 2 + ADDENDUM) * MOD + 0.006);
      }
    }
    if (h.laser) { h.laser.visible = true; h.laser.scale.z = h.hover ? h.hover.distance : 1.2; }
  }
  if (!vr) {
    const hv = mouseHand.hover;
    renderer.domElement.style.cursor = panel.visible
      ? (uiHover >= 0 && panel.actionAt(uiHover) ? 'pointer' : 'default')
      : mouseHand.held ? 'grabbing' : hv ? (hv.kind === 'slot' || hv.kind === 'piece' ? 'grab' : 'pointer') : 'default';
  }
  if (panel.visible) panel.setHover(uiHover);
}

// ---------- Textos: nome da fase e quadro de pedidos ----------
function wrap(g, text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const arrowOf = (r) => (!r || r.n === 0 ? '·' : r.n > 0 ? '↻' : '↺');

function updateTexts() {
  const vr = renderer.xr.isPresenting;
  const res = game.res;
  const title = app === 'menu' || levelIndex < 0 ? 'Relojoaria · oficina do relojoeiro' : `Fase ${levelIndex + 1} · ${level.name}`;
  world.header.draw(title, (g, W, H) => {
    g.fillStyle = '#2b1a0e'; g.font = 'bold italic 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, W / 2, H / 2 + 4);
  });
  world.setLever(game.motorOn, 'Motor');
  const tg = res.targets.map(t => [t.ratio ? str(t.ratio) : '-', t.ok]);
  const fb = res.forbidden.map(f => f.moving);
  const key = JSON.stringify([levelIndex, app, tg, fb, res.jammed, res.solved, game.motorOn, game.state, flash.text, game.placed.length, vr]);
  world.info.draw(key, (g, W, H) => {
    g.fillStyle = '#efe3c8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#b49a70'; g.lineWidth = 3;
    for (let y = 150; y < H; y += 46) { g.globalAlpha = 0.25; g.beginPath(); g.moveTo(20, y); g.lineTo(W - 20, y); g.stroke(); }
    g.globalAlpha = 1;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#3a2412'; g.font = 'bold italic 54px Georgia, serif';
    g.fillText(app === 'menu' ? 'Bem-vindo!' : 'Pedido', 28, 70);
    let y = 120;
    const line = (t, { size = 30, color = '#3a2412', bold = false, x = 28 } = {}) => {
      g.font = `${bold ? 'bold ' : ''}${size}px Georgia, serif`; g.fillStyle = color;
      for (const l of wrap(g, t, W - x - 24)) { g.fillText(l, x, y); y += size * 1.22; }
    };
    if (app === 'menu') {
      line('Escolha uma fase no painel.', { size: 30 });
      y += 10;
      line('Monte as engrenagens nos pinos para que cada mostrador gire no sentido e na velocidade pedidos.', { size: 26 });
      return;
    }
    (level.targets || []).forEach((t, k) => {
      const r = res.targets[k];
      const want = r.want;
      line(`${String.fromCharCode(65 + k)}  ${arrowOf(want)} ${senseText(want)}`, { size: 34, bold: true });
      line(`${ratioText(want)}`, { size: 26, x: 64 });
      const cur = r.ratio && !res.jammed ? `${arrowOf(r.ratio)} ${senseText(r.ratio)}, ${str(abs1(r.ratio))}` : res.jammed && r.ratio ? 'travado' : 'parado';
      line(`agora: ${cur} ${r.ok ? '✔' : '✘'}`, { size: 28, x: 64, color: r.ok ? '#2a6a2a' : r.ratio ? '#a8322a' : '#7a6a50', bold: true });
      line(`(engrenagem de ${t.T}${t.layer ? ', na frente' : ''})`, { size: 22, x: 64, color: '#7a6a50' });
      y += 8;
    });
    (level.forbidden || []).forEach((f, k) => {
      const mv = res.forbidden[k].moving;
      line('✕  não pode girar', { size: 32, bold: true, color: '#a8322a' });
      line(`agora: ${mv ? 'girando ✘' : 'parado ✔'}`, { size: 28, x: 64, color: mv ? '#a8322a' : '#2a6a2a', bold: true });
      y += 8;
    });
    y += 6;
    const motor = level.motor;
    line(`Motor: ${motor.T} dentes${motor.layer ? ' (na frente)' : ''}, ${game.motorOn ? 'ligado' : 'desligado'}`, { size: 24, color: '#5a4630' });
    if (level.belts?.length) line('Correia: as duas polias giram juntas, no mesmo sentido.', { size: 22, color: '#5a4630' });
    y += 10;
    if (game.state === 'won') line('Funcionou! O relógio ganhou vida.', { size: 32, bold: true, color: '#2a6a2a' });
    else if (res.jammed) line('TRAVOU! Tem um laço de engrenagens que não fecha (ímpar ou com velocidades que brigam). Tire uma peça.', { size: 28, bold: true, color: '#a8322a' });
    else if (res.solved) line(game.motorOn ? 'Tudo certo… deixe girar!' : `Tudo certo! Ligue o motor (${vr ? 'thumbstick ou alavanca' : 'Espaço ou alavanca'}).`, { size: 28, bold: true, color: '#2a6a2a' });
    if (flash.text) line(flash.text, { size: 26, bold: true, color: '#a8322a' });
    y += 6;
    line(level.hint, { size: 24, color: '#4a3a26' });
    y += 4;
    line(`Peças no painel: ${game.placed.length}`, { size: 22, color: '#7a6a50' });
  });
}
const abs1 = (r) => ({ n: Math.abs(r.n), d: r.d });

// ---------- HTML (PC) ----------
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>Arraste da bandeja até um pino · Clique numa peça para mudar de lugar · Botão direito: devolve · R: troca a camada · Espaço: motor · ←/→: manivela · Esc: pausa</span>'
    : '<span>Clique nas opções do painel</span>';
}

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Animação das engrenagens ----------
function updateMechanism(dt) {
  const res = game.res;
  const shake = game.shake;
  wheelMeshes.forEach((m, i) => {
    if (!m) return;
    m.rotation.z = phases[i] - TAU * game.wheelTurns(i);
    const base = m.userData.base;
    if (shake > 0 && res.omega.has(res.nodeOf[i])) {
      const k = 0.0025 * shake;
      m.position.set(base.x + (Math.random() - 0.5) * k, base.y + (Math.random() - 0.5) * k, base.z);
      m.rotation.z += (Math.random() - 0.5) * 0.06 * shake;
    } else m.position.copy(base);
  });
  if (fixedMeshes.crank) fixedMeshes.crank.rotation.z = -TAU * game.angle + (shake ? (Math.random() - 0.5) * 0.1 * shake : 0);
  const axTurns = (pin) => { const w = res.axleOmega(pin); return w ? toNumber(w) * game.angle : 0; };
  (level.targets || []).forEach((t, k) => { fixedMeshes.dials[k].userData.hand.rotation.z = -TAU * axTurns(t.pin); });
  (level.forbidden || []).forEach((f, k) => { fixedMeshes.fdials[k].userData.hand.rotation.z = -TAU * axTurns(f.pin); });
  for (const p of fixedMeshes.pulleys) p.mesh.rotation.z = -TAU * axTurns(p.pin);
  // anéis vermelhos nas duas rodas onde o laço não fecha
  conflictRings.forEach(r => { r.visible = false; });
  if (res.jammed && res.conflict && app !== 'menu') {
    res.conflict.forEach((wi, k) => {
      const w = res.wheels[wi];
      pinWorld(level, w.pin, w.layer, _v); _v.z += 0.01;
      showRing(conflictRings[k], _v, (w.T / 2 + ADDENDUM) * MOD + 0.008);
      conflictRings[k].material.opacity = 0.55 + 0.4 * Math.sin(time * 8);
    });
  }
  arrowsGroup.visible = app !== 'menu';
}

// ---------- Laço principal ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  const stick = vr ? pollButtons() : 0;
  rig.updateMatrixWorld(true);

  updatePointers();
  if (app === 'playing' || app === 'menu' || app === 'won') {
    game.step(dt, app === 'playing' ? (stick || crankKeys) : 0);
    handleEvents();
  }
  if (wonTimer > 0 && app === 'playing') { wonTimer -= dt; if (wonTimer <= 0) finishLevel(); }
  if (flash.t > 0) { flash.t -= dt; if (flash.t <= 0) flash.text = ''; }

  updateMechanism(dt);
  world.clock.update(dt, alive || app === 'menu');
  world.updateDust(dt, time);
  updateTexts();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// relo.dev.loadLevel(3)  → abre a fase 3 (número de 1 a 20)
// relo.dev.solve()       → monta a solução do relojoeiro robô e liga o motor
// relo.dev.advance(5)    → roda 5 s de jogo na hora (o painel escondido não anima)
// relo.dev.state()       → resumo do que está no painel
const dev = {
  loadLevel(n) { startLevel(n - 1); return dev.state(); },
  solve() {
    if (!game || levelIndex < 0) return null;
    const sol = solveLevel(level);
    if (!sol) return null;
    startLevel(levelIndex);
    game.clear();
    for (const pl of sol) { game.take(pl.type); game.place(pl.type, pl.pin, pl.layer); }
    game.setMotor(true);
    syncBoard();
    return sol;
  },
  place(type, i, j, layer = 0) {
    if (!game.take(String(type))) return false;
    const k = game.place(String(type), [i, j], layer);
    if (k < 0) game.giveBack(String(type));
    syncBoard();
    return k >= 0;
  },
  remove(index) { const t = game.remove(index); syncBoard(); return t; },
  motor(on = true) { game.setMotor(on); return game.motorOn; },
  advance(sec) { for (let i = 0; i < sec * 72; i++) { lastT = performance.now() - 1000 / 72; frame(); } return dev.state(); },
  state() {
    const r = game.res;
    return {
      app, level: levelIndex + 1, name: level.name, solved: r.solved, jammed: r.jammed, motorOn: game.motorOn, gameState: game.state,
      targets: r.targets.map(t => ({ want: str(t.want), now: t.ratio ? str(t.ratio) : null, ok: t.ok })),
      forbidden: r.forbidden.map(f => f.moving), placed: game.placed.map(p => `${p.type}@${p.pin}:${p.layer}`), stock: { ...game.stock },
    };
  },
};
window.relo = { dev, get game() { return game; }, startLevel, goMenu, save, camera, world, LEVELS };

goMenu();
renderer.setAnimationLoop(frame);
