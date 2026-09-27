# 植物大战僵尸杂交版 · 个人 Mod 存放站

> 云漫行的《植物大战僵尸杂交版》（Godot 4 + C#）个人 Mod 作品集站点。
> 深色极简、硬边、巨型排版，主页 Mod 以**扑克牌叠**形式呈现，悬停自动展开。

**在线访问**：

- **GitHub Pages** —— https://josnil.github.io/pvz-mods/
  （源码仓库 https://github.com/josnil/pvz-mods ）
- **内置发布镜像** —— https://pvz-mods-gallery.app.workbuddy.host/

**下载渠道**：

- **夸克网盘（推荐）** —— https://pan.quark.cn/s/eca3724f6450 （全部 9 个 `.pmod` 一次拿全）
- **GitHub Releases** —— https://github.com/josnil/pvz-mods/releases （原始发布源）

> 两个来源内容一致。夸克网盘免登录、国内直连；GitHub 适合海外访问或需版本追溯。
> 卡片点击**默认跳夸克**；每个 Mod 的详情页同时给夸克与 GitHub 两个按钮。

---

## 站点做了什么

| 交互 | 实现 |
|---|---|
| 主页 **5 个牌叠**并排 | 3 个分类叠（植物 / 僵尸 / 其他）+ 2 个动态叠（最近更新 / 全部 mod） |
| 悬停某叠 → 动画铺开显示前 5 个 | 该叠 `position:absolute` **整行铺开**脱离 1/3 列宽约束；其余叠淡出到 `opacity:.25` |
| 超出 5 个 → 出现「更多 mod」入口 | 自动按分类尾部追加一张虚线卡，跳转对应分类页 |
| **「最近更新」叠** | 按 `updatedAt` 降序取最近 3 个关卡（含关卡构建器），顺序稳定 |
| **「全部 mod」叠** | Fisher–Yates 随机取 3 个，**每次展开都重新洗牌**（`reshuffle:true`） |
| 卡片悬停 → 信息浮窗 | 名称 + 简介 + 最多 4 条关键属性 + 下载提示 |
| 封面支持静态 / 动态两种 | 三形态：`<img>` 静态打底 → `<video>` 循环 → CSS `steps()` 逐帧序列图；无素材时降级为光扫微动效 |
| 点击卡片 → 下载链接 | **默认跳夸克网盘**；无夸克链的工具类回退详情页 |
| 详情页下载区 | **夸克网盘下载**（主按钮）+ **GitHub 下载**（次按钮）+ 全部 Mod 总盘入口 |
| 移动端适配 | <576px 悬停不存在 ⇒ 降级为横向 `scroll-snap` 卡条，取消旋转，浮窗改为卡底简介 |
| 首屏氛围 | 星云背景（3D 光点 + 透视 + 视差）+ 标题逐词浮动 + 指针彩色粒子拖尾 |

### 为什么铺开必须是「整行铺开」

不是审美选择，是算出来的硬约束。用 Python 实测量过：

- 6 张卡（5 个 mod + 1 个「更多」）以 `--tx-step:118px` 展开 ⇒ 需要约 **590px** 横向空间；
- 而 1440px 屏三叠并排时，每叠仅分到约 **373px**。

⇒ 370 < 590，在列内铺开必然重叠。因此展开态改用
`position:absolute; inset-inline:50%; transform:translateX(-50%)` 逃出列宽，
以列中心为锚向两侧对称溢出。

### 动态叠：为什么「全部 mod」每次展开都要重洗

`stack.js` 里两张动态叠由同一套渲染管线生成，唯一差别是 `cat.reshuffle`：

- `false`（最近更新）—— `sample()` 只在初始化时取一次，之后每次展开都一样；
- `true`（全部 mod）—— 展开前调 `refreshDynamicStack()` 重取 `randomMods(3)`，
  只替换 `<li>` 节点并重算居中偏移，不重建整叠（避免动画闪烁）。

采样函数在 `mods.js`：`recentLevels(n)` 按 `updatedAt` 降序；
`randomMods(n)` 用 Fisher–Yates 部分洗牌（不是 `sort(random)` —— 那个分布有偏）。


### 三条展开触发通道（缺一不可）

1. `:hover` —— 鼠标
2. `:focus-within` —— 键盘 Tab
3. `[data-open]` —— 触屏点击（由 JS 切换，同时维护 `aria-expanded`）

---

## 目录结构

