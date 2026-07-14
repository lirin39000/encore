App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d9gwsf1jq9b490005',
        traceUser: true,
      })
    }
  },
})
