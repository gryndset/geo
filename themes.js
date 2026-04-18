// themes.js - Geoscope テーマ定義・切り替えシステム

const THEMES = {
  dark: {
    label: 'ダーク（デフォルト）',
    vars: {
      '--bg':  '#070710',
      '--bg2': '#0b0b1c',
      '--sf':  '#10101f',
      '--bd':  'rgba(255,255,255,.06)',
      '--bd2': 'rgba(255,255,255,.12)',
      '--tx':  '#edeae0',
      '--t2':  'rgba(237,234,224,.52)',
      '--t3':  'rgba(237,234,224,.22)',
      '--gn':  '#3ddc84',
      '--am':  '#f0b429',
      '--rd':  '#ef6060',
      '--pu':  '#8b7cf8',
      // 参考デザイン追加変数
      '--accent':        '#8b7cf8',
      '--accent-muted':  'rgba(139,124,248,.08)',
      '--accent-hover':  'rgba(139,124,248,.15)',
      '--panel':         '#0b0b1c',
      '--hover':         'rgba(255,255,255,.04)',
      '--divider':       'rgba(255,255,255,.06)',
      '--data-green':    '#3ddc84',
      '--data-purple':   '#8b7cf8',
      '--data-amber':    '#f0b429',
      '--data-red':      '#ef6060',
      '--shadow-glow-active': '0 0 20px rgba(139,124,248,.35)',
      '--shadow-sm':     '0 1px 4px rgba(0,0,0,.4)',
      '--radius-card':   '12px',
      '--radius-input':  '8px',
    },
    grain: true,
  },
  light: {
    label: 'ライト',
    vars: {
      '--bg':  '#fafaf8',
      '--bg2': '#f2f1ee',
      '--sf':  '#eae9e4',
      '--bd':  'rgba(0,0,0,.08)',
      '--bd2': 'rgba(0,0,0,.16)',
      '--tx':  '#1a1a1a',
      '--t2':  'rgba(26,26,26,.55)',
      '--t3':  'rgba(26,26,26,.25)',
      '--gn':  '#16a34a',
      '--am':  '#d97706',
      '--rd':  '#dc2626',
      '--pu':  '#6d28d9',
    },
    grain: false,
  },
  midnight: {
    label: 'ミッドナイト',
    vars: {
      '--bg':  '#000000',
      '--bg2': '#0a0a0a',
      '--sf':  '#111111',
      '--bd':  'rgba(255,255,255,.05)',
      '--bd2': 'rgba(255,255,255,.10)',
      '--tx':  '#ffffff',
      '--t2':  'rgba(255,255,255,.5)',
      '--t3':  'rgba(255,255,255,.2)',
      '--gn':  '#00ff88',
      '--am':  '#ffcc00',
      '--rd':  '#ff4444',
      '--pu':  '#aa88ff',
    },
    grain: true,
  },
  sepia: {
    label: 'セピア',
    vars: {
      '--bg':  '#1c1510',
      '--bg2': '#231a13',
      '--sf':  '#2a2018',
      '--bd':  'rgba(255,220,150,.08)',
      '--bd2': 'rgba(255,220,150,.15)',
      '--tx':  '#f5e6c8',
      '--t2':  'rgba(245,230,200,.55)',
      '--t3':  'rgba(245,230,200,.25)',
      '--gn':  '#7ec88a',
      '--am':  '#f0b429',
      '--rd':  '#e07060',
      '--pu':  '#c4a0e8',
    },
    grain: true,
  },
  forest: {
    label: 'フォレスト',
    vars: {
      '--bg':  '#0a110a',
      '--bg2': '#0f180f',
      '--sf':  '#141f14',
      '--bd':  'rgba(100,200,100,.07)',
      '--bd2': 'rgba(100,200,100,.14)',
      '--tx':  '#d4edda',
      '--t2':  'rgba(212,237,218,.52)',
      '--t3':  'rgba(212,237,218,.22)',
      '--gn':  '#4ade80',
      '--am':  '#facc15',
      '--rd':  '#f87171',
      '--pu':  '#a78bfa',
    },
    grain: true,
  },
};

const THEME_KEY = 'gs_theme';

