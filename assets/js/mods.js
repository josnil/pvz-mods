/* ═══════════════════════════════════════════════════════════════
   mods.js — 数据层（单一真源）

   数据来源：.workbuddy/ModWorkspace/ 的实际产物与交付文档
   作者：云漫行
   引擎：植物大战僵尸杂交版（Godot 4 + C#）

   ▸ 新增一个 mod：往 MODS 数组里加一条即可，首页/分类页/详情页会自动出现
   ▸ cover.animated 为 null ⇒ 自动降级为静态图 + CSS 光扫微动效
   ▸ cover.frames > 1     ⇒ 用序列图做逐帧动画（steps）
   ▸ quark / quarkAll     ⇒ 夸克网盘分享链接；卡片点击默认跳 quark（回退 download）
   ▸ updatedAt            ⇒ ISO 日期，用于「最近更新」牌叠排序（新 → 旧）
   ═══════════════════════════════════════════════════════════════ */

/** 分类元信息（顺序即首页牌叠顺序） */
export const CATEGORIES = [
  {
    key: 'plant',
    name: '植物类',
    slug: 'plants',
    desc: '新增或改造植物卡：射速、齐射、近战、溅射。',
    accent: 'var(--card-gold)',
  },
  {
    key: 'zombie',
    name: '僵尸类',
    slug: 'zombies',
    desc: '新增或改造僵尸卡：护具、暴走、投掷、召唤。',
    accent: 'var(--card-diamond)',
  },
  {
    key: 'other',
    name: '其他',
    slug: 'others',
    desc: '地图与配套工具：关卡构建器、图形编辑器。',
    accent: 'var(--card-map)',
  },
];

/** 下载基址（GitHub Release 建好后替换这里即可全局生效） */
const DL_BASE = 'https://github.com/josnil/pvz-mods/releases/latest/download';

/** 夸克网盘 —— 全部 mod 的总分享链接（文件夹级，一次拿全） */
export const QUARK_ALL = 'https://pan.quark.cn/s/eca3724f6450';

/** 每个 mod 一份独立夸克链接（键 = mod id） */
const QUARK = {
  supergatlingpea: 'https://pan.quark.cn/s/653286ef7ce7',
  ultimatecherrygod: 'https://pan.quark.cn/s/11c6df24b494',
  supergatlingpaper: 'https://pan.quark.cn/s/aae6cedcf4dc',
  sunflowerqueenzombie: 'https://pan.quark.cn/s/05b35a3625e2',
  discogargantuarpult: 'https://pan.quark.cn/s/1bd55f3d58f6',
  vampirepool: 'https://pan.quark.cn/s/7ecbb59a05cc',
  peaoverhaul: 'https://pan.quark.cn/s/05e3ee9fe1e3',
  nailongzombie: 'https://pan.quark.cn/s/f7aeb4a298fe',
  pandorapool: 'https://pan.quark.cn/s/b9c9a19766c6',
  drawandguess: 'https://pan.quark.cn/s/ce625d12ca3f',
  burgergatlingpea: 'https://pan.quark.cn/s/d3023d885b22',
  electricsupergatlingpea: 'https://pan.quark.cn/s/e225c8bb3d0d',
};

