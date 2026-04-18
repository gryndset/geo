// gs-client.js - Geoscope フロントエンド共通ライブラリ

// ============================================================
// 設定
// ============================================================
const GS_CONFIG = {
  supabaseUrl: window.GS_SUPABASE_URL || '',
  supabaseAnon: window.GS_SUPABASE_ANON || '',
  siteUrl: window.location.origin,
};

// ============================================================
// セッション管理
// ============================================================
const GS_SESSION_KEY = 'gs_session';
const GS_USER_KEY = 'gs_user';
const GS_PROFILE_KEY = 'gs_profile';

function gsGetSession() {
  try { return JSON.parse(localStorage.getItem(GS_SESSION_KEY)); } catch { return null; }
}
function gsGetUser() {
  try { return JSON.parse(localStorage.getItem(GS_USER_KEY)); } catch { return null; }
}
function gsGetProfile() {
  try { return JSON.parse(localStorage.getItem(GS_PROFILE_KEY)); } catch { return null; }
}
function gsSetSession(session, user, profile) {
  if (session) localStorage.setItem(GS_SESSION_KEY, JSON.stringify(session));
  if (user) localStorage.setItem(GS_USER_KEY, JSON.stringify(user));
  if (profile) localStorage.setItem(GS_PROFILE_KEY, JSON.stringify(profile));
}
function gsClearSession() {
  [GS_SESSION_KEY, GS_USER_KEY, GS_PROFILE_KEY].forEach(k => localStorage.removeItem(k));
}
function gsIsLoggedIn() {
  const session = gsGetSession();
  if (!session) return false;
  // JWTの有効期限チェック
  if (session.expires_at && Date.now() / 1000 > session.expires_at) {
    gsClearSession();
    return false;
  }
  return true;
}
function gsToken() {
  return gsGetSession()?.access_token || '';
}

// ============================================================
// API呼び出し共通
// ============================================================
async function gsApi(path, options = {}) {
  const token = gsToken();
  const resp = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  const data = await resp.json().catch(() => ({ error: 'レスポンスの解析に失敗しました' }));

  if (resp.status === 401) {
    // セッションが切れていた場合、一度だけリフレッシュを試みる
    if (!options._retried) {
      try {
        const refreshed = await fetch('/api/auth?action=refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: gsGetSession()?.refresh_token }),
        });
        if (refreshed.ok) {
          const refreshData = await refreshed.json();
          gsSetSession(refreshData.session, null, null);
          return gsApi(path, { ...options, _retried: true });
        }
      } catch {}
    }
    gsClearSession();
    window.location.href = '/login.html';
    throw new Error('ログインが必要です');
  }

  if (!resp.ok) throw new Error(data.error || `APIエラー: ${resp.status}`);
  return data;
}

// ============================================================
// 認証
// ============================================================
const gsAuth = {
  async login(email, password) {
    const data = await gsApi('/api/auth?action=login', {
      method: 'POST',
      body: { email, password },
    });
    gsSetSession(data.session, data.user, data.profile);
    return data;
  },

  async signup(email, password, name) {
    const data = await gsApi('/api/auth?action=signup', {
      method: 'POST',
      body: { email, password, name },
    });
    return data;
  },

  async logout() {
    await gsApi('/api/auth?action=logout', { method: 'POST' }).catch(() => {});
    gsClearSession();
    window.location.href = '/login.html';
  },

  async getMe() {
    const data = await gsApi('/api/auth?action=me');
    gsSetSession(null, data.user, data.profile);
    return data;
  },

  async updateProfile(updates) {
    const data = await gsApi('/api/auth?action=update', { method: 'PUT', body: updates });
    gsSetSession(null, null, data.profile);
    return data;
  },

  async resetPassword(email) {
    return gsApi('/api/auth?action=reset', { method: 'POST', body: { email } });
  },

  requireLogin() {
    if (!gsIsLoggedIn()) {
      sessionStorage.setItem('gs_redirect', window.location.href);
      window.location.href = '/login.html';
    }
  },
};

// ============================================================
// ブランド
// ============================================================
const gsBrands = {
  async list() {
    return gsApi('/api/brands?action=list');
  },
  async get(id) {
    return gsApi(`/api/brands?action=get&id=${id}`);
  },
  async create(data) {
    return gsApi('/api/brands?action=create', { method: 'POST', body: data });
  },
  async update(id, data) {
    return gsApi(`/api/brands?action=update&id=${id}`, { method: 'PUT', body: data });
  },
  async delete(id) {
    return gsApi(`/api/brands?action=delete&id=${id}`, { method: 'DELETE' });
  },
  async stats(id) {
    return gsApi(`/api/brands?action=stats&id=${id}`);
  },
  async addCompetitor(brandId, name) {
    return gsApi(`/api/brands?action=competitors&id=${brandId}`, { method: 'POST', body: { name } });
  },
  async removeCompetitor(brandId, competitorId) {
    return gsApi(`/api/brands?action=competitors&id=${brandId}`, { method: 'DELETE', body: { competitor_id: competitorId } });
  },
};

// ============================================================
// アラート
// ============================================================
const gsAlerts = {
  async list() { return gsApi('/api/alerts?action=list'); },
  async create(data) { return gsApi('/api/alerts?action=create', { method: 'POST', body: data }); },
  async update(id, data) { return gsApi(`/api/alerts?action=update&id=${id}`, { method: 'PUT', body: data }); },
  async delete(id) { return gsApi(`/api/alerts?action=delete&id=${id}`, { method: 'DELETE' }); },
  async logs(brandId) { return gsApi(`/api/alerts?action=logs${brandId ? `&brand_id=${brandId}` : ''}`); },
};

