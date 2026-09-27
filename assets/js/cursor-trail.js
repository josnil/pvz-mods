/* ═══════════════════════════════════════════════════════════════
   cursor-trail.js — 彩色粒子拖尾（canvas，桌面独占）

   ▸ 形态：指针后方拖出一串色相游走的粒子，越旧越小越淡，
     带一点横向散开与重力回落，看起来像"星尘"而不是"一条线"。

   ▸ 性能口径（本文件的关键）：
     ① **对象池**：粒子数组一次性分配好，游标循环复用，
        运行期零 new / 零 push-splice，避免 GC 周期性卡顿
     ② 每帧最多发射 N 颗；指针不动时不发射（省电）
     ③ rAF 里用时间积分（dt）推进，120Hz 屏上不会加速
     ④ 指针位置在 rAF 里采样 + lerp 平滑，**不在 mousemove 里作图**
     ⑤ 画布尺寸 = 视口，DPR 上限 2
     ⑥ ★ 绘制用「按 (色相, 透明度) 分档 + 每档一次 path 一次 fill」：
        单档内所有粒子的 fillStyle/globalAlpha 完全相同，才允许合并；
        档位上限 = 8 色相 × 6 透明 = 48 次 fill，远低于逐颗粒子画。

   ▸ 只在 (hover:hover) and (pointer:fine) 且非 reduced-motion 时启用。
   ═══════════════════════════════════════════════════════════════ */

const POOL_SIZE = 240;        // 粒子池容量
const EMIT_PER_FRAME = 3;     // 每帧最多发射
const EMIT_MIN_DIST = 2.2;    // 指针位移超过这个才发射（px）
const PARTICLE_LIFE = 0.8;    // 秒
const HUE_SPEED = 92;         // 色相游走速度（度/秒）
const HUE_BUCKETS = 8;        // 色相分档
const ALPHA_BUCKETS = 6;      // 透明度分档

const prefersReduced = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const isFinePointer = () =>
  matchMedia('(hover: hover) and (pointer: fine)').matches;

function cssNum(name, fallback) {
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  );
  return Number.isFinite(v) ? v : fallback;
}

