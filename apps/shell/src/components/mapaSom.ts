// Sound effects of the map opening, synthesised in the browser (no audio files): paper unfolding
// and a quill scratching. Off by default; the guest turns it on with the "Som" button.
export type Som = { ctx: AudioContext; mudo?: boolean; parar: () => void };

function ruido(ctx: AudioContext, segundos: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * segundos), ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
  return buffer;
}

// One burst of filtered noise with a soft envelope.
function rajada(som: Som, quando: number, dur: number, freq: [number, number], volume: number, q = 1.2) {
  const { ctx } = som;
  const fonte = ctx.createBufferSource();
  fonte.buffer = ruido(ctx, dur);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = q;
  filtro.frequency.setValueAtTime(freq[0], quando);
  filtro.frequency.exponentialRampToValueAtTime(freq[1], quando + dur);
  const ganho = ctx.createGain();
  ganho.gain.setValueAtTime(0.0001, quando);
  ganho.gain.exponentialRampToValueAtTime(volume, quando + Math.min(0.04, dur / 3));
  ganho.gain.exponentialRampToValueAtTime(0.0001, quando + dur);
  fonte.connect(filtro).connect(ganho).connect(ctx.destination);
  fonte.start(quando);
  fonte.stop(quando + dur + 0.05);
}

// Parchment folds opening, one rustle per fold.
export function somDePapel(som: Som, atrasoMs: number, dobras = 2, intervaloS = 0.17) {
  if (som.mudo) return;
  const t = som.ctx.currentTime + atrasoMs / 1000;
  for (let i = 0; i < dobras; i++) rajada(som, t + i * intervaloS, 0.5, [480 + Math.random() * 120, 2000], 0.18, 0.8);
}

// Soft steps while the footprints walk.
export function somDePassos(som: Som, duracaoMs: number) {
  if (som.mudo) return;
  const inicio = som.ctx.currentTime + 0.05;
  for (let t = 0; t < duracaoMs / 1000; t += 0.11 + Math.random() * 0.06) {
    rajada(som, inicio + t, 0.05, [900 + Math.random() * 300, 600], 0.08 + Math.random() * 0.04, 1.6);
  }
}

// Quill strokes while the text is written.
export function somDePena(som: Som, duracaoMs: number) {
  if (som.mudo) return;
  const inicio = som.ctx.currentTime + 0.05;
  for (let t = 0; t < duracaoMs / 1000; t += 0.07 + Math.random() * 0.09) {
    rajada(som, inicio + t, 0.03 + Math.random() * 0.05, [3800 + Math.random() * 1500, 5200 + Math.random() * 2000], 0.05 + Math.random() * 0.05, 2.5);
  }
}
