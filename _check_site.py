"""
_check_site.py — 站点验收自查（静态 + 结构 + 无障碍）

覆盖：
  A. 引用完整性  —— HTML/CSS/JS 里出现的每个本地资源都要真实存在
  B. 链接完整性  —— 所有页内 <a href> 指向的本地页面都要存在
  C. JS 接线     —— 每个页面必须挂 app.js，且 body 带 data-depth
  D. 数据一致性  —— 12 个 mod 在首页/分类页/详情页三处都要出现
  E. 无障碍      —— 焦点样式、reduced-motion 兜底、触控目标、aria 属性
  F. 云服务      —— publicConfig、计数走 RPC、留言权限口径
  H. 动效层      —— 星云 / 标题浮动 / 拖尾的性能与降级约束
  G. 负面用例（--neg）—— 故意注入坏数据，断言检查器能抓到
"""

import os
import re
import sys
import json
import shutil
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
NEG = '--neg' in sys.argv

PASS, FAIL = [], []


def ok(m):
    PASS.append(m)


def bad(m):
    FAIL.append(m)


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def walk_html():
    out = []
    for dirpath, _, files in os.walk(ROOT):
        if '.git' in dirpath:
            continue
        for fn in files:
            if fn.endswith('.html'):
                out.append(os.path.join(dirpath, fn))
    return sorted(out)


def rel_depth(page):
    """页面到站点根的层级"""
    rel = os.path.relpath(page, ROOT).replace('\\', '/')
    return rel.count('/')


# ══════════════════════════════════════════════════════════════
# A. 引用完整性
# ══════════════════════════════════════════════════════════════

def check_refs():
    pages = walk_html()
    missing = []
    for p in pages:
        html = read(p)
        depth = rel_depth(p)
        base = os.path.dirname(p)

        # <link href> / <script src> / <img src>
        refs = re.findall(r'(?:href|src)="([^"]+)"', html)
        for r in refs:
            if r.startswith(('http://', 'https://', '#', 'mailto:', 'data:', '//')):
                continue
            if r.endswith('.html') and r.split('#')[0] and not os.path.exists(
                    os.path.normpath(os.path.join(base, r))):
                missing.append((p, r, 'page'))

        # JS 里 import ... from './x.js'
        if p.endswith('.html'):
            continue

    # JS 模块引用
    for js in ('app.js', 'shell.js', 'stack.js', 'reveal.js'):
        jp = os.path.join(ROOT, 'assets', 'js', js)
        if not os.path.exists(jp):
            bad('缺少 JS 模块 assets/js/%s' % js)
            continue
        for imp in re.findall(r"from\s+'\./([^']+)'", read(jp)):
            if not os.path.exists(os.path.join(ROOT, 'assets', 'js', imp)):
                missing.append((jp, imp, 'js-import'))

    # CSS 里 url()
    for css in os.listdir(os.path.join(ROOT, 'assets', 'css')):
        cp = os.path.join(ROOT, 'assets', 'css', css)
        for u in re.findall(r"url\(['\"]?([^'\")]+)", read(cp)):
            if u.startswith(('http', 'data:', '#')):
                continue
            target = os.path.normpath(os.path.join(ROOT, 'assets', 'css', u))
            if not os.path.exists(target):
                missing.append((cp, u, 'css-url'))

    if missing:
        for p, r, kind in missing:
            bad('引用缺失[%s] %s → %s' % (kind, os.path.relpath(p, ROOT), r))
    else:
        ok('A 引用完整性：所有本地资源均存在')


# ══════════════════════════════════════════════════════════════
# B. 链接完整性（含封面图 & 详情页互链）
# ══════════════════════════════════════════════════════════════

def check_links():
    pages = walk_html()
    broken = []

    # 收集页面里出现的本地 png/jpg 引用
    for p in pages:
        html = read(p)
        base = os.path.dirname(p)
        for r in re.findall(r'(?:src|url\()["\']?([^"\')]+\.(?:png|jpg|jpeg|webp))', html, re.I):
            if r.startswith('http'):
                continue
            if not os.path.exists(os.path.normpath(os.path.join(base, r))):
                broken.append((p, r))

    if broken:
        for p, r in broken:
            bad('图片缺失 %s → %s' % (os.path.relpath(p, ROOT), r))
    else:
        ok('B 链接完整性：所有封面/序列帧图片均可解析')

    # 首页必须能路由到每个分类页，分类页必须能到每个详情页
    idx = read(os.path.join(ROOT, 'index.html'))
    for slug in ('plants', 'zombies', 'others'):
        if '%s.html' % slug not in idx and slug not in idx:
            bad('首页未链接到分类页 %s.html' % slug)
    else:
        ok('B 首页 → 3 个分类页路由齐备（由 shell.js + stack.js 注入）')


# ══════════════════════════════════════════════════════════════
# C. JS 接线
# ══════════════════════════════════════════════════════════════

def check_wiring():
    pages = walk_html()
    problems = []
    for p in pages:
        html = read(p)
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        depth = rel.count('/')

        if 'assets/js/app.js' not in html:
            problems.append('%s 未挂载 app.js' % rel)

        expect = 'data-depth="%d"' % depth
        if expect not in html:
            problems.append('%s 的 data-depth 应为 %d（实际未匹配 "%s"）'
                            % (rel, depth, expect))

        if 'data-shell-nav' not in html:
            problems.append('%s 缺少导航占位 data-shell-nav' % rel)
        if 'data-shell-footer' not in html:
            problems.append('%s 缺少页脚占位 data-shell-footer' % rel)

        # module 脚本引用要做到正确层级
        u = '../' * depth
        if ('src="%sassets/js/app.js"' % u) not in html:
            problems.append('%s 的脚本路径层级不对（应为 %sassets/js/app.js）' % (rel, u))

    if problems:
        for x in problems:
            bad('C 接线 %s' % x)
    else:
        ok('C JS 接线：%d 个页面均挂载 app.js、占位与 depth 正确' % len(pages))


# ══════════════════════════════════════════════════════════════
# D. 数据一致性
# ══════════════════════════════════════════════════════════════

MOD_IDS = ['supergatlingpea', 'ultimatecherrygod', 'supergatlingpaper',
           'sunflowerqueenzombie', 'discogargantuarpult',
           'vampirepool', 'gemmatch-builder', 'mod-editor',
           'peaoverhaul', 'nailongzombie', 'pandorapool',
           'drawandguess']


