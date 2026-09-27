/* ═══════════════════════════════════════════════════════════════
   cloud.js — 云服务接入（WorkBuddy Cloud Service）

   项目形态：纯 HTML / 无构建步骤 ⇒ 走 CDN <script> 形式（Form B），
   全局对象 WorkBuddyCloud，**不用** npm，也**不引入**打包器。

   初始化所需两个值全部来自 publicConfig（由云服务开通时返回）：
     endpoint       —— 当前应用的发布域数据面基址（必须显式传入）
     publishableKey —— 标识「哪个应用」，本身不带权限；服务端按 Origin 校验

   ⚠️ endpoint 绝不可硬编码、也不可从 location/env 推断：
      发布域一旦变化，服务端 exact-Origin 校验会直接拒绝，且无法本地规避。

   降级口径：云服务不可用时，所有读写都「静默降级」——
   计数与留言区块隐藏，浏览 / 下载主路径完全不受影响。
   ═══════════════════════════════════════════════════════════════ */

/* publicConfig —— 开通云服务时返回，只包含可公开发布的三个值。
   这三项是唯一允许出现在前端代码里的云配置。 */
export const PUBLIC_CONFIG = {
  resourceId: 'wbcs_NwV9wDgGyLCXFNqXWW93jc',
  endpoint: 'https://pvz-mods-gallery.app.workbuddy.host',
  publishableKey: 'wbpk_KYVWtOKs6qGMXf243Ox567_Qv3Doe0zkKY9KTPtW0TENseYnMradny1',
};

/* CDN IIFE 构建：暴露全局 WorkBuddyCloud，所有导出都挂在它下面 */
const SDK_URL =
  'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';

let _cloud = null;      // 单例客户端：Auth / Database / Storage / LLM 共用
let _ready = null;      // 载入 Promise，避免并发重复插 script
let _failed = false;    // 一旦失败不再重试（CDN 挂了不该反复打网络）

/* ───────────────────────────────────────────────────────────
   载入 SDK（幂等）
   ─────────────────────────────────────────────────────────── */

function loadSdk() {
  if (_ready) return _ready;

  _ready = new Promise((resolve) => {
    // 已经由别的入口载入过
    if (window.WorkBuddyCloud) return resolve(window.WorkBuddyCloud);

    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.WorkBuddyCloud || null);
    s.onerror = () => resolve(null);   // 不 reject：调用方按 null 静默降级
    document.head.appendChild(s);
  });

  return _ready;
}

/* ───────────────────────────────────────────────────────────
   初始化：必须同时传 endpoint + publishableKey
   ─────────────────────────────────────────────────────────── */

export async function getCloud() {
  if (_cloud) return _cloud;
  if (_failed) return null;

  const lib = await loadSdk();
  if (!lib || typeof lib.createWorkBuddyCloud !== 'function') {
    _failed = true;
    warn('SDK 未能载入（CDN 不可达），云功能已降级，浏览与下载不受影响。');
    return null;
  }

  try {
    _cloud = lib.createWorkBuddyCloud({
      endpoint: PUBLIC_CONFIG.endpoint,          // ← 两个值都不可省
      publishableKey: PUBLIC_CONFIG.publishableKey,
    });
    return _cloud;
  } catch (err) {
    _failed = true;
    warn('云客户端初始化失败，云功能已降级。', err);
    return null;
  }
}

function warn(msg, err) {
  // 只输出诊断信息；绝不打印 token / 邮箱 / 私有 URL
  console.warn('[cloud] ' + msg, err ? (err.message || err) : '');
}

/* ───────────────────────────────────────────────────────────
   计数：下载数 / 点赞数

   写入一律走 SECURITY DEFINER 的 RPC（bump_mod_*），
   客户端永远不能直接 UPDATE 计数列 —— 那等于允许任意篡改。
   ─────────────────────────────────────────────────────────── */

/** 一次拉取全部 mod 的计数，返回 { modId: {downloads, likes} } */
export async function fetchStats() {
  const cloud = await getCloud();
  if (!cloud) return null;

  const { data, error } = await cloud.database
    .from('mod_stats')
    .select('mod_id, downloads, likes');

  if (error) {
    warn('读取计数失败：' + (error.message || error));
    return null;
  }

  const out = {};
  for (const row of data || []) {
    out[row.mod_id] = {
      downloads: Number(row.downloads) || 0,
      likes: Number(row.likes) || 0,
    };
  }
  return out;
}

/** 上报一次下载（幂等失败：失败只静默，绝不阻塞跳转） */
export async function bumpDownload(modId, delta = 1) {
  return callBump('bump_mod_download', modId, delta);
}

/** 点赞 / 取消点赞（delta = +1 / -1） */
export async function bumpLike(modId, delta = 1) {
  return callBump('bump_mod_like', modId, delta);
}

async function callBump(fn, modId, delta) {
  const cloud = await getCloud();
  if (!cloud) return null;

  const { data, error } = await cloud.database.rpc(fn, {
    p_mod_id: modId,
    p_delta: delta,
  });

  if (error) {
    warn('计数写入失败：' + (error.message || error));
    return null;
  }

  // RETURNS TABLE ⇒ PostgREST 回数组
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    downloads: Number(row.out_downloads) || 0,
    likes: Number(row.out_likes) || 0,
  };
}

