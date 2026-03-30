export class DogPresenceDetector {
  constructor(poseEstimator) {
    this.poseEstimator = poseEstimator;
  }

  async detect(imageData) {
    const pose = await this.poseEstimator.inferPose(imageData);
    return {
      present: pose.present,
      dogScore: pose.score || 0,
      label: pose.label || "neutral",
      probs: pose.probs || { sit: 0, "lay down": 0, "shake paw": 0, neutral: 1 },
    };
  }
}
