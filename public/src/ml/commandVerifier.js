const DEFAULTS = {
  absoluteThreshold: 0.55,
  marginThreshold: 0.12,
  neutralDominanceThreshold: 0.52,
  minSupportFrames: 8,
  maxContradictFrames: 2,
  minFrames: 12,
};

export class CommandVerifier {
  constructor({ classifier, thresholds = {} }) {
    this.classifier = classifier;
    this.cfg = { ...DEFAULTS, ...thresholds };
    this.labels = {
      presence: ["dog", "empty room", "person only", "no dog visible"],
      neutral: ["dog neutral", "dog idle", "dog unclear pose", "motion blur", "occluded dog"],
      commands: {
        sit: ["dog sitting", "dog seated"],
        "lay down": ["dog lying down", "dog laying on floor"],
        come: ["dog approaching camera", "dog moving toward person"],
        back: ["dog moving backward", "dog stepping back"],
      },
    };
  }

  setThresholds(patch) {
    this.cfg = { ...this.cfg, ...patch };
  }

  async verifyCommandWindow({ frames, command }) {
    if (!Array.isArray(frames) || frames.length < this.cfg.minFrames) {
      return this.#result("NO_DECISION", { reason: "insufficient_frames" });
    }
    const expected = this.labels.commands[command];
    if (!expected) return this.#result("NO_DECISION", { reason: "unknown_command" });

    const other = Object.entries(this.labels.commands)
      .filter(([k]) => k !== command)
      .flatMap(([, v]) => v);

    const labels = [...expected, ...other, ...this.labels.neutral];

    let supportFrames = 0;
    let contradictFrames = 0;
    let neutralFrames = 0;
    let confidenceSum = 0;
    let marginSum = 0;

    for (const frame of frames) {
      const presence = await this.classifier.classify(frame, this.labels.presence);
      const dog = this.#scoreOf(presence, "dog");
      const noDog = Math.max(this.#scoreOf(presence, "empty room"), this.#scoreOf(presence, "no dog visible"));
      if (dog <= noDog) {
        contradictFrames += 1;
        continue;
      }

      const out = await this.classifier.classify(frame, labels);
      const expectedScore = this.#bestScore(out, expected);
      const neutralScore = this.#bestScore(out, this.labels.neutral);
      const competitor = Math.max(neutralScore, this.#bestScore(out, other));
      const margin = expectedScore - competitor;

      if (neutralScore >= this.cfg.neutralDominanceThreshold && neutralScore >= expectedScore) {
        neutralFrames += 1;
        continue;
      }

      confidenceSum += expectedScore;
      marginSum += margin;

      if (expectedScore >= this.cfg.absoluteThreshold && margin >= this.cfg.marginThreshold) {
        supportFrames += 1;
      } else {
        contradictFrames += 1;
      }
    }

    const n = frames.length;
    const confidence = confidenceSum / n;
    const margin = marginSum / n;

    if (supportFrames >= this.cfg.minSupportFrames && contradictFrames <= this.cfg.maxContradictFrames) {
      return this.#result("SUCCESS", { reason: "temporal_consensus_passed", supportFrames, contradictFrames, neutralFrames, confidence, margin });
    }

    if (neutralFrames >= Math.floor(n / 3)) {
      return this.#result("NO_DECISION", { reason: "neutral_dominant_window", supportFrames, contradictFrames, neutralFrames, confidence, margin });
    }

    return this.#result("FAIL", { reason: "temporal_consensus_failed", supportFrames, contradictFrames, neutralFrames, confidence, margin });
  }

  #scoreOf(results, label) {
    return results.find((x) => x.label === label)?.score || 0;
  }

  #bestScore(results, labels) {
    return labels.reduce((m, l) => Math.max(m, this.#scoreOf(results, l)), 0);
  }

  #result(decision, rest = {}) {
    return { decision, ts: Date.now(), ...rest };
  }
}
