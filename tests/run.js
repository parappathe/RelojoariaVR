// Testes automáticos: node tests/run.js  (tem que terminar com "Tudo certo"). Não tocam som.
import { frac, mul, eq, str } from '../js/frac.js';
import { relation, analyze, canPlace, layerOptions, gearOutline, toothPhases, ratioText, senseText, fixedWheels } from '../js/gears.js';
import { Game, WIN_TURNS, MOTOR_SPEED } from '../js/game.js';
import { LEVELS, MENU_LEVEL } from '../js/levels.js';
import { solveLevel } from './robot.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU: ' + msg); } }
const section = (n) => console.log(n);
const L = (o) => ({ blocked: [], targets: [], forbidden: [], belts: [], preset: [], pieces: {}, cols: 6, rows: 4, ...o });
const W = (T, pin, layer = 0) => ({ T, pin, layer });
const P = (type, i, j, layer = 0) => ({ type, pin: [i, j], layer });
const omegaOf = (res, k, part = 0) => res.wheelOmega(res.wheels.findIndex(w => w.piece === k && w.part === part));

section('Frações');
{
  ok(eq(frac(6, -8), frac(-3, 4)), '6/-8 = -3/4');
  ok(eq(mul(frac(2, 3), frac(9, 4)), frac(3, 2)), '2/3 · 9/4 = 3/2');
  ok(str(frac(4, 2)) === '2' && str(frac(1, 9)) === '1/9', 'texto da fração');
}

section('Engrenamento (geometria)');
{
  ok(relation(W(8, [0, 0]), W(16, [1, 0])) === 'mesh', '8 + 16 engrenam no pino do lado');
  ok(relation(W(12, [0, 0]), W(12, [1, 0])) === 'mesh', '12 + 12 engrenam no pino do lado');
  ok(relation(W(8, [0, 0]), W(24, [0, 1])) === 'mesh', '8 + 24 engrenam no pino de cima');
  ok(relation(W(16, [0, 0]), W(16, [0, 1])) === 'mesh', '16 + 16 engrenam no pino de cima');
  ok(relation(W(16, [0, 0]), W(24, [1, 1])) === 'mesh', '16 + 24 engrenam na diagonal');
  ok(relation(W(24, [0, 0]), W(24, [2, 0])) === 'mesh', '24 + 24 engrenam dois pinos ao lado');
  ok(relation(W(16, [0, 0]), W(16, [1, 0])) === 'clash', '16 + 16 lado a lado batem');
  ok(relation(W(8, [0, 0]), W(8, [1, 0])) === 'none', '8 + 8 lado a lado nem encostam');
  ok(relation(W(8, [0, 0]), W(16, [1, 0], 1)) === 'none', 'camadas diferentes não engrenam');
  ok(gearOutline(16).length === 64, 'contorno com 4 pontos por dente');
}

section('Sentido e razão');
{
  const lv = L({ motor: { pin: [0, 0], T: 16 }, targets: [{ pin: [2, 0], T: 16, ratio: [1, 1] }] });
  const r = analyze(lv, [P('8', 1, 0)]);
  ok(eq(omegaOf(r, 0), frac(-2)), 'a 8 tocada pela 16 gira 2x mais rápido e ao contrário');
  ok(r.targets[0].ok && r.solved, 'duas trocas de sentido: mostrador no horário, mesma velocidade');
  ok(senseText(omegaOf(r, 0)) === 'anti-horário' && senseText(r.targets[0].ratio) === 'horário', 'texto do sentido');
  const r2 = analyze({ ...lv, targets: [{ pin: [1, 1], T: 24, ratio: [-2, 3] }] }, []);
  ok(eq(r2.targets[0].ratio, frac(-2, 3)) && r2.solved, 'diagonal 16→24: 2/3 anti-horário');
  ok(ratioText(frac(1, 2)) === '1 volta a cada 2 voltas do motor' && ratioText(frac(-3)) === '3 voltas por volta do motor', 'texto da razão');
  const r3 = analyze(lv, []);
  ok(r3.targets[0].ratio === null && !r3.solved, 'mostrador sem ligação fica parado');
}

