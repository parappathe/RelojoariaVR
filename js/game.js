// Uma fase em andamento: peças na bandeja, peças no painel, motor e vitória. Sem navegador.
import { analyze, canPlace, layerOptions } from './gears.js';
import { toNumber } from './frac.js';

export const MOTOR_SPEED = 0.3;  // voltas do motor por segundo, ligado
export const WIN_TURNS = 0.75;   // o motor precisa dar este tanto de volta com tudo certo
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Game {
  constructor(level) {
    this.level = level;
    // { type, pin: [i, j], layer }; algumas fases já começam com peças montadas (que podem sair)
    this.placed = (level.preset || []).map(p => ({ type: p.type, pin: [p.pin[0], p.pin[1]], layer: p.layer }));
    this.stock = { ...level.pieces };       // peças na bandeja
    this.motorOn = false;
    this.angle = 0;                         // voltas do motor desde o começo
    this.state = 'play';                    // 'play' | 'won'
    this.events = [];
    this.solvedTurns = 0;
    this.jamTimer = 0;
    this.shake = 0;                         // 0..1, tremida de travamento
    this.t = 0;
    this.moves = 0;
    this.refresh();
  }

  refresh() {
    this.res = analyze(this.level, this.placed);
    this.solvedTurns = 0;
  }

  // Pega uma peça da bandeja (fica "na mão").
  take(type) {
    if (this.state !== 'play' || !(this.stock[type] > 0)) return false;
    this.stock[type]--;
    return true;
  }
  giveBack(type) { this.stock[type] = (this.stock[type] || 0) + 1; }

  options(type, pin) { return layerOptions(this.level, this.placed, type, pin); }
  check(type, pin, layer) { return canPlace(this.level, this.placed, { type, pin, layer }); }

  // Encaixa a peça que está na mão. Devolve o índice ou -1 (a peça continua na mão).
  place(type, pin, layer) {
    if (this.state !== 'play') return -1;
    const pl = { type, pin: [pin[0], pin[1]], layer };
    const c = canPlace(this.level, this.placed, pl);
    if (!c.ok) { this.events.push({ type: 'reject', reason: c.reason }); return -1; }
    const wasJammed = this.res.jammed;
    this.placed.push(pl);
    this.moves++;
    this.refresh();
    const k = this.placed.length - 1;
    const meshes = this.res.edges.filter(([a, b]) => this.res.wheels[a].piece === k || this.res.wheels[b].piece === k).length;
    this.events.push({ type: 'place', index: k, meshes, jammed: this.res.jammed && !wasJammed });
    return k;
  }

  // Tira uma peça do painel e ela vai para a mão. Devolve o tipo.
  lift(index) {
    if (this.state !== 'play' || !this.placed[index]) return null;
    const [pl] = this.placed.splice(index, 1);
    this.moves++;
    this.refresh();
    this.events.push({ type: 'lift', piece: pl.type });
    return pl.type;
  }

  // Tira e devolve para a bandeja.
  remove(index) {
    const type = this.lift(index);
    if (type) this.giveBack(type);
    return type;
  }

  // Troca a camada (dupla: inverte qual roda fica na frente).
  flip(index) {
    if (this.state !== 'play' || !this.placed[index]) return false;
    const pl = this.placed[index];
    const rest = this.placed.filter((_, i) => i !== index);
    const np = { ...pl, layer: 1 - pl.layer };
    const c = canPlace(this.level, rest, np);
    if (!c.ok) { this.events.push({ type: 'reject', reason: c.reason }); return false; }
    this.placed[index] = np;
    this.moves++;
    this.refresh();
    this.events.push({ type: 'flip', index });
    return true;
  }

  // Volta tudo para a bandeja.
  clear() {
    if (this.state !== 'play') return;
    for (const pl of this.placed) this.giveBack(pl.type);
    this.placed = [];
    this.refresh();
  }

  setMotor(on) { this.motorOn = !!on; }
  toggleMotor() { this.motorOn = !this.motorOn; return this.motorOn; }

  // crank: manivela à mão (-1..1), usada quando o motor está desligado.
  step(dt, crank = 0) {
    this.t += dt;
    const drive = this.motorOn ? 1 : clamp(crank, -1, 1);
    if (this.res.jammed) {
      if (drive !== 0) {
        this.shake = Math.min(1, this.shake + dt * 6);
        this.jamTimer -= dt;
        if (this.jamTimer <= 0) { this.events.push({ type: 'jam' }); this.jamTimer = 0.8; }
      } else { this.shake = Math.max(0, this.shake - dt * 3); this.jamTimer = 0; }
      return;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.jamTimer = 0;
    if (drive === 0) return;
    const d = drive * MOTOR_SPEED * dt;
    const before = this.angle;
    this.angle += d;
    if (Math.floor(before * 8) !== Math.floor(this.angle * 8)) this.events.push({ type: 'tick', tock: Math.floor(this.angle * 8) % 2 === 0 });
    if (this.state === 'play' && this.res.solved) {
      this.solvedTurns += Math.abs(d);
      if (this.solvedTurns >= WIN_TURNS) { this.state = 'won'; this.events.push({ type: 'win' }); }
    }
  }

  // Ângulo (em voltas, positivo = horário) de uma roda do resultado atual.
  wheelTurns(i) {
    const w = this.res.wheelOmega(i);
    return w ? toNumber(w) * this.angle : 0;
  }
}