```
.
├── index.html                     # 首页：Hero + 5 个牌叠 + 安装说明 + FAQ
├── plants.html / zombies.html / others.html   # 三个分类页
├── mod/
│   └── <mod-id>.html × 11         # 每个 Mod 的详情页（属性表 + 实现要点 + 双源下载）
├── assets/
│   ├── css/
│   │   ├── tokens.css             # 设计令牌（单一真源）
│   │   ├── base.css               # reset + 排版 + reduced-motion 兜底
│   │   ├── components.css         # 导航/按钮/卡片/浮窗/页脚
│   │   ├── stack.css              # 牌叠交互（本项目核心）
│   │   └── pages.css              # 页面级版式
│   ├── js/
│   │   ├── mods.js                # 数据层（唯一真源，新增 Mod 只改这里）
│   │   │                          #   含 QUARK_ALL / QUARK 夸克链接映射
│   │   │                          #   派生：primaryUrl / recentLevels / randomMods
│   │   ├── stack.js               # 牌叠渲染 + 展开交互（静态叠 + 2 个动态叠）
│   │   ├── shell.js               # 共享导航/页脚/面包屑 + 氛围背景层注入
│   │   ├── reveal.js              # 滚动入场 + 导航 + 自定义光标
│   │   ├── nebula.js              # 星云背景（canvas 3D 光点，还原参考站）
│   │   ├── cursor-trail.js        # 彩色粒子拖尾（canvas，桌面独占）
│   │   ├── cloud.js               # 云服务客户端（CDN 形式，publicConfig 单一真源）
│   │   ├── cloud-ui.js            # 云数据接 UI（计数徽章 / 点赞 / 留言 / 登录面板）
│   │   └── app.js                 # 入口，按顺序装配
│   └── img/
│       ├── covers/                # 11 张 512×512 封面
│       └── frames/                # 逐帧动画序列图
├── _build_pages.py                # 由单份模板生成 14 个页面（含夸克链接一致性自检）
├── _check_site.py                 # 验收自查 75 项（含 --neg 16 个负面用例）
├── _drive_verify.js               # 起静态服务 + 跑下面的浏览器验收（同进程，避免服务不跨调用存活）
├── _verify_interaction.js         # 真实浏览器交互验收（Playwright，28 项）
├── _verify_cloud.js               # 云服务关键路径验收（须跑在发布域，17 项）
└── _verify_live.js                # 线上站点冒烟验收（对真 URL）
```

---

## 视觉动效层（首屏）

三层增强，全部**只动 transform / 只走 canvas**，不触发页面重排：