def check_data():
    js = read(os.path.join(ROOT, 'assets', 'js', 'mods.js'))
    idx = read(os.path.join(ROOT, 'index.html'))

    # 1) mods.js 里 12 条 id 齐备
    miss = [mid for mid in MOD_IDS if ("id: '%s'" % mid) not in js]
    if miss:
        bad('D mods.js 缺少 %s' % ', '.join(miss))
    else:
        ok('D mods.js 含全部 %d 条 mod 数据' % len(MOD_IDS))

    # 2) 每个 mod 的详情页存在
    miss = [mid for mid in MOD_IDS
            if not os.path.exists(os.path.join(ROOT, 'mod', '%s.html' % mid))]
    if miss:
        bad('D 详情页缺失 %s' % ', '.join('mod/%s.html' % m for m in miss))
    else:
        ok('D %d 个 mod 详情页齐备' % len(MOD_IDS))

    # 3) 每个分类页要包含该分类下所有 mod 的详情链接
    #    ⚠️ 不用 json.loads 硬转 JS 字面量（键名不带引号必然炸）——
    #       直接用正则从 CATEGORIES 块里抠 slug/key
    cat_block = re.search(r'export const CATEGORIES = \[(.*?)\n\];', js, re.S)
    if not cat_block:
        bad('D 未能从 mods.js 解析出 CATEGORIES')
        return
    cb = cat_block.group(1)
    cats = []
    for m in re.finditer(r"key:\s*'([^']+)'.*?slug:\s*'([^']+)'", cb, re.S):
        cats.append(dict(key=m.group(1), slug=m.group(2)))
    if len(cats) != 3:
        bad('D CATEGORIES 应解析出 3 个分类，实际 %d' % len(cats))

    for cat in cats:
        cp = os.path.join(ROOT, '%s.html' % cat['slug'])
        if not os.path.exists(cp):
            bad('D 分类页缺失 %s.html' % cat['slug'])
            continue
        chtml = read(cp)
        # 该分类下的 mod id：从 MODS 块中取 category 匹配的条目
        cat_ids = re.findall(
            r"id:\s*'([^']+)',\s*\n\s*name:\s*'[^']+',\s*\n\s*category:\s*'%s'"
            % cat['key'], js)
        if not cat_ids:
            bad('D 未解析出 category=%s 的 mod' % cat['key'])
            continue
        for cid in cat_ids:
            if 'mod/%s.html' % cid not in chtml:
                bad('D %s.html 未链接到 mod/%s.html' % (cat['slug'], cid))
        ok('D %s.html 覆盖 %d 个 mod 的详情链接' % (cat['slug'], len(cat_ids)))

    # 4) 首页统计数字与实际一致
    #    ★ 数字不手写：从 mods.js 的 MODS 块里数，避免"改了数据忘了改断言"
    #    ⚠️ 字段名是 category（值 = 'plant'/'zombie'/'other'），
    #       data-stat 的键是复数 slug（plants/zombies/others）—— 两套命名要显式映射。
    cat_blk = re.search(r'export const MODS = \[(.*?)\n\];', js, re.S)
    counts = {}
    if cat_blk:
        for m in re.finditer(r"category:\s*'([^']+)'", cat_blk.group(1)):
            counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    total = len(MOD_IDS)
    expect = [('total', total)]
    for key, slug in (('plant', 'plants'), ('zombie', 'zombies'),
                      ('other', 'others')):
        expect.append((slug, counts.get(key, 0)))
    drift = [k for k, n in expect if 'data-stat="%s">%d<' % (k, n) not in idx]
    if drift:
        bad('D 首页统计与 mods.js 实际不符：%s（实际 %s）'
            % (drift, dict(expect)))
    else:
        ok('D 首页统计数字与 mods.js 实际 mod 数一致（%s）'
           % ' / '.join('%s=%d' % kv for kv in expect))

    # 5) ★ 夸克链接：mods.js 的 QUARK / QUARK_ALL 与详情页/分类页字面量双向对齐
    check_quark(js)


# ══════════════════════════════════════════════════════════════
# D2. 夸克网盘双下载源
#
#   口径（用户明确要求）：
#     · 每个 mod 一个独立夸克链接；全部 mod 再给一个总链接
#     · 卡片点击默认跳夸克；详情页同时给「夸克」+「GitHub」两个按钮
#   ⚠️ 这里刻意做**双向**比对：mods.js ↔ 详情页 HTML 字面量。
#      单向（只查"页面里有夸克字样"）会漏掉"链接串错行"这类真实缺陷
#      （早前 pandorapool 详情页就是因为 dl_html 被覆盖，
#        渲染出的按钮里压根没有夸克 —— 只查 # 号不足以发现）。
# ══════════════════════════════════════════════════════════════

def parse_quark_map(js):
    """从 mods.js 抽 QUARK_ALL 与 QUARK{id:url}（唯一真源）

    ⚠️ 块边界用 `\\n};`（对象以 `};` 收尾）；只写 `\\n}` 会匹配不到，
       症状是"QUARK 覆盖 0 个 mod"这种假红。
    """
    allm = re.search(r"QUARK_ALL\s*=\s*'([^']+)'", js)
    block = re.search(r'const QUARK = \{(.*?)\n\};', js, re.S)
    per = {}
    if block:
        for m in re.finditer(
                r"([A-Za-z0-9_-]+)\s*:\s*'(https://pan\.quark\.cn/s/[0-9a-f]+)'",
                block.group(1)):
            per[m.group(1)] = m.group(2)
    return (allm.group(1) if allm else ''), per


def pkg_mods(js):
    """有 .pmod 包的 mod（工具类 pkgName 为空 ⇒ 不给夸克链/download）"""
    blk = re.search(r'export const MODS = \[(.*?)\n\];', js, re.S)
    if not blk:
        return []
    out = []
    for m in re.finditer(r"id:\s*'([^']+)'([\s\S]*?)(?=\n  \{|\n\];)",
                         blk.group(1)):
        mid, body = m.group(1), m.group(2)
        pm = re.search(r"pkgName:\s*'([^']*)'", body)
        if pm and pm.group(1).strip():
            out.append(mid)
    return out


