/**
 * _verify_live.js — 对线上站点跑一次真实浏览器冒烟验收
 * 目的：确认「本地全绿」=「线上也全绿」（GitHub Pages 的路径大小写、
 *       .nojekyll、相对路径都可能与本地不同）。
 */
const { chromium } = require('playwright');

const BASE = 'https://josnil.github.io/pvz-mods/';
const results = [];
const ok = (m) => { results.push(['✓', m]); };
const bad = (m) => { results.push(['✗', m]); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(String(e)));
  const failedReq = [];
  page.on('requestfailed', r => failedReq.push(r.url() + ' :: ' + (r.failure()?.errorText || '')));
  const badResp = [];
  page.on('response', r => { if (r.status() >= 400) badResp.push(r.status() + ' ' + r.url()); });

  // ── 首页 ──
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const nStack = await page.locator('.stack').count();
  nStack === 3 ? ok(`首页三叠齐备（${nStack}）`) : bad(`首页叠数 = ${nStack}（期望 3）`);

  const labels = await page.locator('.stack').evaluateAll(
    els => els.map(e => (e.innerText || '').split('\n')[0].trim()));
  /植物/.test(labels[0] || '') ? ok('第一叠 = 植物类') : bad('第一叠标签异常：' + labels[0]);
  /僵尸/.test(labels[1] || '') ? ok('第二叠 = 僵尸类') : bad('第二叠标签异常：' + labels[1]);
  /其他/.test(labels[2] || '') ? ok('第三叠 = 其他类') : bad('第三叠标签异常：' + labels[2]);

  // 悬停铺开
  await page.locator('.stack').nth(1).hover();
  await page.waitForTimeout(900);
  const exp = await page.locator('.stack').nth(1).boundingBox();
  exp && exp.width > 300
    ? ok(`悬停铺开宽度 ${Math.round(exp.width)}px > 300px`)
    : bad(`悬停未铺开（宽度 ${exp ? Math.round(exp.width) : 'null'}）`);

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
  dl > 0 ? ok(`详情页含下载直链（${dl} 个）`) : bad('详情页缺下载直链');

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
