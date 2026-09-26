/* ═══════════════════════════════════════════════════════════════
   stack.js — 扑克牌叠：渲染 + 展开/收起交互

   触发通道（三选一即可展开，缺一不可）：
     ① 鼠标悬停      —— CSS :hover
     ② 键盘焦点进入  —— CSS :focus-within
     ③ 点击 / 触屏   —— JS 切换 data-open

   移动端 <576px 不做扇形，改由 CSS 降级为横向 scroll-snap 卡条。
   ═══════════════════════════════════════════════════════════════ */

import {
  CATEGORIES, MODS, STACK_LIMIT,
  byCategory, formatSize,
} from './mods.js';

/* ───────────────────────────────────────────────────────────
   渲染：单个 mod 卡片
   ─────────────────────────────────────────────────────────── */

function modCardHTML(mod, depth, index) {
  const hasVideo = Boolean(mod.cover.animated && /\.(mp4|webm)$/i.test(mod.cover.animated));
  const hasFrames = !hasVideo && mod.cover.frames > 1;

  // 封面三形态：静态 <img> 打底，动态层叠加
  let media = `
    <img src="${mod.cover.static}" alt="${mod.cover.alt}"
         loading="lazy" width="512" height="512">`;

  if (hasVideo) {
    media += `
      <video class="mod-card__video" muted loop playsinline preload="none"
             poster="${mod.cover.static}" aria-hidden="true">
        <source src="${mod.cover.animated}" type="video/mp4">
      </video>`;
  } else if (hasFrames) {
    media += `
      <span class="mod-card__frames" aria-hidden="true"
            style="--frame-count:${mod.cover.frames};
                   background-image:url('${mod.cover.animated}')"></span>`;
  }

  // 卡片数据属性（驱动 CSS 的稀有度着色与动态封面切换）
  const cardAttrs = [
    `data-card-type="${mod.cardType}"`,
    `data-has-video="${hasVideo}"`,
    `data-has-frames="${hasFrames}"`,
  ].join(' ');

  // 关键属性（浮窗里最多 4 条）
  const popStats = mod.stats
    .slice(0, 4)
    .map((s) => `<dt>${s.label}</dt><dd>${s.value}</dd>`)
    .join('');

  const sizeText = mod.fileSize ? formatSize(mod.fileSize) : '工具';

  return `
    <li class="stack__card" style="--i:${index}">
      <a class="mod-card" href="mod/${mod.id}.html" ${cardAttrs}
         aria-label="${mod.name} — 查看详情">
        <div class="mod-card__media">
          ${media}
        </div>
        <div class="mod-card__body">
          <div class="mod-card__name">${mod.name}</div>
          <div class="mod-card__meta">${mod.cardClass} · ${sizeText}</div>
          <p class="mod-card__inline-desc">${mod.description}</p>
        </div>

        <div class="mod-card__pop" role="tooltip">
          <div class="mod-card__pop-title">${mod.name}</div>
          <p class="mod-card__pop-desc">${mod.description}</p>
          <dl class="mod-card__pop-stats">${popStats}</dl>
          <div class="mod-card__pop-hint">点击查看详情与下载 →</div>
        </div>
      </a>
    </li>`;
}

/* ───────────────────────────────────────────────────────────
   渲染：「更多 mod」卡片（仅当该分类超过 STACK_LIMIT 时出现）
   ─────────────────────────────────────────────────────────── */

function moreCardHTML(cat, total, index) {
  const rest = total - STACK_LIMIT;
  return `
    <li class="stack__card stack__card--more" style="--i:${index}">
      <a class="mod-card mod-card--more" href="${cat.slug}.html"
         aria-label="查看${cat.name}全部 ${total} 个 mod">
        <span class="mod-card__more-label">更多 mod</span>
        <span class="mod-card__more-count">还有 ${rest} 个</span>
      </a>
    </li>`;
}

/* ───────────────────────────────────────────────────────────
   渲染：一整叠
   ─────────────────────────────────────────────────────────── */

