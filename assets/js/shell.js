/* ═══════════════════════════════════════════════════════════════
   shell.js — 共享外壳（导航 / 页脚 / 光标 / 面包屑）

   页面按「到站点根」的相对深度调用 buildShell(depth)：
     首页            depth = 0
     分类页          depth = 0
     mod/xxx.html    depth = 1

   为什么用 JS 注入而不是复制粘贴：
     8 个 mod 详情页若各自内联一份导航，改一个链接要改 11 处
     ⇒ 收敛成单一真源，模板 URL 用 <template> 承载、由 shell.js 落地。
   ═══════════════════════════════════════════════════════════════ */

import { CATEGORIES } from './mods.js';

/** 站点元信息 */
export const SITE = {
  name: 'PVZ·MOD',
  fullName: '植物大战僵尸杂交版 · 个人 Mod 存放站',
  author: '云漫行',
  engine: 'Godot 4 + C#',
  game: '植物大战僵尸杂交版',
  repo: 'https://github.com/josnil/pvz-mods',
};

/** 相对路径前缀 */
export const up = (depth) => '../'.repeat(depth);

/* ───────────────────────────────────────────────────────────
   导航
   ─────────────────────────────────────────────────────────── */

export function navHTML(depth, current = '') {
  const u = up(depth);

  const links = [
    { href: `${u}index.html`, label: '首页', key: 'home' },
    ...CATEGORIES.map((c) => ({
      href: `${u}${c.slug}.html`,
      label: c.name,
      key: c.slug,
    })),
  ];

  const desktop = links
    .map(
      (l) => `
        <li><a href="${l.href}"${
        l.key === current ? ' aria-current="page"' : ''
      }>${l.label}</a></li>`
    )
    .join('');

  const drawer = links
    .map(
      (l) => `<a href="${l.href}"${
        l.key === current ? ' aria-current="page"' : ''
      }>${l.label}</a>`
    )
    .join('');

  return `
    <a class="skip-link" href="#main">跳到主内容</a>

    <nav class="nav" data-nav>
      <a class="nav__brand" href="${u}index.html">
        ${SITE.name}<span aria-hidden="true">.</span>
      </a>

      <ul class="nav__links">${desktop}</ul>

      <button class="nav__toggle" type="button"
              aria-expanded="false" aria-controls="nav-drawer"
              aria-label="打开导航菜单">
        <span class="nav__toggle-icon" aria-hidden="true"></span>
      </button>
    </nav>

    <div class="nav__drawer" id="nav-drawer" data-open="false">
      ${drawer}
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   页脚
   ─────────────────────────────────────────────────────────── */

export function footerHTML(depth) {
  const u = up(depth);

  return `
    <footer class="footer">
      <div class="footer__grid">
        <div class="footer__col">
          <h3>分类</h3>
          <ul>
            ${CATEGORIES.map(
              (c) => `<li><a href="${u}${c.slug}.html">${c.name}</a></li>`
            ).join('')}
          </ul>
        </div>
        <div class="footer__col">
          <h3>关于</h3>
          <ul>
            <li><a href="${u}index.html#about">关于本站</a></li>
            <li><a href="${u}index.html#howto">安装说明</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h3>链接</h3>
          <ul>
            <li><a href="${SITE.repo}" target="_blank" rel="noopener">GitHub 仓库</a></li>
            <li><a href="${SITE.repo}/releases" target="_blank" rel="noopener">全部下载</a></li>
          </ul>
        </div>
      </div>
      <p class="footer__note">
        ${SITE.fullName} · 作者 ${SITE.author} · 基于 ${SITE.engine}
        <br>
        本页为个人作品展示，与游戏官方无关；游戏本体与原始素材版权归原作者所有。
      </p>
    </footer>`;
}

/* ───────────────────────────────────────────────────────────
   面包屑
   ─────────────────────────────────────────────────────────── */

export function crumbsHTML(depth, items) {
  const u = up(depth);
  const li = items
    .map((it, i) => {
      const last = i === items.length - 1;
      if (last || !it.href) {
        return `<li><span aria-current="page">${it.label}</span></li>`;
      }
      return `<li><a href="${u}${it.href}">${it.label}</a></li>`;
    })
    .join('');

  return `
    <nav class="crumbs" aria-label="面包屑">
      <ol style="display:flex;gap:var(--sp-2);list-style:none;margin:0;padding:0">
        ${li}
      </ol>
    </nav>`;
}

/* ───────────────────────────────────────────────────────────
   氛围背景层（导航 / 内容 / 页脚 之前）
   ▸ 单一真源：11 个页面都靠这一处注入，避免复制粘贴
   ▸ 两层职责分离：
       .bg__base   —— 深海军蓝径向渐变（静态，还原参考站的底）
       canvas      —— 星云光点（nebula.js 自己 insertBefore 到 .bg__veil 前）
       .bg__veil   —— 底部压暗，保证页脚小字对比度
   ─────────────────────────────────────────────────────────── */

export function bgHTML() {
  return `
    <div class="bg" aria-hidden="true">
      <div class="bg__base"></div>
      <div class="bg__veil"></div>
    </div>`;
}

/* ───────────────────────────────────────────────────────────
   注入外壳 + 初始化交互
   ─────────────────────────────────────────────────────────── */

export function mountShell({ depth = 0, current = '', crumbs = null } = {}) {
  // ★ 背景必须第一个插进 body，保证它早于所有内容存在
  //   （虽然 CSS 用了负 z-index 兜底，但 DOM 顺序在前能少一层"万一"）
  if (!document.querySelector('.bg')) {
    const host = document.createElement('div');
    host.innerHTML = bgHTML().trim();
    document.body.insertBefore(host.firstElementChild, document.body.firstChild);
  }

  const navHost = document.querySelector('[data-shell-nav]');
  if (navHost) navHost.outerHTML = navHTML(depth, current);

  const footHost = document.querySelector('[data-shell-footer]');
  if (footHost) footHost.outerHTML = footerHTML(depth);

  const crumbHost = document.querySelector('[data-shell-crumbs]');
  if (crumbHost && crumbs) crumbHost.outerHTML = crumbsHTML(depth, crumbs);

  // 自定义光标（仅桌面）
  if (!document.querySelector('.cursor')) {
    const cur = document.createElement('div');
    cur.className = 'cursor';
    cur.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cur);
  }
}
