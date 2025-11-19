// audioUnlock.ts
let unlocked = false;

export async function unlockAudio() {
  if (unlocked) return;
  // Create/resume a shared AudioContext
  (window as any).__audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  const ctx: AudioContext = (window as any).__audioCtx;
  if (ctx.state !== 'running') await ctx.resume();
  unlocked = ctx.state === 'running';
}

export function getAudioContext(): AudioContext {
  (window as any).__audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  return (window as any).__audioCtx;
}
