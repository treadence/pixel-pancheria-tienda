// Share only concurrent reads. A later action always performs a fresh SDK read.
export function createCoalescedRead(read) {
  const pending = new Map();
  return function(ref) {
    const key = ref.path;
    if (!pending.has(key)) {
      const request = Promise.resolve().then(() => read(ref));
      pending.set(key, request);
      const clear = () => { if (pending.get(key) === request) pending.delete(key); };
      request.then(clear, clear);
    }
    return pending.get(key);
  };
}
