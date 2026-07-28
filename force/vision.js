/* ============================================================
   vision.js —— 摄像头识别层
   职责：把摄像头画面变成「世界坐标」，交给 app.js 画受力图。
   这一层不做任何物理计算。

   两件事：
     1. 绿色识别卡  -> 两个滑轮的位置（颜色 + 形状 + 空间 + 时间 四层过滤）
     2. MediaPipe   -> 人的挂点/重心位置
   两者都通过「单应性变换」从画面像素换算到现实中的米。
   ============================================================ */

const vision = {
  on: false,            // 摄像头是否已开
  ready: false,         // 标定是否完成
  video: null,
  err: '',

  // 标定（按「摄像头正对龙门架、无透视畸变」处理）
  //
  // 这个前提下画面到现实是一个「相似变换」＝ 缩放 + 旋转 + 平移。
  // 相似变换保角，所以：
  //   · 画面上量到的角度就是真实角度
  //   · 缩放比例在角度里会完全约掉 —— 于是**不需要量任何尺寸**
  // 两个横梁端点只用来确定「水平方向在画面里是哪个方向」（消掉摄像头的侧倾）。
  calib: {
    pts: [],            // [{x,y}] 横梁左端、横梁右端（归一化 0~1）
    pulleyPts: [],      // [{x,y}] 两个滑轮在画面上的位置
    map: null,          // 画面 -> 世界
    inv: null,          // 世界 -> 画面
  },

  // 绿卡识别参数（现场可调）
  // arMin 放到 0.7：实际贴的卡未必是 2:1，方形卡也要能过
  green: { hMin: 75, hMax: 175, sMin: 0.35, vMin: 0.22,
           minArea: 25, maxArea: 6000, fillMin: 0.60,
           arMin: 0.70, arMax: 3.60 },

  // ROI：以横梁为基准，向上 up 米、向下 down 米的横带
  roi: { up: 0.25, down: 0.75 },

  // 识别结果（世界坐标，米）
  out: { pulleys: [null, null], persons: [], maskCount: 0, poseCount: 0 },

  showMask: false,
  fps: 0,
};

/* ============================================================
   相似变换（缩放 + 旋转 + 平移）

   由两个横梁端点确定。横梁在现实中是水平的，所以这两点在画面上的
   连线方向 = 现实水平方向，用它就能把摄像头的侧倾转正。

   缩放比例取多少**不影响任何角度**（相似变换保角，比例在角度里约掉），
   所以下面用的 state.span / state.beamY 只是画图用的坐标而已，
   不需要和实物量出来的尺寸一致。
   ============================================================ */
function rebuildCalibration() {
  const c = vision.calib;
  if (c.pts.length < 2) { c.map = c.inv = null; vision.ready = false; return false; }

  const [p1, p2] = c.pts;
  const dpx = p2.x - p1.x, dpy = -(p2.y - p1.y);   // 画面 y 向下，翻成向上
  const den = dpx * dpx + dpy * dpy;
  if (den < 1e-9) { c.map = c.inv = null; vision.ready = false; return false; }

  const w1 = { x: -state.span / 2, y: state.beamY };
  const dwx = state.span, dwy = 0;
  const a = (dwx * dpx + dwy * dpy) / den;         // 缩放 * cos(旋转)
  const b = (dwy * dpx - dwx * dpy) / den;         // 缩放 * sin(旋转)

  c.map = p => {
    const dx = p.x - p1.x, dy = -(p.y - p1.y);
    return { x: w1.x + a * dx - b * dy, y: w1.y + b * dx + a * dy };
  };
  const det = a * a + b * b;
  c.inv = w => {
    const dx = w.x - w1.x, dy = w.y - w1.y;
    return { x: p1.x + (a * dx + b * dy) / det, y: p1.y - (-b * dx + a * dy) / det };
  };
  vision.ready = true;
  return true;
}

/* 把已点选的两个滑轮换算成世界坐标，写进 state */
function applyPulleyPicks() {
  const c = vision.calib;
  if (!vision.ready || c.pulleyPts.length < 2) return false;
  const w = c.pulleyPts.map(c.map).sort((m, n) => m.x - n.x);   // 左右按 x 排
  state.pulleyX = [w[0].x, w[1].x];
  state.pulleyY = [w[0].y, w[1].y];
  return true;
}

const img2world = p => vision.calib.map ? vision.calib.map(p) : null;
const world2img = p => vision.calib.inv ? vision.calib.inv(p) : null;