def check_quark(js=None):
    js = js or read(os.path.join(ROOT, 'assets', 'js', 'mods.js'))
    quark_all, per = parse_quark_map(js)
    with_pkg = pkg_mods(js)

    if not quark_all:
        bad('D2 mods.js 缺少 QUARK_ALL 总链接')
    elif not re.match(r'^https://pan\.quark\.cn/s/[0-9a-f]+$', quark_all):
        bad('D2 QUARK_ALL 不是合法夸克分享链接：%s' % quark_all)
    else:
        ok('D2 QUARK_ALL 存在且格式合法（全部 mod 总链接）')

    # ★ 覆盖率以"有 .pmod 包的 mod"为分母 —— 工具类（构建器/编辑器）
    #   本身没有可分享的包文件，不该强行给夸克链（会造出死链）。
    miss = [mid for mid in with_pkg if mid not in per]
    if miss:
        bad('D2 以下有 .pmod 的 mod 缺夸克链接：%s' % ', '.join(miss))
    else:
        ok('D2 %d 个有 .pmod 的 mod 各有独立夸克链接（工具类除外，无包可分享）'
           % len(with_pkg))

    dup = [u for u in set(per.values()) if list(per.values()).count(u) > 1]
    if dup:
        bad('D2 存在重复的夸克链接（不同 mod 不该共用）：%s' % dup)
    else:
        ok('D2 各 mod 夸克链接互不重复（一 mod 一链）')

    # ── 逐详情页：主下载块必须同时含「本 mod 的夸克链」+「GitHub 下载」 ──
    #    工具类（无 .pmod）没有下载块，跳过 —— 它们只有仓库/总盘入口。
    checked = 0
    for mid in with_pkg:
        p = os.path.join(ROOT, 'mod', '%s.html' % mid)
        if not os.path.exists(p):
            continue
        html = read(p)
        blk = re.search(r'data-download-block.*?</div>\s*</div>', html, re.S)
        blk = blk.group(0) if blk else html
        checked += 1
        if quark_all not in blk:
            bad('D2 %s 详情页下载块缺「全部 Mod」总链接' % mid)
        if mid in per:
            if per[mid] not in blk:
                bad('D2 %s 详情页下载块未含自身夸克链 %s' % (mid, per[mid]))
            if '夸克网盘下载' not in blk:
                bad('D2 %s 详情页缺夸克下载按钮' % mid)
            if 'github.com/josnil/pvz-mods/releases' not in blk:
                bad('D2 %s 详情页缺 GitHub 下载按钮（双源要求）' % mid)
            # ★ 资产名必须是 <id>.pmod（真源见 mods.js 的 download 字段）。
            #   只断言域名前缀会漏掉「指向包内中文文件名」这类死链
            #   （实测踩过：所有 GitHub 下载按钮都指到不存在的资产）。
            if 'releases/latest/download/%s.pmod' % mid not in blk:
                bad('D2 %s 详情页的 GitHub 下载资产名不对（应为 %s.pmod）'
                    % (mid, mid))
    ok('D2 %d 个详情页下载块含「本 mod 夸克链 + GitHub 双源 + 总链接」'
       % checked)

    # ── 分类页卡片：主按钮必须是夸克外链（点击默认跳夸克） ──
    slug_of = {}
    cb = re.search(r'export const CATEGORIES = \[(.*?)\n\];', js, re.S)
    if cb:
        for m in re.finditer(r"key:\s*'([^']+)'[\s\S]*?slug:\s*'([^']+)'",
                             cb.group(1)):
            slug_of[m.group(1)] = m.group(2)
    for key, slug in slug_of.items():
        cp = os.path.join(ROOT, '%s.html' % slug)
        if not os.path.exists(cp):
            continue
        chtml = read(cp)
        for m in re.finditer(r'data-mod-card="([^"]+)"', chtml):
            cid = m.group(1)
            seg = chtml[m.start():m.start() + 6000]
            if cid in per and per[cid] not in seg:
                bad('D2 %s.html 的 %s 卡片未跳夸克（应默认跳夸克）' % (slug, cid))
    ok('D2 分类页卡片主按钮默认跳夸克链接')

    # ── stack.js：随机/最近两个动态叠的存在与"每次展开重洗" ──
    st = read(os.path.join(ROOT, 'assets', 'js', 'stack.js'))
    for k in ('recent', 'all'):
        if ("key: '%s'" % k) not in st:
            bad('D2 stack.js 缺少动态牌叠 %s' % k)
    else:
        ok('D2 stack.js 含「最近更新」+「全部 mod」两个动态牌叠')

    if re.search(r'reshuffle:\s*true', st):
        ok('D2 「全部 mod」叠声明了 reshuffle（每次展开重随机）')
    else:
        bad('D2 「全部 mod」叠未声明 reshuffle（不会重随机）')

    mjs = read(os.path.join(ROOT, 'assets', 'js', 'mods.js'))
    if 'export function recentLevels' in mjs and 'export function randomMods' in mjs:
        ok('D2 mods.js 导出 recentLevels / randomMods 采样函数')
    else:
        bad('D2 mods.js 缺 recentLevels / randomMods 采样函数')

    if 'export function primaryUrl' in mjs:
        ok('D2 mods.js 导出 primaryUrl（卡片默认去向：夸克优先）')
    else:
        bad('D2 mods.js 缺 primaryUrl（卡片默认跳夸克未生效）')


# ══════════════════════════════════════════════════════════════
# E. 无障碍
# ══════════════════════════════════════════════════════════════

def check_a11y():
    base = read(os.path.join(ROOT, 'assets', 'css', 'base.css'))
    comp = read(os.path.join(ROOT, 'assets', 'css', 'components.css'))
    stack = read(os.path.join(ROOT, 'assets', 'css', 'stack.css'))
    tokens = read(os.path.join(ROOT, 'assets', 'css', 'tokens.css'))
    pages = walk_html()
    idx = read(os.path.join(ROOT, 'index.html'))

    # 1) reduced-motion 兜底必须把内容显式可见（否则 JS 未跑则永久空白）
    if 'opacity: 1 !important' not in base:
        bad('E base.css 的 prefers-reduced-motion 未显式恢复 opacity')
    else:
        ok('E reduced-motion 有显式 opacity:1 兜底')

    if 'prefers-reduced-motion' not in stack:
        bad('E stack.css 缺 prefers-reduced-motion 降级')
    else:
        ok('E 牌叠在 reduced-motion 下降级为普通网格')

    # 2) 触控目标 ≥44px
    if 'min-height: 44px' not in comp:
        bad('E 组件缺 ≥44px 触控目标')
    else:
        ok('E 按钮/导航/抽屉项均 ≥44px 触控目标')

    # 3) 焦点可见
    if ':focus-visible' not in base:
        bad('E 缺 :focus-visible 焦点样式')
    else:
        ok('E 存在 :focus-visible 焦点环')

    # 4) brand-700 不得作为文字色（仅 2.5:1）
    offenders = []
    for name, txt in (('base.css', base), ('components.css', comp),
                      ('stack.css', stack), ('pages.css',
                       read(os.path.join(ROOT, 'assets', 'css', 'pages.css')))):
        for m in re.finditer(r'color:\s*var\(--brand-700\)', txt):
            offenders.append(name)
    if offenders:
        bad('E brand-700 被用作文字色（对比度仅 2.5:1）：%s' % set(offenders))
    else:
        ok('E 未把 brand-700 用作文字色（深底蓝字一律 brand-400）')

    # 5) 每个页面必须有 h1 与 lang
    for p in pages:
        html = read(p)
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        if '<h1' not in html:
            bad('E %s 缺少 h1' % rel)
        if 'lang="zh-CN"' not in html:
            bad('E %s 缺少 lang="zh-CN"' % rel)
    ok('E %d 个页面均有 h1 与 lang 声明' % len(pages))

    # 6) 跳转链接 + main landmark
    for p in pages:
        html = read(p)
        rel = os.path.relpath(p, ROOT).replace('\\', '/')
        if 'id="main"' not in html:
            bad('E %s 缺 main landmark' % rel)
    ok('E 所有页面均有 id="main" 主内容地标（配合 shell.js 的 skip-link）')

    # 7) 装饰性元素必须 aria-hidden
    if 'aria-hidden="true"' not in idx:
        bad('E 首页装饰性巨型排版未 aria-hidden')
    else:
        ok('E 装饰性巨型排版已 aria-hidden，语义由 sr-only h1 承担')

    # 8) 抽屉/牌叠的 aria-expanded 由 JS 管理
    for f in ('shell.js', 'stack.js'):
        src = read(os.path.join(ROOT, 'assets', 'js', f))
        if 'aria-expanded' not in src:
            bad('E %s 未维护 aria-expanded' % f)
    ok('E 导航抽屉与牌叠均通过 aria-expanded 暴露展开态')

    # 9) 浮窗不应只用 hover（触屏与键盘也要）
    if 'focus-within' not in comp:
        bad('E 信息浮窗仅 hover 触发，键盘/触屏不可达')
    else:
        ok('E 信息浮窗支持 hover + focus-within + data-pop 三通道')

    # 10) ★ 封面不许被 cover 裁切
    #     背景：所有封面都是 512×512 方图，且美术主体占满 ~88% 宽度。
    #     若封面容器是竖版/横版（3:4、16:10）却用 object-fit:cover，
    #     浏览器会**以容器比例放大再裁边**，主体被切 —— 实测肉眼可见
    #     （牌叠卡曾把主体左右各切 12.5%）。故：凡承载封面的选择器一律 contain。
    pagescss = read(os.path.join(ROOT, 'assets', 'css', 'pages.css'))
    both = comp + '\n' + pagescss
    cover_sel = ('.mod-card__media img', '.mod-card__video',
                 '.detail__media img', '.tile__media img')
    offending = []
    for sel in cover_sel:
        # 取出该选择器（可能多选择器逗号分隔，逐个找）的声明块
        for probe in sel.split(','):
            probe = probe.strip()
            i = both.find(probe + ' {')
            if i < 0:
                i = both.find(probe + ' {'.replace(' ', '\n'))
            if i < 0:
                continue
            j = both.find('}', i)
            blk = both[i:j] if j > i else ''
            # 去掉注释再判断，避免注释里的 "cover" 误伤
            blk = re.sub(r'/\*.*?\*/', '', blk, flags=re.S)
            if re.search(r'object-fit\s*:\s*cover', blk):
                offending.append(sel)
                break
    if offending:
        bad('E 封面容器用了 object-fit:cover（方图会被裁切）：' + ', '.join(offending))
    else:
        ok('E 封面容器一律 object-fit:contain（1:1 方图零裁切）')


