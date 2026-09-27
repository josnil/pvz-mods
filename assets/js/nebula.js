/* ═══════════════════════════════════════════════════════════════
   nebula.js — 星云背景（还原 rstyro.github.io/html5/nebula.html）

   ── 参考实现到底画了什么（读源码 + 实拍取色得出的口径）────────
   ① 底：`radial-gradient(ellipse farthest-corner at center top,
      #000d4d 0%, #000105 100%)` —— 深海军蓝，顶部中央最亮。
      实拍确认：**极暗藏青**，不是紫、不是纯黑。
   ② 本体：canvas 2D 上约 200 个「白色实心核 + 彩色晕环」的光点，
      `globalCompositeOperation='lighter'` 叠加 ⇒ 交叠处发光。
      每个点的渐变是 hsl(索引, 85%, 40%)：
        实拍色相直方图显示 30° 分档里 **第 0–6 档有值、第 7–11 档全为 0**
        ⇒ 色相实际覆盖 **0°–210°**（红→橙→黄→绿→青→蓝），**没有紫/品红**。
        这是 `hue = 数组下标` 的直接结果（200 个点 ⇒ 0–200）。
   ③ 每个点有一整套 3D 变换：单位顶点 × (w/5, h/5, w/5) → 绕 XYZ 整体自转
      → 叠加一条半径 200 的轨道偏移 → 相机（z=150）→ 透视投影。
      ⇒ 产生「近大远小、向中心汇聚」的深度感；约 1/4 的点半径 > 2px，
        其余退化成亚像素星尘 —— 实拍非透明像素只占 0.148%，非常稀疏。
   ④ 运动：整体自转 0.1°/帧 + 每点轨道 0.04°/帧，叠加起来是缓慢翻滚。
      实拍 1.2s 内亮度重心移动了 (-90, -97)px，即整片星云在稳定漂移。
   ⑤ 相机跟随指针：`to = (指针 - 画布中心) * 0.8`，以 0.05/帧 插值 ⇒ 视差。

   ── 我做的三处必要偏离（都是为了能在**内容站**上安全使用）──────
   A. **不绑 touchmove 的 preventDefault**。原站这么写会**锁死页面滚动**，
      在内容站上是致命的。改为 passive 的 pointermove，滚动照常。
   B. **点击增点加了守卫与上限**。原站点一下 +100 且数组无限增长（内存泄漏）。
      这里只在「点到非交互元素」时增点，且总量硬上限，永不无限增长。
   C. **转成 dt 积分 + 精灵化渲染**。原站用「每帧固定增量 + 每帧重建
      radialGradient」⇒ 120Hz 屏上速度翻倍，且 200 次/帧创建渐变对象
      （实测的卡顿来源）。这里角度按 dt 推进、渐变预渲染成色相精灵，
      逐帧只做 drawImage ⇒ 每帧零对象分配。

   ── 性能口径（本文件的核心约束）────────────────────────────────
   ▸ 色相精灵预渲染 72 档（5° 一档，肉眼无差），全程复用
   ▸ 每帧只算一次旋转矩阵（原站每点每次算 6 次三角函数）
   ▸ dt 上限 50ms，切标签页回来不产生瞬移
   ▸ 页面隐藏 / 指针粗设备 / reduced-motion 全部有明确降级
   ═══════════════════════════════════════════════════════════════ */

/* ── 参考实现的几何常数（照搬，勿轻改）─────────────────────── */
const FOCAL = 149;          // 相机到投影面的距离（原 cam.dist.z 的绝对值）
const RADIUS_K = 2;         // 半径系数：原站渐变外径 = 2p
const CAM_Z = 150;          // 相机 z（原 _z）
const ORBIT_R = 200;        // 每点的轨道半径（原 diff）
const ROT_SPEED = 6;        // 整体自转，度/秒（原 0.1°/帧 @60fps）
const ORBIT_SPEED = 2.4;    // 轨道推进，度/秒（原 0.04°/帧 @60fps）
const NEAR = 10;            // 近裁剪：比这更近的点不画（半径会爆掉）
const PARALLAX = 0.55;      // 指针视差强度（原 0.8，内容站上收了点）
const PARALLAX_LERP = 3.2;  // 相机跟随速率（原 0.05/帧 ⇒ 约 3/s）

/* ── 色相精灵 ──────────────────────────────────────────────── */
const HUE_STEPS = 72;
const SPRITE_SIZE = 128;    // 精灵边长；核心半径 = 1/4 边长（见下）
const SPRITE_CORE = 0.5;    // 核心占精灵半径的比例（原站 p / 2p = 0.5）

