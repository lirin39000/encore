/* ============================================================
   app.js —— 画面绘制与交互
   世界坐标：单位「米」，原点在地面正中，y 轴向上。
   ============================================================ */

/* ---------------- 状态 ---------------- */
const state = {
  mode: 'A',
  span: 4.0,        // 横梁跨度 (m)
  beamY: 2.90,      // 横梁中心离地高度 (m)
  drop: 0.26,       // 滑轮挂钩低于横梁中心的距离 (m)

  pulleyX: [-1.00, 1.00],       // 两个滑轮的 x

  anchorA: { x: 0, y: 1.42 },   // 模式A：挂点位置
  massA: 35,

  massB1: 40, massB2: 28,
  ropeLen: 1.30,                // 模式B 绳长（固定）
  thetaB1: 14 * Math.PI / 180,  // 模式B：左侧学生的摆角

  opt: { parallel: true, values: true },   // 固定：画平行四边形和数值，不画角度

  source: 'mouse',              // 'mouse' 鼠标模拟 | 'camera' 摄像头实测
  pulleyY: null,                // 摄像头模式下滑轮的真实高度，鼠标模拟时为 null
};

const COLOR = {
  G: '#5b8cff', T1: '#ff3d81', T2: '#ffb020', F: '#b06bff',
  R: '#22d3ee', R_LIGHT: 'rgba(34,211,238,.45)',   // 合力与平行四边形的虚线
  ink: '#e7edfb', ink2: '#93a4c3', ink3: '#5b6d90',
  steel: '#2e3b56', steelDark: '#7d93bd', line: 'rgba(125,163,222,.25)',
  accent: '#22d3ee',
};

/* ---------------- 画布与坐标变换 ---------------- */
const cv = document.getElementById('scene');
const ctx = cv.getContext('2d');
let view = { s: 100, ox: 0, oy: 0 }; // s = 每米多少像素

function worldBox() {
  // 摄像头模式下滑轮位置由点选决定，用一个固定的大视野框住，避免画面随人晃动而缩放
  if (state.source === 'camera') return { x0: -2.9, x1: 2.9, y0: -0.15, y1: 3.35 };
  return {
    x0: -state.span / 2 - 0.75, x1: state.span / 2 + 0.75,
    y0: -0.12, y1: state.beamY + 0.55,
  };
}

function resize() {
  const box = worldBox();
  const ww = box.x1 - box.x0, wh = box.y1 - box.y0;
  const cssW = cv.parentElement.clientWidth;
  const cssH = Math.max(360, Math.min(640, cssW * wh / ww));
  const dpr = window.devicePixelRatio || 1;

  cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  view.s = Math.min(cssW / ww, cssH / wh);
  view.ox = (cssW - ww * view.s) / 2 - box.x0 * view.s;
  view.oy = (cssH - wh * view.s) / 2 + box.y1 * view.s;
}

const X = wx => wx * view.s + view.ox;          // 世界x -> 屏幕x
const Y = wy => view.oy - wy * view.s;          // 世界y -> 屏幕y
const S = p => ({ x: X(p.x), y: Y(p.y) });
const invX = sx => (sx - view.ox) / view.s;
const invY = sy => (view.oy - sy) / view.s;

/* ---------------- 绘图基元 ---------------- */
function line(a, b, color, w, dash) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

function arrow(from, to, color, w, label) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const ux = dx / len, uy = dy / len;
  const head = Math.min(15, len * 0.34);
  const bx = to.x - ux * head, by = to.y - uy * head;

  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(bx - uy * head * 0.40, by + ux * head * 0.40);
  ctx.lineTo(bx + uy * head * 0.40, by - ux * head * 0.40);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  if (label && state.opt.values) {
    const lx = to.x + ux * 16, ly = to.y + uy * 16;
    ctx.save();
    ctx.font = '700 13px ui-monospace,"Consolas",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w2 = ctx.measureText(label).width / 2 + 5;
    ctx.fillStyle = 'rgba(6,10,20,.82)';
    ctx.fillRect(lx - w2, ly - 9, w2 * 2, 18);
    ctx.strokeStyle = 'rgba(125,163,222,.35)'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - w2, ly - 9, w2 * 2, 18);
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.fillText(label, lx, ly);
    ctx.restore();
  }
}

