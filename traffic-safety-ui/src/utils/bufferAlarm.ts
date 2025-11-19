// bufferAlarm.ts
import { getAudioContext } from './audioUnlock';

let decoded: AudioBuffer | null = null;

export async function preloadAlarmBuffer(url = '/alarm.wav') {
  const ctx = getAudioContext();
  const resp = await fetch(url, { cache: 'force-cache' });
  const arr = await resp.arrayBuffer();
  decoded = await ctx.decodeAudioData(arr);
  return decoded;
}

export function createBufferAlarm(opts?: { loopStart?: number; loopEnd?: number }) {
  const ctx = getAudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0;

  let src: AudioBufferSourceNode | null = null;
  let playing = false;

  function start(g = 0.25) {
    if (playing || !decoded) return;
    src = ctx.createBufferSource();
    src.buffer = decoded;
    src.loop = true;
    if (opts?.loopStart != null) src.loopStart = opts.loopStart;
    if (opts?.loopEnd != null) src.loopEnd = opts.loopEnd;
    src.connect(gain);
    src.start(0);
    gain.gain.setTargetAtTime(g, ctx.currentTime, 0.01);
    playing = true;
  }

  function stop() {
    if (!playing) return;
    const now = ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.05);
    setTimeout(() => {
      src?.stop();
      src?.disconnect();
      src = null;
      playing = false;
    }, 120);
  }

  function setGain(g: number) {
    gain.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
  }

  return { start, stop, setGain, isReady: () => !!decoded };
}