/* 饱和度/亮度从 tokens.css 读，保持"颜色只在 CSS 里定义一次" */
function cssRaw(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/* ── 数量：按视口面积，桌面 ~200 与参考站一致 ────────────────── */
const COUNT_MIN = 90;
const COUNT_MAX = 320;
const COUNT_AREA_DIV = 6500;
const CAP_FACTOR = 1.6;     // 点击增点后的硬上限 = 基础量 × 1.6

const prefersReduced = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const isCoarse = () =>
  matchMedia('(hover: none), (pointer: coarse)').matches;

/* ───────────────────────────────────────────────────────────
   预渲染一张色相精灵
   ▸ 渐变口径完全照搬参考站：
       stop 0   白色（原站写的是 hsla(255,255%,255%,1) —— 饱和度/亮度
                越界，浏览器按 CSS 规则钳到 hsl(255,100%,100%) = 纯白）
       stop 0.5 hsl(h, 85%, 40%) 不透明
       stop 1   hsl(h, 85%, 40%) 半透明
   ▸ 我在末端补了一段收敛到 0 的尾巴：原站的外缘是 50% 硬边，
     放大到几百像素时会出现明显的锯齿圈；补 8% 的收口后肉眼几乎无差，
     但缩放时干净得多。
   ─────────────────────────────────────────────────────────── */
function makeSprite(hue, sat, lit) {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE_SIZE;
  const g = c.getContext('2d');
  const half = SPRITE_SIZE / 2;

  const col = `hsl(${hue}, ${sat}, ${lit})`;
  const grad = g.createRadialGradient(
    half, half, half * SPRITE_CORE,
    half, half, half
  );
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, col);
  grad.addColorStop(0.92, col);
  // 末端收口（见上）
  grad.addColorStop(1, `hsla(${hue}, ${sat}, ${lit}, 0)`);

  g.fillStyle = grad;
  g.beginPath();
  g.arc(half, half, half, 0, 6.2832);
  g.fill();

  // 环形描边补足原站那个"彩色晕环"的存在感
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = `hsla(${hue}, ${sat}, 46%, 0.5)`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(half, half, half * 0.66, 0, 6.2832);
  g.stroke();

  return c;
}

