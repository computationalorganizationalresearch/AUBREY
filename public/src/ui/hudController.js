export class HudController {
  constructor(els, logFn) {
    this.els = els;
    this.logFn = logFn;
    this.stats = { attempts: 0, rewards: 0, misses: 0, uncertain: 0, streak: 0 };
  }

  setStage(v) { this.els.mStage.textContent = v; }
  setCurrentCommand(v) { this.els.mCommand.textContent = v || "-"; }
  setSessionCode(v) { this.log(`Session: ${v}`); }
  setDogPresence(text) { this.els.dogPresence.textContent = `Dog Presence: ${text}`; }
  setModelStatus(text) { this.els.modelStatus.textContent = `Model: ${text}`; }

  bumpAttempt() { this.stats.attempts += 1; this.render(); }
  bumpReward() { this.stats.rewards += 1; this.stats.streak += 1; this.render(); }
  bumpMiss() { this.stats.misses += 1; this.stats.streak = 0; this.render(); }
  bumpUncertain() { this.stats.uncertain += 1; this.stats.streak = 0; this.render(); }

  pushInference(result) {
    this.log(`Decision=${result.decision} conf=${(result.confidence || 0).toFixed(3)} margin=${(result.margin || 0).toFixed(3)} reason=${result.reason}`);
  }

  render() {
    const { attempts, rewards, misses, uncertain, streak } = this.stats;
    const success = attempts ? (rewards / attempts) * 100 : 0;
    this.els.mAttempts.textContent = String(attempts);
    this.els.mRewards.textContent = String(rewards);
    this.els.mMisses.textContent = String(misses);
    this.els.mUncertain.textContent = String(uncertain);
    this.els.mStreak.textContent = String(streak);
    this.els.mSuccess.textContent = `${success.toFixed(1)}%`;
    this.els.sessionProgress.value = Math.min(100, attempts);
  }

  log(msg) { this.logFn(msg); }
}
