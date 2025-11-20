// crossTab.ts
const channel = new BroadcastChannel('alarm-control');

export function sendAlarm(cmd: 'PLAY'|'STOP'|'ACK'|'RESET_SUPPRESSION', payload?: any) {
  channel.postMessage({ cmd, payload, ts: Date.now() });
}

// Leader election
export async function withAudioMaster<T>(fn: () => Promise<T> | T) {
  if (!('locks' in navigator)) return fn(); // fallback: let it play
  return navigator.locks.request('alarm-audio', { mode: 'exclusive' }, fn);
}

// In each tab:
export function setupCrossTabListener(callback: (cmd: string, payload?: any) => void) {
  channel.onmessage = (e) => {
    callback(e.data.cmd, e.data.payload);
  };
}
