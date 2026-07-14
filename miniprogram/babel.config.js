// babel-preset-taro 更多选项和默认值：
// https://docs.taro.zone/docs/next/babel-config-taro
module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      compiler: 'webpack5'
    }]
  ]
}
