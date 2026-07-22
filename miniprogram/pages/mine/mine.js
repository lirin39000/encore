const { apiGet, apiPost, apiPut, apiDelete } = require('../../utils/api.js')
const { getAll } = require('../../utils/cloudDb.js')
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
    submitting: false,
    refreshing: false, // "更新状态"按钮点击中，用来把按钮文字切成"更新中…"
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
    // 邮箱验证是在邮件里点链接完成的(小程序外)，回到小程序得重拉一次才知道已验证，
    // 否则一直显示"待验证"。sub 已存在时重拉不会闪"加载中"
    if (this.data.tab === 'email') {
      this.loadSubscription()
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab })
    // 收藏可能在首页点心形改过，切回来要刷新
    if (tab === 'favorites') this.loadFavorites()
    // 切到邮箱 tab 时重拉，捕捉刚在邮件里点过验证链接后的最新状态
    if (tab === 'email') this.loadSubscription()
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
      this.setData({ loadingSub: false })
      wx.showToast({ title: e.message, icon: 'none' })
    }
  },

  onEmailInput(e) {
    this.setData({ emailInput: e.detail.value })
  },

  async submitEmail() {
    const email = this.data.emailInput.trim()
    if (!email) return
    this.setData({ submitting: true })
    try {
      // 后端返回 {email, verified, active}，直接拿它更新界面，不再等那个超慢的 loadSubscription。
      // 填的是已验证过的同一个邮箱时，后端原样保留 verified:true，界面不会错误显示"待验证"。
      // 成功后不提示，界面本身会切到待验证/已验证页，下面的灰字说明也会告诉用户去点链接
      const res = await apiPut('/me/email-subscription', { email })
      this.setData({ emailInput: '', editingEmail: false, submitting: false, sub: res })
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: e.message, icon: 'none' })
    }
  },

  // 用户在邮件里点过验证链接后，回来点"更新状态"：当场去后端查一次最新状态。
  // 按钮切成"更新中…"，查完界面自己更新(验证成功就变成绑好邮箱的页)；还没验证就 toast 提示一下
  async refreshVerifyStatus() {
    if (this.data.refreshing) return
    this.setData({ refreshing: true })
    try {
      const res = await apiGet('/me/email-subscription')
      const sub = res.subscription
      this.setData({ sub, refreshing: false })
      if (!(sub && sub.verified)) {
        wx.showToast({ title: '还没检测到验证，确认点过链接了吗', icon: 'none' })
      }
    } catch (e) {
      this.setData({ refreshing: false })
      wx.showToast({ title: e.message, icon: 'none' })
    }
  },

  async resendVerify() {
    try {
      await apiPost('/me/email-subscription/resend')
      wx.showToast({ title: '验证邮件已重新发送', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' })
    }
  },

  startEditEmail() {
    this.setData({ editingEmail: true, emailInput: this.data.sub.email })
  },

  cancelEditEmail() {
    this.setData({ editingEmail: false, emailInput: '' })
  },

  async cancelSubscription() {
    const { confirm } = await wx.showModal({
      title: '取消订阅',
      content: '取消后邮箱不再保留，想重新订阅要再验证一次。',
    })
    if (!confirm) return
    // 确认后立刻把界面切回未订阅态，不干等那个跨国慢接口回来——否则"点了确认半天没反应、
    // 反复点"。失败再回滚
    const previous = this.data.sub
    this.setData({ sub: null, emailInput: '', editingEmail: false })
    try {
      await apiDelete('/me/email-subscription')
    } catch (e) {
      this.setData({ sub: previous })
      wx.showToast({ title: e.message, icon: 'none' })
    }
  },

  async loadArtists() {
    this.setData({ loadingArtists: true })
    try {
      const db = wx.cloud.database()
      // getAll 翻页取全，客户端单次只给 20 条，关注超过 20 个会被吞
      const artists = await getAll(() => db.collection('followed_artists').orderBy('created_at', 'desc'))
      this.setData({ artists, loadingArtists: false })
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
      const favs = await getAll(() => db.collection('favorites').orderBy('created_at', 'desc'))
      const showIds = favs.map((d) => d.show_id)
      if (showIds.length === 0) {
        this.setData({ favorites: [], loadingFavorites: false })
        return
      }
      const showsData = await getAll(() => db.collection('shows').where({ id: _.in(showIds) }))
      // 按收藏时间倒序排(showsData 顺序不保证跟 showIds 一致)
      const byId = {}
      showsData.forEach((s) => { byId[s.id] = s })
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
      getApp().globalData.followListChanged = true // 通知首页：关注列表变了，返回时重查演出
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
      getApp().globalData.followListChanged = true // 通知首页：关注列表变了，返回时重查演出
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