section('Dupla coaxial e camadas');
{
  const lv = L({ motor: { pin: [0, 0], T: 8 }, targets: [{ pin: [1, 1], T: 16, layer: 1, ratio: [1, 6] }] });
  const r = analyze(lv, [P('24x8', 0, 1, 0)]);
  ok(eq(omegaOf(r, 0, 0), frac(-1, 3)) && eq(omegaOf(r, 0, 1), frac(-1, 3)), 'as duas rodas da dupla giram juntas (-1/3)');
  ok(r.solved && eq(r.targets[0].ratio, frac(1, 6)), 'dupla 24/8: 1/6 no mostrador 16 da frente');
  const rf = analyze(lv, [P('24x8', 0, 1, 1)]);
  ok(!rf.targets[0].ratio, 'dupla virada (8 no fundo) não engrena aqui');
  const o = layerOptions(lv, [], '24x8', [0, 1]);
  ok(o[0] === 0, 'camada sugerida é a que engrena no motor');
  const two = L({ motor: { pin: [0, 0], T: 16 }, targets: [{ pin: [4, 0], T: 16, ratio: [9, 1] }], blocked: [[2, 0]] });
  const r9 = analyze(two, [P('24x8', 1, 0, 1), P('16', 2, 1, 1), P('24x8', 3, 1, 0)]);
  ok(r9.solved, 'duas duplas multiplicam por 9');
}

section('Correia');
{
  const lv = L({ motor: { pin: [0, 0], T: 16 }, targets: [{ pin: [5, 0], T: 8, ratio: [2, 1] }], belts: [{ a: [0, 1], b: [4, 0] }] });
  const r = analyze(lv, [P('16', 0, 1), P('16', 4, 0)]);
  ok(eq(omegaOf(r, 0), frac(-1)) && eq(omegaOf(r, 1), frac(-1)), 'as duas polias giram juntas e no mesmo sentido');
  ok(r.solved, 'correia leva o giro longe');
  const r2 = analyze(lv, [P('16', 0, 1), P('8', 4, 0)]);
  ok(eq(omegaOf(r2, 1), frac(-1)), 'na polia, o tamanho não muda a velocidade do eixo');
}

section('Travamento');
{
  const lv = L({ motor: { pin: [0, 0], T: 16 } });
  const tri = analyze(lv, [P('8', 1, 0), P('24', 1, 1)]);
  ok(tri.jammed && tri.conflict, 'triângulo (laço ímpar) trava');
  ok(eq(tri.wheelOmega(0), frac(0)), 'travado: o motor não gira');
  const sq = analyze(lv, [P('16', 0, 1), P('8', 1, 1), P('8', 1, 0)]);
  ok(!sq.jammed, 'laço par com a mesma razão não trava');
  // correia com razões que brigam: a polia A diz -1, a roda na polia B diz -2/3
  const bl = L({ motor: { pin: [0, 0], T: 16 }, belts: [{ a: [0, 1], b: [1, 1] }] });
  const rb = analyze(bl, [P('16', 0, 1), P('24', 1, 1)]);
  ok(rb.jammed, 'correia com velocidades conflitantes trava');
  const g = new Game({ ...lv, pieces: { '8': 1, '24': 1 } });
  g.take('8'); g.place('8', [1, 0], 0);
  g.take('24'); g.place('24', [1, 1], 0);
  g.setMotor(true);
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  ok(g.angle === 0 && g.shake > 0.5 && g.events.some(e => e.type === 'jam'), 'jogo: travado treme, faz o som e não gira');
}

section('Encaixe');
{
  const lv = L({ motor: { pin: [0, 0], T: 16 }, targets: [{ pin: [3, 0], T: 16, ratio: [1, 1] }], blocked: [[2, 2]] });
  ok(!canPlace(lv, [], P('8', 2, 2)).ok, 'pino bloqueado');
  ok(!canPlace(lv, [], P('8', 0, 0, 1)).ok, 'eixo do motor não aceita peça');
  ok(!canPlace(lv, [], P('16', 1, 0)).ok, '16 do lado do motor 16 bate');
  ok(canPlace(lv, [], P('16', 1, 0, 1)).ok, 'na outra camada cabe');
  ok(!canPlace(lv, [P('8', 1, 1)], P('8', 1, 1)).ok, 'pino ocupado');
  ok(!canPlace(lv, [], P('8', 9, 0)).ok, 'fora do painel');
}