function text(str, x, y, color, font, align, baseline) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font || '13px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillText(str, x, y);
  ctx.restore();
}

/* ---------------- 场景：龙门架 ---------------- */
/* 摄像头模式下没有「跨度」这个已知量，横梁就按两个滑轮的连线来画，
   两端各外延一段。这样画出来的横梁一定穿过两个滑轮，和实物对得上。 */
function drawRigFromPulleys() {
  const P1 = pulleyPos(0), P2 = pulleyPos(1);
  const d = vunit(vsub(P2, P1)), ext = 0.75;
  const a = vadd(P1, vmul(d, -ext)), b = vadd(P2, vmul(d, ext));

  line({ x: X(-99), y: Y(0) }, { x: X(99), y: Y(0) }, 'rgba(140,178,255,.16)', 3);

  ctx.save();
  ctx.strokeStyle = COLOR.steel; ctx.lineWidth = Math.max(6, 0.11 * view.s);
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(34,211,238,.25)'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y)); ctx.lineTo(X(b.x), Y(b.y)); ctx.stroke();
  ctx.restore();

  // 立柱：从横梁两端斜着落地，只是让画面像个龙门架，不参与任何计算
  [a, b].forEach((p, i) => {
    const out = (i ? 1 : -1) * 0.55;
    line({ x: X(p.x), y: Y(p.y) }, { x: X(p.x + out), y: Y(0) }, COLOR.steel, 7);
  });
}

function drawRig() {
  if (state.source === 'camera') return drawRigFromPulleys();
  const half = state.span / 2;
  const by = state.beamY;
  const ceil = by + 0.42;

  // 天花板
  line({ x: X(-99), y: Y(ceil) }, { x: X(99), y: Y(ceil) }, 'rgba(140,178,255,.14)', 10);
  // 吊杆
  for (let i = -2; i <= 2; i++) {
    const x = i * state.span / 4.4;
    line({ x: X(x), y: Y(ceil) }, { x: X(x), y: Y(by + 0.05) }, 'rgba(140,178,255,.18)', 2);
  }
  // 地面
  line({ x: X(-99), y: Y(0) }, { x: X(99), y: Y(0) }, 'rgba(140,178,255,.16)', 3);

  // 立柱（斜撑）
  [-1, 1].forEach(s => {
    line({ x: X(s * half), y: Y(by) }, { x: X(s * (half + 0.62)), y: Y(0) }, COLOR.steel, 9);
    line({ x: X(s * (half - 0.05)), y: Y(by - 0.55) }, { x: X(s * (half + 0.50)), y: Y(0) }, COLOR.steel, 6);
  });

  // 横梁
  ctx.save();
  ctx.fillStyle = COLOR.steel; ctx.strokeStyle = COLOR.steelDark; ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(34,211,238,.25)'; ctx.shadowBlur = 8;
  const bh = 0.11 * view.s;
  ctx.beginPath();
  ctx.roundRect(X(-half), Y(by) - bh / 2, state.span * view.s, bh, 4);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  text(state.span.toFixed(1) + ' m', X(0), Y(by) - 22, COLOR.ink3, '12px ui-monospace,"Consolas",monospace');
}

/* 摄像头点选滑轮时会写入 state.pulleyY（滑轮的真实高度）；
   鼠标模拟时没有这一项，退回到「横梁下方固定一段」。 */
function pulleyPos(i) {
  const y = state.pulleyY && state.pulleyY[i];
  return { x: state.pulleyX[i], y: (y === undefined || y === null) ? state.beamY - state.drop : y };
}

