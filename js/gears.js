// Núcleo do engrenamento, sem navegador nem Three.js (os testes rodam no Node).
//
// Medidas em "módulos" (m): uma engrenagem de T dentes tem raio primitivo T/2. Os pinos ficam
// numa grade de 12 m na horizontal e 16 m na vertical, então a diagonal mede 20 m (triângulo
// 3-4-5). Duas engrenagens na mesma camada engrenam quando a soma dos raios é igual à distância
// entre os pinos: soma de dentes 24 (vizinho do lado), 32 (em cima/embaixo), 40 (diagonal) ou
// 48 (dois pinos para o lado). Se a soma passar da distância, elas batem: não cabe.
// Tudo com inteiros: (Ta + Tb)² comparado com 4·d².
import { frac, mul, neg, eq, ONE, ZERO } from './frac.js';

export const SX = 12, SY = 16;           // espaçamento dos pinos, em módulos
export const SIZES = [8, 12, 16, 20, 24]; // engrenagens simples que existem
export const LAYERS = 2;                  // camada 0 (junto da madeira) e 1 (na frente)

// Tipo de peça: '16' é uma engrenagem simples de 16 dentes; '24x8' é uma dupla coaxial
// (a primeira roda vai na camada escolhida, a segunda na outra, presas no mesmo eixo).
export function pieceTeeth(type) {
  return String(type).split('x').map(Number);
}
export const isDouble = (type) => pieceTeeth(type).length === 2;

export const pinKey = (p) => `${p[0]},${p[1]}`;
export const samePin = (a, b) => a[0] === b[0] && a[1] === b[1];

export function inGrid(level, p) {
  return Number.isInteger(p[0]) && Number.isInteger(p[1]) &&
    p[0] >= 0 && p[1] >= 0 && p[0] < level.cols && p[1] < level.rows;
}
export function isBlocked(level, p) {
  return (level.blocked || []).some(b => samePin(b, p));
}

// Todos os pinos onde se pode pôr peça.
export function freePins(level) {
  const out = [];
  for (let j = 0; j < level.rows; j++) for (let i = 0; i < level.cols; i++) {
    if (!isBlocked(level, [i, j])) out.push([i, j]);
  }
  return out;
}

// Pinos com eixo preso (motor, mostradores, proibidos, polias de correia): tudo o que for
// montado neles gira junto com o eixo. Nos pinos comuns cada engrenagem gira solta.
export function keyedPins(level) {
  const list = [level.motor.pin];
  for (const t of level.targets || []) list.push(t.pin);
  for (const f of level.forbidden || []) list.push(f.pin);
  for (const b of level.belts || []) list.push(b.a, b.b);
  return list;
}

// Motor, mostradores e proibidos já têm a própria engrenagem; na frente do eixo fica a manivela
// ou o ponteiro, então não cabe mais nada neles. Nas polias de correia cabem peças nas duas camadas.
export function ownPins(level) {
  return [level.motor.pin, ...(level.targets || []).map(t => t.pin), ...(level.forbidden || []).map(f => f.pin)];
}

// Rodas que já vêm montadas na fase.
export function fixedWheels(level) {
  const w = [{ T: level.motor.T, layer: level.motor.layer || 0, pin: level.motor.pin, role: 'motor', index: 0, piece: -1 }];
  (level.targets || []).forEach((t, k) => w.push({ T: t.T, layer: t.layer || 0, pin: t.pin, role: 'target', index: k, piece: -1 }));
  (level.forbidden || []).forEach((f, k) => w.push({ T: f.T, layer: f.layer || 0, pin: f.pin, role: 'forbidden', index: k, piece: -1 }));
  return w;
}

// Rodas de uma peça posta pelo jogador: { type, pin, layer }.
export function placementWheels(pl, k = -1) {
  const t = pieceTeeth(pl.type);
  const w = [{ T: t[0], layer: pl.layer, pin: pl.pin, role: 'piece', piece: k, part: 0 }];
  if (t.length === 2) w.push({ T: t[1], layer: 1 - pl.layer, pin: pl.pin, role: 'piece', piece: k, part: 1 });
  return w;
}

// Relação entre duas rodas: 'mesh' (engrenam), 'clash' (batem), 'none'.
export function relation(a, b) {
  if (a.layer !== b.layer || samePin(a.pin, b.pin)) return 'none';
  const dx = (a.pin[0] - b.pin[0]) * SX, dy = (a.pin[1] - b.pin[1]) * SY;
  const d4 = 4 * (dx * dx + dy * dy), s2 = (a.T + b.T) ** 2;
  return s2 === d4 ? 'mesh' : s2 > d4 ? 'clash' : 'none';
}