export const MODS = [
  /* ═══════════════ 植物类 ═══════════════ */
  {
    id: 'supergatlingpea',
    name: '超级机枪射手',
    category: 'plant',
    cardType: 'GOLD',
    author: '云漫行',
    version: '1.0.5.0',
    fileSize: 178325,
    pkgName: '超级机枪射手.pmod',
    cardClass: '金卡',
    description:
      '每 1.5 秒向前方一次齐射 7 颗豌豆（横向排开、互不重叠）；每次攻击有 10% 概率触发大招 —— 5 秒内倾泻约 300 颗豌豆。',
    tags: ['齐射', '大招', '金卡', '托管插件'],
    stats: [
      { label: '阳光', value: '600' },
      { label: '血量', value: '1000' },
      { label: '冷却', value: '30.0s' },
      { label: '射速', value: '1.5s' },
      { label: '每轮弹数', value: '7' },
      { label: '弹速', value: '500' },
    ],
    mechanics: [
      '地形要求：空地可直接种，也可种在豌豆射手上升级（plantCover = PlantPeaShooter）',
      '大招触发：每次攻击 10% 概率，持续 5 秒（约 300 颗豌豆）',
      '齐射由插件逐颗出膛（fireEventName = "modfire" 摘掉引擎齐射链）',
      '全息投影花盆（PotQX）可投影本植物（canCopy = true）',
      '托管运行时：Runtime/ModAssembly.dll（入口 SuperGatlingPeaRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/supergatlingpea.png',
      animated: null,
      frames: 0,
      alt: '超级机枪射手 — 戴头盔与护目镜的绿色豌豆射手，装配多管机枪炮口',
    },
    download: `${DL_BASE}/supergatlingpea.pmod`,
    quark: QUARK.supergatlingpea,
    updatedAt: '2026-10-01',
  },
  {
    id: 'ultimatecherrygod',
    name: '究极樱桃战神',
    category: 'plant',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.1.0.0',
    fileSize: 517343,
    pkgName: '究极樱桃战神.pmod',
    cardClass: '钻卡',
    description:
      '高大近战植物：撕咬前方一格造成 300 伤害，并吐出樱桃子弹（直击 300 + 3×3 溅射 300）。被碾压反伤，咬车秒杀，每次咬击回血。',
    tags: ['近战', '溅射', '防爆', '高血量', '钻卡'],
    stats: [
      { label: '阳光', value: '666' },
      { label: '血量', value: '8000' },
      { label: '冷却', value: '30s' },
      { label: '撕咬伤害', value: '300' },
      { label: '溅射伤害', value: '300' },
      { label: '单次受伤上限', value: '500' },
    ],
    mechanics: [
      '撕咬：biteOnly 模式，不吞尸；咬击后吐出 UltimateCherryShot',
      '樱桃子弹：西瓜溅射通道，3×3 范围（rangeSize 1.5×1.5）',
      '防爆：explosionHurt = 0，爆炸免伤',
      '防碾压：smashHurt = 500（碾压仅扣 500）；被碾压反伤 500',
      '咬车秒杀：命中车辆直接摧毁，自损 500',
      '每次咬击回血 250',
      '体型：高大（height = 3）',
    ],
    cover: {
      static: 'assets/img/covers/ultimatecherrygod.png',
      animated: 'assets/img/frames/cherry-4f.png',
      frames: 4,
      alt: '究极樱桃战神 — 红色樱桃龙首状植物，金色巨口露出尖牙，周围环绕绿叶',
    },
    download: `${DL_BASE}/ultimatecherrygod.pmod`,
    quark: QUARK.ultimatecherrygod,
    updatedAt: '2026-10-01',
  },

  /* ═══════════════ 僵尸类 ═══════════════ */
  {
    id: 'supergatlingpaper',
    name: '超级机枪读报僵尸',
    category: 'zombie',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 181388,
    pkgName: '超级机枪读报僵尸.pmod',
    cardClass: '钻卡',
    description:
      '读报僵尸的身体 + 超级机枪射手的头。每 1.5 秒直线连发 7 颗豌豆，10% 概率触发 5 秒 300 颗大招；报纸被打破后 3 倍速暴走。',
    tags: ['远程', '护具', '暴走', '钻卡', '托管插件'],
    stats: [
      { label: '护具', value: '500' },
      { label: '血量', value: '1250' },
      { label: '啃食伤害', value: '800' },
      { label: '卡片阳光', value: '100' },
      { label: '冷却', value: '5.0s' },
      { label: '暴走移速', value: '×3.0' },
    ],
    mechanics: [
      '报纸护具 500，破碎后进入暴走（timeScale = 3.0）',
      '子弹从炮口出膛：插件每帧对齐 FireMarker',
      '与植物版共用 runtime_shared/GatlingVolleyCore.cs 判定核心',
      '图鉴僵尸页重复条目已在运行期消除',
    ],
    cover: {
      static: 'assets/img/covers/supergatlingpaper.png',
      animated: null,
      frames: 0,
      alt: '超级机枪读报僵尸 — 戴头盔护目镜的读报僵尸，手持报纸并装配机枪炮口',
    },
    download: `${DL_BASE}/supergatlingpaper.pmod`,
    quark: QUARK.supergatlingpaper,
    updatedAt: '2026-09-24',
  },
  {
    id: 'sunflowerqueenzombie',
    name: '向日葵女王僵尸',
    category: 'zombie',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 26282,
    pkgName: '向日葵女王僵尸.pmod',
    cardClass: '一包两角色',
    description:
      '一包两个僵尸共用一个 DLL：女王 = 火焰迪斯科身体 + 向日葵女王头，会滑步、点燃队友子弹、召唤伴舞；舞者 = 火焰舞者身体 + 同款头。',
    tags: ['双角色', '追踪', '灼烧光环', '召唤', '钻卡'],
    stats: [
      { label: '女王血量', value: '3850' },
      { label: '女王啃食', value: '300' },
      { label: '女王阳光', value: '350' },
      { label: '女王冷却', value: '15s' },
      { label: '火球齐射', value: '6 颗 / 1.5s' },
      { label: '脑光产出', value: '250 / 10s' },
      { label: '舞者血量', value: '880' },
      { label: '舞者阳光', value: '75' },
    ],
    mechanics: [
      '3×3 光环：每 0.5s 对敌方造成 25 点灼烧',
      '光环对全阵营（含自身）施加 FireHit —— 免减速、免冻结',
      '6 颗追踪火球同帧发射（fireMethodFlags = 32，speed 为负）',
      '召唤伴舞僵尸',
      'unUseBuffFlags = 19',
    ],
    cover: {
      static: 'assets/img/covers/sunflowerqueenzombie.png',
      animated: null,
      frames: 0,
      alt: '向日葵女王僵尸 — 戴金色王冠的向日葵头，配火焰迪斯科身体，脚踩火焰光环',
    },
    download: `${DL_BASE}/sunflowerqueenzombie.pmod`,
    quark: QUARK.sunflowerqueenzombie,
    updatedAt: '2026-09-25',
  },
  {
    id: 'discogargantuarpult',
    name: '暴走舞王伽刚特尔投石车僵尸',
    category: 'zombie',
    cardType: 'GOLD',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 16180,
    pkgName: '暴走舞王伽刚特尔投石车僵尸.pmod',
    cardClass: '金卡',
    description:
      '外形与机制完全照搬「小鬼投石车僵尸」，唯一区别是投石车里扔出来的不是小鬼，而是「暴走舞王伽刚特尔」。',
    tags: ['投掷', '碾压', '金卡', '托管插件'],
    stats: [
      { label: '血量', value: '3000' },
      { label: '碾压攻击', value: '100000' },
      { label: '攻击类型', value: 'Smash' },
      { label: '卡片价格', value: '0' },
      { label: '冷却', value: '0s' },
    ],
    mechanics: [
      '投掷物由插件替换：ZombieImp → ZombieDiscoGargantuar',
      '（「ZombieImp」是硬编码字面量，纯数据改不掉）',
      '美术复用内置小鬼投石车僵尸，零自制贴图',
      '攻击类型为「碾压」，可压扁植物',
    ],
    cover: {
      static: 'assets/img/covers/discogargantuarpult.png',
      animated: null,
      frames: 0,
      alt: '暴走舞王伽刚特尔投石车僵尸 — 投石车僵尸造型，车斗内载着暴走舞王伽刚特尔',
    },
    download: `${DL_BASE}/discogargantuarpult.pmod`,
    quark: QUARK.discogargantuarpult,
    updatedAt: '2026-09-22',
  },

  /* ═══════════════ 其他：地图 ═══════════════ */
  {
    id: 'vampirepool',
    name: '吸血鬼屋泳池',
    category: 'other',
    cardType: 'MAP',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 327435,
    pkgName: '吸血鬼屋泳池.pmod',
    cardClass: '地图',
    description:
      '以「吸血鬼屋」为基底继承全部特性（夜晚 / 无天降阳光 / 吸血规则 / 昼夜元素格），行数由 5 扩到 6，并把第 4~5 行 × 第 1~9 列设为血池。',
    tags: ['地图', '夜晚', '水池', '吸血'],
    stats: [
      { label: '网格', value: '9 × 6' },
      { label: '水池格', value: '18' },
      { label: '背景尺寸', value: '1400×600' },
      { label: '起始点', value: '(260, 74)' },
      { label: '格子尺寸', value: '80 × 83.67' },
    ],
    mechanics: [
      '继承吸血鬼屋：夜晚场景、无天降阳光、吸血规则、昼夜元素格',
      '行数 5 → 6，扩展出第 6 行种植区',
      '第 4~5 行 × 第 1~9 列 = 血池（共 18 格），需种睡莲',
      '背景贴图走托管运行时替换（血池版）',
      'MAPS 字典 key = VampirePool，走 provides 而非 overrides',
    ],
    cover: {
      static: 'assets/img/covers/vampirepool.jpg',
      animated: null,
      frames: 0,
      alt: '吸血鬼屋泳池 — 血红色泳池横贯中央，配血红满月与哥特式吸血鬼屋夜景',
    },
    download: `${DL_BASE}/vampirepool.pmod`,
    quark: QUARK.vampirepool,
    updatedAt: '2026-09-19',
  },

  /* ═══════════════ 其他：工具 ═══════════════ */
  {
    id: 'gemmatch-builder',
    name: '全模式关卡构建器',
    category: 'other',
    cardType: 'TOOL',
    author: '云漫行',
    version: '0.28',
    fileSize: 0,
    pkgName: '',
    cardClass: '工具',
    description:
      '图形化关卡构建器：可视化编辑全模式关卡数据、导入导出关卡配置，免手写 .tres。配套 Python 生成脚本与中文预设。',
    tags: ['工具', '关卡编辑', '可视化'],
    stats: [
      { label: '对应版本', value: 'V0.28' },
      { label: '形态', value: 'HTML + Python' },
      { label: '是否需解包', value: '否' },
    ],
    mechanics: [
      '可视化编辑关卡波次、僵尸池、地形与规则',
      '内置中文预设，降低手写门槛',
      '生成结果直接落地为游戏可读的关卡资源',
    ],
    cover: {
      static: 'assets/img/covers/gemmatch-builder.png',
      animated: null,
      frames: 0,
      alt: '全模式关卡构建器 — 关卡可视化编辑器界面',
    },
    download: '',
    quark: '',
    updatedAt: '2026-09-13',
  },
  {
    id: 'mod-editor',
    name: 'Mod 图形编辑器',
    category: 'other',
    cardType: 'TOOL',
    author: '云漫行',
    version: '1.0',
    fileSize: 0,
    pkgName: '',
    cardClass: '工具',
    description:
      '游戏外运行的图形化 Mod 编辑器：改数值、调属性、打包 .pmod，无需打开游戏即可迭代，附 pmod 规范校验。',
    tags: ['工具', '属性编辑', '打包'],
    stats: [
      { label: '形态', value: 'Python + Web UI' },
      { label: '是否需编译', value: '否' },
      { label: '校验', value: 'verify_pmod' },
    ],
    mechanics: [
      '图形界面直接改 mod 数值与属性，所见即所得',
      '一键打包为 .pmod',
      '内置 pmod 规范校验，防止产出坏包',
    ],
    cover: {
      static: 'assets/img/covers/mod-editor.png',
      animated: null,
      frames: 0,
      alt: 'Mod 图形编辑器 — 深色界面的 Mod 属性编辑与打包工具截图',
    },
    download: '',
    quark: '',
    updatedAt: '2026-09-17',
  },

  /* ═══════════════ 植物类（新增） ═══════════════ */
  {
    id: 'peaoverhaul',
    name: '豌豆强化',
    category: 'plant',
    cardType: 'NORMAL',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 3212,
    pkgName: 'PeaOverhaul.pmod',
    cardClass: '覆盖型',
    description:
      '放大豌豆类子弹并提升伤害与穿透：一次覆盖 PeaDefault / SnowPea / FirePea / GoldPea 四种子弹，子弹 scale 提到 1.6 倍、穿透 8 个。演示型 Mod，适合作为「覆盖内置资源」的模板。',
    tags: ['覆盖', '子弹', '穿透', '模板'],
    stats: [
      { label: '覆盖子弹', value: '4 种' },
      { label: '弹药 scale', value: '1.6×' },
      { label: '穿透数', value: '8' },
      { label: '火焰弹伤害', value: '120' },
      { label: '是否含插件', value: '否' },
      { label: '体积', value: '3.1 KB' },
    ],
    mechanics: [
      'overrides.Projectile = [PeaDefault, SnowPea, FirePea, GoldPea]',
      '全部走「覆盖内置资源」，不新增任何角色或卡片',
      '子弹尺寸 scale = (1.6, 1.6)，穿透 penetrateNum = 8',
      'FirePea 伤害 120、damageFlags = 7、爆破粒子走 FireSplats',
      '无托管运行时插件（runtimeAssembly 为空）',
    ],
    cover: {
      static: 'assets/img/covers/peaoverhaul.png',
      animated: null,
      frames: 0,
      alt: '豌豆强化 — 四颗被放大的豌豆子弹（普通绿豌豆 / 寒冰蓝豌豆 / 火焰豌豆 / 金色豌豆）',
    },
    download: `${DL_BASE}/peaoverhaul.pmod`,
    quark: QUARK.peaoverhaul,
    updatedAt: '2026-09-15',
  },

  /* ═══════════════ 僵尸类（新增） ═══════════════ */
  {
    id: 'nailongzombie',
    name: '奶龙僵尸',
    category: 'zombie',
    cardType: 'NORMAL',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 828651,
    pkgName: '奶龙僵尸.pmod',
    cardClass: '普通卡',
    description:
      '普通僵尸的移动 / 啃食 / 受击 / 死亡，外加大笑控场：出场后每 10 秒大笑一次，切到大笑形象并播奶龙笑声，一边笑一边照常往前冲；全场植物被笑得僵直 3 秒、完全无法发射子弹。',
    tags: ['控场', '大笑', '僵直', '音效', '托管插件'],
    stats: [
      { label: '大笑间隔', value: '10s' },
      { label: '僵直时长', value: '3s' },
      { label: '僵直效果', value: '禁止发射' },
      { label: '形态', value: '2 套形象' },
      { label: '音效', value: '奶龙笑声' },
      { label: '体积', value: '809 KB' },
    ],
    mechanics: [
      '大笑时切换到「捧腹大笑」形象，播 nailong_laugh.wav',
      '大笑期间照常前进，不打断移动',
      '全场植物僵直 3 秒，发射被完全封锁（含射手类）',
      'provide：Audio / Character / CharacterSprite / Packet 各 1 项',
      '托管运行时：Runtime/ModAssembly.dll（入口 NaiLongRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/nailongzombie.png',
      animated: null,
      frames: 0,
      alt: '奶龙僵尸 — 黄色圆润的奶龙捧腹大笑形象，闭眼张嘴、双手捂着肚子',
    },
    download: `${DL_BASE}/nailongzombie.pmod`,
    quark: QUARK.nailongzombie,
    updatedAt: '2026-09-25',
  },

  /* ═══════════════ 其他：地图（新增） ═══════════════ */
  {
    id: 'pandorapool',
    name: '潘多拉泳池',
    category: 'other',
    cardType: 'MAP',
    author: '云漫行',
    version: '1.1.0',
    fileSize: 14287,
    pkgName: '潘多拉泳池.pmod',
    cardClass: '地图',
    description:
      '泳池自选卡关卡：初始阳光 1500，开局即出戴夫博士（0.45 倍血 144000），普通/路障/铁桶僵尸源源不断（15 波），击败博士并清空全场才算胜利。命运选项框每 25 秒弹出，选「衰老」则 45 秒内无法使用铲子。',
    tags: ['关卡', '泳池', 'BOSS', '命运选项', '托管插件'],
    stats: [
      { label: '初始阳光', value: '1500' },
      { label: 'BOSS 血量', value: '144000' },
      { label: 'BOSS 倍率', value: '0.45×' },
      { label: '波数', value: '15' },
      { label: '选项框间隔', value: '25s' },
      { label: '胜利条件', value: '击败博士 + 清场' },
    ],
    mechanics: [
      '地图 = Backyard（泳池），种子库为「自选卡」（SeedBank.METHOD = CHOOSE）',
      '开局即生成戴夫博士，血量按内置值 × 0.45 = 144000',
      '15 波僵尸：普通 / 路障 / 铁桶',
      '命运选项框每 25 秒弹出，标题「选择你的命运吧！」',
      '选中「衰老」⇒ 45 秒内无法使用铲子；不选择则流程不受影响',
      'provide：Level = PandoraCatalog',
      '托管运行时：Runtime/ModAssembly.dll（入口 PandoraLevelRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/pandorapool.jpg',
      animated: null,
      frames: 0,
      alt: '潘多拉泳池 — 官方后院泳池关卡俯视图，蓝色泳池配木栈道、遮阳伞与烤炉',
    },
    download: `${DL_BASE}/pandorapool.pmod`,
    quark: QUARK.pandorapool,
    updatedAt: '2026-09-27',
  },

  /* ═══════════════ 植物类（新增 2026-09-29） ═══════════════ */
  {
    id: 'drawandguess',
    name: '你画戴夫猜（轻量版）',
    category: 'plant',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.11.7.0-hand',
    fileSize: 1261237,
    pkgName: '你画戴夫猜_轻量版_v1.11.7.0.pmod',
    cardClass: '钻卡',
    description:
      '你画戴夫猜（轻量版）—— 玩法与完整版完全一样；识别模型做了精简，整个包只有约 1.2 MB。种下「画布」植物 ⇒ 弹出画布并暂停战斗 ⇒ 随手画一株植物 ⇒ 关掉画布（或点「提交」）自动识别 ⇒ 从三个候选里点一个，当场种回原来那一格（不占卡槽、不花阳光）。画不准可用「贴纸 ▾」选一个家族贴上兜底；自带基础识别库（内置 326 种植物全都有），装好即可玩，不联网、不需要任何额外组件。',
    tags: ['新植物', '手绘识别', '贴纸', '本地推理', '轻量版', '钻卡'],
    stats: [
      { label: '阳光', value: '25' },
      { label: '血量', value: '4000' },
      { label: '冷却', value: '10.0s' },
      { label: '家族贴纸', value: '16 张' },
      { label: '候选池', value: '326 种植物卡' },
      { label: '识别库', value: '自带' },
      { label: '是否联网', value: '否' },
    ],
    mechanics: [
      '种下「画布」⇒ 弹出画布并暂停战斗；画完关掉或点「提交」即自动识别',
      '点中候选 ⇒ 当场种回原来那一格，不占卡槽、不花阳光',
      '「贴纸 ▾」选一个家族贴上 ⇒ 识别优先往那一族找；可贴多张、右键单张删除、可换色或还原原色',
      '自带基础识别库（内置 326 种植物全都有）⇒ 装好即可玩，不需要任何额外操作',
      '后来装了别的 mod 植物？点画布下方的「重建识别库」按钮（触屏可点，键盘也可按 R）；若该 mod 会替换内置植物外观，用 Shift+R 全量重算',
      '识别全程本地：不联网、不需要任何额外组件',
      'provide：Character / CharacterSprite / Packet 各 1 项，不改动原版内容',
      '托管运行时：Runtime/ModAssembly.dll（入口 DrawAndGuessProbeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/drawandguess.png',
      animated: null,
      frames: 0,
      alt: '你画戴夫猜 — 深色画布上左侧是豌豆射手的白色速写线稿，右侧是识别出的真实豌豆射手（蓝色选中框），底部一排植物贴纸',
    },
    download: `${DL_BASE}/drawandguess.pmod`,
    quark: QUARK.drawandguess,
    updatedAt: '2026-09-29',
  },

  /* ═══════════════ 植物类（新增 2026-09-30） ═══════════════ */
  {
    id: 'burgergatlingpea',
    name: '超级汉堡射手',
    category: 'plant',
    cardType: 'GOLD',
    author: '云漫行',
    version: '1.2.3.0',
    fileSize: 200678,
    pkgName: '超级汉堡射手.pmod',
    cardClass: '金卡',
    description:
      '新增植物「超级汉堡射手」：每 2.0 秒向前方一次齐射 9 颗随机子弹 —— 随机池覆盖全游戏 79 种子弹（同名去重后，已排除魅惑类与产资源 / BOSS / 非伤害物件）；另外每 25 秒固定产出 50 阳光。每次攻击有 10% 概率触发大招 —— 5 秒内倾泻 300 颗随机子弹。金卡，600 阳光，冷却 30.0 秒。',
    tags: ['齐射', '随机子弹', '产阳光', '大招', '金卡', '托管插件'],
    stats: [
      { label: '阳光', value: '600' },
      { label: '血量', value: '1000' },
      { label: '冷却', value: '30.0s' },
      { label: '射速', value: '2.0s' },
      { label: '每轮弹数', value: '9' },
      { label: '随机池', value: '79 种子弹' },
      { label: '阳光产出', value: '50 / 25 秒' },
      { label: '大招', value: '10% / 5 秒 / 300 颗' },
    ],
    mechanics: [
      '地形要求：空地可直接种，也可种在豌豆射手上升级（plantCover = PlantPeaShooter）',
      '每轮 9 颗随机子弹：随机池 = 全游戏 79 种子弹等权（按游戏权威注册表 ProjectileRegistry.json 枚举，同名去重）',
      '池子已排除魅惑类、产资源类、BOSS 与非伤害物件；不含加农炮类 8 种',
      '新增产能：每 25 秒固定产出 50 阳光（ProduceComponentDefinition + 生成点 ProduceMarker）',
      '大招触发：每次攻击 10% 概率，持续 5 秒（约 300 颗随机子弹）',
      '齐射由插件逐颗出膛（fireEventName = "modfire" 摘掉引擎齐射链，逐颗间隔 60ms）',
      '外观：SuperGatlingB 官方部件图集直转（23 部件 / 26 轨），根精灵 + 独立头精灵，待机动画常驻',
      '全息投影花盆（PotQX）可投影本植物（canCopy = true）',
      '托管运行时：Runtime/ModAssembly.dll（入口 BurgerGatlingPeaRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/burgergatlingpea.png',
      animated: null,
      frames: 0,
      alt: '超级汉堡射手 — 戴汉堡帽与护目镜的射手植物，绿色炮管上顶着瓜片与黄油',
    },
    download: `${DL_BASE}/burgergatlingpea.pmod`,
    quark: QUARK.burgergatlingpea,
    updatedAt: '2026-10-01',
  },

  /* ═══════════════ 植物类（新增 2026-10-01） ═══════════════ */
  {
    id: 'electricsupergatlingpea',
    name: '电能超级机枪射手',
    category: 'plant',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.7.0.1',
    fileSize: 389611,
    pkgName: '电能超级机枪射手.pmod',
    cardClass: '钻卡',
    description:
      '新增钻卡植物「电能超级机枪射手」：阳光 2000、冷却 60 秒，且不因重复种植涨价。每 1.5 秒打出 6 颗电能豌豆（单颗 30）。电能豌豆无限穿透，对 3×3 范围每 0.15 秒灼烧一次；前 3 次直击时向 3.7 格内的非直击目标放出闪电链（半径 1.5 格 / 300 点）；受击目标 1% 概率定身 0.5 秒。每次攻击有 10% 概率触发大招 —— 5 秒内每 0.02 秒散射 3 颗，共 750 颗。外观取自 PVZ Fusion 电能素材（借轨换皮，保留 87 帧动画），自带「青雷皮肤」装扮。',
    tags: ['电能豌豆', '穿透', '闪电链', '大招', '钻卡', '托管插件'],
    stats: [
      { label: '阳光', value: '2000' },
      { label: '血量', value: '1000' },
      { label: '冷却', value: '60s' },
      { label: '重复种植涨价', value: '否' },
      { label: '射速', value: '1.5s / 6 颗' },
      { label: '单颗伤害', value: '30' },
      { label: '大招', value: '10% / 5 秒 / 750 颗' },
    ],
    mechanics: [
      '钻卡：阳光 2000、冷却 60s、血量 1000；costRise = 0 ⇒ 不因重复种植涨价',
      '电能豌豆（ElectricPea）：单颗 30、无限穿透，对 3×3 范围每 0.15 秒灼烧一次',
      '前 3 次直击时向 3.7 格内的非直击目标放出闪电链（半径 1.5 格 / 300 点）',
      '受击目标 1% 概率定身 0.5 秒',
      '大招：每次攻击 10% 概率触发，持续 5 秒，每 0.02 秒散射 3 颗，共 750 颗',
      '外观取自 PVZ Fusion 电能素材借轨换皮（保留 87 帧动画）；子弹外观由插件运行时生成',
      '自带装扮「青雷皮肤」（游戏内商店购买解锁，装备后整套配色转青）',
      'provide：Character / CharacterSprite / Packet / Projectile 各 1 项；托管运行时 Runtime/ModAssembly.dll（入口 ElectricSuperGatlingPeaRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/electricsupergatlingpea.png',
      animated: null,
      frames: 0,
      alt: '电能超级机枪射手 — 戴闪电纹头盔与护目镜的黄绿色射手植物，炮口朝右，周身缠绕电光',
    },
    download: `${DL_BASE}/electricsupergatlingpea.pmod`,
    quark: QUARK.electricsupergatlingpea,
    updatedAt: '2026-10-01',
  },
];