# ══════════════════════════════════════════════════════════════
# F. 云服务接入（静态可验证部分）
#
#   真正打云端的验证在 _verify_cloud.js（必须跑在发布域上，
#   因为 Web 端按 exact Origin 绑定）。这里只做**静态**断言，
#   把「配置齐全 / 无裸 fetch / 调用点都带 endpoint + key」钉死。
# ══════════════════════════════════════════════════════════════

def check_cloud():
    jsdir = os.path.join(ROOT, 'assets', 'js')
    cloud_p = os.path.join(jsdir, 'cloud.js')
    ui_p = os.path.join(jsdir, 'cloud-ui.js')

    if not os.path.exists(cloud_p):
        bad('F cloud.js 不存在（云接入缺失）')
        return
    if not os.path.exists(ui_p):
        bad('F cloud-ui.js 不存在（云 UI 缺失）')
        return

    cloud = _read(cloud_p)
    ui = _read(ui_p)

    # ── F1. publicConfig 三个值齐备且非占位 ──────────────────
    need = {
        'resourceId': r"resourceId:\s*'(wbcs_[A-Za-z0-9]+)'",
        'endpoint': r"endpoint:\s*'(https://[^']+)'",
        'publishableKey': r"publishableKey:\s*'(wbpk_[A-Za-z0-9_]+)'",
    }
    missing = []
    for k, pat in need.items():
        m = re.search(pat, cloud)
        if not m:
            missing.append(k)
    if missing:
        bad('F publicConfig 缺字段或格式不对：' + ', '.join(missing))
    else:
        ok('F publicConfig 三值齐备（resourceId / endpoint / publishableKey）')

    # ── F2. endpoint 必须来自 publicConfig，不许硬编码在别处 ──
    #      （在 cloud.js 里只允许出现一次，即配置对象那行）
    ep_hits = re.findall(r"https://pvz-mods-gallery\.app\.workbuddy\.host", cloud)
    if len(ep_hits) > 1:
        bad('F endpoint 字面量出现 %d 次（应只在 publicConfig 中一次）' % len(ep_hits))
    else:
        ok('F endpoint 仅出现在 publicConfig 一处（无散落硬编码）')

    # ── F3. 初始化必须同时传 endpoint 与 publishableKey ──────
    initm = re.search(r'createWorkBuddyCloud\(\{([^}]*)\}', cloud, re.S)
    if not initm:
        bad('F 未找到 createWorkBuddyCloud 初始化调用')
    else:
        body = initm.group(1)
        has_ep = 'endpoint' in body
        has_pk = 'publishableKey' in body
        if has_ep and has_pk:
            ok('F 初始化同时传入 endpoint + publishableKey')
        else:
            bad('F 初始化缺参数：%s'
                % ', '.join([x for x, v in
                             [('endpoint', has_ep), ('publishableKey', has_pk)] if not v]))

    # ── F4. 禁止手写 fetch 打 /.cloud/** ─────────────────────
    both = cloud + '\n' + ui
    if re.search(r"fetch\(\s*['\"`][^'\"`]*/\.cloud/", both):
        bad('F 出现手写 fetch 打 /.cloud/**（应一律走 SDK）')
    else:
        ok('F 无手写 fetch 打 /.cloud/**（全部经 SDK）')

    # ── F5. 禁止引入第二套客户端（cloudbase / supabase）──────
    badsdk = []
    for name in ('@cloudbase/js-sdk', 'createClient(', 'supabase'):
        if name in both:
            badsdk.append(name)
    if badsdk:
        bad('F 引入了他家客户端：' + ', '.join(badsdk))
    else:
        ok('F 未引入 cloudbase/supabase 等第二套客户端')

    # ── F6. CDN 形式：用 @dev 频道且挂全局 ───────────────────
    cdnm = re.search(r"jsdelivr\.net/npm/@tencent-ai/workbuddy-cloud-sdk@([\w.\-]+)/", cloud)
    if not cdnm:
        bad('F 未找到 SDK CDN 地址')
    elif cdnm.group(1) == 'latest':
        bad('F SDK 用了 @latest 频道（应用 @dev）')
    else:
        ok('F SDK 走 CDN @%s 频道（非 @latest）' % cdnm.group(1))
    if 'WorkBuddyCloud' in cloud:
        ok('F 通过 WorkBuddyCloud 全局访问（CDN/IIFE 形式）')
    else:
        ok('F 云客户端入口已定义')

    # ── F7. 禁止匿名登录 / 本地假会话 ───────────────────────
    if re.search(r'signInAnonymously|createMockSession|fakeSession', both):
        bad('F 出现匿名登录或伪造会话')
    else:
        ok('F 无匿名登录 / 伪造会话')

    # ── F8. 计数写入必须走 RPC，不许客户端直改计数列 ─────────
    #      直改 = 任意篡改；只有 SECURITY DEFINER 的 bump_* 能改
    #      函数名以字面量传入 callBump(...) → 内层 .rpc(fn, ...)
    rpc_dl = "'bump_mod_download'" in cloud
    rpc_lk = "'bump_mod_like'" in cloud
    rpc_call = re.search(r"\.rpc\(\s*fn\s*,", cloud) is not None
    direct = re.search(r"from\('mod_stats'\)[\s\S]{0,120}?\.update\(", cloud)
    if direct:
        bad('F 客户端直接 update mod_stats（可被篡改）')
    elif rpc_dl and rpc_lk and rpc_call:
        ok('F 计数写入走 RPC（bump_mod_download / bump_mod_like）')
    else:
        bad('F 未找到计数 RPC 调用（dl=%s lk=%s call=%s）'
            % (rpc_dl, rpc_lk, rpc_call))

    # ── F9. 写留言不得自带 owner_id（须由 DEFAULT auth.uid() 填）─
    ins = re.search(r"from\('mod_comments'\)\s*\.insert\(\{([^}]*)\}", cloud, re.S)
    if not ins:
        bad('F 未找到 mod_comments 插入调用')
    elif 'owner_id' in ins.group(1):
        bad('F 插入留言时自带了 owner_id（应由服务端 DEFAULT 填）')
    else:
        ok('F 插入留言未自带 owner_id（服务端 DEFAULT 填充）')

    # ── F10. 页面挂钩点齐备 ─────────────────────────────────
    detail = _walk(ROOT, '.html')
    hooks = {'data-like-btn': 0, 'data-comments': 0, 'data-auth-panel': 0,
             'data-comment-form': 0, 'data-comment-gate': 0}
    for p in detail:
        t = _read(p)
        for h in hooks:
            if h in t:
                hooks[h] += 1
    absent = [h for h, n in hooks.items() if n == 0]
    if absent:
        bad('F 详情页缺少云挂钩点：' + ', '.join(absent))
    else:
        ok('F 详情页挂点齐备：点赞 / 留言 / 登录面板挂钩点均已出现')

    # 首页与分类页的卡片需要 data-mod-card（计数徽章的落点）
    cardhosts = 0
    for p in detail:
        if 'data-mod-card' in _read(p):
            cardhosts += 1
    if cardhosts >= 3:
        ok('F %d 个页面含 data-mod-card（计数徽章可落点）' % cardhosts)
    else:
        bad('F data-mod-card 落点不足（仅 %d 个页面）' % cardhosts)

    # ── F11. app.js 必须初始化云 UI ──────────────────────────
    app = _read(os.path.join(jsdir, 'app.js'))
    if 'initCloudUi' in app and 'cloud-ui.js' in app:
        ok('F app.js 已接线 initCloudUi')
    else:
        bad('F app.js 未接线 initCloudUi')


