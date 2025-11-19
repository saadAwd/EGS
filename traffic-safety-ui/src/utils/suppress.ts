// suppress.ts
const KEY = 'alarm-suppressed-until';

export function suppressFor(ms: number) {
  localStorage.setItem(KEY, String(Date.now() + ms));
  window.dispatchEvent(new Event('storage')); // notify same tab listeners too
}

export function isSuppressed() {
  const until = Number(localStorage.getItem(KEY) || 0);
  return Date.now() < until;
}
