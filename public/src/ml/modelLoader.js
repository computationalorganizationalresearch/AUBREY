const MODEL_PATH = "/models/dog-pose.onnx";
const INPUT_SIZE = 640;

let ortLibPromise = null;

async function loadOrt() {
  if (!ortLibPromise) {
    ortLibPromise = import("https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js");
  }
  return ortLibPromise;
}

function resizeAndNormalize(imageData, size = INPUT_SIZE) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const src = document.createElement("canvas");
  src.width = imageData.width;
  src.height = imageData.height;
  src.getContext("2d").putImageData(imageData, 0, 0);

  ctx.drawImage(src, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const chw = new Float32Array(3 * size * size);
  for (let i = 0; i < size * size; i++) {
    chw[i] = data[i * 4] / 255;
    chw[size * size + i] = data[i * 4 + 1] / 255;
    chw[2 * size * size + i] = data[i * 4 + 2] / 255;
  }
  return chw;
}

function parseUltralyticsPose(outputTensor, confThreshold = 0.35) {
  // Expected YOLO pose format per detection: [x, y, w, h, conf, 24*3 keypoint values]
  const rows = outputTensor.data;
  const dims = outputTensor.dims;
  const stride = dims[dims.length - 1];
  const numDet = rows.length / stride;

  let best = null;
  for (let i = 0; i < numDet; i++) {
    const offset = i * stride;
    const conf = rows[offset + 4];
    if (conf < confThreshold) continue;

    const x = rows[offset + 0];
    const y = rows[offset + 1];
    const w = rows[offset + 2];
    const h = rows[offset + 3];

    const keypoints = [];
    let k = offset + 5;
    for (let p = 0; p < 24; p++) {
      keypoints.push({ x: rows[k], y: rows[k + 1], v: rows[k + 2] });
      k += 3;
    }

    if (!best || conf > best.score) {
      best = { score: conf, bbox: { x, y, w, h }, keypoints };
    }
  }
  return best;
}

function computePoseProbabilities(keypoints) {
  if (!keypoints || keypoints.length !== 24) {
    return { sit: 0, "lay down": 0, "shake paw": 0, neutral: 1, label: "neutral", confidence: 1 };
  }

  const y = (idx) => keypoints[idx]?.y ?? 0;
  const v = (idx) => keypoints[idx]?.v ?? 0;

  const withers = y(22);
  const throat = y(23);
  const frontLPaw = y(0);
  const frontRPaw = y(6);
  const rearLPaw = y(3);
  const rearRPaw = y(9);

  const visibleFrontPaw = Math.max(v(0), v(6));
  const visibleRearPaw = Math.max(v(3), v(9));

  const torsoToGround = ((frontLPaw + frontRPaw + rearLPaw + rearRPaw) / 4) - withers;
  const chestToGround = ((frontLPaw + frontRPaw) / 2) - throat;
  const pawHeightDiff = Math.abs(frontLPaw - frontRPaw);

  const layScore = Math.max(0, Math.min(1, 1 - chestToGround / 80));
  const sitScore = Math.max(0, Math.min(1, (torsoToGround - 25) / 70));
  const shakePawScore = visibleFrontPaw > 0.35 ? Math.max(0, Math.min(1, (40 - pawHeightDiff) / 40)) : 0;

  let neutral = Math.max(0, 1 - Math.max(layScore, sitScore, shakePawScore));

  const raw = {
    sit: sitScore,
    "lay down": layScore,
    "shake paw": shakePawScore,
    neutral,
  };

  const sum = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const probs = Object.fromEntries(Object.entries(raw).map(([k, val]) => [k, val / sum]));

  const [label, confidence] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  return { ...probs, label, confidence };
}

export class DogPoseEstimator {
  constructor(session, ort) {
    this.session = session;
    this.ort = ort;
  }

  static async create({ modelPath = MODEL_PATH } = {}) {
    const ort = await loadOrt();
    const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["wasm"] });
    return new DogPoseEstimator(session, ort);
  }

  async inferPose(imageData) {
    const input = resizeAndNormalize(imageData, INPUT_SIZE);
    const tensor = new this.ort.Tensor("float32", input, [1, 3, INPUT_SIZE, INPUT_SIZE]);

    const feeds = { images: tensor };
    const output = await this.session.run(feeds);

    const outTensor = output[Object.keys(output)[0]];
    const detection = parseUltralyticsPose(outTensor);

    if (!detection) {
      return { present: false, score: 0, probs: { sit: 0, "lay down": 0, "shake paw": 0, neutral: 1 }, label: "neutral", keypoints: [] };
    }

    const probs = computePoseProbabilities(detection.keypoints);
    return {
      present: true,
      score: detection.score,
      probs: { sit: probs.sit, "lay down": probs["lay down"], "shake paw": probs["shake paw"], neutral: probs.neutral },
      label: probs.label,
      confidence: probs.confidence,
      keypoints: detection.keypoints,
      bbox: detection.bbox,
    };
  }
}
