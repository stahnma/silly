// Face detection with YuNet (OpenCV Zoo, MIT; assets/mustache), run with ONNX
// Runtime. Returns each face's box and five landmarks: the eye, nose tip and
// mouth corner positions, in the image's own pixel coordinates.
//
// The decoding follows OpenCV's FaceDetectorYN. YuNet finds faces of roughly
// 10 to 300 pixels, so the image is run at a few sizes and the results merged;
// that catches both a crowd and a close-up selfie.

import ort from 'onnxruntime-node';
import { createCanvas } from '@napi-rs/canvas';

const MODEL = new URL('../assets/mustache/face_detection_yunet_2026may.onnx', import.meta.url);
const STRIDES = [8, 16, 32];
// Longest side of each detection pass.
const SIZES = [640, 320, 160];
const SCORE_THRESHOLD = 0.8;
const NMS_IOU = 0.3;

let session;
const getSession = () => (session ??= ort.InferenceSession.create(MODEL.pathname));

// Planar BGR float32, 0-255, as OpenCV feeds it. Width and height are padded
// up to a multiple of 32; the padding is black.
const toTensor = (image, scale) => {
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const padW = Math.ceil(w / 32) * 32;
  const padH = Math.ceil(h / 32) * 32;
  const canvas = createCanvas(padW, padH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, padW, padH);
  ctx.drawImage(image, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, padW, padH);
  const plane = padW * padH;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = data[i * 4 + 2];
    input[plane + i] = data[i * 4 + 1];
    input[2 * plane + i] = data[i * 4];
  }
  return { tensor: new ort.Tensor('float32', input, [1, 3, padH, padW]), padW, padH };
};

const decode = (out, padW, padH, scale) => {
  const faces = [];
  for (const stride of STRIDES) {
    const cols = padW / stride;
    const rows = padH / stride;
    const cls = out[`cls_${stride}`].data;
    const obj = out[`obj_${stride}`].data;
    const bbox = out[`bbox_${stride}`].data;
    const kps = out[`kps_${stride}`].data;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const clamp = v => Math.min(Math.max(v, 0), 1);
        const score = Math.sqrt(clamp(cls[i]) * clamp(obj[i]));
        if (score < SCORE_THRESHOLD) continue;
        const cx = (c + bbox[i * 4]) * stride;
        const cy = (r + bbox[i * 4 + 1]) * stride;
        const w = Math.exp(bbox[i * 4 + 2]) * stride;
        const h = Math.exp(bbox[i * 4 + 3]) * stride;
        const points = [];
        for (let n = 0; n < 5; n++) {
          points.push({
            x: ((kps[i * 10 + 2 * n] + c) * stride) / scale,
            y: ((kps[i * 10 + 2 * n + 1] + r) * stride) / scale,
          });
        }
        const [rightEye, leftEye, nose, rightMouth, leftMouth] = points;
        faces.push({
          score,
          box: { x: (cx - w / 2) / scale, y: (cy - h / 2) / scale, w: w / scale, h: h / scale },
          rightEye,
          leftEye,
          nose,
          rightMouth,
          leftMouth,
        });
      }
    }
  }
  return faces;
};

const iou = (a, b) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
};

// Keep the best-scoring face among overlapping detections.
const nms = faces => {
  const kept = [];
  for (const face of faces.sort((a, b) => b.score - a.score)) {
    if (kept.every(k => iou(k.box, face.box) < NMS_IOU)) kept.push(face);
  }
  return kept;
};

// Faces in a decoded image (anything with width, height and drawable by canvas).
export const detectFaces = async image => {
  const s = await getSession();
  const longest = Math.max(image.width, image.height);
  const found = [];
  for (const size of SIZES) {
    // Never upscale more than 2x; tiny images don't gain anything from it.
    const scale = Math.min(size / longest, 2);
    const { tensor, padW, padH } = toTensor(image, scale);
    const out = await s.run({ input: tensor });
    found.push(...decode(out, padW, padH, scale));
  }
  return nms(found);
};