/* ───────────────────────────────────────────────────────────
   留言（mod_comments）

   公开可读；写入必须是「已登录身份」——
   表上 owner_id DEFAULT auth.uid() + RLS WITH CHECK，
   客户端**绝不**自己传 owner_id。
   ─────────────────────────────────────────────────────────── */

/** 当前是否已有登录会话 */
export async function getSession() {
  const cloud = await getCloud();
  if (!cloud) return null;

  const { data, error } = await cloud.auth.getSession();
  if (error || !data) return null;
  return data;
}

/** 读取某个 mod 的最新留言（默认 50 条） */
export async function fetchComments(modId, limit = 50) {
  const cloud = await getCloud();
  if (!cloud) return null;

  const { data, error } = await cloud.database
    .from('mod_comments')
    .select('id, mod_id, nickname, body, created_at, owner_id')
    .eq('mod_id', modId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    warn('读取留言失败：' + (error.message || error));
    return null;
  }
  return data || [];
}

/** 发表留言（要求已登录；未登录时由 UI 引导登录） */
export async function postComment(modId, body, nickname) {
  const cloud = await getCloud();
  if (!cloud) throw new Error('云服务暂不可用，请稍后再试。');

  const session = await getSession();
  if (!session) throw new Error('请先登录后再留言。');

  // 注意：不传 owner_id —— 由 DEFAULT auth.uid() 服务端填充
  const { data, error } = await cloud.database
    .from('mod_comments')
    .insert({
      mod_id: modId,
      body: body,
      nickname: nickname || null,
    })
    .select();

  if (error) throw new Error(friendlyDbError(error));

  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

/** 删除自己的留言（RLS 保证只能删自己的） */
export async function deleteComment(id) {
  const cloud = await getCloud();
  if (!cloud) throw new Error('云服务暂不可用，请稍后再试。');

  const { data, error } = await cloud.database
    .from('mod_comments')
    .delete()
    .eq('id', id)
    .select();

  if (error) throw new Error(friendlyDbError(error));

  // RLS 过滤掉不属于自己的行 ⇒ 空数组 = 没删成功，不是成功
  const removed = Array.isArray(data) ? data : [];
  if (removed.length === 0) throw new Error('这条留言不属于你，无法删除。');
  return true;
}

/* ───────────────────────────────────────────────────────────
   邮箱登录（Web 端只支持邮箱；手机号 / 微信登录仅小程序）
   ─────────────────────────────────────────────────────────── */

/** 发送邮箱验证码（注册 / 登录通用入口） */
export async function sendEmailCode(email) {
  const cloud = await getCloud();
  if (!cloud) throw new Error('云服务暂不可用，请稍后再试。');

  const res = await cloud.auth.sendOtp({ email });
  if (res.error) throw new Error(friendlyAuthError(res.error));
  return res.data;   // { verificationId, isExistingUser }
}

/** 校验验证码并建立会话（新账号需同时带 password） */
export async function verifyEmailCode({ email, verificationId, isExistingUser, token, password }) {
  const cloud = await getCloud();
  if (!cloud) throw new Error('云服务暂不可用，请稍后再试。');

  const res = await cloud.auth.verifyOtp({
    email,
    verificationId,
    isExistingUser,
    token,
    password: isExistingUser ? undefined : password,
  });
  if (res.error) throw new Error(friendlyAuthError(res.error));
  return res.data;
}

/** 邮箱 + 密码登录 */
export async function signInWithPassword(email, password) {
  const cloud = await getCloud();
  if (!cloud) throw new Error('云服务暂不可用，请稍后再试。');

  const res = await cloud.auth.signInWithPassword({ email, password });
  if (res.error) throw new Error(friendlyAuthError(res.error));
  return res.data;
}

/** 退出登录 */
export async function signOut() {
  const cloud = await getCloud();
  if (!cloud) return;
  await cloud.auth.signOut();
}

/** 登录态变化订阅（返回取消订阅函数） */
export async function onAuthChange(cb) {
  const cloud = await getCloud();
  if (!cloud) return () => {};
  return cloud.auth.onAuthStateChange((event, session) => cb(event, session));
}

/* ───────────────────────────────────────────────────────────
   错误文案：贴近业务语义，不暴露后端细节
   ─────────────────────────────────────────────────────────── */

function friendlyAuthError(err) {
  const kind = err && err.kind;
  if (kind === 'unauthenticated') return '账号或密码不正确，请重试。';
  if (kind === 'invalid_grant') return '验证码不正确或已过期，请重新获取。';
  if (kind === 'network') return '网络异常，请检查连接后重试。';
  if (kind === 'backend-unavailable') return '云服务暂时繁忙，请稍后再试。';
  return (err && err.message) || '操作失败，请稍后再试。';
}

function friendlyDbError(err) {
  const code = err && err.code;
  if (code === '23505') return '这条内容已存在。';
  if (code === '42501') return '没有权限执行该操作。';
  if (code === '42P01') return '云端数据表尚未就绪。';
  if (code === '22023') return '提交的内容不合法。';
  return (err && err.message) || '保存失败，请稍后再试。';
}
