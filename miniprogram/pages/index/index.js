const cityData = require('../../data/cities.js')
const { getAll } = require('../../utils/cloudDb.js')
const { pickFallbackGradient } = require('../../utils/fallbackGradients.js')
const { HEART_ACTIVE, HEART_INACTIVE_MOBILE } = require('../../utils/icons.js')

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]
const MAX_PRICE_CEILING = 800
const PAGE_SIZE = 20

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 用设备本地日期(不是 UTC)算"今天"，跟后端网页版 /shows 接口用北京时间算
// "今天"是同一个道理——show_dt 存的是演出自己的当地时间字符串，不是 UTC 时间戳，
// 得拿同样口径的日期比较，不然会有一天的误差
function todayDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 阵容很长的拼盘演出会把卡片撑得很高，只展示前几个名字+"等N组"，跟网页版 ShowCard.tsx 一致
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
    shows: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    error: '',
    total: 0,

    searchInput: '',
    scope: 'all', // all | followed
    sortBy: 'time', // time | price
    cityNames: [],
    // 档期默认全选(全红)=不筛选；点掉一些就按剩下的筛；至少留一个。见 toggleWeekday/buildQuery
    freeWeekdays: [...WEEKDAYS],
    maxPrice: MAX_PRICE_CEILING,
    maxPriceCeiling: MAX_PRICE_CEILING,
    weekdayOptions: WEEKDAYS.map((d) => ({ key: d, label: WEEKDAY_LABELS[d], active: true })),

    filterTab: 'location', // location | schedule | price
    filterPanelOpen: false,
    filterPanelReady: false,
    filterPanelShift: 0,
    cityPickerOpen: false,
    citySearch: '',
    cityGroups: cityData.cityDirectory,
    cityScrollInto: '', // 点右侧字母表时设成 city-section-X，驱动 scroll-view 跳转
    cityListTop: 156, // "我的城市"栏底部(px)，城市列表和字母表从这里开始。打开时 JS 量出真实值
    activeFilterCount: 0,
  },

  noop() {},

  // 括号里的数字 = 三类筛选里有几类在生效：城市加了没、档期没全选、预算没顶到 800。
  // 每类算一个，跟"选了几个城市"无关
  updateActiveFilterCount() {
    const count =
      (this.data.cityNames.length > 0 ? 1 : 0) +
      (this.data.freeWeekdays.length < WEEKDAYS.length ? 1 : 0) +
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
        // 旧缓存里空数组是老逻辑的"不筛选"，新逻辑"不筛选"是全选，所以空的当全选
        freeWeekdays: (cached.freeWeekdays && cached.freeWeekdays.length) ? cached.freeWeekdays : [...WEEKDAYS],
        maxPrice: cached.maxPrice || MAX_PRICE_CEILING,
      })
      this.updateActiveFilterCount()
      this.syncWeekdayOptions()
    }
    this.loadFavoriteIds().then(() => this.loadShows())
  },

  // 星期几圆圈是否高亮，算成 weekdayOptions 每一项自己的 active 字段，
  // 不在 WXML 里现算 indexOf——两种写法逻辑上等价，这样写只是更直接、更好排查
  syncWeekdayOptions() {
    const weekdayOptions = this.data.weekdayOptions.map((opt) => ({
      ...opt,
      active: this.data.freeWeekdays.includes(opt.key),
    }))
    this.setData({ weekdayOptions })
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 0 })
    }
    // 从"我的"页面收藏/取消收藏之后切回来，心形状态要跟着更新
    this.loadFavoriteIds().then(() => this.applyFavoriteFlags())
    // 只有真的在"我的"页增减过关注艺人，且当前是"我关注的艺人"模式，才重查演出。
    // 没动关注就不刷，避免每次返回都白查一次
    const app = getApp()
    if (app.globalData.followListChanged) {
      app.globalData.followListChanged = false
      if (this.data.scope === 'followed') this.loadShows()
    }
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
      // 翻页取全，否则收藏超过 20 个时，首页只有前 20 个演出的心形会是红的
      const favs = await getAll(() => db.collection('favorites'))
      this._favoriteIds = new Set(favs.map((d) => d.show_id))
    } catch (e) {
      // 没登录/查不到就当没收藏过任何东西，不阻塞主流程
      this._favoriteIds = new Set()
    }
  },

  applyFavoriteFlags() {
    const shows = this.data.shows.map((s) => this.decorateShow(s))
    this.setData({ shows })
  },

  // 给每条演出记录补上渲染要用的字段：海报背景(有图用图、没图用兜底渐变，
  // 跟网页版 pickFallbackGradient 逻辑一致)、收藏状态对应的心形图标、格式化好的文案
  decorateShow(s) {
    return {
      ...s,
      isFavorite: this._favoriteIds.has(s.id),
      heartIcon: this._favoriteIds.has(s.id) ? HEART_ACTIVE : HEART_INACTIVE_MOBILE,
      posterBg: s.poster_url ? `url('${s.poster_url}')` : pickFallbackGradient(s.id),
      performersText: formatPerformers(s.performers),
      showTimeText: formatShowTime(s),
    }
  },

  decorateList(list) {
    return list.map((s) => this.decorateShow(s))
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

    // 已经过去的演出不该再出现在列表里；show_dt 解析失败(null)的记录还是放行，
    // 没法确定是不是过期的，保守起见继续展示
    conditions.push(_.or([{ show_dt: _.gte(todayDateString()) }, { show_dt: _.eq(null) }]))

    if (this.data.cityNames.length > 0) {
      conditions.push({ city_name: _.in(this.data.cityNames) })
    }
    // 全选(7 天)= 不筛选；点掉了一些(1~6 天)才按剩下的筛
    if (this.data.freeWeekdays.length > 0 && this.data.freeWeekdays.length < WEEKDAYS.length) {
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
      // 翻页取全，否则关注超过 20 个艺人时，"我关注的"筛选会漏掉后面艺人的演出
      const followed = await getAll(() => db.collection('followed_artists'))
      const names = followed.map((d) => d.artist_name)
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
    this.setData({ loading: true, error: '', shows: [], hasMore: true, total: 0 })
    this._skip = 0
    try {
      const query = await this.buildQuery()
      if (!query) {
        this.setData({ loading: false, shows: [], hasMore: false, total: 0 })
        return
      }
      const sortField = this.data.sortBy === 'price' ? 'price_min' : 'show_dt'
      const [res, countRes] = await Promise.all([
        query.orderBy(sortField, 'asc').skip(0).limit(PAGE_SIZE).get(),
        query.count(),
      ])
      this._skip = res.data.length
      this.setData({
        shows: this.decorateList(res.data),
        loading: false,
        hasMore: res.data.length === PAGE_SIZE,
        total: countRes.total,
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
        shows: this.data.shows.concat(this.decorateList(res.data)),
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

  // 筛选面板默认挂在"筛选"胶囊正下方(跟网页版 FilterPanel.tsx 的定位逻辑一致)，
  // 宽度是 CSS 里写死的 rpx 值。屏幕窄的时候，面板从触发按钮位置往右展开可能会
  // 超出屏幕右边缘，这里等面板真正渲染出来之后，直接量它自己的位置(不是预测宽度)，
  // 算出要往左边挪多少，避免被裁掉。
  // 之前的做法是"先在默认位置显示出来，量完再纠正"，纠正前那一下的位置会被用户
  // 看到、看着像"跳了一下"。现在改成面板一开始就是透明的(opacity:0，但still挂在
  // 页面上、量得到)，等测量结果拿到、真正的位置定下来了才显示出来，用户不会再
  // 看到那个未纠正的中间状态
  openFilterPanel() {
    this.setData({ filterPanelOpen: true, filterPanelReady: false, filterPanelShift: 0 }, () => {
      // setData 的回调只保证"数据已经发给渲染层"，不保证渲染层已经排好版——
      // 小程序逻辑层和渲染层是两个线程，真机上偶尔会有量早了、量到还没定型的
      // 布局的情况。用 wx.nextTick 让个一拍，再等一个很短的延时兜底，基本能
      // 保证量到的是渲染层真正定型之后的位置(反正面板这时候还是透明的，
      // 这个延时本身不会被用户看到)
      wx.nextTick(() => {
        setTimeout(() => this.measureFilterPanelShift(), 30)
      })
    })
  },

  measureFilterPanelShift() {
    const windowWidth = wx.getWindowInfo().windowWidth
    wx.createSelectorQuery()
      .select('.filter-panel')
      .boundingClientRect((rect) => {
        if (!rect) {
          this.setData({ filterPanelReady: true })
          return
        }
        const overflow = rect.left + rect.width - (windowWidth - 8)
        this.setData({
          filterPanelShift: overflow > 0 ? overflow : 0,
          filterPanelReady: true,
        })
      })
      .exec()
  },

  // 手机上"点一下筛选项、列表马上跟着变一次"体验很跳，跟网页版不一样：
  // 面板内的调整(城市/档期/价位)都先只改本地状态、更新一下"筛选(N)"这个数字
  // 让用户有反馈，但不重新查询；真正重新查询+存起来，等点了"确定"才做一次
  commitFilters() {
    this.saveFilters()
    this.loadShows()
  },

  closeFilterPanel() {
    this.setData({ filterPanelOpen: false, filterPanelReady: false })
    this.commitFilters()
  },

  switchFilterTab(e) {
    this.setData({ filterTab: e.currentTarget.dataset.tab })
  },

  toggleWeekday(e) {
    const day = e.currentTarget.dataset.day
    const selected = this.data.freeWeekdays.includes(day)
    // 至少留一个：只剩最后一个还想点掉时，直接忽略，不允许全灰
    if (selected && this.data.freeWeekdays.length === 1) return
    const list = selected
      ? this.data.freeWeekdays.filter((d) => d !== day)
      : [...this.data.freeWeekdays, day]
    this.setData({ freeWeekdays: list }, () => {
      this.syncWeekdayOptions()
      this.updateActiveFilterCount()
    })
  },

  onPriceChange(e) {
    this.setData({ maxPrice: e.detail.value }, () => this.updateActiveFilterCount())
  },

  openCityPicker() {
    this.setData({ cityPickerOpen: true, cityGroups: cityData.cityDirectory })
    // "我的城市"栏 chip 换行后高度不定，量出它的实际底部，作为下面城市列表的起始位置。
    // 延一下等渲染完成再量
    setTimeout(() => this.measureCityListTop(), 80)
  },

  // 量"我的城市"固定栏的底部(px)，城市列表 scroll-view 和右侧字母表的 top 都用它。
  // chip 增删导致栏高变化时要重新量，否则列表会跟栏重叠或留缝
  measureCityListTop() {
    if (!this.data.cityPickerOpen) return
    wx.createSelectorQuery()
      .select('.city-picker-mycity')
      .boundingClientRect((rect) => {
        if (rect && rect.bottom) this.setData({ cityListTop: rect.bottom })
      })
      .exec()
  },

  closeCityPicker() {
    this.setData({ cityPickerOpen: false, citySearch: '', cityGroups: cityData.cityDirectory })
  },

  onCitySearchInput(e) {
    const q = e.detail.value.trim()
    const groups = q
      ? cityData.cityDirectory
          .map((g) => ({ letter: g.letter, cities: g.cities.filter((c) => c.name.includes(q)) }))
          .filter((g) => g.cities.length > 0)
      : cityData.cityDirectory
    this.setData({ citySearch: e.detail.value, cityGroups: groups })
  },

  toggleCity(e) {
    const name = e.currentTarget.dataset.name
    const list = this.data.cityNames.includes(name)
      ? this.data.cityNames.filter((c) => c !== name)
      : [...this.data.cityNames, name]
    this.setData({ cityNames: list }, () => {
      this.updateActiveFilterCount()
      this.measureCityListTop() // chip 增减会改变"我的城市"栏的高度，重新量
    })
  },

  // 筛选面板/城市选择器里面的"移除城市"：先只改本地状态，等点"确定"才真正重新查询
  removeCity(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ cityNames: this.data.cityNames.filter((c) => c !== name) }, () => {
      this.updateActiveFilterCount()
      this.measureCityListTop()
    })
  },

  // 首页"共N场演出"下面那排城市 chip 是面板之外的东西，没有"确定"这个步骤，
  // 点了就直接生效，跟网页版一致
  removeCityImmediate(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ cityNames: this.data.cityNames.filter((c) => c !== name) }, () => {
      this.updateActiveFilterCount()
      this.commitFilters()
    })
  },

  jumpToLetter(e) {
    // 城市列表在 scroll-view 里滚，不是整页滚，所以不能用 wx.pageScrollTo(那滚的是页面)。
    // 用 scroll-view 的 scroll-into-view：把它设成目标分组的 id，scroll-view 就滚过去。
    // 先清空再用 nextTick 设值，保证连点同一个字母也能重新触发(值没变 scroll-into-view 不响应)
    const letter = e.currentTarget.dataset.letter
    this.setData({ cityScrollInto: '' }, () => {
      wx.nextTick(() => this.setData({ cityScrollInto: 'city-section-' + letter }))
    })
  },

  previewPoster(e) {
    const url = e.currentTarget.dataset.url
    if (url) wx.previewImage({ urls: [url] })
  },

  // 小程序不能像网页那样直接跳转到秀动这类外部网站(webview 打开外部域名
  // 需要在小程序后台把域名加进"业务域名"白名单，我们不是这个域名的所有者，
  // 加不了)，退而求其次复制链接，让用户自己去浏览器打开
  copyDetailLink(e) {
    const id = e.currentTarget.dataset.id
    wx.setClipboardData({
      data: `https://www.showstart.com/event/${id}`,
      success: () => wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' }),
    })
  },

  async toggleFavorite(e) {
    const show = e.currentTarget.dataset.show
    const db = wx.cloud.database()
    const idx = this.data.shows.findIndex((s) => s._id === show._id)
    const wasFavorite = show.isFavorite

    // 乐观更新：先在界面上立刻反映，请求真正返回后失败了再改回去
    const shows = this.data.shows.slice()
    shows[idx] = { ...shows[idx], isFavorite: !wasFavorite, heartIcon: wasFavorite ? HEART_INACTIVE_MOBILE : HEART_ACTIVE }
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
      revert[idx] = { ...revert[idx], isFavorite: wasFavorite, heartIcon: wasFavorite ? HEART_ACTIVE : HEART_INACTIVE_MOBILE }
      this.setData({ shows: revert })
      if (wasFavorite) {
        this._favoriteIds.add(show.id)
      } else {
        this._favoriteIds.delete(show.id)
      }
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
    }
  },

  // 定义了这个方法，右上角"转发给朋友"才可点。不设 imageUrl，微信会自动截当前页面做封面
  onShareAppMessage() {
    return {
      title: 'LiveFlow — 找你想看的 livehouse 演出',
      path: 'pages/index/index',
    }
  },

  // 分享到朋友圈是另一套机制，要单独定义这个方法，朋友圈那个入口才不是灰的。
  // query 里带的参数会拼到 path 上，别人从朋友圈点进来一样落在首页
  onShareTimeline() {
    return {
      title: 'LiveFlow — 找你想看的 livehouse 演出',
    }
  },
})
