/* ═══════════════════════════════════════════════════════════════
   _verify_interaction.js — 真机浏览器验证牌叠交互

   验证项：
     0. 首页五叠渲染（3 分类静态叠 + 「最近更新」/「全部 mod」两个动态叠）
     0b.「全部 mod」叠每次展开重随机；「最近更新」叠顺序稳定且 = recentLevels(3)
     0c. 动态叠卡片点击默认跳夸克链接
     1. 每叠卡片数与分类数据一致（plant 3 / zombie 4 / other 4）
     2. 悬停某叠 → 该叠铺开（首末卡间距显著变大）+ 其余叠淡出
     3. 铺开宽度 > 列宽（证明"整行铺开"确实生效，没有被子列裁切）
     4. 悬停卡片 → 信息浮窗可见（opacity=1）
     5. 移动端 375px → 降级为横向 scroll-snap 卡条，无旋转
     6. 键盘 Tab → 焦点进入时该叠自动展开（focus-within 通道）
     7. 无 JS 报错
   ═══════════════════════════════════════════════════════════════ */

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const SHOT = process.env.SHOT || './_shots';

// 本机没有下载 chromium，但装了 Edge ⇒ 用系统 Edge（channel）免下载
const LAUNCH = process.env.USE_CHANNEL === '0'
  ? {}
  : { channel: 'msedge' };

const P = [];
const F = [];

