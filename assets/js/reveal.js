/* ═══════════════════════════════════════════════════════════════
   reveal.js — 滚动入场（IntersectionObserver，播一次即注销）
   ═══════════════════════════════════════════════════════════════ */

export function initReveal() {
  const els = document.querySelectorAll('.reveal, .reveal-group');

  // 不支持时直接全部显示，绝不留白
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);   // 只播一次
        }
      }
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px',   // 露出 10% 才触发，避免"贴边就动"
    }
  );

  els.forEach((el) => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════
   nav.js 部分 — 导航滚动态 + 移动端抽屉
   ═══════════════════════════════════════════════════════════════ */

export function initNav() {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  const drawer = document.querySelector('.nav__drawer');

  if (nav) {
    let last = -1;
    const onScroll = () => {
      const v = window.scrollY > 40 ? 1 : 0;
      if (v !== last) {
        nav.classList.toggle('is-scrolled', !!v);
        last = v;
      }
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (!toggle || !drawer) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    drawer.dataset.open = String(open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      // 焦点移入抽屉
      const first = drawer.querySelector('a');
      if (first) first.focus();
    }
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Esc 关闭并把焦点还给触发按钮
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.dataset.open === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // 抽屉内点击链接后关闭
  drawer.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => setOpen(false))
  );

  // 点抽屉空白处（非链接）也关闭
  // ⚠️ 抽屉 inset:0 铺满整屏，若只能靠汉堡按钮关闭，一旦按钮被盖住就是死锁
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer) setOpen(false);
  });

  // 简单焦点陷阱
  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...drawer.querySelectorAll('a')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
   cursor.js — 自定义光标（仅桌面）
   requestAnimationFrame + 线性插值，绝不在 mousemove 里直接定位
   ═══════════════════════════════════════════════════════════════ */

export function initCursor() {
  const cur = document.querySelector('.cursor');
  if (!cur) return;

  // 触屏 / 触控笔 直接不给
  if (matchMedia('(hover: none), (pointer: coarse)').matches) return;
  // 尊重减少动效偏好
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let tx = 0, ty = 0, cx = 0, cy = 0, started = false;

  addEventListener(
    'mousemove',
    (e) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!started) { cx = tx; cy = ty; started = true; }
    },
    { passive: true }
  );

  const lerp = (a, b, t) => a + (b - a) * t;

  (function tick() {
    cx = lerp(cx, tx, 0.18);   // 0.18 = 插值系数，越小越有"重量感"
    cy = lerp(cy, ty, 0.18);
    cur.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(tick);
  })();
}
