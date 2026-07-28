/* ============================================================
   wire.js —— 摄像头这块的界面接线
   物理和识别算法都不在这里。
   ============================================================ */

const $ = id => document.getElementById(id);

const PICK_STEPS = ['① 点【左边那个滑轮】', '② 点【右边那个滑轮】'];
let picking = false;

function startPick() {
  picking = true;
  clearPulleyPicks();
  $('camwrap').hidden = false;
  $('showCam').checked = true;
  updateCamHint();
  draw();
}

function updateCamHint() {
  const n = vision.pulleyPts.length;
  $('camhint').innerHTML = picking
    ? `点选中 ${n}/2 —— 请在画面上${PICK_STEPS[n] || ''}`
    : (vision.ready
      ? `滑轮已定位 · 人 <b>${vision.out.poseCount}</b> · ${vision.fps.toFixed(0)} fps`
      : '还没点滑轮，点右侧的按钮');

  const el = $('calibState');
  if (picking) {
    el.className = 'status calibbox';
    el.innerHTML = `点选中 <b>${n}/2</b> —— 在画面上${PICK_STEPS[n] || ''}`;
  } else if (vision.ready) {
    el.className = 'status okbox';
    el.textContent = '✓ 滑轮已定位';
  } else {
    el.className = 'status warnbox';
    el.textContent = '还没点滑轮 —— 点完才会开始算受力';
  }
  $('camDiag').textContent = cameraDiag();
}

$('camoverlay').addEventListener('click', e => {
  if (!picking) return;
  const r = e.currentTarget.getBoundingClientRect();
  const done = setPulleyPick({
    x: (e.clientX - r.left) / r.width,
    y: (e.clientY - r.top) / r.height,
  });
  if (done) { picking = false; draw(); }
  updateCamHint();
});

/* ---------------- 叠加层：滑轮标记 + 识别到的人 ---------------- */
function drawOverlay() {
  const cvs = $('camoverlay'), v = vision.video;
  if (!v || !v.videoWidth) return;
  const w = cvs.clientWidth, h = cvs.clientHeight;
  const dpr = devicePixelRatio || 1;
  if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
  const g = cvs.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  // 点选的滑轮
  vision.pulleyPts.forEach((p, i) => {
    const x = p.x * w, y = p.y * h;
    g.strokeStyle = '#22d3ee'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 13, 0, 7); g.stroke();
    g.beginPath();
    g.moveTo(x - 20, y); g.lineTo(x + 20, y);
    g.moveTo(x, y - 20); g.lineTo(x, y + 20);
    g.stroke();
    g.fillStyle = '#22d3ee'; g.font = '700 12px monospace'; g.textAlign = 'center';
    g.fillText('滑轮' + (i + 1), x, y - 26);
  });
  // 两滑轮之间连一条线，就是横梁在画面上的样子
  if (vision.pulleyPts.length === 2) {
    const [a, b] = vision.pulleyPts;
    g.save();
    g.strokeStyle = 'rgba(34,211,238,.55)'; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.beginPath(); g.moveTo(a.x * w, a.y * h); g.lineTo(b.x * w, b.y * h); g.stroke();
    g.restore();
  }

  // MediaPipe 认到的人（画在原始画面坐标上，和滑轮点一个空间）
  (vision.lastPoseImg || []).forEach((p, i) => {
    const x = p.x * w, y = p.y * h;
    g.strokeStyle = '#ff3d81'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 11, 0, 7); g.stroke();
    g.beginPath();
    g.moveTo(x - 17, y); g.lineTo(x + 17, y);
    g.moveTo(x, y - 17); g.lineTo(x, y + 17);
    g.stroke();
    g.fillStyle = '#ff3d81'; g.font = '700 12px monospace'; g.textAlign = 'center';
    g.fillText('人' + (i + 1), x, y - 22);
  });
}

/* ---------------- 数据来源切换 ---------------- */
document.querySelectorAll('.seg-btn[data-src]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const src = btn.dataset.src;
    selectSource(src);

    if (src === 'camera') {
      setStatus('正在打开摄像头…');
      $('camPicker').hidden = false;
      const ok = await startCamera($('camSelect').value || undefined);
      await refreshCameraList();
      if (ok) {
        setStatus('');
        if (!vision.ready) startPick();
      } else {
        // 开不了就退回鼠标模式，否则画面卡住又拖不动，看起来像坏了。
        // 设备选择框要留着——多半就是要换一个摄像头再试。
        setStatus(vision.err + '　已退回鼠标模拟，可在下面换个设备重试。');
        selectSource('mouse', true);
        $('camPicker').hidden = false;
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
  $('camPanel').hidden = !on;
  $('camPicker').hidden = !on;
  $('camwrap').hidden = !on || !$('showCam').checked;
  $('srcTag').textContent = on ? '摄像头实测' : '鼠标模拟';
  $('hint').innerHTML = on
    ? '滑轮在摄像头画面上点选，人由摄像头自动跟踪'
    : '拖动<b>滑轮</b>或<b>人</b>，观察受力变化';
  updateCamHint();
}

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

/* ---------------- 摄像头设备选择 ---------------- */
async function refreshCameraList() {
  const sel = $('camSelect');
  const cams = await listCameras();
  const cur = vision.video && vision.video.srcObject
    && vision.video.srcObject.getVideoTracks()[0];
  sel.innerHTML = cams.map((d, i) =>
    `<option value="${d.deviceId}">${d.label || '摄像头 ' + (i + 1)}</option>`).join('');
  if (cur) {
    const hit = cams.find(d => d.label && d.label === cur.label);
    if (hit) sel.value = hit.deviceId;
  }
}

$('camSelect').addEventListener('change', async () => {
  setStatus('正在切换摄像头…');
  const ok = await startCamera($('camSelect').value);
  if (ok) { setStatus(''); selectSource('camera'); $('camPicker').hidden = false; }
  else setStatus(vision.err);
});

$('pickBtn').addEventListener('click', startPick);
$('showCam').addEventListener('change', e => {
  $('camwrap').hidden = !e.target.checked || state.source !== 'camera';
});

/* 摄像头模式下 vision 每帧都会调 draw()，这里只负责叠加层和状态行 */
(function overlayLoop() {
  if (state.source === 'camera') {
    if (!$('camwrap').hidden) drawOverlay();
    updateCamHint();
  }
  requestAnimationFrame(overlayLoop);
})();
