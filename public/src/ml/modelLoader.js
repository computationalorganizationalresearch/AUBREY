let pipelineFn = null;

export async function loadPipeline() {
  if (!pipelineFn) {
    const mod = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers/dist/transformers.min.js");
    pipelineFn = await mod.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32");
  }
  return pipelineFn;
}

export class ClassifierAdapter {
  constructor(pipe) {
    this.pipe = pipe;
  }

  async classify(image, labels) {
    const out = await this.pipe(image, labels, { hypothesis_template: "a photo of {}" });
    return out.map((x) => ({ label: x.label, score: x.score }));
  }
}