section('Jogo');
{
  const g = new Game(LEVELS[0]);
  ok(g.take('8') && !g.take('8'), 'bandeja tem só 1 peça de 8');
  ok(g.place('8', [2, 1], 0) === 0 && !g.res.solved, 'encaixar no pino errado não resolve');
  ok(g.lift(0) === '8' && g.placed.length === 0, 'pegar do painel tira a peça');
  ok(g.place('8', [1, 0], 0) === 0 && g.res.solved, 'encaixe certo resolve');
  ok(g.flip(0) && !g.res.solved && g.flip(0) && g.res.solved, 'trocar a camada desliga e religa');
  ok(g.state === 'play', 'com o motor desligado ainda não ganhou');
  g.step(0.5, 1);
  ok(g.angle > 0 && g.state === 'play', 'manivela gira o motor');
  g.setMotor(true);
  for (let i = 0; i < Math.ceil(WIN_TURNS / MOTOR_SPEED * 60) + 5; i++) g.step(1 / 60);
  ok(g.state === 'won' && g.events.some(e => e.type === 'win'), 'motor girando com tudo certo: ganhou');
  ok(g.events.some(e => e.type === 'tick'), 'tique-taque enquanto gira');
  ok(g.place('8', [2, 1], 0) === -1, 'depois de ganhar não mexe mais');
  const g2 = new Game(LEVELS[0]);
  g2.take('8'); g2.place('8', [1, 0], 0);
  ok(g2.remove(0) === '8' && g2.stock['8'] === 1, 'botão direito devolve para a bandeja');
  const ph = toothPhases(g.res);
  ok(ph.length === g.res.wheels.length && ph.every(Number.isFinite), 'fases dos dentes calculadas');
  const g3 = new Game(LEVELS[6]);
  ok(g3.res.jammed && g3.placed.length === 2, 'fase 7 começa com as peças travadas no painel');
}

section('Fases (o robô resolve todas)');
{
  ok(LEVELS.length === 20, '20 fases');
  const names = new Set();
  LEVELS.forEach((lv, i) => {
    const n = `fase ${i + 1} (${lv.name})`;
    names.add(lv.name);
    ok(lv.name && lv.hint && lv.cols <= 6 && lv.rows <= 4, `${n}: nome, dica e tamanho`);
    const empty = analyze(lv, []);
    ok(empty.clashes.length === 0, `${n}: peças fixas não batem`);
    ok(empty.forbidden.every(f => !f.moving), `${n}: proibido começa parado`);
    ok(!analyze(lv, lv.preset).solved, `${n}: não começa resolvida`);
    const t0 = Date.now();
    const sol = solveLevel(lv);
    ok(!!sol, `${n}: o robô acha solução`);
    if (!sol) return;
    // aplica a solução no jogo de verdade, só com as peças da bandeja (e as que já estavam lá)
    const g = new Game(lv);
    g.clear();
    let legal = true;
    for (const pl of sol) { if (!g.take(pl.type) || g.place(pl.type, pl.pin, pl.layer) < 0) legal = false; }
    ok(legal, `${n}: solução usa só as peças disponíveis`);
    ok(g.res.solved, `${n}: solução resolve`);
    if (lv.preset.length) ok(sol.length <= lv.par, `${n}: par ${lv.par} (robô: ${sol.length})`);
    else ok(sol.length === lv.par, `${n}: par ${lv.par} é o mínimo (robô: ${sol.length})`);
    if (lv.belts.length) ok(!solveLevel({ ...lv, belts: [] }), `${n}: sem a correia não dá`);
    g.setMotor(true);
    for (let k = 0; k < 400 && g.state !== 'won'; k++) g.step(1 / 60);
    ok(g.state === 'won', `${n}: o relógio ganha vida`);
    console.log(`  ${String(i + 1).padStart(2)} ${lv.name.padEnd(22)} ${sol.length} peças  (${Date.now() - t0} ms)`);
  });
  ok(names.size === 20, 'nomes diferentes');
  ok(LEVELS.filter((_, i) => i % 5 === 4).every(l => l.par >= 4), 'fases mestre têm 4 peças ou mais');
  const m = analyze(MENU_LEVEL, MENU_LEVEL.preset);
  ok(!m.jammed && m.clashes.length === 0 && m.solved, 'vitrine do menu gira sem travar');
  ok(fixedWheels(MENU_LEVEL).length >= 1, 'vitrine tem motor');
}

console.log(fails ? `\n${fails} de ${count} testes FALHARAM` : `\n${count} testes. Tudo certo`);
process.exit(fails ? 1 : 0);
