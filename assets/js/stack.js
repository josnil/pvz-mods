/* ═══════════════════════════════════════════════════════════════
   stack.js — 扑克牌叠：渲染 + 展开/收起交互

   触发通道（三选一即可展开，缺一不可）：
     ① 鼠标悬停      —— CSS :hover
     ② 键盘焦点进入  —— CSS :focus-within
     ③ 点击 / 触屏   —— JS 切换 data-open

   牌叠分为两类：
     · 静态叠（植物 / 僵尸 / 其他）—— 按分类取 mod，内容固定
     · 动态叠（最近更新 / 全部 mod）—— 内容由「取样函数」在展开时实时计算，
       「全部 mod」每次展开都重新随机选取（见 refreshDynamicStack）

   移动端 <576px 不做扇形，改由 CSS 降级为横向 scroll-snap 卡条。
   ═══════════════════════════════════════════════════════════════ */

import {
  CATEGORIES, STACK_LIMIT,
  byCategory, formatSize, primaryUrl,
  recentLevels, randomMods,
} from './mods.js';

/* ───────────────────────────────────────────────────────────
   动态叠定义（在静态分类之后追加）
   ─────────────────────────────────────────────────────────── */

const DYNAMIC_STACKS = [
  {
    key: 'recent',
    name: '最近更新',
    slug: null,                       // 不跳分类页
    hint: '悬停展开 · 最近更新 / 上传的关卡',
    sample: () => recentLevels(3),    // 固定取最近 3 个关卡，不重随机
    reshuffle: false,
  },
  {
    key: 'all',
    name: '全部 mod',
    slug: null,
    hint: '悬停展开 · 每次展开随机换一批',
    sample: () => randomMods(3),      // ★ 每次展开重新随机
    reshuffle: true,
  },
];

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
  // ★ 卡片点击默认跳夸克网盘（无夸克链接才回退 GitHub / 详情页）
  const href = primaryUrl(mod);
  const external = /^https?:/i.test(href);

  return `
    <li class="stack__card" style="--i:${index}">
      <a class="mod-card" href="${href}" ${cardAttrs}
         data-mod-card="${mod.id}"
         ${external ? 'target="_blank" rel="noopener"' : ''}
         aria-label="${mod.name} — ${external ? '前往下载' : '查看详情'}">
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
          <div class="mod-card__pop-hint">${
            external ? '点击前往下载 →' : '点击查看详情 →'}</div>
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
   渲染：一整叠（静态分类叠 或 动态叠）
   ─────────────────────────────────────────────────────────── */

/**
 * @param {object} cat      叠描述（key / name / slug / hint / sample / reshuffle）
 * @param {Array}  mods     该叠要展示的 mod 列表
 */
function stackHTML(cat, mods) {
  const shown = mods.slice(0, STACK_LIMIT);
  const hasMore = mods.length > STACK_LIMIT;

  const cards = shown.map((m, i) => modCardHTML(m, 1, i)).join('');
  const more = hasMore ? moreCardHTML(cat, mods.length, shown.length) : '';

  const total = shown.length + (hasMore ? 1 : 0);

  const hint = cat.hint
    || (mods.length > 0 ? '悬停展开 · 点击卡片看详情' : '暂无内容');

  return `
    <div class="stack" data-category="${cat.key}" data-count="${mods.length}"
         data-dynamic="${Boolean(cat.sample)}"
         data-reshuffle="${Boolean(cat.reshuffle)}"
         data-open="false" data-total-cards="${total}">
      <button class="stack__label" type="button"
              aria-expanded="false" aria-controls="stack-${cat.key}">
        <span class="stack__name">${cat.name}</span>
        <span class="stack__count">${mods.length}</span>
      </button>
      <p class="stack__hint">${hint}</p>

      <ul class="stack__cards" id="stack-${cat.key}">
        ${cards + more}
      </ul>
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   动态叠：按 sample() 重新取样本并只替换 <li> 列表
   —— 「全部 mod」在每次展开前调用一次 ⇒ 每次内容都不同
   ─────────────────────────────────────────────────────────── */

function refreshDynamicStack(root, stack, cat) {
  if (!cat.sample) return;
  const ul = stack.querySelector('.stack__cards');
  if (!ul) return;

  const mods = cat.sample();
  const shown = mods.slice(0, STACK_LIMIT);
  const hasMore = mods.length > STACK_LIMIT;
  const more = hasMore ? moreCardHTML(cat, mods.length, shown.length) : '';

  ul.innerHTML = shown.map((m, i) => modCardHTML(m, 1, i)).join('') + more;

  stack.dataset.count = String(mods.length);
  stack.querySelector('.stack__count').textContent = String(mods.length);
  stack.dataset.totalCards = String(shown.length + (hasMore ? 1 : 0));

  assignCentersIn(stack);
  bindCardInteractions(root, stack);
}