function drawTrolley(i) {
  const cam = state.source === 'camera';
  const hookW = pulleyPos(i);
  const hook = S(hookW);
  // 摄像头模式下滑轮位置就是点选的那个点，小车画在它正上方一点
  const bodyY = cam ? hookW.y + 0.16 : state.beamY;
  const sx = hook.x;

  ctx.save();
  ctx.fillStyle = '#3a4a6b'; ctx.strokeStyle = COLOR.steelDark; ctx.lineWidth = 1.5;
  const w = 0.30 * view.s, h = 0.22 * view.s;
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, Y(bodyY) - 0.05 * view.s, w, h, 3);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // 挂钩
  line({ x: sx, y: Y(bodyY - 0.17) }, hook, COLOR.steelDark, 3);
  ctx.save();
  ctx.fillStyle = '#9db3dc';
  ctx.beginPath(); ctx.arc(hook.x, hook.y, 5, 0, 7); ctx.fill();
  ctx.restore();

  // 拖拽把手（摄像头模式下位置由点选决定，不显示）
  if (!cam) {
    ctx.save();
    ctx.strokeStyle = COLOR.accent;
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, Y(state.beamY + 0.03), 15, 0, 7); ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- 绳（只是绳，不是力）---------------- */
/* 绳画到「手」为止：手下方那截绳与手臂重叠，画出来会被看成第二条手臂 */
const ROPE = '#7d93bd';
function drawRope(pulley, hand, slack) {
  line(S(pulley), S(hand), slack ? 'rgba(125,147,189,.4)' : ROPE, 2.4, slack ? [6, 5] : null);
}

/* ---------------- 人 ----------------
   anchor = 背带挂点（绳真正接在人身上的位置，在躯干前方）
   com    = 重心，位于挂点正下方；所有力矢量都画在这里
   hands  = 两只手要伸向的世界坐标（各握住一侧的绳，或伸向对方）
   ---------------------------------------------------- */
/* 人体尺寸，全部相对重心，单位米（约 1.32m 高的学生） */
const BODY = {
  head: 0.50, headR: 0.115,   // 头心高度 / 半径（实心圆）
  neck: 0.32,                 // 肩线高度
  shoulder: 0.075,            // 肩半宽（肩线会把两侧肩点和躯干连成一体）
  hip: -0.08,
  foot: -0.70, footX: 0.055,  // 双腿并拢、笔直向下
  arm: 0.50,                  // 手臂长（肩到手）
};
// 挂点与重心取同一点：这样「绳」「手臂」「拉力箭头」落在同一条线上，
// 也正是质点模型该有的样子（各力共点）。
const COM_BELOW = 0;
const HEAD_ABOVE = BODY.head + BODY.headR - COM_BELOW;  // 头顶高于挂点
const FEET_BELOW = -BODY.foot + COM_BELOW;              // 脚底低于挂点
const comOf = a => ({ x: a.x, y: a.y - COM_BELOW });

/* 最简火柴人：躯干、双腿、每条手臂各一根粗线，头是实心圆
   comArm[i] = true 时，第 i 条手臂改从挂点（重心）画起，而不是从肩画起——
   这样绳子、拉力箭头、手臂三条线才能真正重合成一条直线（都过挂点、都沿同一方向）。 */
function drawPerson(anchor, hands, tone, comArm) {
  const s = view.s, c = tone || '#9fb3d6';
  const com = comOf(anchor);
  const C = S(com);
  const at = (dx, dy) => ({ x: C.x + dx * s, y: C.y - dy * s });   // 世界偏移 -> 屏幕

  const neck = at(0, BODY.neck), hip = at(0, BODY.hip);
  const sh = [at(-BODY.shoulder, BODY.neck), at(BODY.shoulder, BODY.neck)];
  const head = at(0, BODY.head);
  const foot = [at(-BODY.footX, BODY.foot), at(BODY.footX, BODY.foot)];

  ctx.save();
  ctx.strokeStyle = c; ctx.fillStyle = c;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // 躯干、双腿。躯干这根竖线正好穿过挂点（重心），所以从挂点出发的手臂天然贴着身体，
  // 不需要再画一根肩线去接——那样反而会在头下面凭空多出一横。
  // 只有从肩出发的手臂（comArm[i] 为假）才需要一小截肩部短线，把手臂接到躯干上。
  ctx.lineWidth = Math.max(4, 0.055 * s);
  ctx.beginPath();
  ctx.moveTo(neck.x, neck.y); ctx.lineTo(hip.x, hip.y);
  for (let i = 0; i < 2; i++) {
    if (!(comArm && comArm[i])) { ctx.moveTo(neck.x, neck.y); ctx.lineTo(sh[i].x, sh[i].y); }
  }
  for (let i = 0; i < 2; i++) { ctx.moveTo(hip.x, hip.y); ctx.lineTo(foot[i].x, foot[i].y); }
  ctx.stroke();

  // 手臂：一端在肩（或挂点）、一端在绳（或对方手上），一根直线
  ctx.lineWidth = Math.max(3.5, 0.048 * s);
  ctx.beginPath();
  for (let i = 0; i < 2; i++) {
    const H = S(hands[i]);
    const from = (comArm && comArm[i]) ? C : sh[i];
    ctx.moveTo(from.x, from.y); ctx.lineTo(H.x, H.y);
  }
  ctx.stroke();

  // 头：实心圆
  ctx.beginPath(); ctx.arc(head.x, head.y, BODY.headR * s, 0, 7); ctx.fill();
  ctx.restore();

  return com;
}

