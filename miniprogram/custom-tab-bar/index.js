Component({
  data: {
    selected: 0,
  },
  methods: {
    switchTab(e) {
      const { index, url } = e.currentTarget.dataset
      if (this.data.selected === index) return
      wx.switchTab({ url })
    },
  },
})
