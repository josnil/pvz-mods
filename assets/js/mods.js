/* ═══════════════════════════════════════════════════════════════
   mods.js — 数据层（单一真源）

   数据来源：.workbuddy/ModWorkspace/ 的实际产物与交付文档
   作者：云漫行
   引擎：植物大战僵尸杂交版（Godot 4 + C#）

   ▸ 新增一个 mod：往 MODS 数组里加一条即可，首页/分类页/详情页会自动出现
   ▸ cover.animated 为 null ⇒ 自动降级为静态图 + CSS 光扫微动效
   ▸ cover.frames > 1     ⇒ 用序列图做逐帧动画（steps）
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

export const MODS = [
  /* ═══════════════ 植物类 ═══════════════ */
  {
    id: 'supergatlingpea',
    name: '超级机枪射手',
    category: 'plant',
    cardType: 'GOLD',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 178046,
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
      '地形要求：空地可直接种，也可种在双发射手上升级',
      '大招触发：每次攻击 10% 概率，持续 5 秒',
      '托管运行时：Runtime/ModAssembly.dll（入口 SuperGatlingPeaRuntimeEntry）',
    ],
    cover: {
      static: 'assets/img/covers/supergatlingpea.png',
      animated: null,
      frames: 0,
      alt: '超级机枪射手 — 戴头盔与护目镜的绿色豌豆射手，装配多管机枪炮口',
    },
    download: `${DL_BASE}/supergatlingpea.pmod`,
  },
  {
    id: 'ultimatecherrygod',
    name: '究极樱桃战神',
    category: 'plant',
    cardType: 'DIAMOND',
    author: '云漫行',
    version: '1.0.0',
    fileSize: 624958,
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
      '每次咬击回血 100',
      '体型：高大（height = 3）',
    ],
    cover: {
      static: 'assets/img/covers/ultimatecherrygod.png',
      animated: 'assets/img/frames/cherry-4f.png',
      frames: 4,
      alt: '究极樱桃战神 — 红色樱桃龙首状植物，金色巨口露出尖牙，周围环绕绿叶',
    },
    download: `${DL_BASE}/ultimatecherrygod.pmod`,
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
  },
];

/* ═══════════════ 派生工具函数 ═══════════════ */

/** 首页每叠最多展示的 mod 数；超出则补一张「更多 mod」卡 */
export const STACK_LIMIT = 5;

export const byCategory = (key) => MODS.filter((m) => m.category === key);

export const getMod = (id) => MODS.find((m) => m.id === id);

export const getCategory = (key) => CATEGORIES.find((c) => c.key === key);

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
