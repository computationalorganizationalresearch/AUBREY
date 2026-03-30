import { CameraManager } from "./camera/cameraManager.js";
import { FrameSampler } from "./camera/frameSampler.js";
import { DogPoseEstimator } from "./ml/modelLoader.js";

const els = {
  cameraSelect: document.getElementById("cameraSelect"),
  refreshCam: document.getElementById("refreshCam"),
  startCam: document.getElementById("startCam"),
  stopCam: document.getElementById("stopCam"),
  webcam: document.getElementById("webcam"),
  snapshotCanvas: document.getElementById("snapshotCanvas"),
  modelStatus: document.getElementById("modelStatus"),
  topPrediction: document.getElementById("topPrediction"),
  probList: document.getElementById("probList"),
  logs: document.getElementById("logs"),
};

const CLASSES = ["sit", "lay down", "shake paw", "neutral"];

const log = (msg) => {
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  els.logs.textContent = `${line}\n${els.logs.textContent}`;
};

const cameraManager = new CameraManager(els.webcam);
const frameSampler = new FrameSampler(els.webcam, els.snapshotCanvas);

let estimator = null;
let pollTimer = null;

function setModelStatus(v) {
  els.modelStatus.textContent = `Model: ${v}`;
}

function setTop(v) {
  els.topPrediction.textContent = `Top: ${v}`;
}

function renderBars(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  els.probList.innerHTML = entries
    .map(([label, score]) => {
      const pct = Math.max(0, Math.min(100, score * 100));
      return `
      <div class="prob-row">
        <div class="prob-head">
          <strong>${label}</strong>
          <span>${pct.toFixed(1)}%</span>
        </div>
        <div class="prob-track"><div class="prob-fill" style="width:${pct}%"></div></div>
      </div>
    `;
    })
    .join("");
}

async function refreshCameras() {
  const cams = await cameraManager.listCameras();
  els.cameraSelect.innerHTML = cams.map((c) => `<option value="${c.deviceId}">${c.label || "Camera"}</option>`).join("");
}

async function initModel() {
  setModelStatus("Loading pose model");
  estimator = await DogPoseEstimator.create();
  setModelStatus("Ready (dog pose)");
}

async function inferOnce() {
  if (!estimator || !cameraManager.stream) return;

  const frame = frameSampler.captureImageData();
  const pose = await estimator.inferPose(frame);
  const scores = pose.probs || { sit: 0, "lay down": 0, "shake paw": 0, neutral: 1 };

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || ["neutral", 1];
  setTop(`${top[0]} (${(top[1] * 100).toFixed(1)}%)`);
  renderBars(scores);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    inferOnce().catch((e) => log(`Inference error: ${e.message}`));
  }, 400);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

els.refreshCam.onclick = () => refreshCameras().catch((e) => log(e.message));
els.startCam.onclick = () => cameraManager.start(els.cameraSelect.value).then(startPolling).catch((e) => log(e.message));
els.stopCam.onclick = () => {
  stopPolling();
  cameraManager.stop();
};

await refreshCameras();
await initModel().catch((e) => {
  setModelStatus("Failed");
  log(`Pose model init failed: ${e.message}. Place an ONNX dog pose model at /models/dog-pose.onnx`);
});
renderBars(Object.fromEntries(CLASSES.map((c) => [c, c === "neutral" ? 1 : 0])));
