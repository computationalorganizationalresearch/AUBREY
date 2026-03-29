export function createEventBus() {
  const handlers = new Map();
  return {
    on(event, cb) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(cb);
      return () => handlers.get(event)?.delete(cb);
    },
    emit(event, payload) {
      for (const cb of handlers.get(event) || []) cb(payload);
    }
  };
}
