// Test-process-only clock. No clock overrides or fixture loaders exist in application code.
const OriginalDate = Date;
const instant = OriginalDate.parse('2026-09-09T10:00:00Z');
globalThis.Date = new Proxy(OriginalDate, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length ? args : [instant], newTarget);
  },
  apply() {
    return new OriginalDate(instant).toString();
  },
  get(target, key, receiver) {
    return key === 'now' ? () => instant : Reflect.get(target, key, receiver);
  },
});