| 层 | 实现 | 关键约束 |
|---|---|---|
| **星云背景** | `nebula.js`，canvas 2D + 3D 透视投影 + `'lighter'` 叠加发光 | 参考 [rstyro/html5/nebula](https://rstyro.github.io/html5/nebula.html) 还原；见下 |
| **标题浮动** | CSS `hero-float`，逐词独立相位 | 必须挂在**内层** `.hero__word`，见下 |
| **指针拖尾** | `cursor-trail.js`，预分配对象池 + 分档批量绘制 | 仅精细指针设备；`pointer-events:none` |

### 星云背景怎么还原的

参考站的核心机制全部保留：单位顶点 × `(w/5, h/5, w/5)` → 整体自转
→ 半径 200 的轨道偏移 → 相机 `z=150` → 透视投影；点与点之间用
`'lighter'` 叠加；相机以 `(指针 - 中心) × 0.8` 跟随做视差。

底不是纯黑，而是参考站取色的**深海军蓝径向渐变**
（`#000d4d` → `#000105`，锚在顶部中央）——
实拍取色确认了这一点，色相直方图还确认了点的色相只覆盖 **0°–210°**
（红→橙→黄→绿→青→蓝，**没有紫**），这是 `hue = 数组下标` 的直接结果。

**三处刻意的偏离**，都是因为这是一内容站而不是玩具页：

1. **不绑 `touchmove` 的 `preventDefault`** —— 原站这么写会**锁死移动端滚动**。
   改为 passive 的 `pointermove`，滚动照常。
2. **点击增点加了守卫与硬上限** —— 原站点一下 +100 且数组无限增长（内存泄漏）。
   这里只在"点到非交互元素"时增点，且总量封顶（`liveCount >= capCount` 即止）。
3. **转成 dt 积分 + 精灵化渲染** —— 原站用"每帧固定增量 + 每帧重建
   `radialGradient`"，120Hz 屏上速度会翻倍，且 200 次/帧创建渐变对象是
   实测的卡顿来源。这里角度按 `dt` 推进、渐变预渲染成 72 档色相精灵，
   逐帧只做 `drawImage` ⇒ **每帧零对象分配**。

### 标题浮动为什么必须两层元素

`index.html` 里 Hero 是「外层 `.hero__line` + 内层 `.hero__word`」：

- 外层负责布局与**入场**（`.reveal-group.is-visible > *` 会挂 `reveal-up`）
- 内层负责**常驻浮动**（`hero-float`）

⚠️ 若把两个动画挂在同一个元素上，`animation` 简写会被整条覆盖：
`.reveal-group.is-visible > *` 的权重是 `0,2,0`，高于 `.hero__line` 的 `0,1,0`
⇒ **浮动动画根本不生效**（实测 `getComputedStyle().animationName` 读出来是
`reveal-up`）。这正是必须用两层结构的原因。

四个词的 `--delay` / `--dur` / `--amp` 各不相同 ⇒ 任一瞬间四行处在
**不同高度**，而不是整块同步上下跳（那反而更呆板）。

### 性能实测（1440×900，滚动 + 移动指针制造负载）

| 指标 | 实测 |
|---|---|
| 平均帧 | **17.51 ms（≈57 fps）** |
| p95 帧 | 17 ms |
| 长帧（>33ms） | 217 帧中 **2 帧** |

降级路径全部实测有效：`prefers-reduced-motion` 下星云只画**一帧静态**
（两次采样像素逐字节相同 ⇒ rAF 循环确实没跑）、标题浮动关闭、拖尾不创建；
页面隐藏时 `visibilitychange` 停 rAF；触屏设备不创建拖尾。

---

## 云服务

站点已接入 WorkBuddy 云服务（应用 `PVZ杂交版 Mod 存放站`），形态为
**纯 HTML + CDN `<script>`**（无构建步骤 ⇒ 不走 npm）：

```html
<script src="https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js"></script>
```

`assets/js/cloud.js` 用公开配置初始化，**两个值都不可省**：

```js
const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',  // ← 发布域，勿硬编码到别处
  publishableKey: 'wbpk_...',                               // ← 只标识应用，本身不带权限
})
```

| 能力 | 数据表 / 方式 | 权限口径 |
|---|---|---|
| 下载数、点赞数 | `mod_stats` | 公开可读；**写入只走 RPC**（`bump_mod_download` / `bump_mod_like`，`SECURITY DEFINER` + 原子自增 + 步长钳制），客户端无法直改计数列 |
| 留言 | `mod_comments` | 公开可读（访客留言板）；写入/删除要求**真实登录身份**，`owner_id` 由 `DEFAULT auth.uid()` 服务端填充 |
| 登录 | `cloud.auth` | 仅邮箱（Web 端不支持手机号/微信登录） |

⚠️ 两条容易被忽略的口径：

1. **Web 端云服务按 exact Origin 绑定** —— localhost 与预览域都过不了校验，
   所以 `_verify_cloud.js` 必须打到发布域。
2. **未登录时 `auth.uid()` 返回字面量 `'anon'` 而非 NULL** ——
   因此 `owner_id = auth.uid()` 对匿名调用**同样成立**。
   `mod_comments` 的 INSERT/DELETE 策略额外加了
   `auth.uid() <> 'anon'`，否则匿名访客可以写留言（本次实测踩到并已修）。

云不可用时（CDN 挂掉 / 未发布 / Origin 不匹配），计数、点赞、留言三块**整体静默隐藏**，
浏览与下载主路径不受任何影响。

---

## 本地预览

纯静态站点，**无构建步骤**。任选一种：

```bash
# Python
python -m http.server 8791

# Node
npx serve .
```

然后打开 http://127.0.0.1:8791/

> ⚠️ 请用 HTTP 服务器打开，**不要直接双击 `index.html`** ——
> 页面用 ES module（`<script type="module">`），`file://` 协议下会被 CORS 拦截。

---

## 新增一个 Mod

要改**两个**文件（两者有一致性自检，改漏会被闸门拦住）：

1. `assets/js/mods.js` —— 数据层（`MODS` 数组 + `QUARK` 映射）
2. `_build_pages.py` —— 页面生成器（`MODS` 列表 + `QUARK` 字典）

```js
// assets/js/mods.js
{
  id: 'my-mod',                    // 决定详情页文件名 mod/my-mod.html
  name: '我的 Mod',
  category: 'plant',               // plant | zombie | other
  cardType: 'GOLD',                // GOLD | DIAMOND | MAP | TOOL（决定卡片顶边着色）
  version: '1.0.0',
  fileSize: 123456,
  pkgName: '我的 Mod.pmod',        // 留空 ⇒ 视为工具类，不给下载按钮/夸克链
  cardClass: '金卡',
  description: '一句话简介……',
  updatedAt: '2026-09-27',         // ★ 供「最近更新」叠排序（ISO 日期）
  tags: ['标签'],
  stats: [{ label: '血量', value: '1000' }],
  mechanics: ['实现要点一', '实现要点二'],
  cover: {
    static: 'assets/img/covers/my-mod.png',
    animated: null,                // 视频路径，或序列图路径
    frames: 0,                     // >1 时走 CSS steps 逐帧动画
    alt: '封面描述（无障碍必填）',
  },
  quark: QUARK['my-mod'],          // ★ 夸克独立链接（QUARK 字典里先加一条）
  download: 'https://.../my-mod.pmod',
}
```

然后在两处 `QUARK` 里各加一条（键 = `id`）：

```js
'my-mod': 'https://pan.quark.cn/s/xxxxxxxxxxxx',
```

最后重新生成页面：

```bash
python _build_pages.py     # 会自动与 mods.js 做双向一致性自检（含夸克链接）
```

首页牌叠、分类页、详情页会**自动出现**，无需改任何 HTML。

> ⚠️ 别忘了同步 `index.html` 里的 `data-stat` 统计数字（`_check_site.py` 的 D 段
> 会拿 mods.js 现算的计数与它对账，写错直接 FAIL）。

> ⚠️ 「最近更新」叠的成员来自 `recentLevels(3)`：先是 `cardType === 'MAP'`
> 的关卡，再由 `LEVEL_IDS` 补入没有 MAP 标记的关卡类工具（当前是 `gemmatch-builder`）。
> 新增关卡 Mod 时若仍是「其他」类且 `cardType` 不是 `MAP`，记得把它加进 `LEVEL_IDS`，
> 否则它进不了「最近更新」。


---

## 验收自查

```bash
python _check_site.py          # 75 项检查（含 22 项云服务静态断言 + 27 项动效层断言）
python _check_site.py --neg    # 额外跑 16 个负面用例（验证检查器本身有效）
node _drive_verify.js _verify_interaction.js   # 交互验收（28 项；同进程起服务，避免服务不跨调用存活）
node _drive_verify.js _verify_cloud.js         # 云服务关键路径验收（17 项，须打到发布域）
node _verify_live.js           # 对线上 URL 再跑一次冒烟（13 项）
```

覆盖范围：

- **A 引用完整性** —— HTML/CSS/JS 里每个本地资源都真实存在
- **B 链接完整性** —— 所有页内链接、封面图可解析
- **C JS 接线** —— 每页挂载 `app.js`、`data-depth` 与实际层级一致
- **D 数据一致性** —— 11 个 mod 在首页/分类页/详情页三处都出现，统计数字**由 mods.js 现算**（不手写）
- **D2 夸克双下载源** —— 每个有 `.pmod` 的 mod 各有独立夸克链、链接互不重复、
  详情页下载块同时含「本 mod 夸克链 + GitHub 双源 + 总链接」、
  分类页卡片默认跳夸克；两个动态叠存在且「全部 mod」声明 `reshuffle:true`
- **E 无障碍** —— `reduced-motion` 显式兜底、≥44px 触控目标、`:focus-visible`、
  **`brand-700` 绝不用作文字色**（对海军蓝底更糟）、每页有 `h1`/`lang`/`main`、
  **封面容器一律 `object-fit:contain`**（方图被 `cover` 会切主体）
- **F 云服务** —— publicConfig 三值齐备、无手写 `fetch` 打 `/.cloud/**`、
  计数走 RPC、插入不自带 `owner_id`、CDN 用 `@dev` 频道
- **H 视觉动效层** —— 背景层负层级、底渐变取参考站色值、
  星云保留 5 项核心机制、**渐变不得出现在渲染热路径**、
  **不得拦 `touchmove`**、增点必须有上限、标题浮动挂在内层且四相位互异、
  拖尾用对象池且 `pointer-events:none`

负面用例注入 16 种故障（删封面 / 改错 `data-depth` / 把 `brand-700` 当文字色 /
破坏 `reduced-motion` 兜底 / 把封面容器改回 `object-fit:cover` / 手写云 `fetch` /
直改计数 / 漏传 endpoint / 伪造 `owner_id` / **标题浮动退回外层** /
**星云逐帧创建渐变** / **背景层丢掉负层级** / **拖尾画布挡住点击** /
**详情页丢失夸克按钮** / **夸克链接串行** / **「全部 mod」叠丢失 `reshuffle`**），
断言检查器全部能抓到 —— 保证绿灯不是因为检查器瞎了。

> ⚠️ 扫 JS 源码做断言前**必须先剥注释**：`nebula.js` 的注释里专门写了
> "不绑 `touchmove` 的 `preventDefault`"，直接正则扫源码会把这句说明
> 当成违规命中（实测踩过这个假红）。

> ⚠️ 读 `dataset.dynamic` / `dataset.reshuffle` 要显式比 `=== 'true'`：
> 取到的是**字符串**，`"false"` 在 JS 里是真值，直接当布尔用会把所有叠都判成动态叠。


---

## 设计系统要点

| 维度 | 取值 |
|---|---|
| 背景底 | 深海军蓝径向渐变 `#000d4d → #000429 → #000105`（锚在顶部中央） |
| 前景 | `#ffffff`（对最亮背景 18.0:1 ✅） |
| 次级文本 | `#a1a1a1`（6.97:1 ✅） |
| 三级文本 | `#737373`（3.80:1，仅限大字 —— 底色由黑改海军蓝后**上调过**，见下） |
| 强调蓝（文字） | `#4d6cff`（5.4:1 ✅） |
| ⚠️ 强调蓝（装饰） | `#042db4`（2.5:1，**只能做图形，绝不做文字**） |
| 圆角 | 硬边，`border-radius: 0` 为默认；唯一例外是圆形徽标 |
| 标题面 | `Noto Sans SC`（**变体字体，200 是真字重**）/ `HarmonyOS Sans SC` → `PingFang SC` → 雅黑 |
| 标题字重 / 字距 | `200` / `-0.022em`（巨型字号下才有质感）；`font-synthesis:none` 禁合成字重 |
| 标题字面 | 渐变填充（白 → 淡蓝紫，`background-clip:text`）+ `drop-shadow` 光晕 |
| 中文负字距 | 最紧 `-0.022em`（仅巨型标题；正文仍 0） |
| 行高 | 正文 1.75 / 标题 1.15 / 巨型 0.92 |
| 断点 | 36em(576) · 50.625em(810) · 75em(1200) · 100em(1600) |

### ⚠️ 底色改造后必须复验对比度

底色从纯黑 `#000000` 换成海军蓝 `#000d4d` 之后，**所有文字的对比度都会下降**：

| 文本 | 对纯黑 | 对 `#000d4d` | 处置 |
|---|---|---|---|
| `#ffffff` | 21.0:1 | 18.0:1 ✅ | 不动 |
| `#a1a1a1` | 7.9:1 | 6.97:1 ✅ | 不动 |
| `#656565` | 3.9:1 | **3.09:1** ⚠️ | **上调到 `#737373`**（3.80:1） |

改深色主题的背景色时，这步很容易漏 —— 漏了就会出现"看起来还行、
但三级文本已经不达 3:1"的情况。

### 为什么标题不引 webfont

中文 webfont 动辄 3–8 MB，整包加载不现实；Google Fonts 在国内网络不可靠，
一旦失败就是 FOIT 白屏。而本机实测已装有 `NotoSansSC-VF.ttf`（100–900 全轴
可变字体）与 `HarmonyOS_Sans_SC` —— 把 Noto 排在微软雅黑**之前**，
`font-weight:200` 才是真的细（雅黑族只有 Light/Regular/Bold，200 取不到，
会"粗一档"）。所以走「系统里的高品质面 + 真实变体字重 + 紧字距 +
渐变字面」，首屏零网络依赖。

### 为什么极光光斑被移除了

先前那版背景有 4 个 CSS 动画光斑。接入星云后它们被删掉：星云本身就是
"会发光的一团"，两层都动会互相打架，也让移动端多背一份合成开销。
星云的 `'lighter'` 叠加已经提供了同等甚至更好的纵深。

---

## 无障碍

- 语义化 `h1` + 装饰性巨型排版 `aria-hidden`（避免读屏重复朗读）
- 「跳到主内容」skip-link
- 牌叠标签是真 `<button>`，带 `aria-expanded` 与 `aria-controls`
- 浮窗三通道可达：hover / `focus-within` / 触屏 `data-pop`
- `prefers-reduced-motion` 下**不是简单关动画**，而是显式 `opacity:1 !important`
  把内容恢复为可读网格 —— 否则 JS 未跑时内容永久空白
- 全部触控目标 ≥44px（WCAG 2.5.8）

---

## 版权

本站为个人作品展示，与游戏官方无关。
《植物大战僵尸》及《植物大战僵尸杂交版》的游戏本体与原始美术素材版权归各自原作者所有；
本站 Mod 内容由 **云漫行** 制作，仅供学习交流，请勿商用。
