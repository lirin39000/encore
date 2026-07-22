App({
  globalData: {
    // "我的"页增减关注艺人时置 true，首页返回时据此决定要不要重查演出(关注模式下)。
    // 这样没改动关注就不会白刷一次
    followListChanged: false,
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d9gwsf1jq9b490005',
        traceUser: true,
      })
    }
  },
})