# ══════════════════════════════════════════════════════════════
# H. 视觉效果层（星云背景 / 标题浮动 / 指针拖尾）
# ══════════════════════════════════════════════════════════════

def check_effects():
    """断言三层视觉增强的**机制**都在，且降级路径完整。

    ⚠️ 这里刻意只验"机制与降级"，不去验"好不好看"——
       观感由截图人眼判定；能自动化的只有结构约束。
    """
    cssdir = os.path.join(ROOT, 'assets', 'css')
    jsdir = os.path.join(ROOT, 'assets', 'js')

    def css(name):
        return _read(os.path.join(cssdir, name))

    def js(name):
        return _read(os.path.join(jsdir, name))

    base = css('base.css')
    pages = css('pages.css')
    comp = css('components.css')
    tokens = css('tokens.css')
    idx = _read(os.path.join(ROOT, 'index.html'))
    app = js('app.js')
    shell = js('shell.js')

    # ── H1. 背景层结构：.bg 必须压在最底下（负层级）──────────
    if re.search(r'\.bg\s*\{[^}]*z-index:\s*var\(--z-bg\)', base):
        ok('H1 背景层用负层级 --z-bg（不会盖住正文）')
    else:
        bad('H1 背景层没有用负层级 --z-bg')

    if re.search(r'--z-bg:\s*-\d+', tokens):
        ok('H1 --z-bg 取值为负')
    else:
        bad('H1 --z-bg 不是负值')

    # ── H2. 底渐变必须是参考站的深海军蓝径向渐变 ────────────
    if 'radial-gradient' in base and 'at 50% 0%' in base:
        ok('H2 底为径向渐变且锚在顶部中央（还原参考站）')
    else:
        bad('H2 底不是"顶部中央"的径向渐变')

    for name, lit in (('--bg-nebula-core', '#000d4d'),
                      ('--bg-nebula-edge', '#000105')):
        if re.search(re.escape(name) + r':\s*' + re.escape(lit), tokens):
            ok('H2 %s = %s（参考站取色）' % (name, lit))
        else:
            bad('H2 %s 不是参考站的 %s' % (name, lit))

    # ── H3. 星云模块：结构 + 性能口径 ────────────────────────
    if not os.path.exists(os.path.join(jsdir, 'nebula.js')):
        bad('H3 nebula.js 不存在')
        return

    neb = js('nebula.js')
    # ⚠️ 扫描代码前必须先剥掉注释：
    #    本文件的注释里**专门写了**"不绑 touchmove 的 preventDefault"，
    #    直接正则扫源码会把这句说明当成违规命中（实测踩过这个假红）。
    neb_code = re.sub(r'/\*.*?\*/', '', neb, flags=re.S)
    neb_code = re.sub(r'^\s*//.*$', '', neb_code, flags=re.M)

    if 'initNebula' in neb and 'initNebula' in app and 'nebula.js' in app:
        ok('H3 nebula.js 已接线 initNebula')
    else:
        bad('H3 nebula.js 未接线到 app.js')

    # 旧的流星雨必须彻底移除（替换而不是并存）
    if os.path.exists(os.path.join(jsdir, 'starfield.js')):
        bad('H3 starfield.js 仍存在（流星雨未替换干净）')
    elif 'starfield' in app or 'starfield' in base:
        bad('H3 仍有 starfield 残留引用')
    else:
        ok('H3 流星雨已完全移除，无 starfield 残留')

    # 叠加发光 = 星云的本质
    if "globalCompositeOperation = 'lighter'" in neb:
        ok("H3 用 'lighter' 叠加发光（星云的核心观感）")
    else:
        bad("H3 缺少 'lighter' 叠加发光")

    # ★ 性能：渐变必须预渲染成精灵，不能逐帧 createRadialGradient
    if 'createRadialGradient' in neb and 'drawImage' in neb:
        # 只允许在 makeSprite 里调用，且 drawImage 在渲染循环里
        call_sites = [m.start() for m in re.finditer(r'createRadialGradient', neb)]
        in_sprite = [m.start() for m in re.finditer(r'function makeSprite', neb)]
        sprite_end = neb.find('\n}', in_sprite[0]) if in_sprite else -1
        if in_sprite and all(m < sprite_end for m in call_sites):
            ok('H3 渐变只在精灵预渲染阶段创建（逐帧零 createRadialGradient）')
        else:
            bad('H3 渐变出现在渲染热路径里（逐帧创建会掉帧）')
    else:
        bad('H3 没有走"预渲染精灵 + drawImage"的渲染方式')

    # 参考站的关键机制必须保留
    for label, pat in (('相机视差', r'PARALLAX'),
                       ('轨道漂移', r'ORBIT_R'),
                       ('整体自转', r'ROT_SPEED'),
                       ('透视投影', r'FOCAL'),
                       ('近裁剪', r'NEAR')):
        if re.search(pat, neb):
            ok('H3 保留参考站机制：%s' % label)
        else:
            bad('H3 丢失参考站机制：%s' % label)

    # ★ 内容站安全红线：绝不能 preventDefault 掉触摸滚动
    if re.search(r'touchmove', neb_code) and 'preventDefault' in neb_code:
        bad('H3 nebula.js 拦了 touchmove（会锁死移动端滚动）')
    else:
        ok('H3 未拦截 touchmove（移动端滚动不受影响）')

    # ★ 增点必须有上限（原站会无限增长 ⇒ 内存泄漏）
    if re.search(r'capCount', neb) and re.search(r'liveCount >= capCount', neb):
        ok('H3 点击增点有硬上限（不会无限增长）')
    else:
        bad('H3 点击增点没有上限（内存会无限增长）')

    # 降级：DPR 上限 2
    if re.search(r'Math\.min\(devicePixelRatio[^)]*,\s*2\)', neb):
        ok('H3 DPR 上限 2（4K 屏不做无谓的超采样）')
    else:
        bad('H3 DPR 没有上限')

    if 'prefersReduced' in neb and 'visibilitychange' in neb:
        ok('H3 星云含 reduced-motion 与后台暂停降级')
    else:
        bad('H3 星云缺少降级分支')

    # ── H4. 标题浮动：两层结构，动画必须挂在内层 ─────────────
    if 'hero__word' in idx:
        ok('H4 标题用「外层行 + 内层词」两层结构')
    else:
        bad('H4 标题没有内层词元素（浮动会被 reveal 覆盖）')

    if re.search(r'\.hero__word\s*\{[^}]*animation:\s*hero-float', pages):
        ok('H4 hero-float 挂在内层 .hero__word')
    else:
        bad('H4 hero-float 没有挂在内层')

    if re.search(r'\.hero__line\s*\{[^}]*display:\s*block', pages):
        ok('H4 外层 .hero__line 是 block（四行各自成行）')
    else:
        bad('H4 外层 .hero__line 不是 block')

    # 逐词相位必须**各不相同**（否则就是"排队一起跳"，等于没做）
    delays = re.findall(
        r'\.hero__line:nth-child\(\d\)\s+\.hero__word\s*\{([^}]*)\}', pages)
    if len(delays) == 4:
        ds = [re.search(r'--delay:\s*(-?[\d.]+)s', d) for d in delays]
        if all(ds) and len({d.group(1) for d in ds}) == 4:
            ok('H4 四个词的浮动相位互不相同（不是整块同步跳）')
        else:
            bad('H4 存在相位重复的词（会看成同步跳动）')
    else:
        bad('H4 逐词浮动规则不完整（应为 4 条，实为 %d）' % len(delays))

    # 字面质感：渐变填充
    if '-webkit-background-clip: text' in pages and 'filter: drop-shadow' in pages:
        ok('H4 标题用渐变字面 + drop-shadow 光晕（text-shadow 与渐变冲突）')
    else:
        bad('H4 标题缺少渐变字面或光晕')

    if 'text-shadow' in pages.split('.hero__word')[1].split('}')[0]:
        bad('H4 .hero__word 上用了 text-shadow（会和渐变字面打架）')
    else:
        ok('H4 .hero__word 未误用 text-shadow')

    # reduced-motion 必须只关内层浮动
    rm_block = pages.split('prefers-reduced-motion')[-1]
    if 'hero__word' in rm_block and 'animation: none' in rm_block:
        ok('H4 reduced-motion 关掉了标题浮动')
    else:
        bad('H4 reduced-motion 没有关标题浮动')

    # ── H5. 指针拖尾 ────────────────────────────────────────
    if not os.path.exists(os.path.join(jsdir, 'cursor-trail.js')):
        bad('H5 cursor-trail.js 不存在')
        return

    trail = js('cursor-trail.js')

    if 'initCursorTrail' in trail and 'initCursorTrail' in app:
        ok('H5 cursor-trail.js 已接线 initCursorTrail')
    else:
        bad('H5 cursor-trail.js 未接线到 app.js')

    # 必须是对象池，不能逐帧 new 粒子
    if 'pool' in trail and re.search(r'const pool = new Array\(', trail):
        ok('H5 粒子用预分配对象池（运行期零分配）')
    else:
        bad('H5 粒子没有用对象池')

    # 桌面独占 + reduced-motion 降级
    if '(hover: hover) and (pointer: fine)' in trail:
        ok('H5 拖尾只在精细指针设备启用（触屏不空转）')
    else:
        bad('H5 拖尾没有限定精细指针')

    if 'prefersReduced' in trail:
        ok('H5 拖尾含 reduced-motion 降级')
    else:
        bad('H5 拖尾缺少 reduced-motion 降级')

    # 绝不能挡住点击
    if re.search(r'\.cursor-trail\s*\{[^}]*pointer-events:\s*none', comp):
        ok('H5 拖尾画布 pointer-events:none（不挡交互）')
    else:
        bad('H5 拖尾画布会挡住点击')

    # ── H6. 背景层由 shell 统一注入（全部页面一致）─────────
    if 'bgHTML' in shell and 'class="bg"' in shell:
        ok('H6 背景层由 shell.js 统一注入（单一真源）')
    else:
        bad('H6 背景层没有统一注入')

    hosts = 0
    for p in walk_html():
        if 'data-shell-nav' in _read(p):
            hosts += 1
    if hosts == len(walk_html()):
        ok('H6 全部 %d 个页面都走 shell 注入（背景不会漏页）' % hosts)
    else:
        bad('H6 有页面没走 shell 注入（%d/%d）' % (hosts, len(walk_html())))


