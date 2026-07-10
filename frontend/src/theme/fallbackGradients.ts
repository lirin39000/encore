// 没有海报图时的兜底渐变色，配色跟设计稿 data.js 里的示例数据保持一致
export const FALLBACK_GRADIENTS = [
  'linear-gradient(135deg,#C4472E,#7A2A1B)',
  'linear-gradient(135deg,#2A2320,#6B5F55)',
  'linear-gradient(135deg,#B8862E,#5C4210)',
  'linear-gradient(135deg,#6B5F55,#2A2320)',
  'linear-gradient(135deg,#C4472E,#2A2320)',
]

export function pickFallbackGradient(id: number): string {
  return FALLBACK_GRADIENTS[id % FALLBACK_GRADIENTS.length]
}