/* 手落在绳上：直接沿「挂点→滑轮」这条线量出一臂长。
   手臂现在就从挂点画起，于是绳、拉力箭头、手臂天然共线（都是同一条线上的不同线段）。 */
function handOnRope(anchor, pulley) {
  const d = vunit(vsub(pulley, anchor));
  const ropeLen = vlen(vsub(pulley, anchor));
  const t = clamp(BODY.arm, 0.06, ropeLen - 0.05);
  return vadd(anchor, vmul(d, t));
}

/* 伸向对方的手：横向够得着就落在 targetX（手臂自然斜下垂），
   够不着就伸直到最远处，中间由虚线补上。手臂长度始终等于 BODY.arm。 */
function handToward(shoulder, targetX, side) {
  const dx = targetX - shoulder.x;
  if (Math.abs(dx) >= BODY.arm) return { x: shoulder.x + side * BODY.arm, y: shoulder.y };
  return { x: targetX, y: shoulder.y - Math.sqrt(BODY.arm * BODY.arm - dx * dx) };
}

/* 重心记号：物理书里的 ⊕（对角两象限填黑） */
function drawCoM(com) {
  const p = S(com), r = 7;
  ctx.save();
  ctx.shadowColor = 'rgba(34,211,238,.7)'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7);
  ctx.fillStyle = '#eef4ff'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#070b14';
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, r, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#070b14'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke();
  ctx.restore();
}


/* ---------------- 力的比例尺 ---------------- */
let pxPerN = 0.3;
function updateForceScale(G, maxF) {
  const target = Math.min(115 / Math.max(G, 1), 235 / Math.max(maxF, 1));
  pxPerN += (target - pxPerN) * 0.25;   // 平滑，避免数字跳动
}
const fvec = (from, dir, mag, color, label) => {
  const a = S(from);
  arrow(a, { x: a.x + dir.x * mag * pxPerN, y: a.y - dir.y * mag * pxPerN }, color, 3.4, label);
};

/* ---------------- 主绘制 ---------------- */
let last = null;   // 最近一次计算结果，供读数与图表使用

/* 摄像头模式：滑轮来自画面点选，人来自 MediaPipe。
   都换算成世界坐标灌进 state，后面的绘制逻辑完全不用改。 */
function syncFromVision() {
  if (state.source !== 'camera' || typeof vision === 'undefined' || !vision.ready) return null;
  const pw = pulleyWorld();
  if (!pw) return null;
  state.pulleyX = [pw[0].x, pw[1].x];
  state.pulleyY = [pw[0].y, pw[1].y];

  const miss = [];
  const need = state.mode === 'A' ? 1 : 2;
  const ps = vision.out.persons;
  if (state.mode === 'A' && ps[0]) state.anchorA = { x: ps[0].x, y: ps[0].y };
  if (ps.length < need) miss.push('人（识别到 ' + ps.length + '/' + need + '）');
  return { miss, persons: ps };
}

function draw() {
  // 先同步识别结果，横梁要按最新的滑轮位置来画
  const live = syncFromVision();

  resize();
  ctx.clearRect(0, 0, cv.width, cv.height);
  drawRig();

  if (state.mode === 'A') drawModeA();
  else if (live && live.persons.length === 2) drawModeBLive(live.persons);
  else drawModeB();

  drawTrolley(0);
  drawTrolley(1);
  renderReadout();

  if (live && live.miss.length) setWarn('没识别到：' + live.miss.join('、') + '（保持上一次位置）');
}

