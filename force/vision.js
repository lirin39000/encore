/* ============================================================
   vision.js —— 摄像头识别层

   只做两件事：
     1. 两个滑轮的位置：在摄像头画面上点一下定下来
     2. 人的位置：MediaPipe 实时捕捉躯干

   没有标定，也不需要量任何尺寸。

   原理：摄像头正对龙门架拍摄时，画面到现实只差一个缩放，
   而缩放不改变角度。受力只跟绳的方向（角度）有关，
   所以直接在画面坐标里量角度就是对的。

   唯一要注意的是**像素长宽比**：画面归一化坐标 x、y 各自被压到 0~1，
   16:9 的画面横向就被压扁了，角度会错。所以下面统一把 x 乘上长宽比，
   换算到「以画面高度为单位」的方形坐标系里再算。
   ============================================================ */

const vision = {
  on: false,
  ready: false,          // 两个滑轮都点过了
  video: null,
  err: '',

  pulleyPts: [],         // 点选的两个滑轮，画面归一化坐标 [{x,y}]
  origin: null,          // 画面 -> 世界 的平移基准（点完滑轮后确定）

  out: { persons: [], poseCount: 0 },
  fps: 0,
};

/* 每「一个画面高度」代表现实中多少米。
   这个值只影响画面大小，不影响任何角度和受力——因为缩放在角度里会约掉。 */
const METERS_PER_FRAME_H = 3.0;

/* 画面归一化坐标 -> 方形坐标（单位：画面高度），消除长宽比造成的角度畸变 */
function squarePt(p) {
  const v = vision.video;
  const aspect = (v && v.videoHeight) ? v.videoWidth / v.videoHeight : 16 / 9;
  return { x: p.x * aspect, y: p.y };
}

/* 画面归一化坐标 -> 世界坐标（米，y 向上）*/
function imgToWorld(p) {
  const o = vision.origin;
  if (!o) return null;
  const s = squarePt(p);
  return { x: (s.x - o.x) * METERS_PER_FRAME_H,
           y: o.worldY - (s.y - o.y) * METERS_PER_FRAME_H };
}

/* 记录一个滑轮点选。点满两个就确定基准，让两滑轮中点落在画面里合适的位置 */
function setPulleyPick(p) {
  vision.pulleyPts.push(p);
  if (vision.pulleyPts.length < 2) return false;
  vision.pulleyPts = vision.pulleyPts.slice(-2);
  const a = squarePt(vision.pulleyPts[0]), b = squarePt(vision.pulleyPts[1]);
  vision.origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, worldY: 2.60 };
  vision.ready = true;
  return true;
}

function clearPulleyPicks() {
  vision.pulleyPts = [];
  vision.origin = null;
  vision.ready = false;
}

/* 两个滑轮的世界坐标，按左右排好 */
function pulleyWorld() {
  if (!vision.ready) return null;
  return vision.pulleyPts.map(imgToWorld).sort((m, n) => m.x - n.x);
}

/* ============================================================
   摄像头
   ============================================================ */
async function listCameras() {
  try {
    return (await navigator.mediaDevices.enumerateDevices())
      .filter(d => d.kind === 'videoinput');
  } catch (e) { return []; }
}

/* 等到真的有画面帧。只看 play() 有没有 resolve 是不够的——摄像头被别的
   程序占用时 play() 照样成功，但一帧都不来，表现就是全黑。
   用 setTimeout 而不是 rAF：窗口在后台时 rAF 会被暂停，那样这里会永远挂住。 */
function waitForFrames(v, ms = 4000) {
  return new Promise(resolve => {
    const t0 = performance.now();
    (function poll() {
      if (v.videoWidth > 0 && v.videoHeight > 0 && v.readyState >= 2) return resolve(true);
      if (performance.now() - t0 > ms) return resolve(false);
      setTimeout(poll, 60);
    })();
  });
}

async function startCamera(deviceId) {
  stopCamera();                     // 先释放上一路流，否则摄像头会被自己占住
  const v = document.getElementById('cam');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId } }
                      : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    v.srcObject = stream;
    vision.video = v;
    await v.play().catch(() => {});
    vision.on = true;

    if (!await waitForFrames(v)) {
      const t = stream.getVideoTracks()[0];
      vision.err = '摄像头打开了，但收不到画面（' + (t ? t.label || '未命名设备' : '无轨道')
        + '）。多半是被别的程序或另一个页面占用了——关掉它们，或在下面换个设备。';
      return false;
    }
    vision.err = '';
    await initPose();
    requestAnimationFrame(visionLoop);
    return true;
  } catch (e) {
    vision.err = '打不开摄像头：'
      + (e.name === 'NotReadableError' ? '设备被别的程序占用了' : e.message);
    return false;
  }
}

function stopCamera() {
  const v = vision.video || document.getElementById('cam');
  if (v && v.srcObject) {
    v.srcObject.getTracks().forEach(t => t.stop());
    v.srcObject = null;
  }
  vision.on = false;
  vision.out.persons = [];
}

// 刷新/关页面时一定要把摄像头还回去，否则下次打开会被自己占着，表现就是黑屏
addEventListener('pagehide', stopCamera);

function cameraDiag() {
  const v = vision.video;
  if (!v || !v.srcObject) return '未启动';
  const t = v.srcObject.getVideoTracks()[0];
  return `${v.videoWidth}×${v.videoHeight} · readyState ${v.readyState}`
    + (t ? ` · ${t.readyState}${t.muted ? '（无画面）' : ''} · ${t.label || '未命名'}` : ' · 无轨道');
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

/* 人的位置取躯干上一点，由双肩中点和双髋中点插值。
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
   平滑与跳变抑制
   ============================================================ */
const SMOOTH = 0.35;        // 越小越稳、越迟钝
const JUMP_LIMIT = 0.9;     // 单帧位移超过这么多米就当误检丢掉

function smoothTrack(prev, next, missCount) {
  if (!next) return prev;
  if (!prev) return { ...next };
  if (Math.hypot(next.x - prev.x, next.y - prev.y) > JUMP_LIMIT && missCount < 8) return prev;
  return { x: prev.x + (next.x - prev.x) * SMOOTH, y: prev.y + (next.y - prev.y) * SMOOTH };
}

const track = { persons: [], miss: [0, 0] };

/* ============================================================
   主循环
   ============================================================ */
let lastT = 0;

function visionLoop(t) {
  if (!vision.on) return;
  const v = vision.video;

  if (v && v.readyState >= 2 && poseLandmarker) {
    try {
      const res = poseLandmarker.detectForVideo(v, performance.now());
      const raw = (res.landmarks || []).map(torsoPoint).filter(Boolean);
      vision.out.poseCount = raw.length;
      vision.lastPoseImg = raw;                       // 叠加层画标记用
      const pts = vision.ready
        ? raw.map(imgToWorld).filter(Boolean).sort((a, b) => a.x - b.x)
        : [];
      for (let i = 0; i < 2; i++) {
        const found = pts[i] || null;
        if (found) track.miss[i] = 0; else track.miss[i]++;
        track.persons[i] = smoothTrack(track.persons[i], found, track.miss[i]);
      }
      vision.out.persons = track.persons
        .map((p, i) => (track.miss[i] > 20 ? null : p))
        .filter(Boolean);
    } catch (e) { /* 单帧失败无所谓，下一帧继续 */ }
  }

  if (lastT) vision.fps = vision.fps * 0.9 + (1000 / Math.max(1, t - lastT)) * 0.1;
  lastT = t;

  draw();
  requestAnimationFrame(visionLoop);
}