function allWheels(level, placements) {
  return [...fixedWheels(level), ...placements.flatMap((pl, k) => placementWheels(pl, k))];
}

// Pode pôr esta peça aqui? Devolve { ok, reason } (reason em português, para mostrar).
export function canPlace(level, placements, pl) {
  if (!inGrid(level, pl.pin)) return { ok: false, reason: 'fora do painel' };
  if (isBlocked(level, pl.pin)) return { ok: false, reason: 'pino bloqueado' };
  if (pl.layer !== 0 && pl.layer !== 1) return { ok: false, reason: 'camada inválida' };
  if (ownPins(level).some(p => samePin(p, pl.pin))) return { ok: false, reason: 'eixo com engrenagem própria' };
  const existing = allWheels(level, placements);
  for (const w of placementWheels(pl)) {
    if (existing.some(e => samePin(e.pin, w.pin) && e.layer === w.layer)) return { ok: false, reason: 'pino ocupado' };
    const c = existing.find(e => relation(e, w) === 'clash');
    if (c) return { ok: false, reason: 'bate na vizinha', clash: c };
  }
  return { ok: true, reason: '' };
}

// Camadas possíveis para a peça neste pino, da melhor para a pior: primeiro a que engrena com
// mais rodas que já giram com o motor, depois a que engrena com mais rodas, depois a camada 0.
export function layerOptions(level, placements, type, pin) {
  const res = analyze(level, placements);
  const opts = [];
  for (const layer of [0, 1]) {
    const pl = { type, pin, layer };
    if (!canPlace(level, placements, pl).ok) continue;
    let driven = 0, any = 0;
    for (const w of placementWheels(pl)) {
      res.wheels.forEach((e, i) => {
        if (relation(e, w) === 'mesh') { any++; if (res.omega.has(res.nodeOf[i])) driven++; }
      });
    }
    opts.push({ layer, score: driven * 10 + any });
  }
  opts.sort((a, b) => b.score - a.score || a.layer - b.layer);
  return opts.map(o => o.layer);
}

// Monta o grafo e propaga a velocidade do motor (busca em largura). Velocidade = voltas por
// volta do motor; positivo = horário (visto de frente). Engrenar: ωb = -ωa · Ta/Tb. Mesmo eixo
// (dupla coaxial, eixo preso, correia): mesma velocidade. Conflito = travado.
export function analyze(level, placements) {
  const wheels = allWheels(level, placements);
  // eixos presos, com correias juntando dois pinos num eixo só (união simples)
  const parent = new Map();
  const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
  for (const p of keyedPins(level)) parent.set(pinKey(p), pinKey(p));
  for (const b of level.belts || []) parent.set(find(pinKey(b.a)), find(pinKey(b.b)));
  const nodeOf = wheels.map((w, i) => {
    const k = pinKey(w.pin);
    if (parent.has(k)) return 'axle:' + find(k);
    if (w.role === 'piece' && placements[w.piece] && isDouble(placements[w.piece].type)) return 'piece:' + w.piece;
    return 'wheel:' + i;
  });
  const edges = [], clashes = [];
  for (let i = 0; i < wheels.length; i++) for (let j = i + 1; j < wheels.length; j++) {
    const r = relation(wheels[i], wheels[j]);
    if (r === 'mesh') edges.push([i, j]);
    else if (r === 'clash') clashes.push([i, j]);
  }
  const adj = new Map();
  const link = (from, to, wf, wt) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, wf, wt });
  };
  for (const [i, j] of edges) { link(nodeOf[i], nodeOf[j], i, j); link(nodeOf[j], nodeOf[i], j, i); }

  const motorNode = 'axle:' + find(pinKey(level.motor.pin));
  const omega = new Map([[motorNode, ONE]]);
  const via = new Map(); // nó → [roda que empurrou, roda empurrada] (para alinhar os dentes no desenho)
  const queue = [motorNode];
  let conflict = null;
  while (queue.length) {
    const u = queue.shift();
    for (const e of adj.get(u) || []) {
      const w = mul(omega.get(u), neg(frac(wheels[e.wf].T, wheels[e.wt].T)));
      if (!omega.has(e.to)) { omega.set(e.to, w); via.set(e.to, [e.wf, e.wt]); queue.push(e.to); }
      else if (!eq(omega.get(e.to), w) && !conflict) conflict = [e.wf, e.wt];
    }
  }
  const jammed = !!conflict;
  const wheelOmega = (i) => (omega.has(nodeOf[i]) ? (jammed ? ZERO : omega.get(nodeOf[i])) : null);
  const axleOmega = (pin) => {
    const n = 'axle:' + find(pinKey(pin));
    return omega.has(n) ? (jammed ? ZERO : omega.get(n)) : null;
  };
  const targets = (level.targets || []).map(t => {
    const ratio = axleOmega(t.pin);
    const want = frac(t.ratio[0], t.ratio[1]);
    return { ratio, want, ok: !!ratio && !jammed && eq(ratio, want) };
  });
  const forbidden = (level.forbidden || []).map(f => {
    const moving = omega.has('axle:' + find(pinKey(f.pin)));
    return { moving, ok: !moving };
  });
  const solved = !jammed && clashes.length === 0 && targets.every(t => t.ok) && forbidden.every(f => f.ok);
  return { wheels, nodeOf, edges, clashes, omega, via, motorNode, jammed, conflict, wheelOmega, axleOmega, targets, forbidden, solved };
}

