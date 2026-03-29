export class DogPresenceDetector {
  constructor(classifier) {
    this.classifier = classifier;
    this.labels = ["dog", "empty room", "person only", "no dog visible"];
  }

  async detect(frame) {
    const out = await this.classifier.classify(frame, this.labels);
    const score = (label) => out.find((x) => x.label === label)?.score || 0;
    const dog = score("dog");
    const nonDog = Math.max(score("empty room"), score("person only"), score("no dog visible"));
    return {
      present: dog > nonDog && dog >= 0.4,
      dogScore: dog,
      raw: out,
    };
  }
}
