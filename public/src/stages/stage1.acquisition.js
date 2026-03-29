export class Stage1Acquisition {
  constructor({ speech, hud }) {
    this.speech = speech;
    this.hud = hud;
    this.settings = null;
  }

  async start(ctx) {
    this.settings = ctx.getSettings();
    this.hud.setStage("Stage 1");
    this.hud.log("Stage 1 started. Use W/A/S/D to issue mapped command.");
  }

  async stop() {
    this.hud.log("Stage 1 stopped.");
  }

  async onKey(e) {
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      const cmd = this.settings.mapping[key];
      if (cmd) {
        this.hud.setCurrentCommand(cmd);
        this.speech.say(cmd);
      }
    }
    if (key === " ") await this.rewardManual();
  }

  async rewardManual() {
    this.hud.bumpAttempt();
    this.hud.bumpReward();
  }
}
