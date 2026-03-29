export class Telemetry {
  constructor(logFn = console.log) {
    this.logFn = logFn;
  }
  track(event, payload = {}) {
    this.logFn(`[telemetry] ${event} ${JSON.stringify(payload)}`);
  }
}
