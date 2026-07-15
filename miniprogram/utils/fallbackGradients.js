// 跟网页版 frontend/src/theme/fallbackGradients.ts 保持一致
// WXSS 的 linear-gradient 语法跟 CSS 一样，可以直接用同样的字符串
const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg,#C4472E,#7A2A1B)',
  'linear-gradient(135deg,#2A2320,#6B5F55)',
  'linear-gradient(135deg,#B8862E,#5C4210)',
  'linear-gradient(135deg,#6B5F55,#2A2320)',
  'linear-gradient(135deg,#C4472E,#2A2320)',
]

function pickFallbackGradient(id) {
  return FALLBACK_GRADIENTS[id % FALLBACK_GRADIENTS.length]
}

module.exports = { FALLBACK_GRADIENTS, pickFallbackGradient }
