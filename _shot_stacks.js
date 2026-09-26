/**
 * _shot_stacks.js — 滚动到牌叠区域截一张（三叠收起态全景）
 */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge' });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('http://127.0.0.1:8791/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  // 滚到牌叠容器
  await p.locator('[data-stacks]').scrollIntoViewIfNeeded();
  await p.waitForTimeout(1400);
  await p.screenshot({ path: '_shots/final-stacks.png' });
  await b.close();
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
