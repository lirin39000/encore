const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

Page({
  data: {
    shows: [],
    loading: true,
    error: '',
  },

  onLoad() {
    this.loadShows()
  },

  loadShows() {
    this.setData({ loading: true, error: '' })

    // 演出数据存在微信云数据库的 shows 集合里(每天从爬虫那边同步过来)，
    // 小程序直接读云数据库，跟腾讯自己的服务在同一个国内机房，不用跨境请求，
    // 不会有小程序连不上境外服务器的问题。
    const db = wx.cloud.database()
    db.collection('shows')
      .orderBy('show_dt', 'asc')
      .limit(20)
      .get()
      .then((res) => {
        const shows = res.data.map((show) => ({
          ...show,
          weekdayLabel: show.weekday !== null && show.weekday !== undefined
            ? `周${WEEKDAY_LABELS[show.weekday]}`
            : '',
        }))
        this.setData({ shows, loading: false })
      })
      .catch((e) => {
        this.setData({ loading: false, error: e.errMsg || '加载失败' })
      })
  },

  onPullDownRefresh() {
    this.loadShows()
    wx.stopPullDownRefresh()
  },
})
