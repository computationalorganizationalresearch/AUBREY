export class StageMachine {
  constructor({ stages, eventBus, telemetry }) {
    this.stages = stages;
    this.eventBus = eventBus;
    this.telemetry = telemetry;
    this.current = "idle";
    this.currentImpl = null;
    this.ctx = null;
  }

  async init(ctx) {
    this.ctx = ctx;
    this.eventBus?.emit("machine:init", { at: Date.now() });
  }

  async transition(next, payload = {}) {
    if (!this.stages[next] && !["idle", "paused", "stopped"].includes(next)) {
      throw new Error(`Unknown stage: ${next}`);
    }
    const prev = this.current;
    if (prev === next) return;

    if (this.currentImpl?.stop) {
      await this.currentImpl.stop({ reason: "transition", to: next });
    }

    this.current = next;
    this.currentImpl = null;

    if (this.stages[next]) {
      this.currentImpl = this.stages[next];
      await this.currentImpl.start({ ...this.ctx, machine: this, transitionPayload: payload });
    }

    this.telemetry?.track("stage_transition", { from: prev, to: next, at: Date.now() });
    this.eventBus?.emit("stage:changed", { from: prev, to: next });
  }

  async pause(reason = "manual") {
    if (this.currentImpl?.pause) await this.currentImpl.pause({ reason });
    const prev = this.current;
    this.current = "paused";
    this.telemetry?.track("stage_paused", { from: prev, reason, at: Date.now() });
  }

  async stop(reason = "manual") {
    if (this.currentImpl?.stop) await this.currentImpl.stop({ reason, to: "stopped" });
    const prev = this.current;
    this.current = "stopped";
    this.currentImpl = null;
    this.telemetry?.track("machine_stopped", { from: prev, reason, at: Date.now() });
  }

  async handleRewardManual() {
    return this.currentImpl?.rewardManual?.();
  }

  async onKey(e) {
    return this.currentImpl?.onKey?.(e);
  }
}