// Texto da razão para mostrar: "1 volta a cada 2 voltas do motor".
export function ratioText(r) {
  if (!r) return 'parado';
  const n = Math.abs(r.n), d = r.d;
  if (n === 0) return 'parado';
  const v = (k) => (k === 1 ? '1 volta' : `${k} voltas`);
  return d === 1 ? `${v(n)} por volta do motor` : `${v(n)} a cada ${d} voltas do motor`;
}
export const senseText = (r) => (!r || r.n === 0 ? '' : r.n > 0 ? 'horário' : 'anti-horário');

// Contorno de uma engrenagem (em módulos, centro na origem), com o dente 0 centrado no ângulo 0:
// 4 pontos por dente (pé, ponta, ponta, pé). Poucos polígonos, mas dentes de verdade.
export const ADDENDUM = 0.8, DEDENDUM = 1.0;
export function gearOutline(T) {
  const r = T / 2, ro = r + ADDENDUM, ri = r - DEDENDUM;
  const step = 2 * Math.PI / T;
  const pts = [];
  for (let k = 0; k < T; k++) {
    const c = k * step;
    pts.push([ri * Math.cos(c - step * 0.32), ri * Math.sin(c - step * 0.32)]);
    pts.push([ro * Math.cos(c - step * 0.17), ro * Math.sin(c - step * 0.17)]);
    pts.push([ro * Math.cos(c + step * 0.17), ro * Math.sin(c + step * 0.17)]);
    pts.push([ri * Math.cos(c + step * 0.32), ri * Math.sin(c + step * 0.32)]);
  }
  return pts;
}

// Fase inicial dos dentes (ângulo anti-horário, radianos) para que cada roda engrene na que a
// empurrou. Só desenho: a lógica não depende disso.
export function toothPhases(res) {
  const n = res.wheels.length;
  const phase = new Array(n).fill(null);
  const motorIdx = res.wheels.findIndex(w => w.role === 'motor');
  // percorre na ordem em que a busca chegou nos nós
  const nodePhase = new Map([[res.motorNode, 0]]);
  const order = [res.motorNode, ...[...res.via.keys()]];
  const setNode = (node, val) => { for (let i = 0; i < n; i++) if (res.nodeOf[i] === node && phase[i] === null) phase[i] = val; };
  setNode(res.motorNode, 0);
  phase[motorIdx] = 0;
  for (const node of order.slice(1)) {
    const [ia, ib] = res.via.get(node);
    const A = res.wheels[ia], B = res.wheels[ib];
    const ax = A.pin[0] * SX, ay = A.pin[1] * SY, bx = B.pin[0] * SX, by = B.pin[1] * SY;
    const phi = Math.atan2(by - ay, bx - ax);
    const aA = phase[ia] ?? 0;
    const sA = (phi - aA) * A.T / (2 * Math.PI);
    const aB = phi + Math.PI - (2 * Math.PI / B.T) * (0.5 - sA);
    nodePhase.set(node, aB);
    phase[ib] = aB;
    setNode(node, aB);
  }
  for (let i = 0; i < n; i++) if (phase[i] === null) phase[i] = 0;
  return phase;
}
