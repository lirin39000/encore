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
    tab: 'artists', // artists | favorites
    artists: [],
    favorites: [],
    loadingArtists: true,
    loadingFavorites: true,

    addInput: '',
    suggestions: [],
    showSuggestions: false,
  },

  _searchTimer: null,

  onLoad() {
    this.loadArtists()
    this.loadFavorites()
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
    if (tab === 'favorites') this.loadFavorites()
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
})
