export class FrameSampler {
  constructor(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext("2d", { willReadFrequently: true });
  }

  captureFrame() {
    this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
    return this.canvasEl.toDataURL("image/jpeg", 0.85);
  }

  captureImageData() {
    this.ctx.drawImage(this.videoEl, 0, 0, this.canvasEl.width, this.canvasEl.height);
    return this.ctx.getImageData(0, 0, this.canvasEl.width, this.canvasEl.height);
  }

  async captureBurst({ frameCount = 12, intervalMs = 180, asImageData = false }) {
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(asImageData ? this.captureImageData() : this.captureFrame());
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return frames;
  }
}