/* ===== 模式 A ===== */
function drawModeA() {
  const G = state.massA * G_ACC;
  const P1 = pulleyPos(0), P2 = pulleyPos(1);
  const a = state.anchorA;
  const r = solveTwoRopes(a, P1, P2, G);
  last = { mode: 'A', G, ...r };

  // 双手分别握住两侧的绳；绳画到手为止（浅灰，与力矢量区分开）
  const com = comOf(a);
  const hands = [handOnRope(a, P1), handOnRope(a, P2)];
  drawRope(P1, hands[0], r.slack);
  drawRope(P2, hands[1], r.slack);
  drawPerson(a, hands, null, [true, true]);
  drawCoM(com);

  updateForceScale(G, Math.max(G, Math.abs(r.T1), Math.abs(r.T2)));

  // 所有力都作用在重心上（质点模型）
  if (!r.slack) {
    if (state.opt.parallel) {
      const sc = S(com);
      const v1 = { x: r.u1.x * r.T1 * pxPerN, y: -r.u1.y * r.T1 * pxPerN };
      const v2 = { x: r.u2.x * r.T2 * pxPerN, y: -r.u2.y * r.T2 * pxPerN };
      const sum = { x: sc.x + v1.x + v2.x, y: sc.y + v1.y + v2.y };
      line({ x: sc.x + v1.x, y: sc.y + v1.y }, sum, COLOR.R_LIGHT, 1.6, [5, 4]);
      line({ x: sc.x + v2.x, y: sc.y + v2.y }, sum, COLOR.R_LIGHT, 1.6, [5, 4]);
      arrow(sc, sum, COLOR.R, 2.6, state.opt.values ? '合力 ' + Math.round(G) + ' N' : '');
    }
    fvec(com, r.u1, r.T1, COLOR.T1, Math.round(r.T1) + ' N');
    fvec(com, r.u2, r.T2, COLOR.T2, Math.round(r.T2) + ' N');
  }
  fvec(com, { x: 0, y: -1 }, G, COLOR.G, Math.round(G) + ' N');

  setWarn(r.slack
    ? '这个位置绳会松弛（绳只能拉、不能推），现实中无法平衡'
    : (Math.max(r.T1, r.T2) > 2.5 * G
      ? '注意：绳张力已达体重的 ' + (Math.max(r.T1, r.T2) / G).toFixed(1) + ' 倍'
      : ''));
}

/* ===== 模式 B ===== */
/* 右侧绳长自动配平，使两人挂点等高——这样「相互作用力沿水平方向」
   在几何上才是自洽的（现实中就是把两边绳子调到一样的高度）。 */
const MIN_GAP = 0.42;   // 两人之间至少留出的水平距离 (m)

function geomB(th1, G1, G2, L) {
  const th2 = G2 > 1e-6 ? Math.atan(G1 * Math.tan(th1) / G2) : 0;
  const P1 = pulleyPos(0), P2 = pulleyPos(1);
  const h = L * Math.cos(th1);                 // 挂点低于滑轮的竖直距离
  const a1 = { x: P1.x + L * Math.sin(th1), y: P1.y - h };
  const a2 = { x: P2.x - h * Math.tan(th2), y: P2.y - h };
  return { th2, a1, a2, gap: a2.x - a1.x };
}

// 两人不能重叠：二分出允许的最大摆角
function maxThetaB(G1, G2, L) {
  let lo = 0, hi = 58 * Math.PI / 180;
  if (geomB(hi, G1, G2, L).gap >= MIN_GAP) return hi;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (geomB(m, G1, G2, L).gap >= MIN_GAP) lo = m; else hi = m;
  }
  return lo;
}

