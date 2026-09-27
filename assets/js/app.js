/* ═══════════════════════════════════════════════════════════════
   app.js — 站点入口（所有页面共用）

   顺序很重要：
     1. mountShell()     先落地导航/页脚/氛围背景（否则后面找不到节点）
     2. initNebula()     星云背景（需 .bg 已存在）
     3. initNav()        导航交互
     4. initCursor()     光标跟随
     5. initCursorTrail()彩色粒子拖尾（仅桌面精细指针）
     6. initReveal()     滚动入场
     7. initStacks()     牌叠（仅首页有 [data-stacks] 时生效）
     8. initCloudUi()    云增强（计数/点赞/留言；云不可用则整块静默降级）

   ⚠️ 每个增强模块都在内部自己 try/catch + 自检，任一失败都不影响其余模块
      （背景动画坏了也必须能正常浏览与下载）。
   ═══════════════════════════════════════════════════════════════ */

import { mountShell } from './shell.js';
import { initReveal, initNav, initCursor } from './reveal.js';
import { initNebula } from './nebula.js';
import { initCursorTrail } from './cursor-trail.js';
import { initStacks } from './stack.js';
import { initCloudUi } from './cloud-ui.js';

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

  // ★ 视觉增强一律"软失败"：任何一项抛错都不阻断后面的主流程
  const safe = (name, fn) => {
    try {
      fn();
    } catch (err) {
      console.warn('[boot] %s 初始化失败，已降级：', name, err);
    }
  };

  safe('nebula', initNebula);
  safe('nav', initNav);
  safe('cursor', initCursor);
  safe('cursorTrail', initCursorTrail);
  safe('reveal', initReveal);
  safe('stacks', initStacks);
  safe('cloudUi', initCloudUi);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