function ok(m) { P.push(m); console.log('  ✓ ' + m); }
function bad(m) { F.push(m); console.log('  ✗ ' + m); }
function head(m) { console.log('\n── ' + m + ' ──'); }

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const errors = [];

  /* ═══ 桌面端 1440×900 ═══ */
  head('桌面端 1440×900');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  // 记录 404 的具体 URL，否则只能看到一句无用的 "Failed to load resource"
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  // 1. 五叠渲染（3 静态分类叠 + 2 动态叠）
  //   ⚠️ dataset 取到的是**字符串** "true"/"false"，直接当布尔用会把
  //      "false" 也算成真值（"false" is truthy）—— 必须显式比较。
  const stackInfo = await page.evaluate(() => {
    return [...document.querySelectorAll('.stack')].map((s) => ({
      cat: s.dataset.category,
      dyn: s.dataset.dynamic === 'true',
      reshuffle: s.dataset.reshuffle === 'true',
      count: Number(s.dataset.count),
      cards: s.querySelectorAll('.stack__card').length,
      hasMore: !!s.querySelector('.stack__card--more'),
    }));
  });
  console.log('    ', JSON.stringify(stackInfo));

  if (stackInfo.length === 5) ok('首页渲染出 5 个牌叠（3 分类 + 2 动态）');
  else bad(`牌叠数应为 5，实际 ${stackInfo.length}`);

  const dynKeys = stackInfo.filter((s) => s.dyn).map((s) => s.cat);
  if (dynKeys.includes('recent') && dynKeys.includes('all')) {
    ok('含「最近更新」+「全部 mod」两个动态叠');
  } else {
    bad('动态叠缺失，实际：' + JSON.stringify(dynKeys));
  }

  const allStack = stackInfo.find((s) => s.cat === 'all');
  if (allStack && allStack.reshuffle) {
    ok('「全部 mod」叠声明 data-reshuffle=true（每次展开重随机）');
  } else {
    bad('「全部 mod」叠未声明 data-reshuffle=true');
  }

  // 动态叠必须各渲染 3 张卡且不带「更多 mod」
  for (const s of stackInfo.filter((x) => x.dyn)) {
    if (s.cards !== 3) bad(`${s.cat} 动态叠应渲染 3 张卡，实际 ${s.cards}`);
    if (s.hasMore) bad(`${s.cat} 动态叠不该出现「更多 mod」卡`);
  }
  if (!F.length) ok('两个动态叠各渲染 3 张卡且无「更多 mod」卡');

  const expect = { plant: 3, zombie: 4, other: 4 };
  for (const s of stackInfo.filter((x) => !x.dyn)) {
    if (s.count !== expect[s.cat]) {
      bad(`${s.cat} 叠 mod 数应为 ${expect[s.cat]}，实际 ${s.count}`);
    }
    // plant/zombie/other 都 ≤5 ⇒ 不应出现「更多 mod」卡
    if (s.hasMore) bad(`${s.cat} 只有 ${s.count} 个 mod（≤5），不该出现「更多 mod」卡`);
  }
  if (!F.length) ok('各静态叠 mod 数与数据层一致（3/4/4），且无多余的「更多 mod」卡');

  // 1b. 「全部 mod」叠每次展开都要换一批（这是用户点名的行为）
  const drawOnce = async () => {
    await page.mouse.move(10, 10);
    await page.waitForTimeout(160);
    await page.hover('.stack[data-category="all"] .stack__label');
    await page.waitForTimeout(320);
    return page.evaluate(() =>
      [...document.querySelectorAll('.stack[data-category="all"] .mod-card')]
        .map((c) => c.getAttribute('data-mod-card')).sort());
  };
  const draws = [];
  for (let i = 0; i < 6; i++) draws.push((await drawOnce()).join('|'));
  const uniq = new Set(draws);
  console.log('     6 次展开取样 =', [...uniq].map((d) => d.replace(/\|/g, '+')));
  if (uniq.size >= 2) {
    ok(`「全部 mod」叠 ${uniq.size}/6 次取样互不相同（确实在重随机）`);
  } else {
    bad('「全部 mod」叠每次展开都是同一批（reshuffle 没生效）');
  }

  // 1c. 「最近更新」叠顺序稳定（是"最近"而非"随机"）
  const readRecent = () => page.evaluate(() =>
    [...document.querySelectorAll('.stack[data-category="recent"] .mod-card')]
      .map((c) => c.getAttribute('data-mod-card')));
  await page.mouse.move(10, 10);
  await page.waitForTimeout(160);
  await page.hover('.stack[data-category="recent"] .stack__label');
  await page.waitForTimeout(320);
  const recentA = await readRecent();
  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
  await page.hover('.stack[data-category="recent"] .stack__label');
  await page.waitForTimeout(320);
  const recentB = await readRecent();
  console.log('     最近更新取样 =', recentA);
  if (recentA.join('|') === recentB.join('|') && recentA.length === 3) {
    ok('「最近更新」叠两次展开顺序一致（按更新时间，非随机）');
  } else {
    bad('「最近更新」叠顺序不稳定或卡数 ≠ 3');
  }
  // 必须真按 updatedAt 降序：与数据层独立计算的结果比对
  const expectRecent = await page.evaluate(async () => {
    const m = await import('./assets/js/mods.js');
    return m.recentLevels(3).map((x) => x.id);
  });
  if (recentA.join('|') === expectRecent.join('|')) {
    ok('「最近更新」叠顺序与 recentLevels(3) 完全一致（' + expectRecent.join(' > ') + '）');
  } else {
    bad('「最近更新」叠顺序与数据层不符：' + JSON.stringify(recentA)
        + ' vs ' + JSON.stringify(expectRecent));
  }

  // 1d. 动态叠的卡片：有夸克链的一律跳夸克；无夸克链的工具类回退详情页
  //     ⚠️ 工具类（关卡构建器 / 图形编辑器）没有 .pmod 可分享，
  //        primaryUrl() 会回退到详情页 —— 这不违反"默认跳夸克"的口径。
  const dynCards = await page.evaluate(async () => {
    const m = await import('./assets/js/mods.js');
    const quarkIds = new Set(m.MODS.filter((x) => x.quark).map((x) => x.id));
    return [...document.querySelectorAll('.stack[data-dynamic="true"] .mod-card')]
      .map((c) => ({
        id: c.getAttribute('data-mod-card'),
        href: c.getAttribute('href'),
        shouldQuark: quarkIds.has(c.getAttribute('data-mod-card')),
      }));
  });
  const wrong = dynCards.filter(
    (c) => c.shouldQuark ? !(c.href || '').includes('pan.quark.cn')
                         : !(c.href || '').includes('.html'));
  if (dynCards.length && !wrong.length) {
    ok(`动态叠卡片去向正确（${dynCards.length} 张：有夸克链跳夸克，工具类跳详情页）`);
  } else {
    bad('动态叠卡片去向错误：' + JSON.stringify(wrong));
  }


  // 2. 收起态几何
  const collapsed = await page.evaluate(() => {
    const st = document.querySelector('.stack[data-category="zombie"]');
    const cards = [...st.querySelectorAll('.stack__card')];
    const r = cards.map((c) => c.getBoundingClientRect());
    return {
      left: Math.min(...r.map((x) => x.left)),
      right: Math.max(...r.map((x) => x.right)),
      width: Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left)),
    };
  });
  console.log('     收起宽度 =', collapsed.width.toFixed(1), 'px');
  // 收起态应紧凑：3 张卡以 ±9px 错开 ⇒ 总宽约 150~200px，远小于 3×132=396px
  if (collapsed.width > 0 && collapsed.width < 260) {
    ok('收起态紧凑成叠（宽度 ' + collapsed.width.toFixed(0) + 'px，未摊成一排）');
  } else {
    bad('收起态过宽，卡片未真正叠起来：' + collapsed.width);
  }

  // 3. 悬停展开
  await page.hover('.stack[data-category="zombie"] .stack__label');
  await page.waitForTimeout(700);   // 等过渡（--dur-base 300ms）跑完

  const expanded = await page.evaluate(() => {
    const row = document.querySelector('.stacks__row');
    const st = document.querySelector('.stack[data-category="zombie"]');
    const cards = [...st.querySelectorAll('.stack__card')];
    const r = cards.map((c) => c.getBoundingClientRect());
    // 逐卡的 translateX 增量（读 transform 矩阵的 m41）
    const tx = cards.map((c) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
      return Math.round(m.m41);
    });
    const others = [...row.querySelectorAll('.stack')]
      .filter((s) => s !== st)
      .map((s) => Number(getComputedStyle(s).opacity));
    return {
      width: Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left)),
      colWidth: st.getBoundingClientRect().width,
      cardWidth: r[0].width,
      tx,
      others,
      count: cards.length,
    };
  });
  console.log('     展开宽度 =', expanded.width.toFixed(1), 'px / 列宽 =',
              expanded.colWidth.toFixed(1), 'px / 卡宽 =', expanded.cardWidth.toFixed(1));
  console.log('     逐卡 translateX =', JSON.stringify(expanded.tx));
  console.log('     另两叠 opacity =', expanded.others);

  // 期望展开跨度 ≈ 卡宽 + (N-1) × 118px 步进（含旋转带来的少量外扩）
  const expectWidth = expanded.cardWidth + (expanded.count - 1) * 118;
  if (expanded.width > expectWidth * 0.9) {
    ok(`悬停后按 118px 步进铺开（实测 ${expanded.width.toFixed(0)}px，理论下限 ${expectWidth.toFixed(0)}px）`);
  } else {
    bad(`铺开不足：实测 ${expanded.width.toFixed(0)}px < 理论 ${expectWidth.toFixed(0)}px`);
  }

  // 校验「整行铺开」是否真的生效：
  // ⚠️ 本叠只有 3 个 mod，扇开仅 ~388px < 列宽 411px ⇒ 3 卡时其实还塞得下，
  //    这一步证明不了任何事。真正需要"逃出列宽"的是 5 卡（首页上限）情形。
  //    因此这里临时给该叠补到 6 张卡，再断言铺开宽度显著超出列宽。
  const wide = await page.evaluate(async () => {
    const st = document.querySelector('.stack[data-category="zombie"]');
    const ul = st.querySelector('.stack__cards');
    // 克隆现有卡补齐到 6 张，并重算 --c（居中偏移）
    while (ul.querySelectorAll('.stack__card').length < 6) {
      const clone = ul.querySelector('.stack__card').cloneNode(true);
      ul.appendChild(clone);
    }
    const cards = [...ul.querySelectorAll('.stack__card')];
    const n = cards.length;
    cards.forEach((c, i) => c.style.setProperty('--c', (i - (n - 1) / 2).toFixed(3)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 700));
    const rects = cards.map((c) => c.getBoundingClientRect());
    return {
      width: Math.max(...rects.map((x) => x.right)) - Math.min(...rects.map((x) => x.left)),
      colWidth: st.getBoundingClientRect().width,
      count: n,
    };
  });
  console.log(`     ${wide.count} 卡铺开宽度 = ${wide.width.toFixed(1)}px / 列宽 = ${wide.colWidth.toFixed(1)}px`);
  if (wide.width > wide.colWidth) {
    ok(`6 卡铺开 ${wide.width.toFixed(0)}px > 列宽 ${wide.colWidth.toFixed(0)}px ⇒「整行铺开」确有必要且已生效`);
  } else {
    bad(`6 卡铺开仅 ${wide.width.toFixed(0)}px，未超过列宽 ${wide.colWidth.toFixed(0)}px`);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.hover('.stack[data-category="zombie"] .stack__label');
  await page.waitForTimeout(700);

  // 相邻卡片的水平间距应≈118px（步进生效）
  const stepGap = Math.abs(expanded.tx[1] - expanded.tx[0]);
  if (stepGap >= 110 && stepGap <= 126) ok(`相邻卡片水平步进 = ${stepGap}px（目标 118px）`);
  else bad(`相邻卡片步进异常：${stepGap}px（应 ≈118px）`);

  if (expanded.others.every((o) => o < 0.5)) ok('另两叠淡出到 0.25（:has() 让位生效）');
  else bad('另两叠未淡出：' + JSON.stringify(expanded.others));

  // 4. 浮窗
  await page.hover('.stack[data-category="zombie"] .mod-card');
  await page.waitForTimeout(450);
  const pop = await page.evaluate(() => {
    const p = document.querySelector('.stack[data-category="zombie"] .mod-card__pop');
    const cs = getComputedStyle(p);
    return { opacity: cs.opacity, visibility: cs.visibility, text: p.textContent.trim().slice(0, 40) };
  });
  console.log('     浮窗 =', JSON.stringify(pop));
  if (Number(pop.opacity) > 0.9 && pop.visibility === 'visible') {
    ok('悬停卡片浮现信息浮窗（opacity=1, visible）');
  } else {
    bad('浮窗未显示：' + JSON.stringify(pop));
  }

  await page.screenshot({ path: SHOT + '/desktop-expanded.png', fullPage: false });

  // 5. 键盘 focus-within 通道
  await page.evaluate(() => {
    document.querySelector('.stack[data-category="plant"] .stack__label').focus();
    document.querySelector('.stack[data-category="plant"] .stack__card .mod-card').focus();
  });
  await page.waitForTimeout(600);
  const kb = await page.evaluate(() => {
    const st = document.querySelector('.stack[data-category="plant"]');
    const cards = [...st.querySelectorAll('.stack__card')];
    const r = cards.map((c) => c.getBoundingClientRect());
    const tx = cards.map((c) =>
      Math.round(new DOMMatrixReadOnly(getComputedStyle(c).transform).m41));
    return {
      width: Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left)),
      cardWidth: r[0].width,
      count: cards.length,
      tx,
    };
  });
  const kbExpect = kb.cardWidth + (kb.count - 1) * 118;
  console.log('     键盘聚焦时 plant 叠：宽度 =', kb.width.toFixed(1),
              '/ 理论下限 =', kbExpect.toFixed(0), '/ tx =', JSON.stringify(kb.tx));
  if (kb.width > kbExpect * 0.9) {
    ok('键盘 Tab 进入时该叠自动展开（focus-within 通道可用）');
  } else {
    bad(`键盘聚焦未按预期展开：${kb.width.toFixed(0)} < ${kbExpect.toFixed(0)}`);
  }

  // 6. 触屏 data-open 通道（同一页面强制模拟）
  await page.evaluate(() => {
    const st = document.querySelector('.stack[data-category="other"]');
    st.dataset.open = 'true';
    st.querySelector('.stack__label').setAttribute('aria-expanded', 'true');
  });
  await page.waitForTimeout(600);
  const touch = await page.evaluate(() => {
    const st = document.querySelector('.stack[data-category="other"]');
    const cards = [...st.querySelectorAll('.stack__card')];
    const r = cards.map((c) => c.getBoundingClientRect());
    return {
      width: Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left)),
      cardWidth: r[0].width,
      count: cards.length,
      aria: st.querySelector('.stack__label').getAttribute('aria-expanded'),
    };
  });
  const tExpect = touch.cardWidth + (touch.count - 1) * 118;
  console.log('     data-open 时 other 叠：宽度 =', touch.width.toFixed(1),
              '/ 理论下限 =', tExpect.toFixed(0), '/ aria-expanded =', touch.aria);
  if (touch.width > tExpect * 0.9 && touch.aria === 'true') {
    ok('data-open 通道（触屏）也能铺开，且 aria-expanded 同步');
  } else {
    bad('data-open 通道异常：' + JSON.stringify(touch));
  }

  await ctx.close();

  /* ═══ 移动端 375×812 ═══ */
  head('移动端 375×812');
  const mctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errors.push('m-pageerror: ' + e.message));
  await mp.goto(BASE + '/', { waitUntil: 'networkidle' });

  const mobile = await mp.evaluate(() => {
    const list = document.querySelector('.stack[data-category="zombie"] .stack__cards');
    const cs = getComputedStyle(list);
    const card = document.querySelector('.stack[data-category="zombie"] .stack__card');
    const ccs = getComputedStyle(card);
    return {
      scrollSnap: cs.scrollSnapType,
      overflowX: cs.overflowX,
      transform: ccs.transform,
      popDisplay: getComputedStyle(
        document.querySelector('.stack[data-category="zombie"] .mod-card__pop')
      ).display,
      inlineDesc: getComputedStyle(
        document.querySelector('.stack[data-category="zombie"] .mod-card__inline-desc')
      ).display,
    };
  });
  console.log('    ', JSON.stringify(mobile));

  if (mobile.scrollSnap.includes('x') && mobile.overflowX === 'auto') {
    ok('移动端降级为横向 scroll-snap 卡条');
  } else {
    bad('移动端未降级为卡条：' + JSON.stringify(mobile));
  }
  if (mobile.transform === 'none') ok('移动端取消扇形旋转（transform: none）');
  else bad('移动端仍有 transform：' + mobile.transform);
  if (mobile.popDisplay === 'none' && mobile.inlineDesc === 'block') {
    ok('移动端隐藏浮窗、改为卡底直接展示简介');
  } else {
    bad('移动端简介呈现方式不对：' + JSON.stringify(mobile));
  }

  // 移动端导航抽屉
  await mp.click('.nav__toggle');
  await mp.waitForTimeout(350);
  const drawer = await mp.evaluate(() => {
    const d = document.querySelector('.nav__drawer');
    return { open: d.dataset.open, display: getComputedStyle(d).display,
             links: d.querySelectorAll('a').length };
  });
  if (drawer.open === 'true' && drawer.display === 'flex' && drawer.links >= 4) {
    ok(`移动端抽屉可打开（${drawer.links} 个链接）`);
  } else {
    bad('移动端抽屉异常：' + JSON.stringify(drawer));
  }
  await mp.screenshot({ path: SHOT + '/mobile-drawer.png' });
  await mp.click('.nav__toggle');
  await mp.waitForTimeout(350);
  await mp.screenshot({ path: SHOT + '/mobile-home.png' });

  await mctx.close();

  /* ═══ 极窄 320px ═══ */
  head('极窄 320×640');
  const nctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const np = await nctx.newPage();
  np.on('pageerror', (e) => errors.push('320-pageerror: ' + e.message));
  await np.goto(BASE + '/', { waitUntil: 'networkidle' });
  const overflow = await np.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log('    ', JSON.stringify(overflow));
  if (overflow.scrollW <= overflow.clientW + 1) {
    ok('320px 无横向溢出（scrollWidth == clientWidth）');
  } else {
    bad(`320px 出现横向溢出：${overflow.scrollW} > ${overflow.clientW}`);
  }
  await np.screenshot({ path: SHOT + '/narrow-320.png' });
  await nctx.close();

  /* ═══ 详情页 + 分类页 ═══ */
  head('分类页与详情页');
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errors.push('detail-pageerror: ' + e.message));

  for (const path of ['/plants.html', '/zombies.html', '/others.html',
                      '/mod/supergatlingpea.html', '/mod/vampirepool.html']) {
    await dp.goto(BASE + path, { waitUntil: 'networkidle' });
    const r = await dp.evaluate(() => {
      const nav = document.querySelector('.nav');
      const foot = document.querySelector('.footer');
      const imgs = [...document.images];
      return {
        nav: !!nav,
        brand: nav ? nav.querySelector('.nav__brand').textContent.trim() : '',
        foot: !!foot,
        brokenImgs: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
        imgs: imgs.length,
        h1: (document.querySelector('h1') || {}).textContent || '',
      };
    });
    const tag = path.padEnd(32);
    if (r.nav && r.foot && r.brokenImgs === 0) {
      ok(`${tag} 导航+页脚正常，${r.imgs} 张图无破图 | h1="${r.h1.trim().slice(0, 22)}"`);
    } else {
      bad(`${tag} 异常：${JSON.stringify(r)}`);
    }
  }

  await dp.goto(BASE + '/mod/vampirepool.html', { waitUntil: 'networkidle' });
  await dp.screenshot({ path: SHOT + '/detail-vampirepool.png' });
  await dp.goto(BASE + '/zombies.html', { waitUntil: 'networkidle' });
  await dp.screenshot({ path: SHOT + '/category-zombies.png' });
  await dctx.close();

  /* ═══ 汇总 ═══ */
  head('JS 错误');
  if (errors.length === 0) ok('全程无 JS 报错');
  else errors.forEach((e) => bad('JS 错误：' + e));

  console.log('\n' + '='.repeat(60));
  console.log(`通过 ${P.length} 项，失败 ${F.length} 项`);
  console.log('='.repeat(60));
  await browser.close();
  process.exit(F.length ? 1 : 0);
})();