/* ═══════════════ 派生工具函数 ═══════════════ */

/** 首页每叠最多展示的 mod 数；超出则补一张「更多 mod」卡 */
export const STACK_LIMIT = 5;

export const byCategory = (key) => MODS.filter((m) => m.category === key);

export const getMod = (id) => MODS.find((m) => m.id === id);

export const getCategory = (key) => CATEGORIES.find((c) => c.key === key);

/** 卡片点击的默认去向：优先夸克网盘，回退 GitHub Release，最后回详情页 */
export function primaryUrl(mod) {
  return mod.quark || mod.download || `mod/${mod.id}.html`;
}

/**
 * 「关卡」范畴 —— 供「最近更新」牌叠使用。
 * 含：
 *   · 地图 mod（cardType === 'MAP'）—— 真正的关卡
 *   · 关卡构建器（id === 'gemmatch-builder'）—— 产出关卡的工具
 * 说明：站点当前只有 2 个纯地图关卡，若严格只取 MAP 则不足 3 张；
 *       把「关卡构建器」一并纳入，才能凑满用户要求的 3 个。
 */
const LEVEL_IDS = new Set(['gemmatch-builder']);

export const isLevel = (m) => m.cardType === 'MAP' || LEVEL_IDS.has(m.id);

/**
 * 最近更新 / 上传的关卡（默认 3 个）。
 * 以 updatedAt（缺失的排在最后）为主序，同日期按数组顺序稳定排列。
 */
export function recentLevels(n = 3) {
  return MODS
    .filter(isLevel)
    .slice()
    .sort((a, b) => {
      const da = a.updatedAt || '';
      const db = b.updatedAt || '';
      if (da === db) return 0;
      return da < db ? 1 : -1;            // 新 → 旧
    })
    .slice(0, n);
}

/**
 * 随机取 n 个 mod（Fisher–Yates 部分洗牌）。
 * ⚠️ 每次调用都重新抽样 —— 调用方在「展开」时重新调用即得新样本。
 */
export function randomMods(n = 3) {
  const pool = MODS.slice();
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i += 1) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, k);
}

/** 人类可读的文件大小 */
export function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 相对路径 → 根路径（供 mod/ 子目录下的详情页复用同一份数据） */
export function assetPath(path, depth) {
  return '../'.repeat(depth) + path;
}
