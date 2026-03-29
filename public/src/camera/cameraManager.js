export class CameraManager {
  constructor(videoEl) {
    this.videoEl = videoEl;
    this.stream = null;
  }

  async listCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  }

  async start(deviceId = "") {
    if (this.stream) this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    });
    this.videoEl.srcObject = this.stream;
  }

  stop() {
    if (!this.stream) return;
    for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.videoEl.srcObject = null;
  }
}
