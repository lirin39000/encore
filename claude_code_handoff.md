# 项目背景：Livehouse/演出推荐网站 —— 秀动接口逆向调试

## 我在做什么

我想做一个网站，帮人根据「关注的音乐人 + 有空的时间 + 所在城市 + 预算」，
从大麦、秀动等票务平台的演出信息里筛选/推荐适合的演出。

数据来源计划从秀动网（showstart.com）的公开演出列表接口开始，
不需要登录，只是"浏览级"的数据抓取，不涉及下单/购票。

## 已经确认的信息

### 核心接口
- URL: `POST https://www.showstart.com/api/web/activity/list`
- 不需要登录即可访问（未登录游客也能看到完整演出列表）
- 请求体是明文JSON（未加密），字段包括：
  `pageNo, pageSize, cityCode, activityIds, coupon, keyword, organizerId,
  performerId, showStyle, showTime, showType, siteId, sortType, themeId,
  timeRange, tourId, type, tag`
- 返回JSON结构（关键字段）：
  ```json
  {
    "status": 200, "state": "1",
    "result": {
      "pageNo": 1, "pageSize": 20,
      "result": [
        {
          "id": 298011,
          "title": "演出标题",
          "performers": "艺人名",
          "price": "¥189起",
          "showTime": "2026/07/08 20:00",
          "siteName": "场馆名",
          "cityName": "城市",
          "soldOut": 1
        }
      ],
      "totalCount": 5, "totalPage": 1
    }
  }
  ```
- 还有一个辅助接口 `POST /api/web/activity/list/params`，返回城市代码表和演出风格分类表（流行/摇滚/HipHop等）

### 反爬机制：自定义签名 Crpsign
秀动给每个请求都加了一堆自定义请求头，其中 `Crpsign` 是动态计算的MD5签名，
每次请求都不一样，是主要的反爬拦截点。

**已经从秀动 web 端加载的JS文件（`d46ea68.js`）里，通过全局搜索"crpsign"关键词，
定位并提取出了完整的签名生成逻辑原文：**

```javascript
o = accessToken (来自cookie，header名 CUSAT)
l = sign (来自cookie，header名 CUSUT)
f = idToken (来自cookie，header名 CUSIT)
h = userId (来自cookie里的userInfo，header名 CUSID)
m = token (来自cookie，header名 CDEVICENO)
y = uuid(32) + 当前时间戳 (header名 CRTRACEID)
_ = JSON.stringify(请求体) 如果有请求体的话，否则空字符串

w = o + l + f + h + "web" + m + _ + r.url + "999web" + y
CRPSIGN = MD5(w)

// 关键坑：上面签名算完之后，才会把 /api 前缀拼到url上：
r.url = "/api" + r.url
```

**匿名浏览（未登录）时**，`accessToken/sign/idToken/userId` 这几个字段经确认都是空字符串，
只有 `token`（对应CDEVICENO）和 `crtraceid` 是每次请求都有实际值的。

MD5算法本身已经用Node.js跑通验证过（用"abc"的标准md5值校验一致，实现无误）。

## 当前卡住的地方

按照上面这套逻辑，用Python翻译了一版签名计算+完整请求脚本（附件 `xiudong_client.py`），
但**还没有在真实网络环境下测试过**——我这边之前用的AI助手所在的沙盒环境网络是关闭的，
无法实际发出网络请求验证。

## 需要 Claude Code 帮我做的事

1. 帮我运行附件里的 `xiudong_client.py`（可能需要先 `pip install requests`）
2. 看返回结果：
   - 如果返回200且拿到了真实演出数据 → 签名算法验证成功，帮我基于此扩展成一个完整的
     采集脚本（支持多城市、多关键词循环抓取、存到本地CSV或SQLite）
   - 如果返回报错（签名错误/403/401等）→ 帮我一起调试，可能是某个header字段拼接顺序、
     编码方式（比如Cdeviceinfo是否要做URL编码）、或者字段值本身有问题，需要对照抓包
     反复试错
3. 调通之后，帮我规划一下代码结构：定时任务怎么加、数据存哪、要不要防止请求频率太高
   被封（目前秀动官方论坛/开发者没有公开限流规则，需要保守一点，比如每次请求间隔几秒）

## 重要提醒（请Claude Code也遵守）

- 这只是"浏览级"的数据抓取（跟未登录用户在网页上能看到的信息一样），完全不涉及登录、
  下单、支付、验证码绕过等环节，也不会去爬取需要登录才能看到的隐私数据
- 请求frequenct要保守，不要写成高频轮询，避免给秀动服务器造成压力或者被封锁
- 这是我个人学习/产品原型阶段的探索，后续如果做成正式产品，我知道还需要考虑数据源合规、
  是否需要联系秀动官方谈合作等问题，目前先把技术可行性跑通