// ============================================================
// スキャン
// ============================================================
const gsScan = {
  async run(brand, competitors, apis, brandId) {
    return gsApi('/api/scan', {
      method: 'POST',
      body: { brand, competitors, apis, brand_id: brandId },
    });
  },
  async saveToDb(scanData, brandId) {
    return gsApi('/api/scan?action=save', {
      method: 'POST',
      body: { scan_data: scanData, brand_id: brandId },
    });
  },
};

// ============================================================
// エクスポート
// ============================================================
const gsExport = {
  async downloadCsv(brandId) {
    const token = gsToken();
    const url = `/api/export?format=csv${brandId ? `&brand_id=${brandId}` : ''}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('エクスポート失敗');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `geoscope_${dateStr()}.csv`;
    a.click();
  },
  async downloadJson(brandId) {
    const token = gsToken();
    const url = `/api/export?format=json${brandId ? `&brand_id=${brandId}` : ''}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error('エクスポート失敗');
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `geoscope_${dateStr()}.json`;
    a.click();
  },
};

// ============================================================
// 共有
// ============================================================
const gsShare = {
  async create(scanId, expiresDays) {
    return gsApi('/api/share?action=create', { method: 'POST', body: { scan_id: scanId, expires_in_days: expiresDays } });
  },
  async list() { return gsApi('/api/share?action=list'); },
  async delete(slug) { return gsApi(`/api/share?action=delete&slug=${slug}`, { method: 'DELETE' }); },
  async view(slug) { return gsApi(`/api/share?action=view&slug=${slug}`); },
};

// ============================================================
// APIキー管理
// ============================================================
const gsKeys = {
  // localStorageから取得（ダッシュボード用）
  getLocal() {
    return {
      perplexity: localStorage.getItem('gs_key_perplexity') || '',
      openai:     localStorage.getItem('gs_key_openai') || '',
      gemini:     localStorage.getItem('gs_key_gemini') || '',
      anthropic:  localStorage.getItem('gs_key_anthropic') || '',
    };
  },
  setLocal(name, value) {
    localStorage.setItem(`gs_key_${name}`, value.trim());
  },
  clearLocal() {
    ['perplexity','openai','gemini','anthropic'].forEach(k => localStorage.removeItem(`gs_key_${k}`));
  },
  hasAny() {
    return Object.values(this.getLocal()).some(v => v);
  },
};

// ============================================================
// ユーティリティ
// ============================================================
function gsToast(msg, type = 'ok', duration = 3500) {
  const colors = { ok: 'var(--gn)', warn: 'var(--am)', error: 'var(--rd)', info: 'var(--pu)' };
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9998;
    background:var(--bg2);border:1px solid ${colors[type] || colors.ok};
    color:var(--tx);font-family:'DM Mono',monospace;font-size:10px;
    letter-spacing:1px;padding:12px 20px;max-width:320px;line-height:1.6;
    animation:gsToastIn .2s ease;
  `;
  t.textContent = msg;
  if (!document.getElementById('gs-toast-style')) {
    const s = document.createElement('style');
    s.id = 'gs-toast-style';
    s.textContent = '@keyframes gsToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(t);
  setTimeout(() => t.remove(), duration);
}

function gsConfirm(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9995;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bd2);padding:32px;max-width:360px;width:90%;">
        <div style="font-size:14px;color:var(--tx);margin-bottom:24px;line-height:1.6;">${msg}</div>
        <div style="display:flex;gap:12px;">
          <button id="gs-confirm-ok" style="flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:10px;background:var(--rd);color:#fff;border:none;cursor:pointer;">削除する</button>
          <button id="gs-confirm-cancel" style="flex:1;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;padding:10px;background:transparent;color:var(--t2);border:1px solid var(--bd);cursor:pointer;">キャンセル</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#gs-confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#gs-confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
  });
}

function gsLoading(show, text = '読み込み中...') {
  let el = document.getElementById('gs-loading');
  if (show) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'gs-loading';
      el.style.cssText = 'position:fixed;inset:0;background:rgba(7,7,16,.85);z-index:9990;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
      el.innerHTML = `
        <div style="width:32px;height:32px;border:2px solid rgba(139,124,248,.3);border-top-color:var(--pu);border-radius:50%;animation:gsSpin .7s linear infinite;"></div>
        <div id="gs-loading-text" style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:2px;color:var(--t3);">${text}</div>
      `;
      if (!document.getElementById('gs-spin-style')) {
        const s = document.createElement('style'); s.id = 'gs-spin-style';
        s.textContent = '@keyframes gsSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(el);
    } else {
      document.getElementById('gs-loading-text').textContent = text;
    }
  } else {
    el?.remove();
  }
}

function gsFormatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function gsFormatRate(rate) {
  if (rate === null || rate === undefined) return '—';
  const color = rate >= 70 ? 'var(--gn)' : rate >= 40 ? 'var(--am)' : 'var(--rd)';
  return `<span style="color:${color};font-weight:500;">${rate}%</span>`;
}

function dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// グローバルに公開
window.gsAuth = gsAuth;
window.gsBrands = gsBrands;
window.gsAlerts = gsAlerts;
window.gsScan = gsScan;
window.gsExport = gsExport;
window.gsShare = gsShare;
window.gsKeys = gsKeys;
window.gsToast = gsToast;
window.gsConfirm = gsConfirm;
window.gsLoading = gsLoading;
window.gsFormatDate = gsFormatDate;
window.gsFormatRate = gsFormatRate;
window.gsIsLoggedIn = gsIsLoggedIn;
window.gsGetProfile = gsGetProfile;
window.gsGetUser = gsGetUser;
window.gsApi = gsApi;
window.gsToken = gsToken;

// ============================================================
// PWA Service Worker 登録
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
