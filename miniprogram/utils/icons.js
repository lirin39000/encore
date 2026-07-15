// 跟网页版 ShowCard.tsx 里那个心形收藏图标的 SVG path 完全一致，
// 转成 data URI 因为原生小程序 WXML 不能直接写 <svg> 标签
const HEART_PATH =
  'M12 6.5C10.5 4 8.3 3 6.2 3 3 3 0.8 5.5 0.8 8.6c0 5.2 6 8.9 11.2 12.9 5.2-4 11.2-7.7 11.2-12.9C23.2 5.5 21 3 17.8 3c-2.1 0-4.3 1-5.8 3.5z'

function heartSvg(fill, stroke) {
  const raw = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${HEART_PATH}' fill='${fill}' stroke='${stroke}' stroke-width='1.4'/></svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(raw)
}

module.exports = {
  HEART_ACTIVE: heartSvg('#C4472E', '#C4472E'),
  HEART_INACTIVE_MOBILE: heartSvg('none', '#6B5F55'),
  HEART_INACTIVE_GRID: heartSvg('none', 'rgba(242,236,225,0.6)'),
}
