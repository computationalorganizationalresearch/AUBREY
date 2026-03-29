export class Stage2Reinforcement {
  constructor({ speech, hud, scheduler }) {
    this.speech = speech;
    this.hud = hud;
    this.scheduler = scheduler;
    this.timerId = null;
    this.settings = null;
    this.commands = [];
  }

  async start(ctx) {
    this.settings = ctx.getSettings();
    this.commands = Object.values(this.settings.mapping);
    this.hud.setStage("Stage 2");
    this.hud.log("Stage 2 started. Random command intervals active.");
    this.#scheduleNext();
  }

  async stop() {
    if (this.timerId) this.scheduler.clear(this.timerId);
    this.timerId = null;
    this.hud.log("Stage 2 stopped.");
  }

  async onKey(e) {
    if (e.key === " ") await this.rewardManual();
  }

  async rewardManual() {
    this.hud.bumpAttempt();
    this.hud.bumpReward();
  }

  #scheduleNext() {
    const delay = this.scheduler.randomMs(this.settings.minInterval, this.settings.maxInterval);
    this.timerId = this.scheduler.set(() => {
      const cmd = this.commands[Math.floor(Math.random() * this.commands.length)];
      this.hud.setCurrentCommand(cmd);
      this.speech.say(cmd);
      this.#scheduleNext();
    }, delay);
  }
}
