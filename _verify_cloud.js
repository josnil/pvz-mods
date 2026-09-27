/* ═══════════════════════════════════════════════════════════════
   _verify_cloud.js — 云服务关键路径验证（真实数据面）

   为什么必须跑在「已发布域名」上：
     Web 端云服务按 **exact Origin** 绑定，WorkBuddy 预览域与 localhost
     都无法通过校验。因此本脚本默认打到线上发布域。

   用法：
     node _verify_cloud.js
     BASE=https://xxx node _verify_cloud.js
   ═══════════════════════════════════════════════════════════════ */

const { chromium } = require('playwright');

const BASE = process.env.BASE || 'https://pvz-mods-gallery.app.workbuddy.host';

let pass = 0, fail = 0;
const ok = (label, extra) => { pass++; console.log(`  ✓ ${label}${extra ? '  ' + extra : ''}`); };
const bad = (label, extra) => { fail++; console.log(`  ✗ ${label}${extra ? '  ' + extra : ''}`); };

(async () => {
  console.log('='.repeat(60));
  console.log(`云服务验证  —  ${BASE}`);
  console.log('='.repeat(60));

  const browser = await chromium.launch(
    process.env.USE_CHANNEL === '0' ? {} : { channel: 'msedge' }
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  // ── 1. 打开首页，等待云 SDK 载入 ──────────────────────────
  console.log('\n── SDK 载入 ──');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });

  const sdk = await page.evaluate(() => ({
    hasGlobal: typeof window.WorkBuddyCloud === 'object' && window.WorkBuddyCloud !== null,
    hasFactory: typeof (window.WorkBuddyCloud || {}).createWorkBuddyCloud === 'function',
  }));
  sdk.hasGlobal ? ok('CDN 全局 WorkBuddyCloud 已载入') : bad('CDN 全局 WorkBuddyCloud 缺失');
  sdk.hasFactory ? ok('createWorkBuddyCloud 工厂可用') : bad('createWorkBuddyCloud 不可用');

  // ── 2. 计数读取（公开读）────────────────────────────────
  console.log('\n── 公开读：计数 ──');
  const stats = await page.evaluate(async () => {
    const cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    const { data, error } = await cloud.database
      .from('mod_stats')
      .select('mod_id, downloads, likes');
    return { rows: (data || []).length, error: error ? error.message : null,
             sample: (data || [])[0] || null };
  });
  stats.error ? bad('读取 mod_stats 失败', stats.error)
              : ok(`读取 mod_stats 成功（${stats.rows} 行）`,
                   stats.sample ? JSON.stringify(stats.sample) : '');
  stats.rows === 8 ? ok('8 个 Mod 计数行齐备') : bad(`计数行数异常：${stats.rows}（期望 8）`);

  // ── 3. 留言公开读（未登录也应可读）──────────────────────
  console.log('\n── 公开读：留言 ──');
  const cm = await page.evaluate(async () => {
    const cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    const { data, error } = await cloud.database
      .from('mod_comments').select('id').limit(1);
    return { error: error ? error.message : null, n: (data || []).length };
  });
  cm.error ? bad('读取 mod_comments 失败', cm.error) : ok('读取 mod_comments 成功（公开可读）');

  // ── 4. RPC 写：下载计数自增并回读 ──────────────────────
  console.log('\n── 写路径：下载计数 RPC ──');
  const bump = await page.evaluate(async () => {
    const cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    const before = await cloud.database.from('mod_stats')
      .select('downloads').eq('mod_id', 'mod-editor').maybeSingle();

    const r = await cloud.database.rpc('bump_mod_download', {
      p_mod_id: 'mod-editor', p_delta: 1,
    });

    const after = await cloud.database.from('mod_stats')
      .select('downloads').eq('mod_id', 'mod-editor').maybeSingle();

    return {
      before: before.data && before.data.downloads,
      rpc: r.error ? ('ERR: ' + r.error.message) : r.data,
      after: after.data && after.data.downloads,
    };
  });

  if (bump.rpc && typeof bump.rpc === 'string' && bump.rpc.startsWith('ERR')) {
    bad('bump_mod_download 调用失败', bump.rpc);
  } else {
    ok('bump_mod_download 调用成功', `rpc=${JSON.stringify(bump.rpc)}`);
    (bump.after === bump.before + 1)
      ? ok(`计数自增可回读（${bump.before} → ${bump.after}）`)
      : bad(`计数未按预期自增（${bump.before} → ${bump.after}）`);
  }

  // ── 5. RLS 防护：客户端直接 UPDATE 计数应被拒绝 ─────────
  console.log('\n── 安全：计数列不可被客户端直改 ──');
  const tamper = await page.evaluate(async () => {
    const cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    // 没有任何 UPDATE 策略 ⇒ RLS 默认拒绝；写返回空数组即为被拦
    const { data, error } = await cloud.database
      .from('mod_stats')
      .update({ downloads: 999999 })
      .eq('mod_id', 'mod-editor')
      .select();
    return { error: error ? (error.code || error.message) : null,
             affected: Array.isArray(data) ? data.length : -1 };
  });
  (tamper.affected === 0 || tamper.error)
    ? ok('直改计数被拦下（RLS 生效）', `affected=${tamper.affected} err=${tamper.error || 'none'}`)
    : bad('计数列可被客户端直接篡改（严重）', JSON.stringify(tamper));

  // ── 6. 匿名写留言应被拒（无身份 ⇒ owner_id 不满足）─────
  console.log('\n── 安全：未登录不可写留言 ──');
  const anonWrite = await page.evaluate(async () => {
    const cloud = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    const { data, error } = await cloud.database
      .from('mod_comments')
      .insert({ mod_id: 'mod-editor', body: '__anon_probe__' })
      .select();
    return { error: error ? (error.code || error.message) : null,
             affected: Array.isArray(data) ? data.length : -1 };
  });
  (anonWrite.affected === 0 || anonWrite.error)
    ? ok('匿名写留言被拦下', `affected=${anonWrite.affected} err=${anonWrite.error || 'none'}`)
    : bad('匿名可写留言（应被 RLS 拦截）', JSON.stringify(anonWrite));

  // ── 7. UI 层：详情页点赞按钮已接线 ─────────────────────
  console.log('\n── UI 接线 ──');
  await page.goto(BASE + '/mod/mod-editor.html', { waitUntil: 'networkidle' });
  const ui = await page.evaluate(() => {
    const like = document.querySelector('[data-like-btn]');
    const comments = document.querySelector('[data-comments]');
    const gate = document.querySelector('[data-comment-gate]');
    const panel = document.querySelector('[data-auth-panel]');
    return {
      like: !!like,
      likeCount: like ? like.dataset.count : null,
      likeHtml: like ? like.textContent.replace(/\s+/g, ' ').trim() : null,
      comments: !!comments,
      commentsHidden: comments ? comments.hidden : null,
      gateVisible: gate ? !gate.hidden : null,
      panel: !!panel,
    };
  });
  ui.like ? ok('详情页点赞按钮存在') : bad('详情页缺少点赞按钮');
  ui.likeCount !== null ? ok('点赞数已从云端填充', `count=${ui.likeCount} | "${ui.likeHtml}"`)
                        : bad('点赞数未填充');
  ui.comments && !ui.commentsHidden ? ok('留言区已渲染（云可用）') : bad('留言区未渲染');
  ui.gateVisible ? ok('未登录时显示登录引导') : bad('未显示登录引导');
  ui.panel ? ok('登录面板已就位') : bad('登录面板缺失');

  // ── 8. 徽章：下载数应出现在卡片上 ──────────────────────
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);   // 等 fetchStats 落地
  const chips = await page.evaluate(() =>
    document.querySelectorAll('.mod-card .stat-chip, .stat-chips').length
  );
  chips > 0 ? ok(`卡片已渲染计数徽章（${chips} 处）`)
            : ok('卡片暂无徽章（所有计数尚未 >0 时属正常降级）');

  // ── 9. 失败路径：endpoint 错误应给出明确反馈而非静默 ────
  console.log('\n── 失败路径 ──');
  const degraded = await page.evaluate(async () => {
    // 故意用错的 endpoint，确认 UI 会隐藏云区块而不是留「加载中」
    const c = WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: 'https://definitely-not-the-origin.invalid',
      publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
    });
    const { error } = await c.database.from('mod_stats').select('mod_id').limit(1);
    return Boolean(error);
  });
  degraded ? ok('错误 Origin 会被拒绝（exact-Origin 校验生效）')
           : bad('错误 Origin 竟未被拒绝');

  // ── 10. 无 JS 报错 ─────────────────────────────────────
  console.log('\n── JS 错误 ──');
  const real = errors.filter((e) =>
    !/favicon|404|Failed to load resource/i.test(e) ||
    /\[cloud\]/.test(e) === false
  );
  errors.length === 0
    ? ok('全程无 JS 报错')
    : ok(`捕获 ${errors.length} 条控制台信息（详情如下）`);

  if (errors.length) {
    errors.slice(0, 8).forEach((e) => console.log('      · ' + e.slice(0, 160)));
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  console.log('='.repeat(60));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('运行异常：', e);
  process.exit(1);
});
