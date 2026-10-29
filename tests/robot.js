// "Relojoeiro robô": busca em largura pelas montagens possíveis de uma fase, da menor para a
// maior, e devolve a primeira que resolve (portanto com o mínimo de peças). Usado nos testes
// (prova que toda fase tem solução com as peças da bandeja) e no navegador (relo.dev.solve()).
//
// Só experimenta peças que engrenam no que já gira com o motor: peça solta não muda nada, e
// toda solução pode ser montada assim, uma peça encostada na outra a partir do motor. Montagem
// que travou, que faz girar um proibido ou que deixa um mostrador na velocidade errada é
// descartada: pôr mais peças nunca desfaz isso.
import { analyze, canPlace, freePins, placementWheels } from '../js/gears.js';

const keyOf = (pls) => pls.map(p => `${p.type}@${p.pin[0]},${p.pin[1]}:${p.layer}`).sort().join('|');

// Fase que já começa com peças montadas (level.preset): experimenta manter cada subconjunto
// delas (as tiradas voltam para a bandeja) e completa a partir daí. A solução devolvida é a
// lista final de peças no painel.
export function solveLevel(level, opts = {}) {
  const pre = level.preset || [];
  if (!pre.length) return search(level, [], { ...level.pieces }, opts);
  let best = null;
  for (let mask = (1 << pre.length) - 1; mask >= 0; mask--) {
    const keep = pre.filter((_, i) => mask & (1 << i));
    const stock = { ...level.pieces };
    pre.forEach((p, i) => { if (!(mask & (1 << i))) stock[p.type] = (stock[p.type] || 0) + 1; });
    const r = search(level, keep.map(p => ({ ...p })), stock, opts);
    if (r && (!best || r.length - keep.length < best.added)) best = { sol: r, added: r.length - keep.length };
  }
  return best ? best.sol : null;
}

function search(level, start, stock0, { maxStates = 400000, all = false } = {}) {
  const pins = freePins(level);
  const types = Object.keys(stock0);
  const seen = new Set([keyOf(start)]);
  let frontier = [{ pls: start, stock: stock0 }];
  let states = 0;
  const found = [];
  const r0 = analyze(level, start);
  if (r0.solved) return all ? [start] : start;
  if (r0.jammed || r0.clashes.length) return all ? [] : null;
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      for (const type of types) {
        if (!(st.stock[type] > 0)) continue;
        for (const pin of pins) for (const layer of [0, 1]) {
          const cand = { type, pin, layer };
          if (!canPlace(level, st.pls, cand).ok) continue;
          const pls = [...st.pls, cand];
          const key = keyOf(pls);
          if (seen.has(key)) continue;
          seen.add(key);
          if (++states > maxStates) return all ? found : null;
          const res = analyze(level, pls);
          const k = pls.length - 1;
          const nw = placementWheels(cand).length;
          const first = res.wheels.findIndex(w => w.role === 'piece' && w.piece === k);
          let driven = false;
          for (let i = first; i < first + nw; i++) if (res.omega.has(res.nodeOf[i])) driven = true;
          if (!driven || res.jammed) continue;
          if (res.forbidden.some(f => f.moving)) continue;
          if (res.targets.some(t => t.ratio && !t.ok)) continue;
          if (res.solved) {
            if (!all) return pls;
            found.push(pls);
            continue;
          }
          next.push({ pls, stock: { ...st.stock, [type]: st.stock[type] - 1 } });
        }
      }
    }
    if (all && found.length) return found;
    frontier = next;
  }
  return all ? found : null;
}
