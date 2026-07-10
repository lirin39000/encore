// 1:1 移植自设计稿 场次.dc.html 里的 DARK_THEME（原型里 LIGHT_THEME 是死代码，renderVals() 永远用 DARK_THEME）
export const theme = {
  bg: "#1B1512",
  panel: "#2A211C",
  subtle: "#241C17",
  text: "#F2ECE1",
  textSec: "rgba(242,236,225,0.62)",
  border: "rgba(255,255,255,0.14)",
  glassBg: "rgba(42,33,28,0.55)",
  glassBorder: "rgba(255,255,255,0.14)",
  accent: "#C4472E",
  gold: "#B8862E",
} as const;

export const fontSerif = "'Noto Serif SC', serif";
export const fontSans = "'Noto Sans SC', sans-serif";