function drawModeB() {
  const G1 = state.massB1 * G_ACC, G2 = state.massB2 * G_ACC;
  const L = state.ropeLen;
  const P1 = pulleyPos(0), P2 = pulleyPos(1);

  state.thetaB1 = clamp(state.thetaB1, 0, maxThetaB(G1, G2, L));
  const g = geomB(state.thetaB1, G1, G2, L);
  const r = solveInteraction(state.thetaB1, G1, G2);
  last = { mode: 'B', G1, G2, ...r };

  const a1 = g.a1, a2 = g.a2;
  const u1 = vunit(vsub(P1, a1)), u2 = vunit(vsub(P2, a2));

  // 外侧手握自己的绳，内侧手伸向对方
  const com1 = comOf(a1), com2 = comOf(a2);
  const midX = (a1.x + a2.x) / 2;
  const inner1 = handToward(com1, midX, 1);
  const inner2 = handToward(com2, midX, -1);
  const outer1 = handOnRope(a1, P1);
  const outer2 = handOnRope(a2, P2);
  drawRope(P1, outer1, false);
  drawRope(P2, outer2, false);
  // 两条手臂都从挂点画起：一条沿绳，一条伸向对方，方向不同但起点相同，
  // 不会出现「一只手贴腰、一只手贴肩」那种一高一低的错位。
  drawPerson(a1, [outer1, inner1], null, [true, true]);
  drawPerson(a2, [inner2, outer2], null, [true, true]);
  // 两人之间的连接（手拉手 / 中间一段短绳）
  line(S(inner1), S(inner2), ROPE, 2.2, [6, 5]);
  drawCoM(com1); drawCoM(com2);

  updateForceScale(Math.max(G1, G2), Math.max(G1, G2, r.T1, r.T2));

  fvec(com1, u1, r.T1, COLOR.T1, Math.round(r.T1) + ' N');
  fvec(com2, u2, r.T2, COLOR.T2, Math.round(r.T2) + ' N');
  fvec(com1, { x: 0, y: -1 }, G1, COLOR.G, Math.round(G1) + ' N');
  fvec(com2, { x: 0, y: -1 }, G2, COLOR.G, Math.round(G2) + ' N');
  // 相互作用力：一对方向相反、大小相等
  fvec(com1, { x: 1, y: 0 }, r.F, COLOR.F, Math.round(r.F) + ' N');
  fvec(com2, { x: -1, y: 0 }, r.F, COLOR.F, Math.round(r.F) + ' N');

  const lighter = G1 < G2 ? '左' : '右';
  setWarn(Math.abs(G1 - G2) > 20 && r.F > 20
    ? '体重较轻的' + lighter + '侧学生，摆角明显更大——这正是牛顿第三定律的直接体现'
    : '');
}

/* ===== 模式 B · 摄像头实测 =====
   模拟版是「给一个摆角，推出另一个」；实测版两个人的位置都是量出来的，
   于是可以对每个人各自独立算一遍相互作用力：

       竖直:  T·u_y = G      ->  T = G / u_y
       水平:  T·u_x + F = 0  ->  F = -G · u_x / u_y   (= ∓G·tanθ)

   牛顿第三定律要求 F₁ 和 F₂ 大小相等、方向相反。两个独立测量值差多少，
   就是当前这套装置的测量误差——这本身就很值得给学生看。               */
function drawModeBLive(persons) {
  const G1 = state.massB1 * G_ACC, G2 = state.massB2 * G_ACC;
  const P = [pulleyPos(0), pulleyPos(1)];
  const a = [persons[0], persons[1]];
  const G = [G1, G2];

  const u = [vunit(vsub(P[0], a[0])), vunit(vsub(P[1], a[1]))];
  const T = [], Fx = [], th = [];
  for (let i = 0; i < 2; i++) {
    const uy = Math.max(u[i].y, 1e-3);            // 人必须吊在滑轮下方
    T[i] = G[i] / uy;
    Fx[i] = -G[i] * u[i].x / uy;                  // 带符号：正=受到向右的力
    th[i] = Math.acos(clamp(u[i].y, -1, 1));
  }
  const F = (Math.abs(Fx[0]) + Math.abs(Fx[1])) / 2;
  const mismatch = Math.abs(Math.abs(Fx[0]) - Math.abs(Fx[1]));

  last = { mode: 'B', live: true, G1, G2, T1: T[0], T2: T[1],
           theta1: th[0], theta2: th[1], F, F1: Math.abs(Fx[0]), F2: Math.abs(Fx[1]), mismatch };

  const com = [comOf(a[0]), comOf(a[1])];
  const midX = (a[0].x + a[1].x) / 2;
  const outer = [handOnRope(a[0], P[0]), handOnRope(a[1], P[1])];
  const inner = [handToward(com[0], midX, 1), handToward(com[1], midX, -1)];
  drawRope(P[0], outer[0], false);
  drawRope(P[1], outer[1], false);
  drawPerson(a[0], [outer[0], inner[0]], null, [true, true]);
  drawPerson(a[1], [inner[1], outer[1]], null, [true, true]);
  line(S(inner[0]), S(inner[1]), ROPE, 2.2, [6, 5]);
  drawCoM(com[0]); drawCoM(com[1]);

  updateForceScale(Math.max(G1, G2), Math.max(G1, G2, T[0], T[1]));

  for (let i = 0; i < 2; i++) {
    fvec(com[i], u[i], T[i], i ? COLOR.T2 : COLOR.T1, Math.round(T[i]) + ' N');
    fvec(com[i], { x: 0, y: -1 }, G[i], COLOR.G, Math.round(G[i]) + ' N');
    if (Math.abs(Fx[i]) > 1)
      fvec(com[i], { x: Math.sign(Fx[i]), y: 0 }, Math.abs(Fx[i]), COLOR.F, Math.round(Math.abs(Fx[i])) + ' N');
  }

  // 两个独立测得的 F 差得太多，通常是人晃出了摄像头正对的那个平面，或体重填错了
  setWarn(F > 25 && mismatch / F > 0.25
    ? '左右两侧测得的相互作用力相差 ' + Math.round(mismatch) + ' N —— 检查体重是否填对、人有没有前后晃出平面'
    : '');
}