function stackHTML(cat) {
  const mods = byCategory(cat.key);
  const shown = mods.slice(0, STACK_LIMIT);
  const hasMore = mods.length > STACK_LIMIT;

  const cards = shown.map((m, i) => modCardHTML(m, 1, i)).join('');
  const more = hasMore ? moreCardHTML(cat, mods.length, shown.length) : '';

  const total = shown.length + (hasMore ? 1 : 0);
  // 居中偏移量 c = i - (N-1)/2，写成 CSS 变量供扇形变换使用
  const withCenter = (html) => html;   // --c 由下面的 assignCenters 统一注入

  return `
    <div class="stack" data-category="${cat.key}" data-count="${mods.length}"
         data-open="false" data-total-cards="${total}">
      <button class="stack__label" type="button"
              aria-expanded="false" aria-controls="stack-${cat.key}">
        <span class="stack__name">${cat.name}</span>
        <span class="stack__count">${mods.length}</span>
      </button>
      <p class="stack__hint">${mods.length > 0 ? '悬停展开 · 点击卡片看详情' : '暂无内容'}</p>

      <ul class="stack__cards" id="stack-${cat.key}">
        ${withCenter(cards + more)}
      </ul>
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   注入居中偏移 --c，并保留 --i
   ─────────────────────────────────────────────────────────── */

function assignCenters(root) {
  root.querySelectorAll('.stack').forEach((stack) => {
    const cards = [...stack.querySelectorAll('.stack__card')];
    const n = cards.length;
    cards.forEach((card, i) => {
      const c = n > 1 ? i - (n - 1) / 2 : 0;
      card.style.setProperty('--c', c.toFixed(3));
      card.style.setProperty('--i', i);
    });
  });
}

/* ───────────────────────────────────────────────────────────
   交互：点击切换（触屏与无 hover 设备的主通道）
   ─────────────────────────────────────────────────────────── */

function initToggles(root) {
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;

  root.querySelectorAll('.stack').forEach((stack) => {
    const label = stack.querySelector('.stack__label');

    label?.addEventListener('click', () => {
      const open = stack.dataset.open === 'true';
      // 一次只开一叠
      root.querySelectorAll('.stack').forEach((s) => {
        s.dataset.open = 'false';
        s.querySelector('.stack__label')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        stack.dataset.open = 'true';
        label.setAttribute('aria-expanded', 'true');
      }
    });

    // 触屏：点空白处收起
    if (isTouch) {
      document.addEventListener('click', (e) => {
        if (!stack.contains(e.target)) {
          stack.dataset.open = 'false';
          label?.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 键盘：焦点离开整叠时收起
    stack.addEventListener('focusout', (e) => {
      if (!stack.contains(e.relatedTarget)) {
        stack.dataset.open = 'false';
        label?.setAttribute('aria-expanded', 'false');
      }
    });

    // Esc 收起
    stack.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        stack.dataset.open = 'false';
        label?.setAttribute('aria-expanded', 'false');
        label?.focus();
      }
    });
  });

  // 触屏：卡片第一次点击只负责展开浮窗信息，不直接跳转
  if (isTouch) {
    root.querySelectorAll('.mod-card:not(.mod-card--more)').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (card.dataset.pop !== 'true') {
          e.preventDefault();
          root.querySelectorAll('.mod-card').forEach((c) => (c.dataset.pop = 'false'));
          card.dataset.pop = 'true';
        } else {
          card.dataset.pop = 'false';
        }
      });
    });
  }
}

/* ───────────────────────────────────────────────────────────
   动态封面：视频懒加载 —— 首次 hover / focus 才 load()
   避免首屏加载 8 个视频
   ─────────────────────────────────────────────────────────── */

function initLazyVideo(root) {
  root.querySelectorAll('.mod-card[data-has-video="true"]').forEach((card) => {
    const video = card.querySelector('.mod-card__video');
    if (!video) return;

    const activate = () => {
      if (video.dataset.loaded !== '1') {
        video.load();
        video.dataset.loaded = '1';
      }
      // 自动播放可能被浏览器拦截 —— 静默降级，留在静态图
      video.play().catch(() => {});
    };

    card.addEventListener('pointerenter', activate, { once: true });
    card.addEventListener('focusin', activate, { once: true });
  });
}

/* ───────────────────────────────────────────────────────────
   浮窗边界修正：靠近视口左右边缘时换对齐方式
   ─────────────────────────────────────────────────────────── */

function initPopoverAlign(root) {
  const fix = (card) => {
    const pop = card.querySelector('.mod-card__pop');
    if (!pop) return;
    pop.removeAttribute('data-align');

    // 先复位再测量
    const rect = card.getBoundingClientRect();
    const popW = Math.min(pop.offsetWidth || 272, 272);
    const half = popW / 2;
    const cx = rect.left + rect.width / 2;

    if (cx - half < 8) pop.dataset.align = 'start';
    else if (cx + half > innerWidth - 8) pop.dataset.align = 'end';
  };

  root.querySelectorAll('.mod-card').forEach((card) => {
    card.addEventListener('pointerenter', () => fix(card), { passive: true });
    card.addEventListener('focusin', () => fix(card));
  });
}

/* ───────────────────────────────────────────────────────────
   入口
   ─────────────────────────────────────────────────────────── */

export function initStacks() {
  const host = document.querySelector('[data-stacks]');
  if (!host) return;

  host.innerHTML = `
    <div class="stacks__row">
      ${CATEGORIES.map(stackHTML).join('')}
    </div>`;

  assignCenters(host);
  initToggles(host);
  initLazyVideo(host);
  initPopoverAlign(host);
}
