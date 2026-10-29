// Sons sintetizados na hora com WebAudio (sem arquivos): tique-taque, catraca ao encaixar,
// rangido ao travar, cuco e carrilhão na vitória.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.8 : 0;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    if (!c || !this.on) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0 } = {}) {
    const c = this.ctx;
    if (!c || !this.on) return;
    const t = c.currentTime + at;
    const buf = c.createBuffer(1, Math.max(1, Math.ceil(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  // Sino: parciais inarmônicas que somem em tempos diferentes.
  bell(freq, { at = 0, vol = 0.18, len = 2.6 } = {}) {
    [[1, 1, 1], [2, 0.45, 0.6], [2.76, 0.32, 0.4], [5.4, 0.16, 0.22], [8.9, 0.07, 0.12]].forEach(([m, v, l]) =>
      this.tone(freq * m, len * l, { vol: vol * v, at, attack: 0.004 }));
  }

  tick(tock) {
    this.noise(0.025, { vol: 0.09, freq: tock ? 2100 : 3200, q: 6 });
    this.tone(tock ? 1250 : 1700, 0.03, { vol: 0.025, type: 'square' });
  }
  pick() { this.tone(1400, 0.12, { vol: 0.06, type: 'triangle', slide: 1.3 }); this.noise(0.04, { vol: 0.05, freq: 5000, q: 2 }); }
  // Catraca: cliques rápidos e um "toc" de metal quando assenta no pino.
  ratchet(meshes = 0) {
    for (let i = 0; i < 4; i++) this.noise(0.018, { vol: 0.11 - i * 0.02, freq: 3800 - i * 300, q: 8, at: i * 0.028 });
    this.tone(520, 0.18, { vol: 0.08, type: 'triangle', at: 0.11, slide: 0.8 });
    if (meshes > 0) this.tone(1046, 0.25, { vol: 0.05, type: 'sine', at: 0.14 });
  }
  reject() { this.tone(160, 0.22, { vol: 0.12, type: 'square', slide: 0.6 }); this.noise(0.08, { vol: 0.06, freq: 500, q: 1 }); }
  lift() { this.noise(0.03, { vol: 0.07, freq: 2800, q: 5 }); this.tone(700, 0.1, { vol: 0.05, type: 'triangle', slide: 1.4 }); }
  flip() { this.noise(0.03, { vol: 0.07, freq: 3000, q: 5 }); this.noise(0.03, { vol: 0.07, freq: 3400, q: 5, at: 0.07 }); }
  // Rangido de metal forçado: dente de serra grave tremendo, mais um chiado.
  jam() {
    const c = this.ctx;
    if (!c || !this.on) return;
    const t = c.currentTime;
    const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = 95;
    lfo.frequency.value = 23; lg.gain.value = 30;
    lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
    this.noise(0.4, { vol: 0.05, freq: 1800, q: 4 });
  }
  motor(on) { this.noise(0.05, { vol: 0.1, freq: 900, q: 2 }); this.tone(on ? 330 : 220, 0.12, { vol: 0.07, type: 'triangle' }); }
  click() { this.tone(880, 0.05, { vol: 0.06, type: 'square' }); }

  // Cuco: duas notas (terça menor descendo), três vezes.
  cuckoo(times = 3) {
    for (let i = 0; i < times; i++) {
      this.tone(740, 0.22, { vol: 0.16, at: i * 0.7, attack: 0.02 });
      this.tone(622, 0.36, { vol: 0.15, at: i * 0.7 + 0.25, attack: 0.02 });
    }
  }
  // Carrilhão: quartos de Westminster.
  chime(full = false) {
    const E4 = 329.6, C4 = 261.6, D4 = 293.7, G3 = 196;
    const seq = full ? [E4, C4, D4, G3, G3, D4, E4, C4] : [E4, C4, D4, G3];
    seq.forEach((f, i) => this.bell(f * 2, { at: i * 0.55, vol: 0.14 }));
    if (full) [0, 1.4].forEach((d) => this.bell(C4, { at: seq.length * 0.55 + 0.4 + d, vol: 0.2, len: 3.5 }));
  }
}
