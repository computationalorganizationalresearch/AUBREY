export class Scheduler {
  set(cb, ms) { return setTimeout(cb, ms); }
  clear(id) { clearTimeout(id); }
  randomMs(minSec, maxSec) {
    const min = Number(minSec) * 1000;
    const max = Number(maxSec) * 1000;
    return Math.random() * (max - min) + min;
  }
}