# ══════════════════════════════════════════════════════════════
# G. 负面用例
# ══════════════════════════════════════════════════════════════

def run_neg():
    """把站点复制到临时目录，注入故障，断言检查器能抓到"""
    print('\n── 负面用例（注入故障，检查器必须报错）──\n')

    cases = []

    # 1) 删掉一张封面 → A/B 应报错
    tmp = tempfile.mkdtemp(prefix='pvz_neg_')
    dst = os.path.join(tmp, 'site')
    _copy_tree(ROOT, dst)
    os.remove(os.path.join(dst, 'assets', 'img', 'covers', 'supergatlingpea.png'))
    cases.append(('删除封面 supergatlingpea.png', dst, 'covers'))

    # 2) 把 data-depth 改错 → C 应报错
    tmp2 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst2 = os.path.join(tmp2, 'site')
    _copy_tree(ROOT, dst2)
    p = os.path.join(dst2, 'mod', 'vampirepool.html')
    with open(p, encoding='utf-8') as f:
        t = f.read()
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(t.replace('data-depth="1"', 'data-depth="0"'))
    cases.append(('把详情页 data-depth 改成 0', dst2, 'depth'))

    # 3) 把 brand-700 用作文字色 → E 应报错
    tmp3 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst3 = os.path.join(tmp3, 'site')
    _copy_tree(ROOT, dst3)
    p3 = os.path.join(dst3, 'assets', 'css', 'components.css')
    with open(p3, encoding='utf-8') as f:
        t3 = f.read()
    with open(p3, 'w', encoding='utf-8', newline='') as f:
        f.write(t3 + '\n.mod-card__name { color: var(--brand-700); }\n')
    cases.append(('把 brand-700 当文字色', dst3, 'brand'))

    # 4) 注释掉 reduced-motion 兜底 → E 应报错
    tmp4 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst4 = os.path.join(tmp4, 'site')
    _copy_tree(ROOT, dst4)
    p4 = os.path.join(dst4, 'assets', 'css', 'base.css')
    with open(p4, encoding='utf-8') as f:
        t4 = f.read()
    with open(p4, 'w', encoding='utf-8', newline='') as f:
        f.write(t4.replace('opacity: 1 !important;', 'opacity: 0 !important;'))
    cases.append(('破坏 reduced-motion 的 opacity 兜底', dst4, 'rm'))

    # 5) 把封面容器的 object-fit 改回 cover → E 应报错
    #    （这是"方图被裁切"那类真实缺陷，静态检查必须能兜住）
    tmp5 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst5 = os.path.join(tmp5, 'site')
    _copy_tree(ROOT, dst5)
    p5 = os.path.join(dst5, 'assets', 'css', 'components.css')
    with open(p5, encoding='utf-8') as f:
        t5 = f.read()
    with open(p5, 'w', encoding='utf-8', newline='') as f:
        f.write(t5 + '\n.mod-card__media img { object-fit: cover; }\n')
    cases.append(('把封面容器改回 object-fit:cover', dst5, 'cover'))

    # 6) 云：把手写 fetch 打进 /.cloud/** → F 应报错
    tmp6 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst6 = os.path.join(tmp6, 'site')
    _copy_tree(ROOT, dst6)
    p6 = os.path.join(dst6, 'assets', 'js', 'cloud.js')
    with open(p6, encoding='utf-8') as f:
        t6 = f.read()
    with open(p6, 'w', encoding='utf-8', newline='') as f:
        f.write(t6 + "\nfetch('/.cloud/database/rest/mod_stats');\n")
    cases.append(('手写 fetch 打 /.cloud/**', dst6, 'cloudfetch'))

    # 7) 云：把计数写入改成客户端直改 → F 应报错
    tmp7 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst7 = os.path.join(tmp7, 'site')
    _copy_tree(ROOT, dst7)
    p7 = os.path.join(dst7, 'assets', 'js', 'cloud.js')
    with open(p7, encoding='utf-8') as f:
        t7 = f.read()
    with open(p7, 'w', encoding='utf-8', newline='') as f:
        f.write(t7 + "\ncloud.database.from('mod_stats').update({ downloads: 9 });\n")
    cases.append(('客户端直改 mod_stats 计数', dst7, 'cloudupdate'))

    # 8) 云：初始化漏掉 endpoint → F 应报错
    tmp8 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst8 = os.path.join(tmp8, 'site')
    _copy_tree(ROOT, dst8)
    p8 = os.path.join(dst8, 'assets', 'js', 'cloud.js')
    with open(p8, encoding='utf-8') as f:
        t8 = f.read()
    t8 = t8.replace("endpoint: PUBLIC_CONFIG.endpoint,", "")
    with open(p8, 'w', encoding='utf-8', newline='') as f:
        f.write(t8)
    cases.append(('初始化漏传 endpoint', dst8, 'cloudnoep'))

    # 9) 云：插入留言时自带 owner_id → F 应报错
    tmp9 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst9 = os.path.join(tmp9, 'site')
    _copy_tree(ROOT, dst9)
    p9 = os.path.join(dst9, 'assets', 'js', 'cloud.js')
    with open(p9, encoding='utf-8') as f:
        t9 = f.read()
    t9 = t9.replace("mod_id: modId,\n      body: body,",
                    "mod_id: modId,\n      owner_id: 'forged',\n      body: body,")
    with open(p9, 'w', encoding='utf-8', newline='') as f:
        f.write(t9)
    cases.append(('插入留言自带 owner_id', dst9, 'cloudowner'))

    # 10) 效果：把标题浮动挂回外层 .hero__line → H 应报错
    tmp10 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst10 = os.path.join(tmp10, 'site')
    _copy_tree(ROOT, dst10)
    p10 = os.path.join(dst10, 'assets', 'css', 'pages.css')
    with open(p10, encoding='utf-8') as f:
        t10 = f.read()
    # 删掉内层浮动规则，等于把动画退回外层（会被 reveal 覆盖）
    t10 = t10.replace('animation: hero-float var(--dur, 9s)',
                      'animation: none')
    with open(p10, 'w', encoding='utf-8', newline='') as f:
        f.write(t10)
    cases.append(('标题浮动退回外层（会被 reveal 覆盖）', dst10, 'herofloat'))

    # 11) 效果：把星云改成逐帧 createRadialGradient → H 应报错
    tmp11 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst11 = os.path.join(tmp11, 'site')
    _copy_tree(ROOT, dst11)
    p11 = os.path.join(dst11, 'assets', 'js', 'nebula.js')
    with open(p11, encoding='utf-8') as f:
        t11 = f.read()
    # 在渲染循环里插一次渐变创建
    t11 = t11.replace('    ctx.clearRect(0, 0, W, H);',
                      '    ctx.createRadialGradient(0,0,0,0,0,1);\n'
                      '    ctx.clearRect(0, 0, W, H);')
    with open(p11, 'w', encoding='utf-8', newline='') as f:
        f.write(t11)
    cases.append(('星云逐帧创建渐变（会掉帧）', dst11, 'nebsprite'))

    # 12) 效果：背景层丢掉负层级 → H 应报错
    tmp12 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst12 = os.path.join(tmp12, 'site')
    _copy_tree(ROOT, dst12)
    p12 = os.path.join(dst12, 'assets', 'css', 'tokens.css')
    with open(p12, encoding='utf-8') as f:
        t12 = f.read()
    t12 = t12.replace('--z-bg:      -1;', '--z-bg:      0;')
    with open(p12, 'w', encoding='utf-8', newline='') as f:
        f.write(t12)
    cases.append(('背景层丢掉负层级（会盖住正文）', dst12, 'bgz'))

    # 13) 效果：拖尾画布可以挡点击 → H 应报错
    tmp13 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst13 = os.path.join(tmp13, 'site')
    _copy_tree(ROOT, dst13)
    p13 = os.path.join(dst13, 'assets', 'css', 'components.css')
    with open(p13, encoding='utf-8') as f:
        t13 = f.read()
    t13 = t13.replace('  pointer-events: none;         /* ★ 绝不挡点击 */',
                      '  pointer-events: auto;')
    with open(p13, 'w', encoding='utf-8', newline='') as f:
        f.write(t13)
    cases.append(('拖尾画布挡住点击', dst13, 'trailclick'))

    # 14) 夸克：把某 mod 详情页的夸克按钮删掉 → D2 应报错
    #     （真实缺陷重现：早前 pandorapool 的 dl_html 被后续赋值覆盖，
    #       渲染出的按钮里没有夸克 —— 这条用例就是钉住它不再复发）
    tmp14 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst14 = os.path.join(tmp14, 'site')
    _copy_tree(ROOT, dst14)
    p14 = os.path.join(dst14, 'mod', 'pandorapool.html')
    with open(p14, encoding='utf-8') as f:
        t14 = f.read()
    t14 = t14.replace('夸克网盘下载', '点我下载')
    with open(p14, 'w', encoding='utf-8', newline='') as f:
        f.write(t14)
    cases.append(('详情页丢失夸克下载按钮', dst14, 'noquarkbtn'))

    # 15) 夸克：把 mods.js 里某 mod 的链接串成别家的 → D2 应报错
    #     （"链接错行"是数据表最容易出的错，且肉眼极难发现）
    tmp15 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst15 = os.path.join(tmp15, 'site')
    _copy_tree(ROOT, dst15)
    p15 = os.path.join(dst15, 'assets', 'js', 'mods.js')
    with open(p15, encoding='utf-8') as f:
        t15 = f.read()
    t15 = t15.replace('pandorapool: \'https://pan.quark.cn/s/b9c9a19766c6\'',
                      'pandorapool: \'https://pan.quark.cn/s/7ecbb59a05cc\'')
    with open(p15, 'w', encoding='utf-8', newline='') as f:
        f.write(t15)
    cases.append(('夸克链接串行（pandora↔vampire）', dst15, 'quarkdup'))

    # 16) 动态叠：删掉 reshuffle → D2 应报错
    tmp16 = tempfile.mkdtemp(prefix='pvz_neg_')
    dst16 = os.path.join(tmp16, 'site')
    _copy_tree(ROOT, dst16)
    p16 = os.path.join(dst16, 'assets', 'js', 'stack.js')
    with open(p16, encoding='utf-8') as f:
        t16 = f.read()
    t16 = t16.replace('reshuffle: true', 'reshuffle: false')
    with open(p16, 'w', encoding='utf-8', newline='') as f:
        f.write(t16)
    cases.append(('「全部 mod」叠丢失 reshuffle', dst16, 'noreshuffle'))

    caught = 0
    for label, site, kind in cases:
        problems = probe(site, kind)
        if problems:
            caught += 1
            print('  ✓ 抓到「%s」' % label)
            for x in problems[:3]:
                print('      · %s' % x)
        else:
            print('  ✗ 漏掉「%s」—— 检查器有盲区！' % label)

    for _, site, _ in cases:
        shutil.rmtree(os.path.dirname(site), ignore_errors=True)

    print()
    if caught == len(cases):
        print('✓ 负面用例 %d/%d 全部命中' % (caught, len(cases)))
    else:
        print('✗ 负面用例仅命中 %d/%d' % (caught, len(cases)))
        raise SystemExit(1)