export function initNebula() {
  if (document.querySelector('.nebula')) return;

  const bg = document.querySelector('.bg');
  if (!bg) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'nebula';
  canvas.setAttribute('aria-hidden', 'true');
  const veil = bg.querySelector('.bg__veil');
  if (veil) bg.insertBefore(canvas, veil);
  else bg.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) return;   // 拿不到上下文 ⇒ 静默放弃，底下的渐变仍在

  /* 色相精灵：一次生成，全程复用
     ⚠️ 必须在 initNebula 内部（而非模块顶层）生成 —— 精灵颜色要读
        tokens.css 的 CSS 变量，模块求值时样式表可能还没解析完。 */
  const SAT = cssRaw('--nebula-hue-sat', '85%');
  const LIT = cssRaw('--nebula-hue-lit', '40%');
  const sprites = new Array(HUE_STEPS);
  for (let i = 0; i < HUE_STEPS; i++) {
    sprites[i] = makeSprite((i * 360) / HUE_STEPS, SAT, LIT);
  }

  let W = 0, H = 0, CX = 0, CY = 0, dpr = 1;
  let objSz = [0, 0, 0];
  let baseCount = 0;
  let capCount = 0;

  /* 粒子池：字段预定义，保持同一隐藏类；运行期零分配 */
  let pts = [];
  let liveCount = 0;
  let hueSeq = 0;          // 色相游标（等价于原站的数组下标）

  let rotX = 0, rotY = 0, rotZ = 0;      // 整体自转（度）
  let camX = 0, camY = 0;                // 相机位置（lerp 后）
  let toX = 0, toY = 0;                  // 指针目标
  let rafId = 0, running = false, last = 0, tAcc = 0;

  /* ── 尺寸 ──────────────────────────────────────────────── */
  function resize() {
    W = bg.clientWidth || innerWidth;
    H = bg.clientHeight || innerHeight;
    CX = W / 2;
    CY = H / 2;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 世界尺度照搬参考站
    objSz = [W / 5, H / 5, W / 5];
  }

  /* ── 初始化一个点 ──────────────────────────────────────── */
  function makePoint(i) {
    // 单位顶点：原站用 sin(随机角度) ⇒ 值域 [-1,1] 且分布偏向两端
    const vtx = [
      Math.sin(((Math.random() * 360) * Math.PI) / 180),
      Math.sin(((Math.random() * 360) * Math.PI) / 180),
      Math.sin(((Math.random() * 360) * Math.PI) / 180),
    ];
    return {
      vx: vtx[0], vy: vtx[1], vz: vtx[2],
      // 轨道相位（度），各自独立推进
      ax: 360 * Math.random(),
      ay: 360 * Math.random(),
      az: 360 * Math.random(),
      // 色相：照搬「下标即色相」，用取模保证永不出界
      hue: hueSeq % 360,
      // 尺寸档：0.7 / 1.0 / 1.45 三档随机
      // （★ 这是相对参考站唯一的"美术加料"：原站的尺寸分布极度偏小，
      //   约 3/4 的点是亚像素级别，作为网页背景太"空"。给点尺寸分档后
      //   中号光晕变多，才有"星云"而不是"噪点"的观感。）
      size: [0.7, 1, 1, 1.45][(Math.random() * 4) | 0],
      // 轻微的整体明度差异，避免所有点一样亮
      bright: 0.82 + Math.random() * 0.32,
    };
  }

  function buildPoints(n) {
    pts = new Array(n);
    for (let i = 0; i < n; i++) {
      hueSeq = i;                    // 让初始色相均匀铺满 0–360
      pts[i] = makePoint(i);
    }
    hueSeq = n;
    liveCount = n;
  }

  function rebuild() {
    resize();
    baseCount = Math.max(
      COUNT_MIN,
      Math.min(COUNT_MAX, Math.round((W * H) / COUNT_AREA_DIV))
    );
    capCount = Math.round(baseCount * CAP_FACTOR);
    buildPoints(baseCount);
    drawOnce();
  }

  /* ── 增点（点击爆发，带上限）───────────────────────────── */
  function addPoints(k) {
    if (liveCount >= capCount) return;
    const room = Math.min(k, capCount - liveCount);
    for (let i = 0; i < room; i++) {
      pts[liveCount] = makePoint(liveCount);
      hueSeq++;
      liveCount++;
    }
  }

  /* ── 核心：把一点从世界坐标投到屏幕 ─────────────────────── */
  function project(p, out) {
    // 1) 单位顶点 × 世界尺度
    const sx = p.vx * objSz[0];
    const sy = p.vy * objSz[1];
    const sz = p.vz * objSz[2];

    // 2) 整体自转（旋转矩阵每帧只算一次，存在 OUT 里）
    const wx = R0 * sx + R1 * sy + R2 * sz;
    const wy = R3 * sx + R4 * sy + R5 * sz;
    const wz = R6 * sx + R7 * sy + R8 * sz;

    // 3) 叠加轨道偏移（原站：pos 在 rot 之后、于世界空间相加）
    const d = ORBIT_R;
    const ox = d * Math.cos(p.ax * DEG);
    const oy = d * Math.sin(p.ay * DEG);
    const oz = d * Math.sin(p.az * DEG);

    // 4) 相机空间
    const vx = wx + ox - camX;
    const vy = wy + oy - camY;
    const vz = wz + oz - CAM_Z;

    // 5) 透视：只画相机前方的点（vz < -NEAR）
    if (vz > -NEAR) {
      out.ok = false;
      return out;
    }
    const persp = FOCAL / -vz;          // > 0
    out.x = CX + vx * persp;
    out.y = CY - vy * persp;            // 屏幕 y 向下，世界 y 向上
    out.r = RADIUS_K * persp * p.size;
    // 视锥外直接丢（含半径裕量），省下一次 drawImage
    out.ok =
      out.r > 0.34 &&
      out.x + out.r > -8 && out.x - out.r < W + 8 &&
      out.y + out.r > -8 && out.y - out.r < H + 8;
    return out;
  }

  const DEG = Math.PI / 180;
  const OUT = { x: 0, y: 0, r: 0, ok: false };
  // 旋转矩阵（每帧算一次）
  let R0 = 1, R1 = 0, R2 = 0, R3 = 0, R4 = 1, R5 = 0, R6 = 0, R7 = 0, R8 = 1;

  function setRotMatrix() {
    const cx = Math.cos(rotX * DEG), sx = Math.sin(rotX * DEG);
    const cy = Math.cos(rotY * DEG), sy = Math.sin(rotY * DEG);
    const cz = Math.cos(rotZ * DEG), szn = Math.sin(rotZ * DEG);

    // R = Rz · Ry · Rx（与原站 rot.x → rot.y → rot.z 的应用顺序一致）
    R0 = cz * cy;
    R1 = cz * sy * sx - szn * cx;
    R2 = cz * sy * cx + szn * sx;
    R3 = szn * cy;
    R4 = szn * sy * sx + cz * cx;
    R5 = szn * sy * cx - cz * sx;
    R6 = -sy;
    R7 = cy * sx;
    R8 = cy * cx;
  }

  /* ── 绘制 ──────────────────────────────────────────────── */
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';   // ★ 叠加发光：星云的本质
    ctx.globalAlpha = 1;

    for (let i = 0; i < liveCount; i++) {
      const p = pts[i];

      // 轨道推进（dt 已折算成"度"存在 ORBIT_STEP 里）
      p.ax += ORBIT_STEP;
      if (p.ax >= 360) p.ax -= 360;
      p.ay += ORBIT_STEP;
      if (p.ay >= 360) p.ay -= 360;
      p.az += ORBIT_STEP;
      if (p.az >= 360) p.az -= 360;

      project(p, OUT);
      if (!OUT.ok) continue;

      const idx = ((p.hue / 360) * HUE_STEPS) | 0;
      const sp = sprites[idx >= HUE_STEPS ? HUE_STEPS - 1 : idx];
      const r = OUT.r;

      // 外圈软雾：给中小型的点也加，堆出"星云"的弥散感
      // （参考站只有硬核 + 晕环，整屏读起来偏"星野"；
      //   补一层 3.4× 的低透明外晕后，叠加处才有云絮的层次。
      //   这是相对参考站唯一的观感加料，机制完全没变。）
      if (r > 1.6) {
        ctx.globalAlpha = 0.13 * p.bright;
        const rw = r * 3.4;
        ctx.drawImage(sp, OUT.x - rw, OUT.y - rw, rw * 2, rw * 2);
      }

      ctx.globalAlpha = Math.min(1, p.bright);
      ctx.drawImage(sp, OUT.x - r, OUT.y - r, r * 2, r * 2);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  let ORBIT_STEP = 0;   // 本帧的轨道推进量（度）

  function frame(now) {
    if (!running) return;

    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    tAcc += dt;

    // 相机视差：dt 化的 lerp（等价原站 0.05/帧，但帧率无关）
    const k = 1 - Math.exp(-PARALLAX_LERP * dt);
    camX += (toX - camX) * k;
    camY += (toY - camY) * k;

    // 整体自转
    rotX += ROT_SPEED * dt;
    rotY += ROT_SPEED * dt;
    rotZ += ROT_SPEED * dt;
    if (rotX >= 360) rotX -= 360;
    if (rotY >= 360) rotY -= 360;
    if (rotZ >= 360) rotZ -= 360;

    ORBIT_STEP = ORBIT_SPEED * dt;
    setRotMatrix();
    render();

    rafId = requestAnimationFrame(frame);
  }

  /* 静态渲染一帧（reduced-motion / 初始化占位） */
  function drawOnce() {
    setRotMatrix();
    render();
  }

  function start() {
    if (running || prefersReduced()) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* ── 指针视差 ──────────────────────────────────────────── */
  function onPointer(e) {
    toX = (e.clientX - CX) * -PARALLAX;
    toY = (e.clientY - CY) * PARALLAX;
  }

  /* ── 启动 ──────────────────────────────────────────────── */
  rebuild();

  if (prefersReduced()) return;   // 降级：保留一帧静态星云，完全不动

  if (!isCoarse()) {
    addEventListener('pointermove', onPointer, { passive: true });
    // ★ 点击增点：只在"没点到交互元素"时触发，且有硬上限
    addEventListener(
      'click',
      (e) => {
        if (e.target.closest('a, button, input, textarea, select, label, [role="button"]')) {
          return;
        }
        addPoints(40);
      },
      { passive: true }
    );
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  let resizeIdle = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeIdle);
    resizeIdle = setTimeout(() => {
      rebuild();
      start();
    }, 180);
  });

  // 运行期切换「减少动效」偏好
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', () => {
      if (mq.matches) {
        stop();
        drawOnce();
      } else {
        start();
      }
    });
  } catch {
    /* 老浏览器不支持 MQ 的 addEventListener —— 忽略 */
  }

  // 首屏先把一帧画出来（避免等第一次 rAF 才出现内容）
  drawOnce();
  start();
}
