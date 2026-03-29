export class Stage3Nanny {
  constructor({ scheduler, speech, frameSampler, commandVerifier, apiClient, hud, telemetry }) {
    this.scheduler = scheduler;
    this.speech = speech;
    this.frameSampler = frameSampler;
    this.commandVerifier = commandVerifier;
    this.apiClient = apiClient;
    this.hud = hud;
    this.telemetry = telemetry;
    this.running = false;
    this.sessionCode = null;
    this.timerId = null;
    this.settings = null;
  }

  async start(ctx) {
    this.settings = ctx.getSettings();
    this.sessionCode = this.settings.sessionCode?.trim();
    if (!this.sessionCode) {
      throw new Error("Stage 3 requires a session code.");
    }
    this.commandVerifier.setThresholds({
      absoluteThreshold: this.settings.absThreshold,
      marginThreshold: this.settings.marginThreshold,
      neutralDominanceThreshold: this.settings.neutralThreshold,
    });
    this.running = true;
    this.hud.setStage("Stage 3");
    this.hud.setSessionCode(this.sessionCode);
    this.hud.log("Stage 3 started.");
    await this.apiClient.postEvent({ type: "stage_started", sessionCode: this.sessionCode, payload: { stage: "stage3" } });
    this.#scheduleNext();
  }

  async stop(meta = {}) {
    this.running = false;
    if (this.timerId) this.scheduler.clear(this.timerId);
    this.timerId = null;
    this.hud.log("Stage 3 stopped.");
    if (this.sessionCode) {
      await this.apiClient.postEvent({ type: "stage_stopped", sessionCode: this.sessionCode, payload: meta });
    }
  }

  async pause(meta = {}) {
    this.running = false;
    if (this.timerId) this.scheduler.clear(this.timerId);
    this.timerId = null;
    if (this.sessionCode) {
      await this.apiClient.postEvent({ type: "stage_paused", sessionCode: this.sessionCode, payload: meta });
    }
  }

  async rewardManual() {
    if (!this.sessionCode) return;
    this.hud.bumpAttempt();
    this.hud.bumpReward();
    await this.apiClient.postEvent({ type: "manual_reward", sessionCode: this.sessionCode, payload: { at: Date.now() } });
  }

  async onKey(e) {
    if (e.key === " ") await this.rewardManual();
  }

  #scheduleNext() {
    if (!this.running) return;
    const ms = this.scheduler.randomMs(this.settings.minInterval, this.settings.maxInterval);
    this.timerId = this.scheduler.set(() => this.#runCycle(), ms);
  }

  async #runCycle() {
    if (!this.running) return;

    const commands = Object.values(this.settings.mapping);
    const command = commands[Math.floor(Math.random() * commands.length)];

    this.hud.setCurrentCommand(command);
    this.speech.say(command);

    const issuedAt = Date.now();
    await this.apiClient.postEvent({ type: "command_issued", sessionCode: this.sessionCode, payload: { command, issuedAt } });

    try {
      const frames = await this.frameSampler.captureBurst({ frameCount: 12, intervalMs: 180, asImageData: true });
      this.hud.bumpAttempt();

      const result = await this.commandVerifier.verifyCommandWindow({ frames, command });
      this.hud.pushInference(result);

      await this.apiClient.postEvent({
        type: "nanny_decision",
        sessionCode: this.sessionCode,
        payload: {
          command,
          issuedAt,
          ...result,
        },
      });

      if (result.decision === "SUCCESS") {
        this.hud.bumpReward();
        this.speech.say("Good Boy");
      } else if (result.decision === "FAIL") {
        this.hud.bumpMiss();
      } else {
        this.hud.bumpUncertain();
      }

      this.telemetry.track("stage3_cycle", { command, decision: result.decision });
    } catch (err) {
      this.hud.log(`Stage3 error: ${err.message}`);
      this.telemetry.track("stage3_error", { message: err.message });
      await this.apiClient.postEvent({ type: "stage3_error", sessionCode: this.sessionCode, payload: { message: err.message } });
    } finally {
      this.#scheduleNext();
    }
  }
}
