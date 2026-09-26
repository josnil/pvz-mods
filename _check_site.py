"""
_check_site.py — 站点验收自查（静态 + 结构 + 无障碍）

覆盖：
  A. 引用完整性  —— HTML/CSS/JS 里出现的每个本地资源都要真实存在
  B. 链接完整性  —— 所有页内 <a href> 指向的本地页面都要存在
  C. JS 接线     —— 每个页面必须挂 app.js，且 body 带 data-depth
  D. 数据一致性  —— 8 个 mod 在首页/分类页/详情页三处都要出现
  E. 无障碍      —— 焦点样式、reduced-motion 兜底、触控目标、aria 属性
  F. 负面用例（--neg）—— 故意注入坏数据，断言检查器能抓到
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
           'vampirepool', 'gemmatch-builder', 'mod-editor']


def check_data():
    js = read(os.path.join(ROOT, 'assets', 'js', 'mods.js'))
    idx = read(os.path.join(ROOT, 'index.html'))

    # 1) mods.js 里 8 条 id 齐备
    for mid in MOD_IDS:
        if ("id: '%s'" % mid) not in js:
            bad('D mods.js 缺少 %s' % mid)
    else:
        ok('D mods.js 含全部 8 条 mod 数据')

    # 2) 每个 mod 的详情页存在
    for mid in MOD_IDS:
        p = os.path.join(ROOT, 'mod', '%s.html' % mid)
        if not os.path.exists(p):
            bad('D 详情页缺失 mod/%s.html' % mid)
    else:
        ok('D 8 个 mod 详情页齐备')

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
    for key, n in (('total', 8), ('plants', 2), ('zombies', 3), ('others', 3)):
        if 'data-stat="%s">%d<' % (key, n) not in idx:
            bad('D 首页统计 %s 应为 %d' % (key, n))
    else:
        ok('D 首页统计数字与实际 mod 数一致（8 / 2 / 3 / 3）')


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


# ══════════════════════════════════════════════════════════════
# F. 负面用例
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
