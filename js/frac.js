// Frações exatas (numerador/denominador inteiros): a simulação das engrenagens não usa ponto
// flutuante, então "1/3" é sempre 1/3 e um laço incoerente nunca passa por arredondamento.
export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

export function frac(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`fração inválida ${n}/${d}`);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

export const ZERO = frac(0);
export const ONE = frac(1);
export const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
export const neg = (a) => frac(-a.n, a.d);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const isZero = (a) => a.n === 0;
export const toNumber = (a) => a.n / a.d;
export const abs = (a) => frac(Math.abs(a.n), a.d);
export const str = (a) => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);
