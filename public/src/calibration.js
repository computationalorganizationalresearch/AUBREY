import { CameraManager } from "./camera/cameraManager.js";
import { FrameSampler } from "./camera/frameSampler.js";
import { loadPipeline, ClassifierAdapter } from "./ml/modelLoader.js";

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

const COMMAND_LABELS = {
  sit: ["dog sitting", "dog seated"],
  come: ["dog approaching camera", "dog moving toward person"],
  "lay down": ["dog lying down", "dog laying on floor"],
  back: ["dog moving backward", "dog stepping back"],
  neutral: ["dog neutral", "dog idle", "dog unclear pose", "dog standing"],
};

const log = (msg) => {
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  els.logs.textContent = `${line}\n${els.logs.textContent}`;
};

const cameraManager = new CameraManager(els.webcam);
const frameSampler = new FrameSampler(els.webcam, els.snapshotCanvas);

let classifier = null;
let pollTimer = null;

function setModelStatus(v) {
  els.modelStatus.textContent = `Model: ${v}`;
}

function setTop(v) {
  els.topPrediction.textContent = `Top: ${v}`;
}

function renderBars(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  els.probList.innerHTML = entries.map(([label, score]) => {
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
  }).join("");
}

async function refreshCameras() {
  const cams = await cameraManager.listCameras();
  els.cameraSelect.innerHTML = cams
    .map((c) => `<option value="${c.deviceId}">${c.label || "Camera"}</option>`)
    .join("");
}

async function initModel() {
  setModelStatus("Loading");
  const pipe = await loadPipeline();
  classifier = new ClassifierAdapter(pipe);
  setModelStatus("Ready");
}

async function inferOnce() {
  if (!classifier || !cameraManager.stream) return;

  const frame = frameSampler.captureFrame();
  const flatLabels = Object.values(COMMAND_LABELS).flat();
  const out = await classifier.classify(frame, flatLabels);

  const scoreFor = (labels) => labels.reduce((m, l) => Math.max(m, out.find((x) => x.label === l)?.score || 0), 0);

  const scores = {
    sit: scoreFor(COMMAND_LABELS.sit),
    come: scoreFor(COMMAND_LABELS.come),
    "lay down": scoreFor(COMMAND_LABELS["lay down"]),
    back: scoreFor(COMMAND_LABELS.back),
    neutral: scoreFor(COMMAND_LABELS.neutral),
  };

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  setTop(`${top[0]} (${(top[1] * 100).toFixed(1)}%)`);
  renderBars(scores);
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    inferOnce().catch((e) => log(`Inference error: ${e.message}`));
  }, 600);
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
await initModel().catch((e) => log(`Model init failed: ${e.message}`));
renderBars({ sit: 0, come: 0, "lay down": 0, back: 0, neutral: 0 });
