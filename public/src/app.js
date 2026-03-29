import { COMMANDS, defaultMapping } from "./config/commands.js";
import { createEventBus } from "./core/eventBus.js";
import { Telemetry } from "./core/telemetry.js";
import { Scheduler } from "./core/scheduler.js";
import { Speech } from "./core/speech.js";
import { StageMachine } from "./core/stageMachine.js";
import { CameraManager } from "./camera/cameraManager.js";
import { FrameSampler } from "./camera/frameSampler.js";
import { ApiClient } from "./api/apiClient.js";
import { HudController } from "./ui/hudController.js";
import { DogPoseEstimator } from "./ml/modelLoader.js";
import { DogPresenceDetector } from "./ml/dogPresenceDetector.js";
import { CommandVerifier } from "./ml/commandVerifier.js";
import { Stage1Acquisition } from "./stages/stage1.acquisition.js";
import { Stage2Reinforcement } from "./stages/stage2.reinforcement.js";
import { Stage3Nanny } from "./stages/stage3.nanny.js";

const els = {
  btnStage1: document.getElementById("btnStage1"),
  btnStage2: document.getElementById("btnStage2"),
  btnStage3: document.getElementById("btnStage3"),
  btnPause: document.getElementById("btnPause"),
  btnStop: document.getElementById("btnStop"),
  cameraSelect: document.getElementById("cameraSelect"),
  refreshCam: document.getElementById("refreshCam"),
  startCam: document.getElementById("startCam"),
  stopCam: document.getElementById("stopCam"),
  saveSettings: document.getElementById("saveSettings"),
  rewardManual: document.getElementById("rewardManual"),
  sessionCode: document.getElementById("sessionCode"),
  minInterval: document.getElementById("minInterval"),
  maxInterval: document.getElementById("maxInterval"),
  absThreshold: document.getElementById("absThreshold"),
  marginThreshold: document.getElementById("marginThreshold"),
  neutralThreshold: document.getElementById("neutralThreshold"),
  mapW: document.getElementById("mapW"),
  mapA: document.getElementById("mapA"),
  mapS: document.getElementById("mapS"),
  mapD: document.getElementById("mapD"),
  webcam: document.getElementById("webcam"),
  snapshotCanvas: document.getElementById("snapshotCanvas"),
  logs: document.getElementById("logs"),
  mStage: document.getElementById("mStage"),
  mCommand: document.getElementById("mCommand"),
  mAttempts: document.getElementById("mAttempts"),
  mRewards: document.getElementById("mRewards"),
  mMisses: document.getElementById("mMisses"),
  mUncertain: document.getElementById("mUncertain"),
  mSuccess: document.getElementById("mSuccess"),
  mStreak: document.getElementById("mStreak"),
  sessionProgress: document.getElementById("sessionProgress"),
  dogPresence: document.getElementById("dogPresence"),
  modelStatus: document.getElementById("modelStatus"),
};

const log = (msg) => {
  const line = `${new Date().toLocaleTimeString()} ${msg}`;
  els.logs.textContent = `${line}\n${els.logs.textContent}`;
};

const hud = new HudController(els, log);
const telemetry = new Telemetry(log);
const eventBus = createEventBus();
const scheduler = new Scheduler();
const speech = new Speech();
const cameraManager = new CameraManager(els.webcam);
const frameSampler = new FrameSampler(els.webcam, els.snapshotCanvas);
const apiClient = new ApiClient("/server/api.php");

let commandVerifier = null;
let presenceDetector = null;

const getSettings = () => ({
  sessionCode: els.sessionCode.value.trim(),
  minInterval: Number(els.minInterval.value),
  maxInterval: Number(els.maxInterval.value),
  absThreshold: Number(els.absThreshold.value),
  marginThreshold: Number(els.marginThreshold.value),
  neutralThreshold: Number(els.neutralThreshold.value),
  mapping: {
    w: els.mapW.value,
    a: els.mapA.value,
    s: els.mapS.value,
    d: els.mapD.value,
  },
});

function initCommandMapping() {
  for (const id of ["mapW", "mapA", "mapS", "mapD"]) {
    const select = els[id];
    select.innerHTML = COMMANDS.map((c) => `<option value="${c}">${c}</option>`).join("");
  }
  const map = defaultMapping();
  els.mapW.value = map.w;
  els.mapA.value = map.a;
  els.mapS.value = map.s;
  els.mapD.value = map.d;
}

async function initModel() {
  hud.setModelStatus("Loading dog pose model");
  const poseEstimator = await DogPoseEstimator.create();
  commandVerifier = new CommandVerifier({ poseEstimator });
  presenceDetector = new DogPresenceDetector(poseEstimator);
  hud.setModelStatus("Ready (dog pose)");
}

async function refreshCameras() {
  const cams = await cameraManager.listCameras();
  els.cameraSelect.innerHTML = cams.map((c) => `<option value="${c.deviceId}">${c.label || "Camera"}</option>`).join("");
}

const stage1 = new Stage1Acquisition({ speech, hud });
const stage2 = new Stage2Reinforcement({ speech, hud, scheduler });
const stage3 = new Stage3Nanny({
  scheduler,
  speech,
  frameSampler,
  commandVerifier: {
    setThresholds: () => {},
    verifyCommandWindow: async () => ({ decision: "NO_DECISION", reason: "model_not_initialized", confidence: 0, margin: 0 }),
  },
  apiClient,
  hud,
  telemetry,
});

const machine = new StageMachine({
  stages: { stage1, stage2, stage3 },
  eventBus,
  telemetry,
});

await machine.init({ getSettings });
initCommandMapping();
await refreshCameras();

initModel()
  .then(() => {
    stage3.commandVerifier = commandVerifier;
    log("Dog pose model initialized.");
  })
  .catch((e) => {
    hud.setModelStatus("Failed");
    log(`Pose model init failed: ${e.message}. Put ONNX model at /models/dog-pose.onnx`);
  });

els.refreshCam.onclick = () => refreshCameras().catch((e) => log(e.message));
els.startCam.onclick = () => cameraManager.start(els.cameraSelect.value).catch((e) => log(e.message));
els.stopCam.onclick = () => cameraManager.stop();

els.btnStage1.onclick = () => machine.transition("stage1").catch((e) => log(e.message));
els.btnStage2.onclick = () => machine.transition("stage2").catch((e) => log(e.message));
els.btnStage3.onclick = () => machine.transition("stage3").catch((e) => log(e.message));
els.btnPause.onclick = () => machine.pause("ui").catch((e) => log(e.message));
els.btnStop.onclick = () => machine.stop("ui").catch((e) => log(e.message));
els.rewardManual.onclick = () => machine.handleRewardManual().catch((e) => log(e.message));

els.saveSettings.onclick = async () => {
  try {
    const s = getSettings();
    const code = s.sessionCode || "default";
    await apiClient.saveSettings(code, s);
    log(`Settings saved for ${code}.`);
  } catch (e) {
    log(`Save settings failed: ${e.message}`);
  }
};

document.addEventListener("keydown", (e) => machine.onKey(e));

setInterval(async () => {
  if (!presenceDetector || !cameraManager.stream) return;
  try {
    const frame = frameSampler.captureImageData();
    const p = await presenceDetector.detect(frame);
    hud.setDogPresence(`${p.present ? "Yes" : "No"} (${p.dogScore.toFixed(2)}) pose=${p.label}`);
  } catch {
    // no-op
  }
}, 2500);
