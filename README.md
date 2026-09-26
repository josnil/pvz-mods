# 植物大战僵尸杂交版 · 个人 Mod 存放站

> 云漫行的《植物大战僵尸杂交版》（Godot 4 + C#）个人 Mod 作品集站点。
> 深色极简、硬边、巨型排版，主页三类 Mod 以**扑克牌叠**形式呈现，悬停自动展开。

**在线访问**：https://josnil.github.io/pvz-mods/

---

## 站点做了什么

| 交互 | 实现 |
|---|---|
| 主页三类 Mod 分叠摆放（植物 / 僵尸 / 其他） | 每叠收拢成一个紧凑扇形，`--rot-step` 与 `--tx-step` 极小 |
| 悬停某叠 → 动画铺开显示前 5 个 | 该叠 `position:absolute` **整行铺开**脱离 1/3 列宽约束；另两叠淡出到 `opacity:.25` |
| 超出 5 个 → 出现「更多 mod」入口 | 自动按分类尾部追加一张虚线卡，跳转对应分类页 |
| 卡片悬停 → 信息浮窗 | 名称 + 简介 + 最多 4 条关键属性 + 下载提示 |
| 封面支持静态 / 动态两种 | 三形态：`<img>` 静态打底 → `<video>` 循环 → CSS `steps()` 逐帧序列图；无素材时降级为光扫微动效 |
| 点击卡片 → 下载链接 | 跳该 Mod 详情页（详情页内提供 GitHub Release 直链） |
| 移动端适配 | <576px 悬停不存在 ⇒ 降级为横向 `scroll-snap` 卡条，取消旋转，浮窗改为卡底简介 |

### 为什么铺开必须是「整行铺开」

不是审美选择，是算出来的硬约束。用 Python 实测量过：

- 6 张卡（5 个 mod + 1 个「更多」）以 `--tx-step:118px` 展开 ⇒ 需要约 **590px** 横向空间；
- 而 1440px 屏三叠并排时，每叠仅分到约 **373px**。

⇒ 370 < 590，在列内铺开必然重叠。因此展开态改用
`position:absolute; inset-inline:50%; transform:translateX(-50%)` 逃出列宽，
以列中心为锚向两侧对称溢出。

### 三条展开触发通道（缺一不可）

1. `:hover` —— 鼠标
2. `:focus-within` —— 键盘 Tab
3. `[data-open]` —— 触屏点击（由 JS 切换，同时维护 `aria-expanded`）

---

## 目录结构

```
.
├── index.html                     # 首页：Hero + 三类牌叠 + 安装说明 + FAQ
├── plants.html / zombies.html / others.html   # 三个分类页
├── mod/
│   └── <mod-id>.html × 8          # 每个 Mod 的详情页（属性表 + 实现要点 + 下载）
├── assets/
│   ├── css/
│   │   ├── tokens.css             # 设计令牌（单一真源）
│   │   ├── base.css               # reset + 排版 + reduced-motion 兜底
│   │   ├── components.css         # 导航/按钮/卡片/浮窗/页脚
│   │   ├── stack.css              # 牌叠交互（本项目核心）
│   │   └── pages.css              # 页面级版式
│   ├── js/
│   │   ├── mods.js                # 数据层（唯一真源，新增 Mod 只改这里）
│   │   ├── stack.js               # 牌叠渲染 + 展开交互
│   │   ├── shell.js               # 共享导航/页脚/面包屑
│   │   ├── reveal.js              # 滚动入场 + 导航 + 自定义光标
│   │   └── app.js                 # 入口，按顺序装配
│   └── img/
│       ├── covers/                # 8 张 512×512 封面
│       └── frames/                # 逐帧动画序列图
├── _build_pages.py                # 由单份模板生成 11 个页面
└── _check_site.py                 # 验收自查（含 --neg 负面用例）
```

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

只改一个文件：`assets/js/mods.js` 的 `MODS` 数组。

```js
{
  id: 'my-mod',                    // 决定详情页文件名 mod/my-mod.html
  name: '我的 Mod',
  category: 'plant',               // plant | zombie | other
  cardType: 'GOLD',                // GOLD | DIAMOND | MAP | TOOL（决定卡片顶边着色）
  version: '1.0.0',
  fileSize: 123456,
  pkgName: '我的 Mod.pmod',
  cardClass: '金卡',
  description: '一句话简介……',
  tags: ['标签'],
  stats: [{ label: '血量', value: '1000' }],
  mechanics: ['实现要点一', '实现要点二'],
  cover: {
    static: 'assets/img/covers/my-mod.png',
    animated: null,                // 视频路径，或序列图路径
    frames: 0,                     // >1 时走 CSS steps 逐帧动画
    alt: '封面描述（无障碍必填）',
  },
  download: 'https://.../my-mod.pmod',
}
```

然后重新生成页面：

```bash
python _build_pages.py     # 会自动与 mods.js 做双向一致性自检
```

首页牌叠、分类页、详情页会**自动出现**，无需改任何 HTML。

---

## 验收自查

```bash
python _check_site.py          # 20 项检查
python _check_site.py --neg    # 额外跑 4 个负面用例（验证检查器本身有效）
```

覆盖范围：

- **A 引用完整性** —— HTML/CSS/JS 里每个本地资源都真实存在
- **B 链接完整性** —— 所有页内链接、封面图可解析
- **C JS 接线** —— 每页挂载 `app.js`、`data-depth` 与实际层级一致
- **D 数据一致性** —— 8 个 mod 在首页/分类页/详情页三处都出现，统计数字对得上
- **E 无障碍** —— `reduced-motion` 显式兜底、≥44px 触控目标、`:focus-visible`、
  **`brand-700` 绝不用作文字色**（对黑底仅 2.5:1）、每页有 `h1`/`lang`/`main`

负面用例注入 4 种故障（删封面 / 改错 `data-depth` / 把 `brand-700` 当文字色 /
破坏 `reduced-motion` 兜底），断言检查器全部能抓到 —— 保证绿灯不是因为检查器瞎了。

---

## 设计系统要点

| 维度 | 取值 |
|---|---|
| 背景 / 前景 | `#000` / `#fff` |
| 次级文本 | `#a1a1a1`（对黑底 7.0:1 ✅） |
| 强调蓝（文字） | `#4d6cff`（5.4:1 ✅） |
| ⚠️ 强调蓝（装饰） | `#042db4`（2.5:1，**只能做图形，绝不做文字**） |
| 圆角 | 硬边，`border-radius: 0` 为默认；唯一例外是圆形徽标 |
| 字体 | `TWK Lausanne` 300/400/500 → `Inter` → `PingFang SC` / `Microsoft YaHei` |
| 中文负字距 | 最紧 `-0.01em`（中文过度收紧会挤成一团） |
| 行高 | 正文 1.75 / 标题 1.15 / 巨型 0.95 |
| 断点 | 36em(576) · 50.625em(810) · 75em(1200) · 100em(1600) |

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