function setWarn(msg) {
  const el = document.getElementById('warn');
  el.textContent = msg;
  el.hidden = !msg;
}

/* ---------------- 右侧读数 ---------------- */
function row(k, v, u, extra, color) {
  return `<div class="row">
    <span class="k">${color ? `<i class="swatch" style="background:${color}"></i>` : ''}${k}</span>
    ${extra ? `<span class="x">${extra}</span>` : ''}
    <span class="v">${v}</span><span class="u">${u}</span>
  </div>`;
}

function renderReadout() {
  const el = document.getElementById('readout');
  if (!last) return;

  if (last.mode === 'A') {
    const { G, T1, T2, theta1, theta2, slack } = last;
    el.innerHTML =
      row('重力 G', Math.round(G), 'N', state.massA + ' kg', COLOR.G) +
      (slack
        ? `<p class="sub">当前位置无法平衡，绳会松弛。</p>`
        : row('左绳张力 T₁', Math.round(T1), 'N', toDeg(theta1).toFixed(1) + '°', COLOR.T1) +
          row('右绳张力 T₂', Math.round(T2), 'N', toDeg(theta2).toFixed(1) + '°', COLOR.T2) +
          row('两绳夹角', (toDeg(theta1) + toDeg(theta2)).toFixed(1), '°', '') +
          row('张力 / 体重', (Math.max(T1, T2) / G).toFixed(2), '倍', ''));
  } else {
    const { G1, G2, T1, T2, F, F1, F2, theta1, theta2, live, mismatch } = last;
    el.innerHTML =
      row('左侧重力 G₁', Math.round(G1), 'N', state.massB1 + ' kg', COLOR.G) +
      row('左绳张力 T₁', Math.round(T1), 'N', toDeg(theta1).toFixed(1) + '°', COLOR.T1) +
      row('右侧重力 G₂', Math.round(G2), 'N', state.massB2 + ' kg', COLOR.G) +
      row('右绳张力 T₂', Math.round(T2), 'N', toDeg(theta2).toFixed(1) + '°', COLOR.T2) +
      (live
        // 实测：两侧各自独立算出的 F，理论上应该相等
        ? row('左侧测得 F₁', Math.round(F1), 'N', 'G₁·tanθ₁', COLOR.F) +
          row('右侧测得 F₂', Math.round(F2), 'N', 'G₂·tanθ₂', COLOR.F) +
          row('两者之差', Math.round(mismatch), 'N',
              F > 1 ? (mismatch / F * 100).toFixed(0) + '%' : '')
        : row('相互作用力 F', Math.round(F), 'N', '一对', COLOR.F));
  }
}

/* ---------------- 交互 ---------------- */
let dragging = null;

