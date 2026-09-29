"""
_build_pages.py — 由单份模板生成 3 个分类页 + 12 个 mod 详情页

为什么用生成器：
  15 个页面若各手写一份，改一个卡片结构要改 15 处，必然漂移。
  这里把「页面骨架」收敛成模板函数，数据一律来自 mods.js 的同源副本（PAGES 数据块）。

数据源说明：
  ⚠️ 真源是 assets/js/mods.js。本脚本为「离线生成 HTML」需要一份 Python 侧副本，
     两份必须保持一致 —— 脚本末尾会做一致性自检（对比 mods.js 里的 id/name/尺寸）。
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, 'assets')
ROOT = HERE

# ══════════════════════════════════════════════════════════════
# 与 mods.js 同源的数据副本
# ══════════════════════════════════════════════════════════════

CATEGORIES = [
    dict(key='plant',  name='植物类', slug='plants',
         desc='新增或改造植物卡：射速、齐射、近战、溅射。'),
    dict(key='zombie', name='僵尸类', slug='zombies',
         desc='新增或改造僵尸卡：护具、暴走、投掷、召唤。'),
    dict(key='other',  name='其他',   slug='others',
         desc='地图与配套工具：关卡构建器、图形编辑器。'),
]

MODS = [
    dict(id='supergatlingpea', name='超级机枪射手', category='plant',
         card_type='GOLD', card_class='金卡', version='1.0.0',
         size=178046, pkg='超级机枪射手.pmod',
         desc='每 1.5 秒向前方一次齐射 7 颗豌豆（横向排开、互不重叠）；每次攻击有 10% 概率触发大招 —— 5 秒内倾泻约 300 颗豌豆。',
         tags=['齐射', '大招', '金卡', '托管插件'],
         stats=[('阳光', '600'), ('血量', '1000'), ('冷却', '30.0s'),
                ('射速', '1.5s'), ('每轮弹数', '7'), ('弹速', '500')],
         mechanics=['地形要求：空地可直接种，也可种在双发射手上升级',
                    '大招触发：每次攻击 10% 概率，持续 5 秒',
                    '托管运行时：Runtime/ModAssembly.dll（入口 SuperGatlingPeaRuntimeEntry）'],
         cover_static='supergatlingpea.png', cover_frames=0,
         cover_alt='超级机枪射手 — 戴头盔与护目镜的绿色豌豆射手，装配多管机枪炮口'),
    dict(id='ultimatecherrygod', name='究极樱桃战神', category='plant',
         card_type='DIAMOND', card_class='钻卡', version='1.0.0',
         size=624958, pkg='究极樱桃战神.pmod',
         desc='高大近战植物：撕咬前方一格造成 300 伤害，并吐出樱桃子弹（直击 300 + 3×3 溅射 300）。被碾压反伤，咬车秒杀，每次咬击回血。',
         tags=['近战', '溅射', '防爆', '高血量', '钻卡'],
         stats=[('阳光', '666'), ('血量', '8000'), ('冷却', '30s'),
                ('撕咬伤害', '300'), ('溅射伤害', '300'), ('单次受伤上限', '500')],
         mechanics=['撕咬：biteOnly 模式，不吞尸；咬击后吐出 UltimateCherryShot',
                    '樱桃子弹：西瓜溅射通道，3×3 范围（rangeSize 1.5×1.5）',
                    '防爆：explosionHurt = 0，爆炸免伤',
                    '防碾压：smashHurt = 500（碾压仅扣 500）；被碾压反伤 500',
                    '咬车秒杀：命中车辆直接摧毁，自损 500',
                    '每次咬击回血 100', '体型：高大（height = 3）'],
         cover_static='ultimatecherrygod.png', cover_frames=4,
         cover_alt='究极樱桃战神 — 红色樱桃龙首状植物，金色巨口露出尖牙，周围环绕绿叶'),

    dict(id='supergatlingpaper', name='超级机枪读报僵尸', category='zombie',
         card_type='DIAMOND', card_class='钻卡', version='1.0.0',
         size=181388, pkg='超级机枪读报僵尸.pmod',
         desc='读报僵尸的身体 + 超级机枪射手的头。每 1.5 秒直线连发 7 颗豌豆，10% 概率触发 5 秒 300 颗大招；报纸被打破后 3 倍速暴走。',
         tags=['远程', '护具', '暴走', '钻卡', '托管插件'],
         stats=[('护具', '500'), ('血量', '1250'), ('啃食伤害', '800'),
                ('卡片阳光', '100'), ('冷却', '5.0s'), ('暴走移速', '×3.0')],
         mechanics=['报纸护具 500，破碎后进入暴走（timeScale = 3.0）',
                    '子弹从炮口出膛：插件每帧对齐 FireMarker',
                    '与植物版共用 runtime_shared/GatlingVolleyCore.cs 判定核心',
                    '图鉴僵尸页重复条目已在运行期消除'],
         cover_static='supergatlingpaper.png', cover_frames=0,
         cover_alt='超级机枪读报僵尸 — 戴头盔护目镜的读报僵尸，手持报纸并装配机枪炮口'),
    dict(id='sunflowerqueenzombie', name='向日葵女王僵尸', category='zombie',
         card_type='DIAMOND', card_class='一包两角色', version='1.0.0',
         size=26282, pkg='向日葵女王僵尸.pmod',
         desc='一包两个僵尸共用一个 DLL：女王 = 火焰迪斯科身体 + 向日葵女王头，会滑步、点燃队友子弹、召唤伴舞；舞者 = 火焰舞者身体 + 同款头。',
         tags=['双角色', '追踪', '灼烧光环', '召唤', '钻卡'],
         stats=[('女王血量', '3850'), ('女王啃食', '300'), ('女王阳光', '350'),
                ('女王冷却', '15s'), ('火球齐射', '6 颗 / 1.5s'),
                ('脑光产出', '250 / 10s'), ('舞者血量', '880'), ('舞者阳光', '75')],
         mechanics=['3×3 光环：每 0.5s 对敌方造成 25 点灼烧',
                    '光环对全阵营（含自身）施加 FireHit —— 免减速、免冻结',
                    '6 颗追踪火球同帧发射（fireMethodFlags = 32，speed 为负）',
                    '召唤伴舞僵尸', 'unUseBuffFlags = 19'],
         cover_static='sunflowerqueenzombie.png', cover_frames=0,
         cover_alt='向日葵女王僵尸 — 戴金色王冠的向日葵头，配火焰迪斯科身体，脚踩火焰光环'),
    dict(id='discogargantuarpult', name='暴走舞王伽刚特尔投石车僵尸', category='zombie',
         card_type='GOLD', card_class='金卡', version='1.0.0',
         size=16180, pkg='暴走舞王伽刚特尔投石车僵尸.pmod',
         desc='外形与机制完全照搬「小鬼投石车僵尸」，唯一区别是投石车里扔出来的不是小鬼，而是「暴走舞王伽刚特尔」。',
         tags=['投掷', '碾压', '金卡', '托管插件'],
         stats=[('血量', '3000'), ('碾压攻击', '100000'), ('攻击类型', 'Smash'),
                ('卡片价格', '0'), ('冷却', '0s')],
         mechanics=['投掷物由插件替换：ZombieImp → ZombieDiscoGargantuar',
                    '（「ZombieImp」是硬编码字面量，纯数据改不掉）',
                    '美术复用内置小鬼投石车僵尸，零自制贴图',
                    '攻击类型为「碾压」，可压扁植物'],
         cover_static='discogargantuarpult.png', cover_frames=0,
         cover_alt='暴走舞王伽刚特尔投石车僵尸 — 投石车僵尸造型，车斗内载着暴走舞王伽刚特尔'),

    dict(id='vampirepool', name='吸血鬼屋泳池', category='other',
         card_type='MAP', card_class='地图', version='1.0.0',
         size=327435, pkg='吸血鬼屋泳池.pmod', cover_ext='jpg',
         desc='以「吸血鬼屋」为基底继承全部特性（夜晚 / 无天降阳光 / 吸血规则 / 昼夜元素格），行数由 5 扩到 6，并把第 4~5 行 × 第 1~9 列设为血池。',
         tags=['地图', '夜晚', '水池', '吸血'],
         stats=[('网格', '9 × 6'), ('水池格', '18'), ('背景尺寸', '1400×600'),
                ('起始点', '(260, 74)'), ('格子尺寸', '80 × 83.67')],
         mechanics=['继承吸血鬼屋：夜晚场景、无天降阳光、吸血规则、昼夜元素格',
                    '行数 5 → 6，扩展出第 6 行种植区',
                    '第 4~5 行 × 第 1~9 列 = 血池（共 18 格），需种睡莲',
                    '背景贴图走托管运行时替换（血池版）',
                    'MAPS 字典 key = VampirePool，走 provides 而非 overrides'],
         cover_static='vampirepool.jpg', cover_frames=0,
         cover_alt='吸血鬼屋泳池 — 血红色泳池横贯中央，配血红满月与哥特式吸血鬼屋夜景'),
    dict(id='gemmatch-builder', name='全模式关卡构建器', category='other',
         card_type='TOOL', card_class='工具', version='0.28',
         size=0, pkg='',
         desc='图形化关卡构建器：可视化编辑全模式关卡数据、导入导出关卡配置，免手写 .tres。配套 Python 生成脚本与中文预设。',
         tags=['工具', '关卡编辑', '可视化'],
         stats=[('对应版本', 'V0.28'), ('形态', 'HTML + Python'), ('是否需解包', '否')],
         mechanics=['可视化编辑关卡波次、僵尸池、地形与规则',
                    '内置中文预设，降低手写门槛',
                    '生成结果直接落地为游戏可读的关卡资源'],
         cover_static='gemmatch-builder.png', cover_frames=0,
         cover_alt='全模式关卡构建器 — 关卡可视化编辑器界面'),
    dict(id='mod-editor', name='Mod 图形编辑器', category='other',
         card_type='TOOL', card_class='工具', version='1.0',
         size=0, pkg='',
         desc='游戏外运行的图形化 Mod 编辑器：改数值、调属性、打包 .pmod，无需打开游戏即可迭代，附 pmod 规范校验。',
         tags=['工具', '属性编辑', '打包'],
         stats=[('形态', 'Python + Web UI'), ('是否需编译', '否'), ('校验', 'verify_pmod')],
         mechanics=['图形界面直接改 mod 数值与属性，所见即所得',
                    '一键打包为 .pmod',
                    '内置 pmod 规范校验，防止产出坏包'],
         cover_static='mod-editor.png', cover_frames=0,
         cover_alt='Mod 图形编辑器 — 深色界面的 Mod 属性编辑与打包工具截图'),

    # ── 新增（2026-09-27）：豌豆强化 / 奶龙僵尸 / 潘多拉泳池 ──
    dict(id='peaoverhaul', name='豌豆强化', category='plant',
         card_type='NORMAL', card_class='覆盖型', version='1.0.0',
         size=3212, pkg='PeaOverhaul.pmod',
         desc='放大豌豆类子弹并提升伤害与穿透：一次覆盖 PeaDefault / SnowPea / FirePea / GoldPea 四种子弹，子弹 scale 提到 1.6 倍、穿透 8 个。演示型 Mod，适合作为「覆盖内置资源」的模板。',
         tags=['覆盖', '子弹', '穿透', '模板'],
         stats=[('覆盖子弹', '4 种'), ('弹药 scale', '1.6×'), ('穿透数', '8'),
                ('火焰弹伤害', '120'), ('是否含插件', '否'), ('体积', '3.1 KB')],
         mechanics=['overrides.Projectile = [PeaDefault, SnowPea, FirePea, GoldPea]',
                    '全部走「覆盖内置资源」，不新增任何角色或卡片',
                    '子弹尺寸 scale = (1.6, 1.6)，穿透 penetrateNum = 8',
                    'FirePea 伤害 120、damageFlags = 7、爆破粒子走 FireSplats',
                    '无托管运行时插件（runtimeAssembly 为空）'],
         cover_static='peaoverhaul.png', cover_frames=0,
         cover_alt='豌豆强化 — 四颗被放大的豌豆子弹（普通绿豌豆 / 寒冰蓝豌豆 / 火焰豌豆 / 金色豌豆）'),
    dict(id='nailongzombie', name='奶龙僵尸', category='zombie',
         card_type='NORMAL', card_class='普通卡', version='1.0.0',
         size=828651, pkg='奶龙僵尸.pmod',
         desc='普通僵尸的移动 / 啃食 / 受击 / 死亡，外加大笑控场：出场后每 10 秒大笑一次，切到大笑形象并播奶龙笑声，一边笑一边照常往前冲；全场植物被笑得僵直 3 秒、完全无法发射子弹。',
         tags=['控场', '大笑', '僵直', '音效', '托管插件'],
         stats=[('大笑间隔', '10s'), ('僵直时长', '3s'), ('僵直效果', '禁止发射'),
                ('形态', '2 套形象'), ('音效', '奶龙笑声'), ('体积', '809 KB')],
         mechanics=['大笑时切换到「捧腹大笑」形象，播 nailong_laugh.wav',
                    '大笑期间照常前进，不打断移动',
                    '全场植物僵直 3 秒，发射被完全封锁（含射手类）',
                    'provide：Audio / Character / CharacterSprite / Packet 各 1 项',
                    '托管运行时：Runtime/ModAssembly.dll（入口 NaiLongRuntimeEntry）'],
         cover_static='nailongzombie.png', cover_frames=0,
         cover_alt='奶龙僵尸 — 黄色圆润的奶龙捧腹大笑形象，闭眼张嘴、双手捂着肚子'),
    dict(id='pandorapool', name='潘多拉泳池', category='other',
         card_type='MAP', card_class='地图', version='1.1.0',
         size=14287, pkg='潘多拉泳池.pmod',
         desc='泳池自选卡关卡：初始阳光 1500，开局即出戴夫博士（0.45 倍血 144000），普通/路障/铁桶僵尸源源不断（15 波），击败博士并清空全场才算胜利。命运选项框每 25 秒弹出，选「衰老」则 45 秒内无法使用铲子。',
         tags=['关卡', '泳池', 'BOSS', '命运选项', '托管插件'],
         stats=[('初始阳光', '1500'), ('BOSS 血量', '144000'), ('BOSS 倍率', '0.45×'),
                ('波数', '15'), ('选项框间隔', '25s'), ('胜利条件', '击败博士 + 清场')],
         mechanics=['地图 = Backyard（泳池），种子库为「自选卡」（SeedBank.METHOD = CHOOSE）',
                    '开局即生成戴夫博士，血量按内置值 × 0.45 = 144000',
                    '15 波僵尸：普通 / 路障 / 铁桶',
                    '命运选项框每 25 秒弹出，标题「选择你的命运吧！」',
                    '选中「衰老」⇒ 45 秒内无法使用铲子；不选择则流程不受影响',
                    'provide：Level = PandoraCatalog',
                    '托管运行时：Runtime/ModAssembly.dll（入口 PandoraLevelRuntimeEntry）'],
         cover_static='pandorapool.jpg', cover_frames=0,
         cover_alt='潘多拉泳池 — 官方后院泳池关卡俯视图，蓝色泳池配木栈道、遮阳伞与烤炉'),

    # ── 新增（2026-09-29）：画啥种啥（纯手工档） ──
    dict(id='drawandguess', name='画啥种啥（纯手工档）', category='plant',
         card_type='DIAMOND', card_class='钻卡', version='1.11.7.0-hand',
         size=1258915, pkg='ProbeV029_hand.pmod',
         desc='种下「画布」植物 ⇒ 弹出画布并暂停战斗；随手画一株植物，关掉画布自动识别，从三个候选里点一个，当场种回原来那一格（不占卡槽、不花阳光）。16 张家族贴纸可抬高对应权重兜底；识别引擎完全本地、不联网。本包是「纯手工档」降级版：刻意不含 42 MB DINO 权重，识别退化为 384 维手工特征检索（严格 Top-3 ≈ 30%），换取秒开与零算力负担。',
         tags=['新植物', '手绘识别', '贴纸', '本地推理', '钻卡'],
         stats=[('阳光', '25'), ('血量', '4000'), ('冷却', '10.0s'),
                ('家族贴纸', '16 张'), ('候选池', '326 种植物卡'),
                ('严格 Top-3', '≈ 30%'), ('是否联网', '否')],
         mechanics=['种下「画布」⇒ 弹出画布并暂停战斗；画完关掉即自动识别',
                    '点中候选 ⇒ 当场种回原来那一格，不占卡槽、不花阳光',
                    '贴纸可贴多张、右键单张删除、可整张换色（保留原明暗层次）',
                    '本包 = 纯手工档：不含 DINO 权重，识别走 384 维手工特征检索',
                    '识别全程本地：不联网、不需要任何原生库（裁剪运行时拒绝 ONNX Runtime）',
                    'provide：Character / CharacterSprite / Packet 各 1 项，不改动原版内容',
                    '托管运行时：Runtime/ModAssembly.dll（入口 DrawAndGuessProbeEntry）'],
         cover_static='drawandguess.png', cover_frames=0,
         cover_alt='画啥种啥 — 深色画布上左侧是豌豆射手的白色速写线稿，右侧是识别出的真实豌豆射手（蓝色选中框），底部一排植物贴纸'),
]

DL_BASE = 'https://github.com/josnil/pvz-mods/releases/latest/download'

# 夸克网盘 —— 与 assets/js/mods.js 的 QUARK / QUARK_ALL 同源（脚本末尾自检）
QUARK_ALL = 'https://pan.quark.cn/s/eca3724f6450'
QUARK = {
    'supergatlingpea': 'https://pan.quark.cn/s/3e3b62402dfd',
    'ultimatecherrygod': 'https://pan.quark.cn/s/f8cacc624df8',
    'supergatlingpaper': 'https://pan.quark.cn/s/aae6cedcf4dc',
    'sunflowerqueenzombie': 'https://pan.quark.cn/s/05b35a3625e2',
    'discogargantuarpult': 'https://pan.quark.cn/s/1bd55f3d58f6',
    'vampirepool': 'https://pan.quark.cn/s/7ecbb59a05cc',
    'peaoverhaul': 'https://pan.quark.cn/s/05e3ee9fe1e3',
    'nailongzombie': 'https://pan.quark.cn/s/f7aeb4a298fe',
    'pandorapool': 'https://pan.quark.cn/s/b9c9a19766c6',
    'drawandguess': 'https://pan.quark.cn/s/c513206d2792',
}

CAT_BY_KEY = {c['key']: c for c in CATEGORIES}


def fmt_size(n):
    if not n:
        return '工具'
    if n < 1024:
        return '%d B' % n
    if n < 1024 * 1024:
        return '%.1f KB' % (n / 1024)
    return '%.2f MB' % (n / 1024 / 1024)


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
             .replace('"', '&quot;'))


def asset_url(path, depth):
    return '../' * depth + path


def cover_src(m, depth=0):
    return asset_url('assets/img/covers/' + m['cover_static'], depth)


def download_url(m):
    """GitHub Release 的下载地址。

    ⚠️ 资产名是 `<id>.pmod`（英文 id），**不是**包内的中文文件名 `m['pkg']`。
       真源口径见 mods.js 每条的 `download: `${DL_BASE}/<id>.pmod``。
       早前这里错用了 m['pkg'] ⇒ 所有详情页的「GitHub 下载」按钮都指向
       一个 Release 里不存在的资产（中文名），点了必然 404 ——
       而 D2 只断言过域名前缀，所以一直没被闸门拦住（现已补断言）。
    """
    return '%s/%s.pmod' % (DL_BASE, m['id']) if m['pkg'] else ''


def quark_url(m):
    return QUARK.get(m['id'], '')


def primary_url(m):
    """卡片点击的默认去向：夸克优先，回退 GitHub，最后详情页。"""
    return quark_url(m) or download_url(m) or ('mod/%s.html' % m['id'])


# ══════════════════════════════════════════════════════════════
# 公共 HTML 片段
# ══════════════════════════════════════════════════════════════

HEAD = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="icon" type="image/png" sizes="32x32" href="{u}assets/img/favicon-32.png">
<link rel="apple-touch-icon" href="{u}assets/img/apple-touch-icon.png">
<link rel="stylesheet" href="{u}assets/css/tokens.css">
<link rel="stylesheet" href="{u}assets/css/base.css">
<link rel="stylesheet" href="{u}assets/css/components.css">
<link rel="stylesheet" href="{u}assets/css/stack.css">
<link rel="stylesheet" href="{u}assets/css/pages.css">
</head>

<body data-depth="{depth}" data-current="{current}"{crumbs_attr}>
'''

TAIL = '''
<footer data-shell-footer></footer>

<script type="module" src="{u}assets/js/app.js"></script>
</body>
</html>
'''


def page_shell(title, desc, depth, current, body, crumbs=None):
    u = '../' * depth
    if crumbs:
        crumbs_attr = ' data-crumbs=\'%s\'' % json.dumps(
            crumbs, ensure_ascii=False).replace("'", '&#39;')
    else:
        crumbs_attr = ''
    return (HEAD.format(title=esc(title), desc=esc(desc), depth=depth,
                        current=current, u=u, crumbs_attr=crumbs_attr)
            + body + TAIL.format(u=u))


def nav_placeholder():
    return '<header data-shell-nav></header>\n'


def crumbs_placeholder():
    return '<div class="page-head__crumbs" data-shell-crumbs></div>\n'


# ══════════════════════════════════════════════════════════════
# 分类页
# ══════════════════════════════════════════════════════════════

def catalog_card(m, depth=0):
    """分类页/推荐区用的卡片（.tile）：封面 + 标题 + 简介 + 属性摘要 + 下载

    ⚠️ depth 必须显式传入：
       - 分类页（站点根）depth=0，路径写成 assets/... 与 mod/x.html
       - 详情页里的「同类 Mod」区 depth=1，路径要写成 ../assets/... 与 x.html
       （详情页本身已在 mod/ 下，兄弟页面链接不能再带 mod/ 前缀）
    """
    u = '../' * depth
    # 详情页链接：根页面需带 mod/ 前缀；详情页自身只需文件名
    href_detail = ('%smod/%s.html' % (u, m['id'])) if depth == 0 else ('%s.html' % m['id'])

    has_frames = m['cover_frames'] > 1
    frames_attr = ''
    frames_html = ''
    if has_frames:
        frames_attr = ' data-has-frames="true"'
        frames_html = (
            '<span class="mod-card__frames" aria-hidden="true" '
            'style="--frame-count:%d;background-image:url(\'%sassets/img/frames/cherry-4f.png\')">'
            '</span>' % (m['cover_frames'], u))

    dl = download_url(m)
    qu = quark_url(m)
    # 主按钮走夸克（用户要求「点击默认跳转夸克链接」），无夸克才回退 GitHub
    if qu:
        dl_html = ('<a class="btn btn--primary" href="%s" target="_blank" '
                   'rel="noopener">夸克网盘下载</a>' % qu)
    elif dl:
        dl_html = ('<a class="btn btn--primary" href="%s" download>下载 .pmod · %s</a>'
                   % (dl, fmt_size(m['size'])))
    else:
        dl_html = '<span class="btn" aria-disabled="true">联系作者获取</span>'

    return '''
      <article class="tile reveal" data-mod-card="%s">
        <a class="tile__media"%s href="%s" aria-label="%s 详情">''' % (
        m['id'], frames_attr, href_detail, esc(m['name'])) + '''
          <img src="%sassets/img/covers/%s" alt="%s" loading="lazy" width="512" height="512">
          %s
        </a>''' % (u, m['cover_static'], esc(m['cover_alt']), frames_html) + '''
        <div class="tile__body">
          <div class="tags">%s</div>
          <h2 class="tile__title">
            <a href="%s">%s</a>
          </h2>
          <p class="tile__desc">%s</p>
          <dl class="stats-table" style="margin-top:var(--sp-2)">
            <tr><th>卡片</th><td>%s</td></tr>
            <tr><th>版本</th><td>v%s</td></tr>
            <tr><th>体积</th><td>%s</td></tr>
          </dl>
          <div class="detail__actions" style="margin-top:var(--sp-3)">
            <a class="btn" href="%s">查看详情</a>
            %s
          </div>
        </div>
      </article>''' % (
        ''.join('<span class="tag">%s</span>' % esc(t) for t in m['tags']),
        href_detail, esc(m['name']), esc(m['desc']),
        m['card_class'], m['version'], fmt_size(m['size']),
        href_detail, dl_html)


def build_category_page(cat):
    mods = [m for m in MODS if m['category'] == cat['key']]
    body = nav_placeholder()
    body += '''
<main id="main">

  <section class="page-head" aria-labelledby="ph-title">
    <div class="page-head__inner">
      %s
      <p class="label">%s</p>
      <h1 id="ph-title" class="h2">%s</h1>
      <p class="lede">%s</p>
      <p class="page-head__count">共 <b>%d</b> 个 Mod</p>
    </div>
  </section>

  <section class="section" aria-label="%s列表">
    <div class="layout">
      <div class="catalog reveal-group">
%s
      </div>
    </div>
  </section>

</main>
''' % (
        crumbs_placeholder(),
        'CATEGORY / ' + cat['slug'].upper(),
        esc(cat['name']),
        esc(cat['desc']),
        len(mods),
        esc(cat['name']),
        ''.join(catalog_card(m) for m in mods) if mods
        else '<p class="empty">该分类下暂无 Mod。</p>',
    )

    return page_shell(
        title='%s · Mod 列表 — 植物大战僵尸杂交版个人 Mod 存放站' % cat['name'],
        desc='%s 共 %d 个 Mod：%s' % (cat['name'], len(mods),
                                    '、'.join(m['name'] for m in mods)),
        depth=0, current=cat['slug'], body=body,
        crumbs=[dict(label='首页', href='index.html'),
                dict(label=cat['name'])])


# ══════════════════════════════════════════════════════════════
# 详情页
# ══════════════════════════════════════════════════════════════

def build_detail_page(m):
    cat = CAT_BY_KEY[m['category']]
    dl = download_url(m)
    qu = quark_url(m)

    # ── 详情页下载区：夸克 + GitHub 双链接（用户明确要求两者都给）──
    # 无 .pmod 包的工具类（pkg 为空）不给「下载」按钮，只给仓库/总盘入口。
    dl_parts = []
    if qu:
        dl_parts.append(
            '<a class="btn btn--primary btn--lg" href="%s" target="_blank" '
            'rel="noopener">夸克网盘下载</a>' % qu)
    if dl:
        dl_parts.append(
            '<a class="btn btn--lg" href="%s" download>GitHub 下载 %s.pmod（%s）</a>'
            % (dl, esc(m['id']), fmt_size(m['size'])))
    if not dl_parts:
        dl_parts.append('<a class="btn btn--lg" href="#">联系作者获取</a>')
    dl_html = ''.join(dl_parts)

    # 抽屉式说明：写清两个来源的关系，避免用户疑惑该点哪个
    dual_note = (
        '<p class="detail__dl-note">'
        '两个来源内容一致：<b>夸克网盘</b>免登录、国内直连，推荐；'
        '<b>GitHub</b> 为原始发布源，海外或需版本追溯时使用。'
        '</p>' if (qu and dl) else '')

    repo_html = (
        '<a class="btn btn--lg" href="%s" target="_blank" rel="noopener">在 GitHub 查看</a>'
        % DL_BASE.replace('/releases/latest/download', ''))

    quark_all_html = (
        '<a class="btn btn--lg" href="%s" target="_blank" rel="noopener">'
        '夸克网盘 · 全部 Mod</a>' % QUARK_ALL)

    has_frames = m['cover_frames'] > 1
    if has_frames:
        media_attr = ' data-has-frames="true" style="--frame-count:%d"' % m['cover_frames']
        media_extra = (
            '<span class="mod-card__frames" aria-hidden="true" '
            'style="--frame-count:%d;background-image:url(\'%s\')"></span>'
            % (m['cover_frames'], asset_url('assets/img/frames/cherry-4f.png', 1)))
    else:
        media_attr = ''
        media_extra = ''

    stats_rows = ''.join(
        '<tr><th>%s</th><td>%s</td></tr>' % (esc(k), esc(v))
        for k, v in m['stats'])

    mech_items = ''.join('<li>%s</li>' % esc(x) for x in m['mechanics'])

    repo_html = (
        '<a class="btn btn--lg" href="%s" target="_blank" rel="noopener">在 GitHub 查看</a>'
        % DL_BASE.replace('/releases/latest/download', ''))

    related = [x for x in MODS
               if x['category'] == m['category'] and x['id'] != m['id']][:3]
    related_html = ''
    if related:
        related_html = '''
  <section class="related" aria-labelledby="rel-title">
    <h2 id="rel-title" class="related__title">同类 Mod</h2>
    <div class="catalog reveal-group">
%s
    </div>
  </section>
''' % ''.join(catalog_card(r, depth=1) for r in related)

    body = nav_placeholder()
    body += '''
<main id="main">

  <section class="page-head" aria-labelledby="d-title">
    <div class="page-head__inner">
      %s
      <p class="label">%s</p>
      <h1 id="d-title" class="h2">%s</h1>
      <p class="lede">%s</p>
    </div>
  </section>

  <section class="detail" aria-label="%s 详情">

    <div class="detail__media" data-has-frames-holder%s>
      <img src="%s" alt="%s" width="512" height="512">
      %s
    </div>

    <div class="detail__info">

      <div class="tags">%s</div>

      <p class="body-text">%s</p>

      <div class="detail__meta">
        <span>作者 <b>%s</b></span>
        <span>版本 <b>v%s</b></span>
        <span>卡片 <b>%s</b></span>
        <span>体积 <b>%s</b></span>
        <span>类别 <b>%s</b></span>
      </div>

      <div class="detail__block">
        <h2>属性数值</h2>
        <table class="stats-table"><tbody>
          %s
        </tbody></table>
      </div>

      <div class="detail__block">
        <h2>实现要点</h2>
        <ul class="detail__list">%s</ul>
      </div>

      <div class="detail__block" data-download-block>
        <h2>下载</h2>
        <div class="detail__actions">
          %s
        </div>
        %s
      </div>

      <div class="detail__actions">
        %s
        %s
      </div>

      <div class="detail__block" data-cloud-detail="%s">
        <div class="like-row">
          <button class="like-btn" type="button" data-like-btn="%s"
                  data-count="0" data-liked="false" aria-pressed="false">
            <span class="like-btn__heart" aria-hidden="true">♡</span>
            <span class="like-btn__num">0</span>
            <span class="like-btn__text">点赞</span>
          </button>
          <span class="like-row__hint">喜欢这个 Mod？点个赞让作者知道。</span>
        </div>
      </div>

    </div>
  </section>

  <section class="comments-wrap" aria-labelledby="cm-title">
    <div class="layout" style="max-width:820px" data-comments="%s">
      <div class="comments__head">
        <h2 id="cm-title" class="h2">留言 <span class="comments__count" data-comment-count>0</span></h2>
        <p class="comments__lead">说说你的玩法体验，或报告遇到的问题。</p>
      </div>

      <div class="comments__gate" data-comment-gate hidden>
        <p>留言需要先登录（仅支持邮箱）。</p>
        <button class="btn btn--primary" type="button" data-open-auth>登录 / 注册</button>
      </div>

      <form class="comments__form" data-comment-form hidden>
        <label class="field">
          <span class="field__label">昵称（可选）</span>
          <input class="field__input" type="text" name="nickname" maxlength="24"
                 autocomplete="nickname" placeholder="不填则显示为匿名访客">
        </label>
        <label class="field">
          <span class="field__label">留言内容</span>
          <textarea class="field__input field__input--area" name="body" rows="3"
                    maxlength="500" required
                    placeholder="例如：这个 Mod 装在 V0.28 上跑通了，投石车扔出来的舞王很带感。"></textarea>
        </label>
        <div class="comments__actions">
          <button class="btn btn--primary" type="submit">发布留言</button>
          <button class="btn" type="button" data-sign-out>退出登录</button>
        </div>
      </form>

      <ul class="comments__list" data-comment-list></ul>
    </div>
  </section>

  <!-- 登录面板（邮箱验证码 / 邮箱+密码），默认隐藏 -->
  <div class="auth-panel" data-auth-panel hidden role="dialog" aria-modal="true"
       aria-labelledby="auth-title">
    <div class="auth-panel__box">
      <button class="auth-panel__close" type="button" data-close-auth aria-label="关闭">×</button>
      <h2 id="auth-title" class="auth-panel__title">登录 / 注册</h2>
      <p class="auth-panel__hint">仅支持邮箱登录。首次登录会自动创建账号。</p>

      <div class="auth-panel__tabs" role="tablist">
        <button class="auth-panel__tab" type="button" role="tab"
                data-auth-tab="otp" aria-selected="true">邮箱验证码</button>
        <button class="auth-panel__tab" type="button" role="tab"
                data-auth-tab="pwd" aria-selected="false">邮箱 + 密码</button>
      </div>

      <p class="auth-panel__msg" data-auth-msg aria-live="polite"></p>

      <div class="auth-panel__pane" data-auth-pane="otp">
        <form data-verify-form>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input class="field__input" type="email" name="email" autocomplete="email"
                   placeholder="you@example.com" required>
          </label>
          <div class="auth-panel__row">
            <button class="btn" type="button" data-send-code>获取验证码</button>
          </div>
          <label class="field">
            <span class="field__label">验证码</span>
            <input class="field__input" type="text" name="code" inputmode="numeric"
                   autocomplete="one-time-code" placeholder="6 位数字" required>
          </label>
          <label class="field" data-password-wrap hidden>
            <span class="field__label">密码（仅新账号需要）</span>
            <input class="field__input" type="password" name="password"
                   autocomplete="new-password" minlength="6" placeholder="至少 6 位">
          </label>
          <button class="btn btn--primary" type="submit">登录 / 注册</button>
        </form>
      </div>

      <div class="auth-panel__pane" data-auth-pane="pwd" hidden>
        <form data-password-form>
          <label class="field">
            <span class="field__label">邮箱</span>
            <input class="field__input" type="email" name="email" autocomplete="email" required>
          </label>
          <label class="field">
            <span class="field__label">密码</span>
            <input class="field__input" type="password" name="password"
                   autocomplete="current-password" required>
          </label>
          <button class="btn btn--primary" type="submit">登录</button>
        </form>
      </div>
    </div>
  </div>
%s
</main>
''' % (
        crumbs_placeholder(),
        'MOD / ' + m['id'].upper(),
        esc(m['name']),
        esc(m['desc'][:110] + ('…' if len(m['desc']) > 110 else '')),
        esc(m['name']),
        media_attr,
        asset_url('assets/img/covers/' + m['cover_static'], 1),
        esc(m['cover_alt']),
        media_extra,
        ''.join('<span class="tag">%s</span>' % esc(t) for t in m['tags']),
        esc(m['desc']),
        '云漫行', m['version'], m['card_class'], fmt_size(m['size']),
        esc(cat['name']),
        stats_rows, mech_items,
        dl_html, dual_note,            # ← 下载块：双链接 + 说明
        repo_html, quark_all_html,     # ← 次行：仓库 + 全部 Mod 总盘
        m['id'], m['id'], m['id'],
        related_html,
    )

    return page_shell(
        title='%s — 植物大战僵尸杂交版 Mod' % m['name'],
        desc=m['desc'][:150],
        depth=1, current=cat['slug'], body=body,
        crumbs=[dict(label='首页', href='index.html'),
                dict(label=cat['name'], href='%s.html' % cat['slug']),
                dict(label=m['name'])])


# ══════════════════════════════════════════════════════════════
# 一致性自检：HTML 生成数据 vs mods.js
# ══════════════════════════════════════════════════════════════

def check_against_modsjs():
    js_p = os.path.join(ROOT, 'assets', 'js', 'mods.js')
    with open(js_p, encoding='utf-8') as f:
        js = f.read()

    errs = []
    for m in MODS:
        if ("id: '%s'" % m['id']) not in js:
            errs.append('mods.js 缺少 id=%s' % m['id'])
        if m['name'] not in js:
            errs.append('mods.js 缺少 name=%s' % m['name'])
    # 反向：js 里的 id 是否都在本脚本里
    for jid in re.findall(r"^\s*id: '([^']+)'", js, re.M):
        if jid == 'app':
            continue
        if not any(m['id'] == jid for m in MODS):
            errs.append('本脚本缺少 id=%s（mods.js 有）' % jid)

    # 夸克链接双向对齐：本脚本 vs mods.js
    if QUARK_ALL not in js:
        errs.append('mods.js 缺少 QUARK_ALL=%s' % QUARK_ALL)
    for mid, url in QUARK.items():
        if url not in js:
            errs.append('mods.js 缺少夸克链接 %s → %s' % (mid, url))
    return errs


# ══════════════════════════════════════════════════════════════
# 写盘
# ══════════════════════════════════════════════════════════════

def main():
    written = []

    for cat in CATEGORIES:
        p = os.path.join(ROOT, '%s.html' % cat['slug'])
        with open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(build_category_page(cat))
        written.append(p)
        print('  %-22s %7d B' % (os.path.basename(p), os.path.getsize(p)))

    mod_dir = os.path.join(ROOT, 'mod')
    os.makedirs(mod_dir, exist_ok=True)
    for m in MODS:
        p = os.path.join(mod_dir, '%s.html' % m['id'])
        with open(p, 'w', encoding='utf-8', newline='') as f:
            f.write(build_detail_page(m))
        written.append(p)
        print('  %-22s %7d B' % ('mod/%s.html' % m['id'], os.path.getsize(p)))

    print()
    errs = check_against_modsjs()
    if errs:
        print('✗ mods.js 一致性自检失败：')
        for e in errs:
            print('   - %s' % e)
        raise SystemExit(1)
    print('✓ mods.js 一致性自检通过（%d 条数据双向对齐）' % len(MODS))
    print('✓ 共生成 %d 个页面' % len(written))


if __name__ == '__main__':
    main()
