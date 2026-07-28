/* ============================================================
   wire.js —— 摄像头这块的界面接线：标定、调参、叠加层
   物理和识别算法都不在这里。
   ============================================================ */

const $ = id => document.getElementById(id);

/* ---------------- 标定 ---------------- */
const CALIB_STEPS = [
  '① 点【横梁的左端】',
  '② 点【横梁的右端】',
  '③ 点【左边那个滑轮】',
  '④ 点【右边那个滑轮】',
];
let calibrating = false;    // false | 'full'（四个点全点） | 'pulley'（只重点滑轮）

function startCalib(mode) {
  calibrating = mode || 'full';
  if (calibrating === 'full') { vision.calib.pts = []; }
  vision.calib.pulleyPts = [];
  $('camwrap').hidden = false;
  $('showCam').checked = true;
  updateCamHint();
}

/* 当前该点第几个点（只重点滑轮时直接从 ③ 开始） */
function calibIndex() {
  return calibrating === 'pulley' ? 2 + vision.calib.pulleyPts.length
    : vision.calib.pts.length + vision.calib.pulleyPts.length;
}

function updateCamHint() {
  const i = calibIndex();
  const auto = state.pulleySource === 'auto';
  const done = vision.ready && (auto || state.pulleyY);

  $('camhint').innerHTML = calibrating
    ? `标定中 ${i}/4 —— 请在画面上${CALIB_STEPS[i] || ''}`
    : (done
      ? (auto ? `绿卡 <b>${vision.out.pulleys.filter(Boolean).length}/2</b> · ` : '滑轮已点选 · ')
        + `人 <b>${vision.out.poseCount}</b> · ${vision.fps.toFixed(0)} fps`
      : '还没标定，点右侧的「开始标定」');

  // 标定状态做成醒目横幅：没标定的话人也识别不了，必须先过这一关
  const el = $('calibState');
  if (calibrating) {
    el.className = 'status calibbox';
    el.innerHTML = `正在标定 <b>${i}/4</b> —— 在画面上${CALIB_STEPS[i] || ''}`;
  } else if (done) {
    el.className = 'status okbox';
    el.textContent = '✓ 标定完成';
  } else {
    el.className = 'status warnbox';
    el.textContent = vision.ready
      ? '② 还没点选滑轮' : '① 还没标定 —— 标定之前识别不会启动';
  }
  $('repickBtn').hidden = !vision.ready || auto;
}

$('camoverlay').addEventListener('click', e => {
  if (!calibrating) return;
  const r = e.currentTarget.getBoundingClientRect();
  const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  const c = vision.calib;

  if (calibrating === 'full' && c.pts.length < 2) {
    c.pts.push(p);
    // 两个横梁端点点完就能建立变换，接着点滑轮
    if (c.pts.length === 2 && !rebuildCalibration()) {
      c.pts = [];
      $('camhint').textContent = '这两个点太靠近了，认不出水平方向，请重新点';
      return;
    }
  } else {
    c.pulleyPts.push(p);
    if (c.pulleyPts.length === 2) {
      applyPulleyPicks();
      calibrating = false;
      draw();
    }
  }
  updateCamHint();
});