/* ───────────────────────────────────────────────────────────
   注入居中偏移 --c，并保留 --i
   ─────────────────────────────────────────────────────────── */

function assignCentersIn(stack) {
  const cards = [...stack.querySelectorAll('.stack__card')];
  const n = cards.length;
  cards.forEach((card, i) => {
    const c = n > 1 ? i - (n - 1) / 2 : 0;
    card.style.setProperty('--c', c.toFixed(3));
    card.style.setProperty('--i', i);
  });
}

function assignCenters(root) {
  root.querySelectorAll('.stack').forEach((stack) => assignCentersIn(stack));
}

/* ───────────────────────────────────────────────────────────
   卡片自身的交互（浮窗边界修正 / 触屏首次点击只展开信息）
   —— 动态叠换了一批卡片后必须重新绑，故抽成函数
   ─────────────────────────────────────────────────────────── */

function bindCardInteractions(root, scope) {
  const cards = scope.querySelectorAll('.mod-card');
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;

  cards.forEach((card) => {
    // 浮窗左右边界修正
    const fix = () => {
      const pop = card.querySelector('.mod-card__pop');
      if (!pop) return;
      pop.removeAttribute('data-align');
      const rect = card.getBoundingClientRect();
      const popW = Math.min(pop.offsetWidth || 272, 272);
      const half = popW / 2;
      const cx = rect.left + rect.width / 2;
      if (cx - half < 8) pop.dataset.align = 'start';
      else if (cx + half > innerWidth - 8) pop.dataset.align = 'end';
    };
    card.addEventListener('pointerenter', fix, { passive: true });
    card.addEventListener('focusin', fix);

    // 动态封面：视频懒加载（首次 hover / focus 才 load()）
    if (card.dataset.hasVideo === 'true') {
      const video = card.querySelector('.mod-card__video');
      const activate = () => {
        if (video && video.dataset.loaded !== '1') {
          video.load();
          video.dataset.loaded = '1';
        }
        video?.play().catch(() => {});
      };
      card.addEventListener('pointerenter', activate, { once: true });
      card.addEventListener('focusin', activate, { once: true });
    }

    // 触屏：第一次点击只展开浮窗信息，不直接跳转（避免误触外链）
    if (isTouch && !card.classList.contains('mod-card--more')) {
      card.addEventListener('click', (e) => {
        if (card.dataset.pop !== 'true') {
          e.preventDefault();
          root.querySelectorAll('.mod-card').forEach((c) => (c.dataset.pop = 'false'));
          card.dataset.pop = 'true';
        } else {
          card.dataset.pop = 'false';
        }
      });
    }
  });
}

/* ───────────────────────────────────────────────────────────
   交互：点击切换（触屏与无 hover 设备的主通道）
   ─────────────────────────────────────────────────────────── */

function initToggles(root, dynByKey) {
  const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;

  root.querySelectorAll('.stack').forEach((stack) => {
    const label = stack.querySelector('.stack__label');
    const cat = dynByKey.get(stack.dataset.category);

    label?.addEventListener('click', () => {
      const open = stack.dataset.open === 'true';
      // 一次只开一叠
      root.querySelectorAll('.stack').forEach((s) => {
        s.dataset.open = 'false';
        s.querySelector('.stack__label')?.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        // ★ 展开前刷新动态叠：「全部 mod」这里重新随机
        if (cat && cat.reshuffle) refreshDynamicStack(root, stack, cat);
        stack.dataset.open = 'true';
        label.setAttribute('aria-expanded', 'true');
      }
    });

    // 桌面端也支持 hover 展开 —— 展开瞬间重新随机（与点击同语义）
    if (!isTouch && cat && cat.reshuffle) {
      stack.addEventListener('pointerenter', () => {
        refreshDynamicStack(root, stack, cat);
      }, { passive: true });
    }

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
}

/* ───────────────────────────────────────────────────────────
   入口
   ─────────────────────────────────────────────────────────── */

export function initStacks() {
  const host = document.querySelector('[data-stacks]');
  if (!host) return;

  // 静态分类叠 + 动态叠
  const staticStacks = CATEGORIES.map((cat) => ({ cat, mods: byCategory(cat.key) }));
  const dynamicStacks = DYNAMIC_STACKS.map((cat) => ({ cat, mods: cat.sample() }));

  const dynByKey = new Map(DYNAMIC_STACKS.map((c) => [c.key, c]));

  host.innerHTML = `
    <div class="stacks__row">
      ${staticStacks.map(({ cat, mods }) => stackHTML(cat, mods)).join('')}
      ${dynamicStacks.map(({ cat, mods }) => stackHTML(cat, mods)).join('')}
    </div>`;

  assignCenters(host);
  initToggles(host, dynByKey);
  host.querySelectorAll('.stack').forEach((s) => bindCardInteractions(host, s));
}
