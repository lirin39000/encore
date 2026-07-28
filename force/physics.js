/* ============================================================
   physics.js —— 受力计算
   这里只做物理，不碰画面。所有力的单位是牛顿(N)，角度用弧度。
   ============================================================ */

const G_ACC = 9.8; // 重力加速度 m/s^2

/* ---------- 小工具：二维向量 ---------- */
function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function vlen(v) { return Math.hypot(v.x, v.y); }
function vunit(v) { const L = vlen(v) || 1e-9; return { x: v.x / L, y: v.y / L }; }
function vadd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function vmul(v, k) { return { x: v.x * k, y: v.y * k }; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function toDeg(r) { return r * 180 / Math.PI; }

/* ============================================================
   模式 A：一个人由两根绳分别吊在两个滑轮上
   把人看成质点，两根绳的拉力和重力共同作用于「挂点」。

   平衡条件：T1·u1 + T2·u2 + (0, -G) = 0
   其中 u1、u2 是由挂点指向两个滑轮的单位向量（y 轴向上为正）。
   ============================================================ */
function solveTwoRopes(anchor, P1, P2, G) {
  const u1 = vunit(vsub(P1, anchor));
  const u2 = vunit(vsub(P2, anchor));

  // 解二元一次方程组（克拉默法则）
  //   T1·u1x + T2·u2x = 0
  //   T1·u1y + T2·u2y = G
  const D = u1.x * u2.y - u2.x * u1.y;

  let T1 = NaN, T2 = NaN;
  if (Math.abs(D) > 1e-6) {
    T1 = (-u2.x * G) / D;
    T2 = (u1.x * G) / D;
  }

  return {
    T1, T2, u1, u2,
    theta1: Math.acos(clamp(u1.y, -1, 1)), // 与竖直方向的夹角
    theta2: Math.acos(clamp(u2.y, -1, 1)),
    // 绳只能拉不能推：出现负值说明这个位置在现实中站不住
    slack: !(T1 >= 0 && T2 >= 0),
  };
}

/* ============================================================
   模式 B：两人各吊在一个滑轮下，水平互拉（或互推）

   对每个人：竖直方向  T·cosθ = G     -> T = G / cosθ
             水平方向  T·sinθ = F     -> F = G·tanθ
   牛顿第三定律要求两人受到的 F 大小相等，于是
             G1·tanθ1 = G2·tanθ2
   ——体重轻的那个人必然荡开更大的角度。

   模型假设：两人之间的相互作用力沿水平方向。
   ============================================================ */
function solveInteraction(theta1, G1, G2) {
  const F = G1 * Math.tan(theta1);
  const theta2 = G2 > 1e-6 ? Math.atan(F / G2) : 0;
  return {
    F,
    theta1,
    theta2,
    T1: G1 / Math.cos(theta1),
    T2: G2 / Math.cos(theta2),
  };
}