/* ---------------- 叠加层：标定点、ROI 横带、识别结果、掩码 ---------------- */
function drawOverlay() {
  const cvs = $('camoverlay'), v = vision.video;
  if (!v || !v.videoWidth) return;
  const w = cvs.clientWidth, h = cvs.clientHeight;
  const dpr = devicePixelRatio || 1;
  if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
  const g = cvs.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // 绿色掩码：现场调参时最有用的一个视图
  if (vision.showMask && vision.lastMask) {
    const { mask, W, H } = vision.lastMask;
    const im = g.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      im.data[i * 4] = 57; im.data[i * 4 + 1] = 255; im.data[i * 4 + 2] = 106; im.data[i * 4 + 3] = 190;
    }
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(im, 0, 0);
    g.drawImage(tmp, 0, 0, w, h);
  }

  const P = p => { const q = world2img(p); return q && { x: q.x * w, y: q.y * h }; };

  // 已点的标定点：横梁两端（青）和滑轮（绿）
  const marks = vision.calib.pts.map((p, i) => [p, i + 1, '#22d3ee'])
    .concat(vision.calib.pulleyPts.map((p, i) => [p, i + 3, '#39ff6a']));
  marks.forEach(([p, n, col]) => {
    g.fillStyle = col; g.strokeStyle = '#04101a'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x * w, p.y * h, 8, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#04101a'; g.font = '700 11px monospace'; g.textAlign = 'center';
    g.fillText(n, p.x * w, p.y * h + 4);
  });
  // 横梁基准线：标定对不对，看它有没有贴着真实横梁
  if (vision.calib.pts.length === 2) {
    const [a, b] = vision.calib.pts;
    g.save();
    g.strokeStyle = 'rgba(34,211,238,.8)'; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.beginPath(); g.moveTo(a.x * w, a.y * h); g.lineTo(b.x * w, b.y * h); g.stroke();
    g.restore();
  }

  if (!vision.ready) return;

  // ROI 横带：绿卡只在这条带子里找，所以学生的衣服颜色再撞也没关系
  if (state.pulleySource === 'auto') {
    const half = state.span / 2 + 0.35;
    const band = [{ x: -half, y: state.beamY + vision.roi.up }, { x: half, y: state.beamY + vision.roi.up },
                  { x: half, y: state.beamY - vision.roi.down }, { x: -half, y: state.beamY - vision.roi.down }]
                  .map(P);
    if (band.every(Boolean)) {
      g.save();
      g.strokeStyle = 'rgba(34,211,238,.75)'; g.fillStyle = 'rgba(34,211,238,.07)';
      g.lineWidth = 1.5; g.setLineDash([6, 4]);
      g.beginPath(); band.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    vision.out.pulleys.forEach((p, i) => {
      if (!p) return;
      const q = P(p); if (!q) return;
      g.strokeStyle = '#39ff6a'; g.lineWidth = 2.5;
      g.strokeRect(q.x - 16, q.y - 9, 32, 18);
      g.fillStyle = '#39ff6a'; g.font = '700 11px monospace'; g.textAlign = 'center';
      g.fillText('滑轮' + (i + 1), q.x, q.y - 14);
    });
  }
  vision.out.persons.forEach((p, i) => {
    const q = P(p); if (!q) return;
    g.strokeStyle = '#ff3d81'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(q.x, q.y, 11, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(q.x - 17, q.y); g.lineTo(q.x + 17, q.y);
    g.moveTo(q.x, q.y - 17); g.lineTo(q.x, q.y + 17); g.stroke();
    g.fillStyle = '#ff3d81'; g.font = '700 11px monospace'; g.textAlign = 'center';
    g.fillText('人' + (i + 1), q.x, q.y - 20);
  });
}

/* ---------------- 数据来源切换 ---------------- */
document.querySelectorAll('.seg-btn[data-src]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const src = btn.dataset.src;
    selectSource(src);

    if (src === 'camera') {
      setStatus('正在打开摄像头…');
      const ok = await startCamera();
      if (ok) {
        setStatus('');
        if (vision.calib.pts.length !== 4) startCalib();
      } else {
        // 开不了就退回鼠标模式，否则画面会卡住且拖不动，看起来像坏了
        setStatus(vision.err + '　已退回鼠标模拟。');
        selectSource('mouse', true);
      }
    } else {
      stopCamera();
      setStatus('');
      setWarn('');
      draw();
    }
  });
});

function setCamUI(on) {
  const auto = state.pulleySource === 'auto';
  $('camPanel').hidden = !on;
  $('greenCard').hidden = !on || !auto;      // 绿卡调参只在自动识别时才有意义
  $('camwrap').hidden = !on || !$('showCam').checked;
  $('srcTag').textContent = on ? '摄像头实测' : '鼠标模拟';
  $('hint').innerHTML = on
    ? (auto ? '滑轮和人都由摄像头识别' : '滑轮在摄像头画面上点选，人由摄像头识别')
    : '拖动<b>滑轮</b>或<b>人</b>，观察受力变化';
  updateCamHint();
}

/* 滑轮位置来源：手动拖 / 绿卡识别 */
document.querySelectorAll('.seg-btn[data-pulley]').forEach(btn => {
  btn.addEventListener('click', () => {
    state.pulleySource = btn.dataset.pulley;
    document.querySelectorAll('.seg-btn[data-pulley]')
      .forEach(b => b.classList.toggle('active', b === btn));
    setCamUI(state.source === 'camera');
    draw();
  });
});

/* keepStatus: 退回鼠标时保留错误提示，否则会一闪而过看不见 */
function selectSource(src, keepStatus) {
  state.source = src;
  document.querySelectorAll('.seg-btn[data-src]')
    .forEach(b => b.classList.toggle('active', b.dataset.src === src));
  setCamUI(src === 'camera');
  if (!keepStatus) setStatus('');
  setWarn('');
  draw();
}

function setStatus(msg) {
  const el = $('camStatus');
  el.textContent = msg;
  el.hidden = !msg;
}

$('calibBtn').addEventListener('click', () => startCalib('full'));
$('repickBtn').addEventListener('click', () => startCalib('pulley'));
$('showCam').addEventListener('change', e => {
  $('camwrap').hidden = !e.target.checked || state.source !== 'camera';
});
$('showMask').addEventListener('change', e => { vision.showMask = e.target.checked; });

/* ---------------- 调参滑条 ---------------- */
function tune(id, apply, fmt) {
  const el = $(id), out = $(id + 'Out');
  if (!el) return;                     // 控件被删掉时不要连累后面的代码
  const run = () => {
    const v = parseFloat(el.value);
    apply(v);
    if (out) out.textContent = fmt ? fmt(v) : v;
  };
  el.addEventListener('input', run);
  run();
}
tune('hMin', v => vision.green.hMin = v);
tune('hMax', v => vision.green.hMax = v);
tune('sMin', v => vision.green.sMin = v, v => v.toFixed(2));
tune('vMin', v => vision.green.vMin = v, v => v.toFixed(2));
tune('minArea', v => vision.green.minArea = v);
tune('fillMin', v => vision.green.fillMin = v, v => v.toFixed(2));

/* 摄像头模式下，vision 的每一帧都会调 draw()，这里只负责画叠加层 */
(function overlayLoop() {
  if (state.source === 'camera' && !$('camwrap').hidden) { drawOverlay(); updateCamHint(); }
  requestAnimationFrame(overlayLoop);
})();
