// Next free number for IDs like LD-1001 / TXN-007. Uses the highest existing number,
// so IDs never repeat even after records are removed or a backup is restored.
export function nextSeq(ids: string[], prefix: string, start: number): number {
  let max = start - 1;
  for (const id of ids) {
    if (typeof id === 'string' && id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max + 1;
}