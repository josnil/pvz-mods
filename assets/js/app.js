/* ═══════════════════════════════════════════════════════════════
   app.js — 站点入口（所有页面共用）

   顺序很重要：
     1. mountShell()  先落地导航/页脚（否则 initNav 找不到节点）
     2. initNav()     再绑定导航交互
     3. initCursor()  光标
     4. initReveal()  滚动入场
     5. initStacks()  牌叠（仅首页有 [data-stacks] 时生效）
   ═══════════════════════════════════════════════════════════════ */

import { mountShell } from './shell.js';
import { initReveal, initNav, initCursor } from './reveal.js';
import { initStacks } from './stack.js';

/* 页面通过 <body data-depth="1" data-current="plants"> 声明自身位置
   data-depth   —— 到站点根的层级（0 = 根目录页面，1 = mod/ 下）
   data-current —— 高亮哪个导航项（home / plants / zombies / others）
   data-crumbs  —— JSON 数组，可选，渲染面包屑 */
function boot() {
  const body = document.body;
  const depth = Number(body.dataset.depth || 0);
  const current = body.dataset.current || '';

  let crumbs = null;
  if (body.dataset.crumbs) {
    try {
      crumbs = JSON.parse(body.dataset.crumbs);
    } catch {
      crumbs = null;   // 面包屑是增强项，坏 JSON 不该拖垮整页
    }
  }

  mountShell({ depth, current, crumbs });
  initNav();
  initCursor();
  initReveal();
  initStacks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
