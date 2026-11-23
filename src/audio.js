/* ===== RÉGLAGES ===== */
const settings = { music: true, sfx: true, hints: true, autoRot: true, sky: 'day', fightLen: 'medium' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('echecs-industriels') || '{}')); } catch (e) {}
if (!['day', 'sunset', 'mist'].includes(settings.sky)) settings.sky = 'day';
if (!['short', 'medium', 'long'].includes(settings.fightLen)) settings.fightLen = 'medium';
function saveSettings() { try { localStorage.setItem('echecs-industriels', JSON.stringify(settings)); } catch (e) {} }

/* ===== SON : musique d'atelier + bruitages (synthèse Web Audio) ===== */
const AU = {
  ctx: null, step: 0, next: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = .9; this.master.connect(c.destination);
    this.mus = c.createGain(); this.mus.gain.value = settings.music ? .38 : 0; this.mus.connect(this.master);
    this.fx = c.createGain(); this.fx.gain.value = settings.sfx ? .9 : 0; this.fx.connect(this.master);
    this.bassF = c.createBiquadFilter(); this.bassF.type = 'lowpass'; this.bassF.frequency.value = 520; this.bassF.connect(this.mus);
    const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.next = c.currentTime + .15;
    setInterval(() => this.sched(), 80);
  },
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.mus.gain.setTargetAtTime(settings.music ? .38 : 0, t, .06);
    this.fx.gain.setTargetAtTime(settings.sfx ? .9 : 0, t, .06);
  },
  osc(type, f, t, dur, vol, dest, f2) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .03);
  },
  noise(t, dur, vol, dest, hp) {
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  },
  sched() {
    const c = this.ctx; if (!c) return;
    while (this.next < c.currentTime + .3) { this.play(this.step, this.next); this.next += .15; this.step = (this.step + 1) % 64; }
  },
  play(st, t) {
    const bar = st >> 4, s = st & 15, root = [55, 55, 43.65, 49][bar];
    if (s % 4 === 0) this.osc('sine', 120, t, .2, .95, this.mus, 40);
    if (s === 2 || s === 6 || s === 10 || s === 14) this.noise(t, .05, .22, this.mus, 7000);
    if (s === 4 || s === 12) { this.noise(t, .13, .2, this.mus, 1400); this.osc('square', 190, t, .08, .08, this.mus, 120); }
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) this.osc('sawtooth', root * ((s === 6 || s === 14) ? 1.5 : 1), t, .14, .24, this.bassF);
    if (s % 2 === 1) {
      const ch = [1, 1.2, 1.5, 2][(s >> 1) % 4];
      this.osc('triangle', root * 4 * ch, t, .13, .1, this.mus);
    }
    if (bar === 3 && s === 8) [880, 2430, 3720].forEach((f, i) => this.osc('sine', f, t, 1.1 - i * .25, .09 / (i + 1), this.mus));
  },
  sfx(n) {
    if (!this.ctx || !settings.sfx) return;
    const c = this.ctx, t = c.currentTime + .01, d = this.fx;
    switch (n) {
      case 'select': this.osc('square', 660, t, .06, .12, d); this.osc('square', 990, t + .05, .07, .1, d); break;
      case 'move': this.osc('sine', 190, t, .13, .8, d, 70); this.noise(t, .04, .3, d, 2500); break;
      case 'clang':
        [520, 1130, 1790, 2400].forEach((f, i) => this.osc(i % 2 ? 'sine' : 'square', f * (1 + Math.random() * .012), t, .6 - i * .1, .2 / (i + 1), d));
        this.noise(t, .09, .5, d, 3000); this.osc('sine', 150, t, .2, .7, d, 60); break;
      case 'zap':
        this.osc('sawtooth', 2400, t, .32, .22, d, 90); this.osc('square', 90, t, .28, .3, d, 50); this.noise(t, .28, .35, d, 2200); break;
      case 'boom': this.osc('sine', 150, t, .4, 1, d, 32); this.noise(t, .3, .3, d, 300); break;
      case 'whoosh': this.noise(t, .2, .22, d, 900); this.osc('sine', 420, t, .16, .12, d, 180); break;
      case 'charge': this.osc('sawtooth', 110, t, .7, .1, d, 900); this.osc('square', 220, t, .7, .05, d, 1400); break;
      case 'thunder': this.noise(t, .9, .55, d, 80); this.osc('sine', 80, t, .8, .9, d, 28); this.osc('sawtooth', 2600, t, .25, .15, d, 100); break;
      case 'squash': this.osc('sine', 300, t, .25, .6, d, 60); this.noise(t, .12, .3, d, 1200); break;
      case 'pop': this.osc('sine', 400, t, .18, .5, d, 1200); break;
      case 'check': this.osc('square', 880, t, .12, .18, d); this.osc('square', 880, t + .18, .12, .18, d); break;
      case 'win': [392, 494, 587, 784, 988].forEach((f, i) => this.osc('triangle', f, t + i * .13, .35, .3, d)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this.osc('sawtooth', f, t + i * .2, .4, .16, d)); break;
    }
  }
};
document.addEventListener('pointerdown', () => AU.init(), { once: false });
