/* ═══════════════════════════════════════════════════════════════
   cloud-ui.js — 把云数据接到界面（渐进增强，失败静默降级）

   挂钩点：
     首页 / 分类页   [data-mod-card="<id>"]    → 计数徽章（下载 / 点赞）
     详情页          [data-cloud-detail="<id>"] → 点赞按钮 + 留言区

   设计口径：
     ▸ 云不可用 ⇒ 所有云区块整体隐藏，绝不留下「加载中…」的残骸
     ▸ 计数为 0 时不渲染徽章（不显示「0 次下载」这种负信息）
     ▸ 下载计数在点击下载链接时上报；上报失败不影响跳转
   ═══════════════════════════════════════════════════════════════ */

import { MODS } from './mods.js';
import {
  fetchStats, bumpDownload, bumpLike,
  fetchComments, postComment, deleteComment,
  getSession, sendEmailCode, verifyEmailCode, signInWithPassword,
  signOut, onAuthChange,
} from './cloud.js';

/* ───────────────────────────────────────────────────────────
   计数徽章
   ─────────────────────────────────────────────────────────── */

function badgeHTML(stats) {
  if (!stats) return '';
  const { downloads, likes } = stats;

  const items = [];
  if (downloads > 0) {
    items.push(
      `<span class="stat-chip" title="累计下载 ${downloads} 次">
         <span class="stat-chip__num">${downloads}</span>
         <span class="stat-chip__unit">次下载</span>
       </span>`
    );
  }
  if (likes > 0) {
    items.push(
      `<span class="stat-chip" title="收到 ${likes} 个赞">
         <span class="stat-chip__num">${likes}</span>
         <span class="stat-chip__unit">赞</span>
       </span>`
    );
  }
  return items.length ? `<span class="stat-chips">${items.join('')}</span>` : '';
}

/** 把统计徽章插进所有卡片与详情页头部 */
async function mountStats() {
  const stats = await fetchStats();
  if (!stats) return;

  // 卡片：插到名称行后面
  document.querySelectorAll('[data-mod-card]').forEach((el) => {
    const id = el.dataset.modCard;
    const s = stats[id];
    const html = badgeHTML(s);
    if (!html) return;

    const host = el.querySelector('.mod-card__meta') ||
                 el.querySelector('.tile__title') ||
                 el.querySelector('.detail__meta');
    if (!host) return;

    const span = document.createElement('span');
    span.innerHTML = html;
    const node = span.firstElementChild;
    if (host.classList.contains('detail__meta')) host.appendChild(node);
    else host.insertAdjacentElement('afterend', node);
  });

  // 详情页：点赞按钮的数字初值
  const likeBtn = document.querySelector('[data-like-btn]');
  if (likeBtn) {
    const id = likeBtn.dataset.likeBtn;
    const s = stats[id];
    if (s) {
      likeBtn.dataset.count = String(s.likes);
      renderLike(likeBtn);
    }
  }
}

/* ───────────────────────────────────────────────────────────
   下载计数上报
   ─────────────────────────────────────────────────────────── */

function mountDownloadTracking() {
  // 详情页下载按钮 + 分类页卡片下载按钮共享同一条上报路径
  document.querySelectorAll('a[href*="/releases/"][download]').forEach((a) => {
    a.addEventListener('click', () => {
      const id = findModIdFor(a);
      if (id) bumpDownload(id, 1);   // fire-and-forget：绝不用 await 阻塞跳转
    });
  });
}

/** 从最近的容器上找 mod id（详情页 body / 卡片） */
function findModIdFor(el) {
  const holder = el.closest('[data-mod-card]') ||
                 el.closest('[data-cloud-detail]');
  if (holder) return holder.dataset.modCard || holder.dataset.cloudDetail;

  // 详情页没有标记时，从 URL 反推
  const m = location.pathname.match(/\/mod\/([^/]+)\.html$/);
  if (m) return m[1];

  // 兜底：用下载链接里的包名匹配
  const href = el.getAttribute('href') || '';
  const hit = MODS.find((mod) => mod.pkgName && href.includes(encodeURI(mod.pkgName)));
  return hit ? hit.id : null;
}

/* ───────────────────────────────────────────────────────────
   点赞
   ─────────────────────────────────────────────────────────── */

const LIKE_KEY = 'pvz_mod_liked';

function likedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveLiked(set) {
  try {
    localStorage.setItem(LIKE_KEY, JSON.stringify([...set]));
  } catch {
    /* 隐私模式下写不了：不影响点赞，只是无法记住状态 */
  }
}

