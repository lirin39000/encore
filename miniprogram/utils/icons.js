// 跟网页版 ShowCard.tsx 里那个心形收藏图标的 SVG path 完全一致，
// 转成 data URI 因为原生小程序 WXML 不能直接写 <svg> 标签。
// 用 base64 编码(不是 percent-encode)，小程序的 <image> 组件对 base64 格式的
// data URI 兼容性明显更好。注意：这段代码是跑在小程序自己的 JS 运行时里，
// 不是 Node.js，不能用 Buffer 这个 Node 专属的全局对象，得手写一个纯 JS 的
// base64 编码(内容全是 ASCII 字符，不用考虑多字节字符编码这些复杂情况)
const HEART_PATH =
  'M12 6.5C10.5 4 8.3 3 6.2 3 3 3 0.8 5.5 0.8 8.6c0 5.2 6 8.9 11.2 12.9 5.2-4 11.2-7.7 11.2-12.9C23.2 5.5 21 3 17.8 3c-2.1 0-4.3 1-5.8 3.5z'

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64EncodeAscii(str) {
  let out = ''
  for (let i = 0; i < str.length; i += 3) {
    const b1 = str.charCodeAt(i)
    const b2 = i + 1 < str.length ? str.charCodeAt(i + 1) : null
    const b3 = i + 2 < str.length ? str.charCodeAt(i + 2) : null

    out += B64_CHARS[b1 >> 2]
    out += B64_CHARS[((b1 & 0x03) << 4) | (b2 === null ? 0 : b2 >> 4)]
    out += b2 === null ? '=' : B64_CHARS[((b2 & 0x0f) << 2) | (b3 === null ? 0 : b3 >> 6)]
    out += b3 === null ? '=' : B64_CHARS[b3 & 0x3f]
  }
  return out
}

function heartSvg(fill, stroke) {
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${HEART_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/></svg>`
  return 'data:image/svg+xml;base64,' + base64EncodeAscii(raw)
}

module.exports = {
  HEART_ACTIVE: heartSvg('#C4472E', '#C4472E'),
  HEART_INACTIVE_MOBILE: heartSvg('none', '#6B5F55'),
  HEART_INACTIVE_GRID: heartSvg('none', 'rgba(242,236,225,0.6)'),
}
