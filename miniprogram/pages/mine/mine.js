const { apiGet, apiPost, apiPut, apiDelete } = require('../../utils/api.js')
const { pickFallbackGradient } = require('../../utils/fallbackGradients.js')
const { HEART_ACTIVE, HEART_INACTIVE_MOBILE } = require('../../utils/icons.js')

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatPerformers(performers) {
  if (!performers) return '艺人待定'
  const names = performers.split('/').map((n) => n.trim()).filter(Boolean)
  if (names.length <= 3) return names.join('/')
  return `${names.slice(0, 3).join('/')} 等${names.length}组`
}

function formatShowTime(show) {
  if (!show.show_time) return ''
  if (show.weekday === null || show.weekday === undefined) return show.show_time
  return `${show.show_time} 周${WEEKDAY_LABELS[show.weekday]}`
}

Page({
  data: {
    tab: 'artists', // artists | favorites | email
    artists: [],
    favorites: [],
    loadingArtists: true,
    loadingFavorites: true,

    addInput: '',
    suggestions: [],
    showSuggestions: false,

    // 邮箱订阅。sub 为 null 表示还没订阅过，此时显示输入框
    sub: null,
    loadingSub: true,
    emailInput: '',
    editingEmail: false,
    subNotice: '',
    submitting: false,
  },

  _searchTimer: null,

  onLoad() {
    // 三个 tab 的数据都在页面一打开就并行预取。邮箱订阅这条链路特别长
    // (小程序→云函数→Railway 美国→Supabase 印度)，不预取的话切到那个 tab 要现等几秒。
    // 提前拉好，用户切过去时数据多半已经到了
    this.loadArtists()
    this.loadFavorites()
    this.loadSubscription()
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 1 })
    }
    // 从首页点收藏心形之后切回"我的"，列表要跟着刷新
    if (this.data.tab === 'favorites') {
      this.loadFavorites()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab })
    // 收藏可能在首页点心形改过，切回来要刷新；订阅只在本页内改、已预取，不用重拉
    if (tab === 'favorites') this.loadFavorites()
  },

  // ---------- 邮箱订阅 ----------
  // 数据存在后端 Postgres(不是云数据库)，因为每天发提醒邮件的任务读的是那边。
  // 身份由 apiProxy 云函数用微信验证过的 openid 提供，这里不用管登录。

  async loadSubscription() {
    this.setData({ loadingSub: true })
    try {
      const res = await apiGet('/me/email-subscription')
      this.setData({ sub: res.subscription, loadingSub: false })
    } catch (e) {
      this.setData({ loadingSub: false, subNotice: e.message })
    }
  },

  onEmailInput(e) {
    this.setData({ emailInput: e.detail.value })
  },

  async submitEmail() {
    const email = this.data.emailInput.trim()
    if (!email) return
    this.setData({ subNotice: '', submitting: true })
    try {
      await apiPut('/me/email-subscription', { email })
      this.setData({
        emailInput: '',
        editingEmail: false,
        submitting: false,
        subNotice: '验证邮件已发出，去邮箱点一下链接就生效了',
      })
      this.loadSubscription()
    } catch (e) {
      this.setData({ submitting: false, subNotice: e.message })
    }
  },

  async resendVerify() {
    this.setData({ subNotice: '' })
    try {
      await apiPost('/me/email-subscription/resend')
      this.setData({ subNotice: '验证邮件已重新发出' })
    } catch (e) {
      this.setData({ subNotice: e.message })
    }
  },

  startEditEmail() {
    this.setData({ editingEmail: true, emailInput: this.data.sub.email, subNotice: '' })
  },

  cancelEditEmail() {
    this.setData({ editingEmail: false, emailInput: '', subNotice: '' })
  },

  async cancelSubscription() {
    const { confirm } = await wx.showModal({
      title: '取消订阅',
      content: '取消后邮箱不再保留，想重新订阅要再验证一次。',
    })
    if (!confirm) return
    this.setData({ subNotice: '' })
    try {
      await apiDelete('/me/email-subscription')
      this.setData({ sub: null, emailInput: '', editingEmail: false })
    } catch (e) {
      this.setData({ subNotice: e.message })
    }
  },

  async loadArtists() {
    this.setData({ loadingArtists: true })
    try {
      const db = wx.cloud.database()
      const res = await db.collection('followed_artists').orderBy('created_at', 'desc').limit(200).get()
      this.setData({ artists: res.data, loadingArtists: false })
    } catch (e) {
      this.setData({ loadingArtists: false })
    }
  },

  decorateShow(s) {
    return {
      ...s,
      isFavorite: true,
      heartIcon: HEART_ACTIVE,
      posterBg: s.poster_url ? `url('${s.poster_url}')` : pickFallbackGradient(s.id),
      performersText: formatPerformers(s.performers),
      showTimeText: formatShowTime(s),
    }
  },

  async loadFavorites() {
    this.setData({ loadingFavorites: true })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      const favRes = await db.collection('favorites').orderBy('created_at', 'desc').limit(100).get()
      const showIds = favRes.data.map((d) => d.show_id)
      if (showIds.length === 0) {
        this.setData({ favorites: [], loadingFavorites: false })
        return
      }
      const showsRes = await db.collection('shows').where({ id: _.in(showIds) }).limit(100).get()
      // 按收藏时间倒序排(showsRes 顺序不保证跟 showIds 一致)
      const byId = {}
      showsRes.data.forEach((s) => { byId[s.id] = s })
      const ordered = showIds.map((id) => byId[id]).filter(Boolean).map((s) => this.decorateShow(s))
      this.setData({ favorites: ordered, loadingFavorites: false })
    } catch (e) {
      this.setData({ loadingFavorites: false })
    }
  },

  onAddInput(e) {
    const value = e.detail.value
    this.setData({ addInput: value, showSuggestions: true })
    clearTimeout(this._searchTimer)
    if (!value.trim()) {
      this.setData({ suggestions: [] })
      return
    }
    this._searchTimer = setTimeout(async () => {
      try {
        const db = wx.cloud.database()
        const re = db.RegExp({ regexp: escapeRegExp(value.trim()), options: 'i' })
        const res = await db.collection('artists').where({ name: re }).limit(20).get()
        this.setData({ suggestions: res.data.map((d) => d.name) })
      } catch (e) {
        this.setData({ suggestions: [] })
        console.error('搜索艺人失败', e)
        wx.showToast({ title: '搜索失败: ' + (e.errMsg || e.message || '未知错误'), icon: 'none', duration: 3000 })
      }
    }, 250)
  },

  async addArtist(e) {
    const name = (e.currentTarget.dataset.name || this.data.addInput).trim()
    if (!name) return
    this.setData({ addInput: '', showSuggestions: false, suggestions: [] })

    // 乐观更新：立刻显示在列表里
    const tempId = 'temp-' + Date.now()
    this.setData({ artists: [{ _id: tempId, artist_name: name }, ...this.data.artists] })

    try {
      const db = wx.cloud.database()
      await db.collection('followed_artists').add({ data: { artist_name: name, created_at: Date.now() } })
      this.loadArtists()
    } catch (e) {
      this.setData({ artists: this.data.artists.filter((a) => a._id !== tempId) })
      wx.showToast({ title: '添加失败，请重试', icon: 'none' })
    }
  },

  async removeArtist(e) {
    const id = e.currentTarget.dataset.id
    const previous = this.data.artists
    this.setData({ artists: previous.filter((a) => a._id !== id) })
    try {
      const db = wx.cloud.database()
      await db.collection('followed_artists').doc(id).remove()
    } catch (e) {
      this.setData({ artists: previous })
      wx.showToast({ title: '移除失败，请重试', icon: 'none' })
    }
  },

  previewPoster(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url] })
  },

  copyDetailLink(e) {
    const id = e.currentTarget.dataset.id
    wx.setClipboardData({
      data: `https://www.showstart.com/event/${id}`,
      success: () => wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' }),
    })
  },

  // 收藏列表里心形一直是实心的，点一下就是取消收藏(跟网页版 ShowCard 逻辑一致，
  // 收藏/取消收藏统一用同一个心形按钮，不需要另外一个"移除"文字按钮)
  async toggleFavorite(e) {
    const show = e.currentTarget.dataset.show
    const previous = this.data.favorites
    this.setData({ favorites: previous.filter((s) => s.id !== show.id) })
    try {
      const db = wx.cloud.database()
      const existing = await db.collection('favorites').where({ show_id: show.id }).get()
      for (const doc of existing.data) {
        await db.collection('favorites').doc(doc._id).remove()
      }
    } catch (e) {
      this.setData({ favorites: previous })
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },

  // "我的"是个人页，转发给别人时让对方落在推荐流首页，而不是分享者的私人页
  onShareAppMessage() {
    return {
      title: 'LiveFlow — 找你想看的 livehouse 演出',
      path: 'pages/index/index',
    }
  },

  // 分享到朋友圈要单独定义，否则朋友圈入口是灰的。朋友圈打开固定进小程序首页，
  // 不支持指定 path，所以"我的"页分享出去也是落在首页，正好符合预期
  onShareTimeline() {
    return {
      title: 'LiveFlow — 找你想看的 livehouse 演出',
    }
  },
})