function hitTest(sx, sy) {
  if (state.source === 'camera') return null;   // 位置全部由摄像头决定
  const near = (p, r) => Math.hypot(sx - p.x, sy - p.y) < r;
  for (let i = 0; i < 2; i++) {
    if (near({ x: X(state.pulleyX[i]), y: Y(state.beamY + 0.03) }, 20)) return 'p' + i;
    if (near({ x: X(state.pulleyX[i]), y: Y(state.beamY - 0.14) }, 20)) return 'p' + i;
  }
  if (state.mode === 'A') {
    if (near(S(state.anchorA), 26)) return 'a';
  } else {
    const P1 = pulleyPos(0), L = state.ropeLen;
    const a1 = { x: P1.x + L * Math.sin(state.thetaB1), y: P1.y - L * Math.cos(state.thetaB1) };
    if (near(S(a1), 30)) return 'b1';
  }
  return null;
}

function pointerPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

cv.addEventListener('pointerdown', e => {
  const p = pointerPos(e);
  dragging = hitTest(p.x, p.y);
  if (dragging) { cv.setPointerCapture(e.pointerId); moveTo(p); }
});
cv.addEventListener('pointermove', e => {
  const p = pointerPos(e);
  if (dragging) { moveTo(p); return; }
  cv.style.cursor = hitTest(p.x, p.y) ? 'grab' : 'default';
});
cv.addEventListener('pointerup', () => { dragging = null; cv.style.cursor = 'default'; });
cv.addEventListener('pointercancel', () => { dragging = null; });

function moveTo(p) {
  const wx = invX(p.x), wy = invY(p.y);
  const half = state.span / 2;

  if (dragging === 'p0' || dragging === 'p1') {
    const i = dragging === 'p0' ? 0 : 1;
    let v = clamp(wx, -half + 0.25, half - 0.25);
    // 两个滑轮不能穿过对方
    if (i === 0) v = Math.min(v, state.pulleyX[1] - 0.45);
    else v = Math.max(v, state.pulleyX[0] + 0.45);
    state.pulleyX[i] = v;
  } else if (dragging === 'a') {
    const box = worldBox();
    state.anchorA.x = clamp(wx, box.x0 + 0.35, box.x1 - 0.35);
    // 下限：脚不穿到地面以下；上限：头顶不超过滑轮
    state.anchorA.y = clamp(wy,
      FEET_BELOW + 0.08,
      state.beamY - state.drop - HEAD_ABOVE - 0.05);
  } else if (dragging === 'b1') {
    const P1 = pulleyPos(0);
    const sin = clamp((wx - P1.x) / state.ropeLen, -0.95, 0.95);
    const lim = maxThetaB(state.massB1 * G_ACC, state.massB2 * G_ACC, state.ropeLen);
    state.thetaB1 = clamp(Math.asin(sin), 0, lim);
  }
  draw();
}

/* ---------------- 控件绑定 ---------------- */
function bindRange(id, key, fmt, after) {
  const el = document.getElementById(id), out = document.getElementById(id + 'Out');
  const apply = () => {
    state[key] = parseFloat(el.value);
    out.textContent = fmt(state[key]);
    if (after) after();
    draw();
  };
  el.addEventListener('input', apply);
  apply();
}

bindRange('massA', 'massA', v => v + ' kg');
bindRange('massB1', 'massB1', v => v + ' kg');
bindRange('massB2', 'massB2', v => v + ' kg');

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.mode = btn.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.ctl[data-mode]').forEach(c => {
      c.hidden = c.dataset.mode !== state.mode;
    });
    document.getElementById('hint').innerHTML = state.mode === 'A'
      ? '拖动<b>滑轮</b>或<b>人</b>，观察两绳张力如何变化'
      : '拖动<b>左侧学生</b>让两人互拉，或拖动<b>滑轮</b>';
    setWarn('');
    draw();
  });
});

document.getElementById('reset').addEventListener('click', () => {
  state.pulleyX = [-Math.min(1.0, state.span / 2 - 0.5), Math.min(1.0, state.span / 2 - 0.5)];
  state.anchorA = { x: 0, y: 1.42 };
  state.thetaB1 = 14 * Math.PI / 180;
  draw();
});

// 监听容器尺寸变化：首帧布局尚未稳定时宽度可能是 0，
// 只靠 window.resize 会导致画布一直空白。
new ResizeObserver(() => draw()).observe(document.getElementById('stage'));
window.addEventListener('resize', draw);
draw();