function renderLike(btn) {
  const count = Number(btn.dataset.count || 0);
  const on = btn.dataset.liked === 'true';
  btn.innerHTML =
    `<span class="like-btn__heart" aria-hidden="true">${on ? '♥' : '♡'}</span>` +
    `<span class="like-btn__num">${count}</span>` +
    `<span class="like-btn__text">${on ? '已赞' : '点赞'}</span>`;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function mountLike() {
  const btn = document.querySelector('[data-like-btn]');
  if (!btn) return;

  const id = btn.dataset.likeBtn;
  const liked = likedSet();
  btn.dataset.liked = liked.has(id) ? 'true' : 'false';
  btn.dataset.count = btn.dataset.count || '0';
  renderLike(btn);

  btn.addEventListener('click', async () => {
    if (btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';

    const set = likedSet();
    const isOn = set.has(id);
    const next = isOn ? -1 : 1;

    // 乐观更新：先动 UI，再对齐服务端真值
    btn.dataset.liked = isOn ? 'false' : 'true';
    btn.dataset.count = String(Math.max(0, Number(btn.dataset.count || 0) + next));
    renderLike(btn);

    const res = await bumpLike(id, next);
    if (res) {
      btn.dataset.count = String(res.likes);      // 以服务端为准
      renderLike(btn);
    } else {
      // 云不可用：回滚，不留下假状态
      btn.dataset.liked = isOn ? 'true' : 'false';
      btn.dataset.count = String(Math.max(0, Number(btn.dataset.count || 0) - next));
      renderLike(btn);
      toast('点赞没能保存，请稍后再试。');
    }

    if (isOn) set.delete(id); else set.add(id);
    saveLiked(set);
    btn.dataset.busy = '0';
  });
}

/* ───────────────────────────────────────────────────────────
   留言区
   ─────────────────────────────────────────────────────────── */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function commentHTML(c, myOwnerId) {
  const mine = myOwnerId && c.owner_id === myOwnerId;
  return `
    <li class="comment" data-comment-id="${c.id}">
      <div class="comment__head">
        <span class="comment__name">${escapeHtml(c.nickname || '匿名访客')}</span>
        <time class="comment__time" datetime="${escapeHtml(c.created_at)}">${fmtTime(c.created_at)}</time>
        ${mine ? `<button class="comment__del" type="button" data-del="${c.id}" aria-label="删除这条留言">删除</button>` : ''}
      </div>
      <p class="comment__body">${escapeHtml(c.body)}</p>
    </li>`;
}

async function mountComments() {
  const host = document.querySelector('[data-comments]');
  if (!host) return;

  const modId = host.dataset.comments;
  const listEl = host.querySelector('[data-comment-list]');
  const formEl = host.querySelector('[data-comment-form]');
  const gateEl = host.querySelector('[data-comment-gate]');
  const countEl = host.querySelector('[data-comment-count]');

  const session = await getSession();

  // 渲染列表
  async function refresh() {
    const rows = await fetchComments(modId);
    if (rows === null) {
      host.hidden = true;         // 云不可用 ⇒ 整块隐藏
      return;
    }
    host.hidden = false;
    if (countEl) countEl.textContent = String(rows.length);

    const me = session && session.user ? session.user.id : null;
    listEl.innerHTML = rows.length
      ? rows.map((c) => commentHTML(c, me)).join('')
      : '<li class="comment comment--empty">还没有留言，来占个沙发。</li>';

    listEl.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await deleteComment(Number(b.dataset.del));
          await refresh();
        } catch (err) {
          toast(err.message || '删除失败');
          b.disabled = false;
        }
      });
    });
  }

  // 登录态 → 表单 / 登录引导二选一
  async function renderGate() {
    const s = await getSession();
    const signedIn = Boolean(s);
    if (formEl) formEl.hidden = !signedIn;
    if (gateEl) gateEl.hidden = signedIn;
    if (signedIn && countEl) countEl.dataset.signed = '1';
  }

  if (formEl) {
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bodyEl = formEl.querySelector('[name="body"]');
      const nickEl = formEl.querySelector('[name="nickname"]');
      const submitBtn = formEl.querySelector('[type="submit"]');

      const body = (bodyEl.value || '').trim();
      if (!body) { toast('留言内容不能为空。'); bodyEl.focus(); return; }
      if (body.length > 500) { toast('留言最多 500 字。'); return; }

      submitBtn.disabled = true;
      try {
        await postComment(modId, body, (nickEl && nickEl.value || '').trim());
        bodyEl.value = '';
        await refresh();
        toast('留言已发布。');
      } catch (err) {
        toast(err.message || '发布失败，请稍后再试。');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  await renderGate();
  await refresh();

  // 登录 / 注册（邮箱验证码）—— 站内轻量弹层，不跳页
  mountAuthPanel();
}

/* ───────────────────────────────────────────────────────────
   登录面板（邮箱 + 密码 / 邮箱验证码）
   ─────────────────────────────────────────────────────────── */

function mountAuthPanel() {
  const openers = document.querySelectorAll('[data-open-auth]');
  if (!openers.length) return;

  const panel = document.querySelector('[data-auth-panel]');
  if (!panel) return;

  let pending = null;   // { email, verificationId, isExistingUser }

  openers.forEach((b) => b.addEventListener('click', () => {
    panel.hidden = false;
    panel.querySelector('input')?.focus();
  }));

  panel.querySelectorAll('[data-close-auth]').forEach((b) =>
    b.addEventListener('click', () => { panel.hidden = true; }));

  const tabBtns = panel.querySelectorAll('[data-auth-tab]');
  tabBtns.forEach((b) => b.addEventListener('click', () => {
    tabBtns.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    panel.querySelectorAll('[data-auth-pane]').forEach((p) => {
      p.hidden = p.dataset.authPane !== b.dataset.authTab;
    });
  }));

  const msg = (t, isErr) => {
    const m = panel.querySelector('[data-auth-msg]');
    if (!m) return;
    m.textContent = t || '';
    m.dataset.err = isErr ? '1' : '0';
  };

  // ① 获取验证码
  panel.querySelectorAll('[data-send-code]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pane = btn.closest('[data-auth-pane]');
      const email = (pane.querySelector('[name="email"]').value || '').trim();
      if (!email) { msg('请先填写邮箱。', true); return; }

      btn.disabled = true;
      msg('正在发送验证码…');
      try {
        const data = await sendEmailCode(email);
        pending = { email, ...data };
        msg(data.isExistingUser
          ? '验证码已发送，请查收邮箱后填入下方。'
          : '验证码已发送；新账号还需要设置一个密码。');
        pane.querySelector('[data-password-wrap]')?.removeAttribute('hidden');
      } catch (err) {
        msg(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ② 用验证码登录 / 注册
  panel.querySelectorAll('[data-verify-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailNow = (form.querySelector('[name="email"]').value || '').trim();
      const token = (form.querySelector('[name="code"]').value || '').trim();
      const password = (form.querySelector('[name="password"]')?.value || '').trim();

      if (!pending || pending.email !== emailNow) {
        msg('请先为当前邮箱获取验证码。', true);
        return;
      }
      if (!token) { msg('请填写收到的验证码。', true); return; }
      if (!pending.isExistingUser && !password) {
        msg('新账号需要设置密码（至少 6 位）。', true);
        return;
      }

      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      msg('正在验证…');
      try {
        await verifyEmailCode({
          email: pending.email,
          verificationId: pending.verificationId,
          isExistingUser: pending.isExistingUser,
          token,
          password,
        });
        pending = null;
        msg('登录成功。');
        panel.hidden = true;
        location.reload();
      } catch (err) {
        msg(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });

  // ③ 邮箱 + 密码登录
  panel.querySelectorAll('[data-password-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.querySelector('[name="email"]').value || '').trim();
      const password = (form.querySelector('[name="password"]').value || '').trim();
      if (!email || !password) { msg('请填写邮箱与密码。', true); return; }

      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      msg('正在登录…');
      try {
        await signInWithPassword(email, password);
        msg('登录成功。');
        panel.hidden = true;
        location.reload();
      } catch (err) {
        msg(err.message, true);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

/* ───────────────────────────────────────────────────────────
   轻量提示条
   ─────────────────────────────────────────────────────────── */

let toastTimer = null;
function toast(text) {
  let el = document.querySelector('.cloud-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'cloud-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.dataset.on = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.dataset.on = 'false'; }, 3200);
}

/* ───────────────────────────────────────────────────────────
   退出登录（导航区若有按钮）
   ─────────────────────────────────────────────────────────── */

function mountSignOut() {
  document.querySelectorAll('[data-sign-out]').forEach((b) => {
    b.addEventListener('click', async () => {
      await signOut();
      location.reload();
    });
  });
}

/* ───────────────────────────────────────────────────────────
   入口
   ─────────────────────────────────────────────────────────── */

export function initCloudUi() {
  // 整条链都是「增强项」：任何一步失败都不该影响页面本身
  try {
    mountSignOut();
    mountLike();
    mountDownloadTracking();
    mountStats();
    mountComments();
    onAuthChange(() => { /* 会话变化由各挂载点自行读取，这里只需保持订阅 */ });
  } catch (err) {
    console.warn('[cloud] 增强初始化异常，已忽略：', err && err.message);
  }
}
