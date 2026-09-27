/**
 * _verify_live.js — 对线上站点跑一次真实浏览器冒烟验收
 * 目的：确认「本地全绿」=「线上也全绿」（GitHub Pages 的路径大小写、
 *       .nojekyll、相对路径都可能与本地不同）。
 */
const { chromium } = require('playwright');

const BASE = process.env.LIVE_BASE || 'https://josnil.github.io/pvz-mods/';
const results = [];
const ok = (m) => { results.push(['✓', m]); };
const bad = (m) => { results.push(['✗', m]); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  const failedReq = [];
  page.on('requestfailed', r => failedReq.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  const badResp = [];
  page.on('response', r => { if (r.status() >= 400) badResp.push(r.status() + ' ' + r.url()); });

  // ── 首页 ──
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);

  const nStack = await page.locator('.stack').count();
  nStack === 5 ? ok(`首页五叠齐备（${nStack}）`) : bad(`首页叠数 = ${nStack}（期望 5）`);

  const labels = await page.locator('.stack').evaluateAll(
    els => els.map(e => (e.innerText || '').split('\n')[0].trim()));
  /植物/.test(labels[0] || '') ? ok('第 1 叠 = 植物类') : bad('第 1 叠标签异常：' + labels[0]);
  /僵尸/.test(labels[1] || '') ? ok('第 2 叠 = 僵尸类') : bad('第 2 叠标签异常：' + labels[1]);
  /其他/.test(labels[2] || '') ? ok('第 3 叠 = 其他类') : bad('第 3 叠标签异常：' + labels[2]);
  /最近更新/.test(labels[3] || '') ? ok('第 4 叠 = 最近更新') : bad('第 4 叠标签异常：' + labels[3]);
  /全部\s*mod/i.test(labels[4] || '') ? ok('第 5 叠 = 全部 mod') : bad('第 5 叠标签异常：' + labels[4]);

  // ★ 卡片默认跳夸克（线上数据层是否真是新版）
  //   工具类（无 .pmod）会回退详情页 —— 它们没有可分享的包，属正确行为。
  const hrefs = await page.locator('.stack [data-mod-card]').evaluateAll(
    els => els.map(e => ({ id: e.getAttribute('data-mod-card'), href: e.getAttribute('href') })));
  const quark = hrefs.filter(h => (h.href || '').includes('pan.quark.cn'));
  const fallback = hrefs.filter(h => !(h.href || '').includes('pan.quark.cn'));
  quark.length > 0
    ? ok(`卡片默认跳夸克（${quark.length}/${hrefs.length} 张；其余 ${fallback.length} 张为工具类回退详情页：${fallback.map(x => x.id).join(', ') || '无'}）`)
    : bad(`卡片未跳夸克，实际：${JSON.stringify(hrefs.slice(0, 6))}`);

  // ★ 首页统计数字已是新值（11）
  const total = await page.locator('[data-stat="total"]').first().innerText()
    .catch(() => '');
  total.trim() === '11' ? ok('首页统计 total = 11（新版计数）')
    : bad(`首页统计 total = "${total}"（期望 11）`);

  // 悬停铺开 —— ⚠️ 必须逐卡量 getBoundingClientRect 的跨度，
  // 不能量 .stack 本身的 boundingBox（那是绝对定位的容器框，
  // 展开卡溢出在外、不计入，会误报"未铺开"）。
  const st = page.locator('.stack[data-category="zombie"]');
  const collapsedSpan = await st.evaluate((el) => {
    const r = [...el.querySelectorAll('.stack__card')].map((c) => c.getBoundingClientRect());
    return Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left));
  });
  await st.locator('.stack__label').hover();
  await page.waitForTimeout(900);
  const expandedSpan = await st.evaluate((el) => {
    const r = [...el.querySelectorAll('.stack__card')].map((c) => c.getBoundingClientRect());
    return Math.max(...r.map((x) => x.right)) - Math.min(...r.map((x) => x.left));
  });
  expandedSpan > collapsedSpan * 2 && expandedSpan > 380
    ? ok(`悬停铺开 ${Math.round(collapsedSpan)}px → ${Math.round(expandedSpan)}px（>2×）`)
    : bad(`悬停未铺开：${Math.round(collapsedSpan)}px → ${Math.round(expandedSpan)}px`);

  // 封面是否真的加载（naturalWidth > 0）
  const covers = await page.evaluate(() => Array.from(document.images)
    .filter(i => i.src.includes('/covers/'))
    .map(i => ({ src: i.src.split('/').pop(), w: i.naturalWidth })));
  const brokenCovers = covers.filter(c => c.w === 0);
  covers.length > 0 && brokenCovers.length === 0
    ? ok(`封面全部加载成功（${covers.length} 张）`)
    : bad(`封面破图：${JSON.stringify(brokenCovers)}`);

  // 投石车封面必须在线且非空
  const pult = covers.find(c => c.src === 'discogargantuarpult.png');
  pult && pult.w >= 512
    ? ok(`投石车封面在线且完整（naturalWidth=${pult.w}）`)
    : bad(`投石车封面异常：${JSON.stringify(pult)}`);

  // ── 详情页 ──
  await page.goto(BASE + 'mod/discogargantuarpult.html',
    { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1000);
  const h1 = await page.locator('h1').first().innerText().catch(() => '');
  h1.includes('投石车') ? ok(`详情页 h1 = ${h1.trim()}`) : bad('详情页 h1 异常：' + h1);
  const dl = await page.locator('a[href*="github.com"][href*="download"], a[href*="/releases/"]')
    .count();
  dl > 0 ? ok(`详情页含 GitHub 下载直链（${dl} 个）`) : bad('详情页缺 GitHub 下载直链');
  // ★ 详情页必须同时有夸克按钮与总盘入口
  const quarkBtn = await page.locator('[data-download-block] a[href*="pan.quark.cn"]')
    .count();
  quarkBtn >= 1 ? ok(`详情页含夸克下载按钮（${quarkBtn} 个）`)
    : bad('详情页缺夸克下载按钮');
  const allEntry = await page.locator('a[href="https://pan.quark.cn/s/eca3724f6450"]')
    .count();
  allEntry >= 1 ? ok('详情页含「夸克网盘 · 全部 Mod」总盘入口')
    : bad('详情页缺全部 Mod 总盘入口');

  // ★ 新增的 3 个 Mod 详情页在线且双源齐备
  for (const mid of ['pandorapool', 'nailongzombie', 'peaoverhaul']) {
    await page.goto(`${BASE}mod/${mid}.html`,
      { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    const q = await page.locator('[data-download-block] a[href*="pan.quark.cn"]').count();
    const g = await page.locator('[data-download-block] a[href*="/releases/"], [data-download-block] a[href*="github.com"][download]').count();
    (q >= 1 && g >= 1) ? ok(`mod/${mid}.html 双源齐备（夸克 ${q} / GitHub ${g}）`)
      : bad(`mod/${mid}.html 双源缺失（夸克 ${q} / GitHub ${g}）`);
  }

  // ── 移动端 ──
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 375, height: 812 });
  await m.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await m.waitForTimeout(1200);
  const mInfo = await m.locator('.stack__cards').first().evaluate(el => {
    const cs = getComputedStyle(el);
    return { snap: cs.scrollSnapType, ox: cs.overflowX };
  });
  mInfo.ox === 'auto' ? ok('移动端降级为横向卡条') : bad('移动端未降级：' + JSON.stringify(mInfo));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  !overflow ? ok('移动端无横向溢出') : bad('移动端出现横向溢出');

  // ── 资源健康 ──
  badResp.length === 0 ? ok('无 4xx/5xx 响应') : bad('异常响应：\n      ' + badResp.join('\n      '));
  jsErrors.length === 0 ? ok('无 JS 报错') : bad('JS 报错：\n      ' + jsErrors.join('\n      '));

  await browser.close();

  console.log('══════════ 线上站点冒烟验收 ══════════');
  console.log('  ' + BASE);
  console.log('──────────────────────────────────────');
  for (const [mark, msg] of results) console.log(`  ${mark} ${msg}`);
  const fails = results.filter(r => r[0] === '✗').length;
  console.log('──────────────────────────────────────');
  console.log(`  通过 ${results.length - fails} 项，失败 ${fails} 项`);
  if (failedReq.length) {
    console.log('  [注] 请求失败（含被取消）：');
    for (const f of failedReq.slice(0, 8)) console.log('      ' + f);
  }
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