export function initCursorTrail() {
  if (document.querySelector('.cursor-trail')) return;

  // ★ 触屏 / 粗指针 直接不给：手指没有"指针拖尾"这个概念，白烧电
  if (!isFinePointer()) return;
  if (prefersReduced()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) {
    canvas.remove();
    return;
  }

  const sat = cssNum('--trail-sat', 90);
  const lit = cssNum('--trail-lit', 64);
  const baseSize = cssNum('--trail-size', 7);

  let W = 0;
  let H = 0;
  let dpr = 1;

  /* ── 对象池：字段预定义，保持同一隐藏类 ─────────────────── */
  const pool = new Array(POOL_SIZE);
  for (let i = 0; i < POOL_SIZE; i++) {
    pool[i] = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 0, hue: 0, live: 0 };
  }
  let cursorIdx = 0;

  /* ── 分档桶 ──────────────────────────────────────────────
     每个桶装"索引数组"，用长度字段裁剪，同样零分配。 */
  const bucketIdx = new Int16Array(HUE_BUCKETS * ALPHA_BUCKETS * 64);
  const bucketLen = new Uint16Array(HUE_BUCKETS * ALPHA_BUCKETS);

  let px = 0, py = 0;          // 平滑指针
  let tx = 0, ty = 0;          // 原始指针
  let hasPointer = false;
  let hue = 0;
  let acc = 0;                 // 位移累加器（发射节流用）
  let rafId = 0;
  let running = false;
  let last = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  addEventListener(
    'mousemove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!hasPointer) {
        px = tx;
        py = ty;
        hasPointer = true;
      }
    },
    { passive: true }
  );

  addEventListener('pointerleave', () => { hasPointer = false; }, { passive: true });
  addEventListener('pointerenter', () => { hasPointer = true; }, { passive: true });

  function emit(x, y, vx, vy) {
    const p = pool[cursorIdx];
    cursorIdx = (cursorIdx + 1) % POOL_SIZE;

    p.x = x;
    p.y = y;
    // 速度 = 指针速度的一小部分（"被甩出去"的观感）+ 随机散开 + 轻微下坠
    p.vx = vx * 0.055 + (Math.random() - 0.5) * 24;
    p.vy = vy * 0.055 + (Math.random() - 0.5) * 24 + 11;
    p.max = PARTICLE_LIFE * (0.62 + Math.random() * 0.38);
    p.life = p.max;
    p.r = baseSize * (0.4 + Math.random() * 0.8);
    // 基准色相 + 抖动 ⇒ 同一条拖尾上有细微色差，才像星尘
    p.hue = (hue + (Math.random() - 0.5) * 36 + 360) % 360;
    p.live = 1;
  }

  function frame(now) {
    if (!running) return;

    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    const prevX = px;
    const prevY = py;
    // 0.22 ≈ 有一点"重量感"，又不至于滞后到脱手
    px += (tx - px) * 0.22;
    py += (ty - py) * 0.22;

    hue = (hue + HUE_SPEED * dt) % 360;
    acc += Math.hypot(px - prevX, py - prevY);

    // ── 发射：按位移节流；指针静止时一颗都不发 ──
    if (hasPointer && acc >= EMIT_MIN_DIST) {
      const ivx = (px - prevX) / dt;
      const ivy = (py - prevY) / dt;
      let budget = EMIT_PER_FRAME;
      let ex = prevX;
      let ey = prevY;
      // 沿本段位移等距插值，避免快速移动时拖尾断成一粒粒
      while (acc >= EMIT_MIN_DIST && budget-- > 0) {
        const t = EMIT_MIN_DIST / acc;
        ex += (px - ex) * t;
        ey += (py - ey) * t;
        emit(ex, ey, ivx, ivy);
        acc -= EMIT_MIN_DIST;
      }
      // 本帧还没画完的位移留到下一帧，但不允许无限堆积
      acc = Math.min(acc, EMIT_MIN_DIST * 4);
    } else if (!hasPointer) {
      acc = 0;
    }

    ctx.clearRect(0, 0, W, H);

    // ── 推进 + 分档 ──
    bucketLen.fill(0);
    let alive = 0;

    const perBucket = 64;
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = pool[i];
      if (p.live !== 1) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.live = 0;
        continue;
      }
      alive++;

      const drag = 1 - 2.6 * dt;
      p.vx *= drag;
      p.vy = p.vy * drag + 46 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 出屏就不必再画（但仍要继续衰减）
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;

      const k = p.life / p.max;              // 1 → 0
      const a = k * k;                       // 二次淡出，尾巴收得干净
      let hb = (p.hue / (360 / HUE_BUCKETS)) | 0;
      if (hb >= HUE_BUCKETS) hb = HUE_BUCKETS - 1;
      let ab = (a * ALPHA_BUCKETS) | 0;
      if (ab >= ALPHA_BUCKETS) ab = ALPHA_BUCKETS - 1;
      if (ab < 0) ab = 0;

      const b = hb * ALPHA_BUCKETS + ab;
      const n = bucketLen[b];
      if (n < perBucket) {
        bucketIdx[b * perBucket + n] = i;
        bucketLen[b] = n + 1;
      }
    }

    // 无粒子且指针已离开 ⇒ 整个循环停掉，不空转
    if (!alive && !hasPointer) {
      running = false;
      rafId = 0;
      return;
    }

    // ── 绘制：两遍（外发光 + 实心核），每档一次 fill ──
    ctx.globalCompositeOperation = 'lighter';   // 叠加发光，粒子交叠处更亮

    for (let pass = 0; pass < 2; pass++) {
      const grow = pass === 0 ? 2.5 : 1;
      const alphaScale = pass === 0 ? 0.15 : 0.9;
      const lightBoost = pass === 0 ? 16 : 0;

      for (let hb = 0; hb < HUE_BUCKETS; hb++) {
        // 该色相档的代表色（取档位中点，视觉上足够）
        const hdeg = hb * (360 / HUE_BUCKETS) + 360 / HUE_BUCKETS / 2;

        for (let ab = 0; ab < ALPHA_BUCKETS; ab++) {
          const b = hb * ALPHA_BUCKETS + ab;
          const n = bucketLen[b];
          if (!n) continue;

          const a = ((ab + 0.5) / ALPHA_BUCKETS) ** 1.6 * alphaScale;
          if (a < 0.006) continue;

          ctx.globalAlpha = a > 1 ? 1 : a;
          ctx.fillStyle = `hsl(${hdeg.toFixed(1)},${sat}%,${lit + lightBoost}%)`;
          ctx.beginPath();
          for (let j = 0; j < n; j++) {
            const p = pool[bucketIdx[b * perBucket + j]];
            ctx.moveTo(p.x + p.r * grow, p.y);
            ctx.arc(p.x, p.y, p.r * grow, 0, 6.2832);
          }
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  resize();
  addEventListener('resize', resize, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  start();
}
