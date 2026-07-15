const cityData = require('../../data/cities.js')

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
const MAX_PRICE_CEILING = 800
const PAGE_SIZE = 20

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

Page({
  data: {
    shows: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    error: '',

    searchInput: '',
    scope: 'all', // all | followed
    sortBy: 'time', // time | price
    cityNames: [],
    freeWeekdays: [],
    maxPrice: MAX_PRICE_CEILING,
    maxPriceCeiling: MAX_PRICE_CEILING,
    weekdayOptions: WEEKDAYS.map((d) => ({ key: d, label: WEEKDAY_LABELS[d] })),

    filterPanelOpen: false,
    cityPickerOpen: false,
    citySearch: '',
    cityGroups: cityData.cityDirectory,
    activeFilterCount: 0,
  },

  noop() {},

  updateActiveFilterCount() {
    const count =
      (this.data.cityNames.length > 0 ? 1 : 0) +
      (this.data.freeWeekdays.length > 0 ? 1 : 0) +
      (this.data.maxPrice < MAX_PRICE_CEILING ? 1 : 0)
    this.setData({ activeFilterCount: count })
  },

  _skip: 0,
  _searchTimer: null,
  // 收藏的 show_id 集合，缓存在内存里，不用每次加载/每次点击都去查一遍数据库；
  // 云数据库的安全规则(仅创建者可读写)会自动把这个查询限定在当前用户自己的记录，
  // 不需要手动传/管理 openid
  _favoriteIds: new Set(),

  onLoad() {
    const cached = wx.getStorageSync('filters')
    if (cached) {
      this.setData({
        cityNames: cached.cityNames || [],
        freeWeekdays: cached.freeWeekdays || [],
        maxPrice: cached.maxPrice || MAX_PRICE_CEILING,
      })
      this.updateActiveFilterCount()
    }
    this.loadFavoriteIds().then(() => this.loadShows())
  },

  onShow() {
    // 从"我的"页面收藏/取消收藏之后切回来，心形状态要跟着更新
    this.loadFavoriteIds().then(() => this.applyFavoriteFlags())
  },

  onPullDownRefresh() {
    Promise.all([this.loadFavoriteIds(), this.loadShows()]).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMore()
    }
  },

  async loadFavoriteIds() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('favorites').limit(1000).get()
      this._favoriteIds = new Set(res.data.map((d) => d.show_id))
    } catch (e) {
      // 没登录/查不到就当没收藏过任何东西，不阻塞主流程
      this._favoriteIds = new Set()
    }
  },

  applyFavoriteFlags() {
    const shows = this.data.shows.map((s) => ({ ...s, isFavorite: this._favoriteIds.has(s.id) }))
    this.setData({ shows })
  },

  markFavorites(list) {
    return list.map((s) => ({ ...s, isFavorite: this._favoriteIds.has(s.id) }))
  },

  saveFilters() {
    wx.setStorageSync('filters', {
      cityNames: this.data.cityNames,
      freeWeekdays: this.data.freeWeekdays,
      maxPrice: this.data.maxPrice,
    })
  },

  async buildQuery() {
    const db = wx.cloud.database()
    const _ = db.command
    const conditions = []

    if (this.data.cityNames.length > 0) {
      conditions.push({ city_name: _.in(this.data.cityNames) })
    }
    if (this.data.freeWeekdays.length > 0) {
      conditions.push({ weekday: _.in(this.data.freeWeekdays) })
    }
    if (this.data.maxPrice < MAX_PRICE_CEILING) {
      conditions.push({ price_min: _.lte(this.data.maxPrice) })
    }

    const q = this.data.searchInput.trim()
    if (q) {
      const re = db.RegExp({ regexp: escapeRegExp(q), options: 'i' })
      conditions.push(_.or([{ title: re }, { performers: re }, { site_name: re }]))
    }

    if (this.data.scope === 'followed') {
      const followedRes = await db.collection('followed_artists').limit(100).get()
      const names = followedRes.data.map((d) => d.artist_name)
      if (names.length === 0) {
        return null // 没关注任何人，直接返回空结果，不用查
      }
      const orClauses = names.map((name) => ({
        performers: db.RegExp({ regexp: escapeRegExp(name), options: 'i' }),
      }))
      conditions.push(_.or(orClauses))
    }

    let query = db.collection('shows')
    if (conditions.length > 0) {
      query = query.where(_.and(conditions))
    }
    return query
  },

  async loadShows() {
    this.setData({ loading: true, error: '', shows: [], hasMore: true })
    this._skip = 0
    try {
      const query = await this.buildQuery()
      if (!query) {
        this.setData({ loading: false, shows: [], hasMore: false })
        return
      }
      const sortField = this.data.sortBy === 'price' ? 'price_min' : 'show_dt'
      const res = await query.orderBy(sortField, 'asc').skip(0).limit(PAGE_SIZE).get()
      this._skip = res.data.length
      this.setData({
        shows: this.markFavorites(res.data),
        loading: false,
        hasMore: res.data.length === PAGE_SIZE,
      })
    } catch (e) {
      this.setData({ loading: false, error: e.errMsg || '加载失败' })
    }
  },

  async loadMore() {
    this.setData({ loadingMore: true })
    try {
      const query = await this.buildQuery()
      if (!query) {
        this.setData({ loadingMore: false, hasMore: false })
        return
      }
      const sortField = this.data.sortBy === 'price' ? 'price_min' : 'show_dt'
      const res = await query.orderBy(sortField, 'asc').skip(this._skip).limit(PAGE_SIZE).get()
      this._skip += res.data.length
      this.setData({
        shows: this.data.shows.concat(this.markFavorites(res.data)),
        loadingMore: false,
        hasMore: res.data.length === PAGE_SIZE,
      })
    } catch (e) {
      this.setData({ loadingMore: false })
    }
  },

  onSearchInput(e) {
    const value = e.detail.value
    this.setData({ searchInput: value })
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => this.loadShows(), 300)
  },

  toggleScope() {
    this.setData({ scope: this.data.scope === 'followed' ? 'all' : 'followed' }, () => this.loadShows())
  },

  toggleSort() {
    this.setData({ sortBy: this.data.sortBy === 'time' ? 'price' : 'time' }, () => this.loadShows())
  },

  openFilterPanel() {
    this.setData({ filterPanelOpen: true })
  },

  closeFilterPanel() {
    this.setData({ filterPanelOpen: false })
    this.updateActiveFilterCount()
    this.saveFilters()
    this.loadShows()
  },

  toggleWeekday(e) {
    const day = e.currentTarget.dataset.day
    const list = this.data.freeWeekdays.includes(day)
      ? this.data.freeWeekdays.filter((d) => d !== day)
      : [...this.data.freeWeekdays, day]
    this.setData({ freeWeekdays: list })
  },

  onPriceChange(e) {
    this.setData({ maxPrice: e.detail.value })
  },


  openCityPicker() {
    this.setData({ cityPickerOpen: true })
  },

  closeCityPicker() {
    this.setData({ cityPickerOpen: false, citySearch: '' })
  },

  onCitySearchInput(e) {
    this.setData({ citySearch: e.detail.value })
  },

  toggleCity(e) {
    const name = e.currentTarget.dataset.name
    const list = this.data.cityNames.includes(name)
      ? this.data.cityNames.filter((c) => c !== name)
      : [...this.data.cityNames, name]
    this.setData({ cityNames: list })
  },

  removeCity(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ cityNames: this.data.cityNames.filter((c) => c !== name) }, () => {
      this.updateActiveFilterCount()
      this.saveFilters()
      this.loadShows()
    })
  },

  async toggleFavorite(e) {
    const show = e.currentTarget.dataset.show
    const db = wx.cloud.database()
    const idx = this.data.shows.findIndex((s) => s._id === show._id)
    const wasFavorite = show.isFavorite

    // 乐观更新：先在界面上立刻反映，请求真正返回后失败了再改回去
    const shows = this.data.shows.slice()
    shows[idx] = { ...shows[idx], isFavorite: !wasFavorite }
    this.setData({ shows })
    if (wasFavorite) {
      this._favoriteIds.delete(show.id)
    } else {
      this._favoriteIds.add(show.id)
    }

    try {
      if (wasFavorite) {
        const existing = await db.collection('favorites').where({ show_id: show.id }).get()
        for (const doc of existing.data) {
          await db.collection('favorites').doc(doc._id).remove()
        }
      } else {
        await db.collection('favorites').add({ data: { show_id: show.id, created_at: Date.now() } })
      }
    } catch (err) {
      const revert = this.data.shows.slice()
      revert[idx] = { ...revert[idx], isFavorite: wasFavorite }
      this.setData({ shows: revert })
      if (wasFavorite) {
        this._favoriteIds.add(show.id)
      } else {
        this._favoriteIds.delete(show.id)
      }
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },
})
