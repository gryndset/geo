// api/report/index.js
// スキャン完了通知 & 週次レポートメール - Resend使用

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, email, scanData, weeklyData } = req.body || {};
  if (!email) return res.status(400).json({ error: 'メールアドレスが必要です' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) {
    console.log('REPORT:', { type, email });
    return res.status(200).json({ ok: true, note: 'RESEND_API_KEY未設定' });
  }

  try {
    if (type === 'scan_complete') {
      await sendScanComplete(RESEND_KEY, email, scanData);
    } else if (type === 'weekly') {
      await sendWeeklyReport(RESEND_KEY, email, weeklyData);
    } else {
      return res.status(400).json({ error: 'typeはscan_completeまたはweeklyを指定してください' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Report mail error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== スキャン完了通知 =====
async function sendScanComplete(apiKey, email, data) {
  if (!data) throw new Error('scanDataが必要です');
  const { brand, summary, scannedAt } = data;
  const byAI = summary?.byAI || {};
  const avgRate = summary?.avgRate ?? 0;
  const citations = summary?.citations || [];

  const aiRows = Object.entries({
    chatgpt: 'ChatGPT', perplexity: 'Perplexity', gemini: 'Gemini', claude: 'Claude'
  }).filter(([k]) => byAI[k] !== null && byAI[k] !== undefined).map(([k, label]) => {
    const rate = byAI[k];
    const bar = '█'.repeat(Math.floor(rate / 10)) + '░'.repeat(10 - Math.floor(rate / 10));
    return `<tr>
      <td style="padding:8px 16px;color:rgba(237,234,224,.5);font-size:12px;">${label}</td>
      <td style="padding:8px 16px;font-family:monospace;font-size:11px;color:rgba(237,234,224,.3);">${bar}</td>
      <td style="padding:8px 16px;font-size:13px;font-weight:600;">${rate}%</td>
    </tr>`;
  }).join('');

  const citationRows = citations.slice(0, 5).map(c =>
    `<tr><td style="padding:6px 16px;font-size:11px;color:#8b7cf8;">${c.domain}</td><td style="padding:6px 16px;font-size:10px;color:rgba(237,234,224,.3);">${c.url.slice(0, 60)}...</td></tr>`
  ).join('');

  await sendMail(apiKey, {
    from: 'Geoscope <noreply@geoscope.jp>',
    to: email,
    subject: `[Geoscope] スキャン完了 — ${brand} ${avgRate}%`,
    html: `
      <div style="font-family:monospace;max-width:600px;background:#070710;color:#edeae0;padding:0;border:1px solid rgba(255,255,255,.1);">
        <!-- Header -->
        <div style="padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:10px;letter-spacing:4px;color:rgba(237,234,224,.3);text-transform:uppercase;margin-bottom:8px;">Geoscope</div>
          <div style="font-size:28px;font-weight:300;letter-spacing:-1px;">スキャン完了</div>
        </div>
        <!-- Brand + Score -->
        <div style="padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:10px;letter-spacing:2px;color:rgba(237,234,224,.3);margin-bottom:6px;">BRAND</div>
            <div style="font-size:20px;">${brand}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;letter-spacing:2px;color:rgba(237,234,224,.3);margin-bottom:6px;">AVERAGE</div>
            <div style="font-size:48px;font-weight:300;line-height:1;color:${avgRate >= 60 ? '#3ddc84' : avgRate >= 30 ? '#f0b429' : '#ef6060'};">${avgRate}<span style="font-size:20px;">%</span></div>
          </div>
        </div>
        <!-- AI Breakdown -->
        <div style="padding:24px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:9px;letter-spacing:3px;color:rgba(237,234,224,.3);text-transform:uppercase;margin-bottom:16px;">AI別出現率</div>
          <table style="width:100%;border-collapse:collapse;">${aiRows}</table>
        </div>
        ${citations.length > 0 ? `
        <!-- Citations -->
        <div style="padding:24px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:9px;letter-spacing:3px;color:rgba(237,234,224,.3);text-transform:uppercase;margin-bottom:16px;">引用URL Top5</div>
          <table style="width:100%;border-collapse:collapse;">${citationRows}</table>
        </div>` : ''}
        <!-- Footer -->
        <div style="padding:24px 40px;">
          <a href="https://geoscope.jp/dashboard.html" style="display:inline-block;background:#edeae0;color:#070710;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:12px 24px;text-decoration:none;">ダッシュボードを開く →</a>
          <div style="margin-top:16px;font-size:10px;color:rgba(237,234,224,.2);">
            ${new Date(scannedAt || Date.now()).toLocaleString('ja-JP')} にスキャン実行
          </div>
        </div>
      </div>
    `,
  });
}

// ===== 週次レポート =====
async function sendWeeklyReport(apiKey, email, data) {
  if (!data) throw new Error('weeklyDataが必要です');
  const { brand, thisWeek, lastWeek, history = [] } = data;

  const diff = thisWeek - lastWeek;
  const diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;
  const diffColor = diff > 0 ? '#3ddc84' : diff < 0 ? '#ef6060' : '#f0b429';

  const historyRows = history.slice(-6).map(h => {
    const d = new Date(h.scannedAt);
    return `<tr>
      <td style="padding:6px 16px;font-size:11px;color:rgba(237,234,224,.5);">${d.getMonth()+1}/${d.getDate()}</td>
      <td style="padding:6px 16px;font-size:13px;">${h.avgRate}%</td>
      <td style="padding:6px 16px;">
        <div style="height:4px;width:${h.avgRate * 2}px;background:#8b7cf8;opacity:.7;"></div>
      </td>
    </tr>`;
  }).join('');

  await sendMail(apiKey, {
    from: 'Geoscope <noreply@geoscope.jp>',
    to: email,
    subject: `[Geoscope] 週次レポート — ${brand} ${thisWeek}% (${diffStr})`,
    html: `
      <div style="font-family:monospace;max-width:600px;background:#070710;color:#edeae0;padding:0;border:1px solid rgba(255,255,255,.1);">
        <div style="padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:10px;letter-spacing:4px;color:rgba(237,234,224,.3);text-transform:uppercase;margin-bottom:8px;">Geoscope 週次レポート</div>
          <div style="font-size:24px;font-weight:300;">${brand}</div>
        </div>
        <div style="padding:32px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="display:flex;gap:40px;">
            <div>
              <div style="font-size:9px;letter-spacing:2px;color:rgba(237,234,224,.3);margin-bottom:6px;">今週</div>
              <div style="font-size:48px;font-weight:300;line-height:1;">${thisWeek}%</div>
            </div>
            <div>
              <div style="font-size:9px;letter-spacing:2px;color:rgba(237,234,224,.3);margin-bottom:6px;">先週比</div>
              <div style="font-size:48px;font-weight:300;line-height:1;color:${diffColor};">${diffStr}</div>
            </div>
          </div>
        </div>
        ${history.length > 0 ? `
        <div style="padding:24px 40px;border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="font-size:9px;letter-spacing:3px;color:rgba(237,234,224,.3);text-transform:uppercase;margin-bottom:16px;">推移（直近6回）</div>
          <table style="width:100%;border-collapse:collapse;">${historyRows}</table>
        </div>` : ''}
        <div style="padding:24px 40px;">
          <a href="https://geoscope.jp/dashboard.html" style="display:inline-block;background:#edeae0;color:#070710;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:12px 24px;text-decoration:none;">詳細を見る →</a>
          <div style="margin-top:16px;font-size:10px;color:rgba(237,234,224,.2);">
            毎週月曜に自動送信 | <a href="https://geoscope.jp/dashboard.html" style="color:rgba(237,234,224,.2);">配信停止</a>
          </div>
        </div>
      </div>
    `,
  });
}

async function sendMail(apiKey, payload) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Resend ${resp.status}`);
  }
  return resp.json();
}