function applyTheme(name) {
  const theme = THEMES[name] || THEMES.dark;
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v));

  // grain（ノイズテクスチャ）
  const before = document.getElementById('gs-grain');
  if (theme.grain) {
    if (!before) {
      const el = document.createElement('style');
      el.id = 'gs-grain';
      el.textContent = `body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");pointer-events:none;z-index:9999;opacity:.4;}`;
      document.head.appendChild(el);
    }
  } else {
    before?.remove();
    // ライト時はbody::beforeを無効化
    let noGrain = document.getElementById('gs-no-grain');
    if (!noGrain) {
      noGrain = document.createElement('style');
      noGrain.id = 'gs-no-grain';
      document.head.appendChild(noGrain);
    }
    noGrain.textContent = 'body::before{display:none!important;}';
  }

  // ナビロゴのbg色も追従
  document.querySelectorAll('.nav-cta').forEach(el => {
    el.style.background = theme.vars['--tx'];
    el.style.color = theme.vars['--bg'];
  });

  localStorage.setItem(THEME_KEY, name);
  document.documentElement.setAttribute('data-theme', name);
}

function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark';
}

function initTheme() {
  applyTheme(getCurrentTheme());
}

// テーマ選択パネルを開く
function openThemePanel() {
  document.getElementById('gs-theme-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'gs-theme-panel';
  panel.style.cssText = `
    position:fixed;bottom:80px;right:24px;z-index:9990;
    background:var(--bg2);border:1px solid var(--bd2);
    padding:20px;min-width:200px;
    box-shadow:0 8px 40px rgba(0,0,0,.4);
  `;

  panel.innerHTML = `
    <div style="font-family:'DM Mono',monospace;font-size:8px;letter-spacing:3px;color:var(--t3);text-transform:uppercase;margin-bottom:14px;">テーマ</div>
    ${Object.entries(THEMES).map(([key, t]) => `
      <label style="display:flex;align-items:center;gap:10px;padding:8px 0;cursor:pointer;border-bottom:1px solid var(--bd);">
        <input type="radio" name="gs-theme" value="${key}" ${getCurrentTheme() === key ? 'checked' : ''}
          style="accent-color:var(--pu);"
          onchange="applyTheme('${key}');document.querySelectorAll('[data-theme-dot]').forEach(e=>e.style.opacity= e.dataset.themeDot==='${key}'?'1':'.3')">
        <span data-theme-dot="${key}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${t.vars['--pu']};opacity:${getCurrentTheme() === key ? '1' : '.3'};"></span>
        <span style="font-size:12px;color:var(--t2);">${t.label}</span>
      </label>
    `).join('')}
    <button onclick="document.getElementById('gs-theme-panel').remove()"
      style="margin-top:14px;width:100%;font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;text-transform:uppercase;padding:8px;border:1px solid var(--bd);color:var(--t3);background:transparent;cursor:pointer;">
      閉じる
    </button>
  `;

  // パネル外クリックで閉じる
  setTimeout(() => {
    document.addEventListener('click', function closeFn(e) {
      if (!panel.contains(e.target) && !e.target.closest('#gs-theme-btn')) {
        panel.remove();
        document.removeEventListener('click', closeFn);
      }
    });
  }, 100);

  document.body.appendChild(panel);
}

// テーマボタンをnavに追加
function mountThemeButton() {
  if (document.getElementById('gs-theme-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'gs-theme-btn';
  btn.title = 'テーマ切り替え';
  btn.style.cssText = `
    font-family:'DM Mono',monospace;font-size:8px;letter-spacing:2px;
    text-transform:uppercase;padding:6px 14px;border:1px solid var(--bd);
    color:var(--t3);background:transparent;cursor:pointer;
    display:flex;align-items:center;gap:6px;
  `;
  btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>テーマ`;
  btn.onclick = (e) => { e.stopPropagation(); openThemePanel(); };

  const navR = document.querySelector('.nav-r');
  if (navR) navR.insertBefore(btn, navR.firstChild);
}

// グローバルに公開
window.THEMES = THEMES;
window.applyTheme = applyTheme;
window.openThemePanel = openThemePanel;
window.getCurrentTheme = getCurrentTheme;
window.initTheme = initTheme;
window.mountThemeButton = mountThemeButton;