/* ============================================================
   摄像头
   ============================================================ */
const proc = document.createElement('canvas');
const pctx = proc.getContext('2d', { willReadFrequently: true });
const PROC_W = 480;                      // 处理分辨率，兼顾速度与精度

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: false,
    });
    const v = document.getElementById('cam');
    v.srcObject = stream;
    await v.play();
    vision.video = v;
    vision.on = true;
    vision.err = '';
    await initPose();
    requestAnimationFrame(visionLoop);
    return true;
  } catch (e) {
    vision.err = '打不开摄像头：' + e.message;
    return false;
  }
}

function stopCamera() {
  const v = vision.video;
  if (v && v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
  vision.on = false;
  vision.out.pulleys = [null, null];
  vision.out.persons = [];
}

/* ============================================================
   MediaPipe 姿态识别（全部走本地文件，断网也能用）
   ============================================================ */
let poseLandmarker = null, poseLoading = false;

async function initPose() {
  if (poseLandmarker || poseLoading) return;
  poseLoading = true;
  try {
    const { FilesetResolver, PoseLandmarker } = await import('./lib/vision_bundle.mjs');
    const fileset = await FilesetResolver.forVisionTasks('./lib/wasm');
    poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: './models/pose_landmarker_lite.task', delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (e) {
    vision.err = '姿态模型加载失败：' + e.message;
  }
  poseLoading = false;
}

/* 挂点/重心：躯干上，由双肩中点和双髋中点插值得到。
   比手腕稳得多——手腕常常跑到画面边缘或被遮挡。 */
const TORSO_BLEND = 0.55;   // 0=双肩中点，1=双髋中点

function torsoPoint(lm) {
  const need = [11, 12, 23, 24];
  if (need.some(i => !lm[i] || (lm[i].visibility !== undefined && lm[i].visibility < 0.5))) return null;
  const sx = (lm[11].x + lm[12].x) / 2, sy = (lm[11].y + lm[12].y) / 2;
  const hx = (lm[23].x + lm[24].x) / 2, hy = (lm[23].y + lm[24].y) / 2;
  return { x: sx + (hx - sx) * TORSO_BLEND, y: sy + (hy - sy) * TORSO_BLEND };
}

/* ============================================================
   绿卡识别：颜色 -> 连通域 -> 形状 -> 空间 -> 时间
   ============================================================ */
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

/* 世界坐标里的 ROI 横带，投影回画面得到扫描范围 */
function roiBoxImage() {
  const half = state.span / 2 + 0.35;
  const yTop = state.beamY + vision.roi.up, yBot = state.beamY - vision.roi.down;
  const corners = [{ x: -half, y: yTop }, { x: half, y: yTop },
                   { x: -half, y: yBot }, { x: half, y: yBot }].map(world2img);
  if (corners.some(c => !c)) return null;
  return {
    x0: Math.max(0, Math.min(...corners.map(c => c.x))),
    x1: Math.min(1, Math.max(...corners.map(c => c.x))),
    y0: Math.max(0, Math.min(...corners.map(c => c.y))),
    y1: Math.min(1, Math.max(...corners.map(c => c.y))),
  };
}

function detectCards(imgData, W, H) {
  const g = vision.green, d = imgData.data;
  const box = roiBoxImage();
  if (!box) return [];

  const px0 = Math.floor(box.x0 * W), px1 = Math.ceil(box.x1 * W);
  const py0 = Math.floor(box.y0 * H), py1 = Math.ceil(box.y1 * H);
  const mask = new Uint8Array(W * H);
  let count = 0;

  for (let y = py0; y < py1; y++) {
    for (let x = px0; x < px1; x++) {
      const i = (y * W + x) * 4;
      const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      if (h < g.hMin || h > g.hMax || s < g.sMin || v < g.vMin) continue;
      // 逐点确认确实落在世界坐标的横带里（挡掉透视造成的边角误差）
      const w = img2world({ x: (x + 0.5) / W, y: (y + 0.5) / H });
      if (!w) continue;
      if (w.y > state.beamY + vision.roi.up || w.y < state.beamY - vision.roi.down) continue;
      if (Math.abs(w.x) > state.span / 2 + 0.35) continue;
      mask[y * W + x] = 1; count++;
    }
  }
  vision.out.maskCount = count;
  vision.lastMask = vision.showMask ? { mask, W, H } : null;

  // 连通域（4 邻域，显式栈，避免递归爆栈）
  const seen = new Uint8Array(W * H), blobs = [], stack = new Int32Array(W * H);
  for (let y = py0; y < py1; y++) {
    for (let x = px0; x < px1; x++) {
      const s0 = y * W + x;
      if (!mask[s0] || seen[s0]) continue;
      let sp = 0; stack[sp++] = s0; seen[s0] = 1;
      let area = 0, sumX = 0, sumY = 0, minX = W, maxX = 0, minY = H, maxY = 0;
      while (sp) {
        const p = stack[--sp], py = (p / W) | 0, px = p - py * W;
        area++; sumX += px; sumY += py;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (px > px0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
        if (px < px1 - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
        if (py > py0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
        if (py < py1 - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const ar = bw / bh, fill = area / (bw * bh);
      // 形状过滤：长宽比接近 2:1，且填满外接框（矩形才填得满）
      if (area < g.minArea || area > g.maxArea) continue;
      if (ar < g.arMin || ar > g.arMax) continue;
      if (fill < g.fillMin) continue;
      blobs.push({ area, cx: (sumX / area + 0.5) / W, cy: (sumY / area + 0.5) / H });
    }
  }
  blobs.sort((a, b) => b.area - a.area);
  return blobs.slice(0, 2)
    .map(b => ({ ...b, world: img2world({ x: b.cx, y: b.cy }) }))
    .filter(b => b.world)
    .sort((a, b) => a.world.x - b.world.x);   // 左右永远不会互换，按 x 排序即可分辨
}

/* ============================================================
   平滑与跳变抑制
   ============================================================ */
const SMOOTH = 0.35;        // 指数平滑系数，越小越稳但越迟钝
const JUMP_LIMIT = 0.9;     // 单帧位移超过这个米数就当误检丢掉

function smoothTrack(prev, next, missCount) {
  if (!next) return prev;
  if (!prev) return { ...next };
  if (Math.hypot(next.x - prev.x, next.y - prev.y) > JUMP_LIMIT && missCount < 8) return prev;
  return { x: prev.x + (next.x - prev.x) * SMOOTH, y: prev.y + (next.y - prev.y) * SMOOTH };
}

const track = { pulleys: [null, null], persons: [], miss: [0, 0], pmiss: [0, 0] };

/* ============================================================
   主循环
   ============================================================ */
let lastT = 0;

function visionLoop(t) {
  if (!vision.on) return;
  const v = vision.video;

  if (v && v.readyState >= 2 && vision.ready) {
    const W = PROC_W, H = Math.max(1, Math.round(PROC_W * v.videoHeight / v.videoWidth));
    if (proc.width !== W || proc.height !== H) { proc.width = W; proc.height = H; }
    pctx.drawImage(v, 0, 0, W, H);

    // --- 绿卡（滑轮设成手动时就不用跑了，省一半 CPU）---
    if (state.pulleySource === 'auto' || vision.showMask) {
      const cards = detectCards(pctx.getImageData(0, 0, W, H), W, H);
      for (let i = 0; i < 2; i++) {
        const found = cards[i] ? cards[i].world : null;
        if (found) track.miss[i] = 0; else track.miss[i]++;
        track.pulleys[i] = smoothTrack(track.pulleys[i], found, track.miss[i]);
        vision.out.pulleys[i] = track.miss[i] > 30 ? null : track.pulleys[i];
      }
    }

    // --- 人 ---
    if (poseLandmarker) {
      try {
        const res = poseLandmarker.detectForVideo(v, performance.now());
        const pts = (res.landmarks || []).map(torsoPoint).filter(Boolean)
          .map(p => img2world(p)).filter(Boolean)
          .sort((a, b) => a.x - b.x);
        vision.out.poseCount = pts.length;
        for (let i = 0; i < 2; i++) {
          const found = pts[i] || null;
          if (found) track.pmiss[i] = 0; else track.pmiss[i]++;
          track.persons[i] = smoothTrack(track.persons[i], found, track.pmiss[i]);
        }
        vision.out.persons = track.persons
          .map((p, i) => (track.pmiss[i] > 20 ? null : p))
          .filter(Boolean);
      } catch (e) { /* 单帧失败无所谓，下一帧继续 */ }
    }
  }

  if (lastT) vision.fps = vision.fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
  lastT = t;

  draw();
  requestAnimationFrame(visionLoop);
}
