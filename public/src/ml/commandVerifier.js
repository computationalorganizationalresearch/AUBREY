const DEFAULTS = {
  absoluteThreshold: 0.6,
  marginThreshold: 0.15,
  neutralDominanceThreshold: 0.55,
  minSupportFrames: 8,
  maxContradictFrames: 2,
  minFrames: 12,
};

const COMMANDS = ["sit", "lay down", "shake paw", "neutral"];

export class CommandVerifier {
  constructor({ poseEstimator, thresholds = {} }) {
    this.poseEstimator = poseEstimator;
    this.cfg = { ...DEFAULTS, ...thresholds };
  }

  setThresholds(patch) {
    this.cfg = { ...this.cfg, ...patch };
  }

  async verifyCommandWindow({ frames, command }) {
    if (!COMMANDS.includes(command)) {
      return this.#result("NO_DECISION", { reason: "unsupported_command" });
    }
    if (!Array.isArray(frames) || frames.length < this.cfg.minFrames) {
      return this.#result("NO_DECISION", { reason: "insufficient_frames" });
    }

    let supportFrames = 0;
    let contradictFrames = 0;
    let neutralFrames = 0;
    let confidenceSum = 0;
    let marginSum = 0;

    for (const frame of frames) {
      const pose = await this.poseEstimator.inferPose(frame);
      if (!pose.present) {
        contradictFrames += 1;
        continue;
      }

      const probs = pose.probs || {};
      const expectedScore = probs[command] || 0;
      const competitors = COMMANDS.filter((c) => c !== command);
      const bestCompetitor = Math.max(...competitors.map((c) => probs[c] || 0));
      const margin = expectedScore - bestCompetitor;

      if (probs.neutral >= this.cfg.neutralDominanceThreshold && command !== "neutral") {
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

  #result(decision, rest = {}) {
    return { decision, ts: Date.now(), ...rest };
  }
}
