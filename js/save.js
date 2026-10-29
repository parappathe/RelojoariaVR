// Progresso e opções, salvos no navegador.
const KEY = 'relojoariavr.v1';
const DEFAULTS = {
  done: {},        // fases resolvidas: { 0: { pieces: 3, time: 41.2, stars: 3 }, ... }
  sound: true,
  fps: false,
};

export function loadSave() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