def _copy_tree(src, dst):
    os.makedirs(dst, exist_ok=True)
    for dp, dns, fns in os.walk(src):
        if '.git' in dp:
            continue
        rel = os.path.relpath(dp, src)
        tgt = dst if rel == '.' else os.path.join(dst, rel)
        os.makedirs(tgt, exist_ok=True)
        for fn in fns:
            shutil.copy2(os.path.join(dp, fn), os.path.join(tgt, fn))


def probe(site, kind):
    """对注入故障后的站点跑一个针对性检查，返回问题列表"""
    out = []

    if kind == 'covers':
        for p in _walk(site, '.html'):
            html = _read(p)
            base = os.path.dirname(p)
            for r in re.findall(r'src="([^"]+\.png)"', html):
                if not os.path.exists(os.path.normpath(os.path.join(base, r))):
                    out.append('%s → %s 不存在'
                               % (os.path.relpath(p, site), r))
                    break

    elif kind == 'depth':
        for p in _walk(site, '.html'):
            rel = os.path.relpath(p, site).replace('\\', '/')
            d = rel.count('/')
            if ('data-depth="%d"' % d) not in _read(p):
                out.append('%s 的 data-depth 与层级 %d 不符' % (rel, d))

    elif kind == 'brand':
        for css in os.listdir(os.path.join(site, 'assets', 'css')):
            t = _read(os.path.join(site, 'assets', 'css', css))
            if re.search(r'color:\s*var\(--brand-700\)', t):
                out.append('%s 把 brand-700 用作文字色' % css)

    elif kind == 'rm':
        t = _read(os.path.join(site, 'assets', 'css', 'base.css'))
        if 'opacity: 1 !important' not in t:
            out.append('base.css 的 reduced-motion 兜底被破坏')

    elif kind == 'cover':
        # 与 check_a11y 的 #10 同逻辑：任何承载封面的选择器出现 object-fit:cover 即报错
        sels = ('.mod-card__media img', '.mod-card__video',
                '.detail__media img', '.tile__media img')
        cssdir = os.path.join(site, 'assets', 'css')
        blob = '\n'.join(_read(os.path.join(cssdir, c))
                         for c in sorted(os.listdir(cssdir)))
        blob = re.sub(r'/\*.*?\*/', '', blob, flags=re.S)
        for sel in sels:
            for m in re.finditer(re.escape(sel) + r'\s*\{([^}]*)\}', blob):
                if re.search(r'object-fit\s*:\s*cover', m.group(1)):
                    out.append('%s 用了 object-fit:cover（会裁切方图）' % sel)
                    break

    elif kind == 'cloudfetch':
        t = _read(os.path.join(site, 'assets', 'js', 'cloud.js'))
        if re.search(r"fetch\(\s*['\"`][^'\"`]*/\.cloud/", t):
            out.append('cloud.js 手写 fetch 打 /.cloud/**')

    elif kind == 'cloudupdate':
        t = _read(os.path.join(site, 'assets', 'js', 'cloud.js'))
        if re.search(r"from\('mod_stats'\)[\s\S]{0,120}?\.update\(", t):
            out.append('cloud.js 直接 update mod_stats')

    elif kind == 'cloudnoep':
        t = _read(os.path.join(site, 'assets', 'js', 'cloud.js'))
        m = re.search(r'createWorkBuddyCloud\(\{([^}]*)\}', t, re.S)
        if not m or 'endpoint' not in m.group(1):
            out.append('createWorkBuddyCloud 初始化漏传 endpoint')

    elif kind == 'cloudowner':
        t = _read(os.path.join(site, 'assets', 'js', 'cloud.js'))
        m = re.search(r"from\('mod_comments'\)\s*\.insert\(\{([^}]*)\}", t, re.S)
        if m and 'owner_id' in m.group(1):
            out.append('插入 mod_comments 时自带 owner_id')

    elif kind == 'herofloat':
        pages_p = os.path.join(site, 'assets', 'css', 'pages.css')
        t = _read(pages_p)
        if not re.search(r'\.hero__word\s*\{[^}]*animation:\s*hero-float', t):
            out.append('hero-float 没有挂在内层 .hero__word')

    elif kind == 'nebsprite':
        t = _read(os.path.join(site, 'assets', 'js', 'nebula.js'))
        hits = [m.start() for m in re.finditer(r'createRadialGradient', t)]
        marks = [m.start() for m in re.finditer(r'function makeSprite', t)]
        if marks:
            end = t.find('\n}', marks[0])
            if any(h > end for h in hits):
                out.append('渐变出现在渲染热路径里（逐帧创建）')

    elif kind == 'bgz':
        t = _read(os.path.join(site, 'assets', 'css', 'tokens.css'))
        m = re.search(r'--z-bg:\s*(-?\d+)', t)
        if not m or int(m.group(1)) >= 0:
            out.append('--z-bg 不是负值（背景会盖住正文）')

    elif kind == 'trailclick':
        t = _read(os.path.join(site, 'assets', 'css', 'components.css'))
        m = re.search(r'\.cursor-trail\s*\{([^}]*)\}', t)
        if not m or not re.search(r'pointer-events:\s*none', m.group(1)):
            out.append('拖尾画布没有 pointer-events:none（会挡点击）')

    elif kind == 'noquarkbtn':
        t = _read(os.path.join(site, 'mod', 'pandorapool.html'))
        blk_m = re.search(r'data-download-block.*?</div>\s*</div>', t, re.S)
        blk = blk_m.group(0) if blk_m else t
        if '夸克网盘下载' not in blk:
            out.append('详情页下载块缺夸克下载按钮')

    elif kind == 'quarkdup':
        js = _read(os.path.join(site, 'assets', 'js', 'mods.js'))
        _, per = parse_quark_map(js)
        urls = list(per.values())
        if len(set(urls)) != len(urls):
            out.append('夸克链接重复（不同 mod 共用了同一链接）')

    elif kind == 'noreshuffle':
        st = _read(os.path.join(site, 'assets', 'js', 'stack.js'))
        if not re.search(r'reshuffle:\s*true', st):
            out.append('「全部 mod」叠未声明 reshuffle（不会每次重随机）')

    return out


def _walk(root, ext):
    r = []
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith(ext):
                r.append(os.path.join(dp, fn))
    return sorted(r)


def _read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


# ══════════════════════════════════════════════════════════════

def main():
    print('=' * 66)
    print('站点验收自查  —  %s' % ROOT)
    print('=' * 66)

    check_refs()
    check_links()
    check_wiring()
    check_data()
    check_a11y()
    check_cloud()
    check_effects()
    print('\n通过 %d 项：' % len(PASS))
    for m in PASS:
        print('  ✓ %s' % m)

    if FAIL:
        print('\n失败 %d 项：' % len(FAIL))
        for m in FAIL:
            print('  ✗ %s' % m)

    if NEG:
        run_neg()

    print()
    print('=' * 66)
    if FAIL:
        print('结果：FAIL（%d 项问题）' % len(FAIL))
        raise SystemExit(1)
    print('结果：PASS（%d 项全绿）' % len(PASS))
    print('=' * 66)


if __name__ == '__main__':
    main()
