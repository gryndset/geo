// api/contact/index.js
// お問い合わせメール送信 - Resend使用

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, type, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: '名前・メール・内容は必須です' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const TO_EMAIL   = process.env.CONTACT_TO_EMAIL || 'hello@geoscope.jp';

  if (!RESEND_KEY) {
    // Resendキー未設定でも200を返す（開発環境用）
    console.log('CONTACT:', { name, email, type, message });
    return res.status(200).json({ ok: true, note: 'RESEND_API_KEY未設定（ログのみ）' });
  }

  const typeLabel = { 'バグ報告':'🐛 バグ報告', '機能リクエスト':'💡 機能リクエスト', '使い方の質問':'❓ 質問', 'その他':'📩 その他' }[type] || type || '📩 お問い合わせ';

  try {
    // 管理者宛
    await sendMail(RESEND_KEY, {
      from: 'Geoscope <noreply@geoscope.jp>',
      to: TO_EMAIL,
      subject: `[Geoscope] ${typeLabel} — ${name}`,
      html: `
        <div style="font-family:monospace;max-width:600px;background:#070710;color:#edeae0;padding:40px;border:1px solid rgba(255,255,255,.1);">
          <div style="font-size:11px;letter-spacing:3px;color:rgba(237,234,224,.4);margin-bottom:24px;text-transform:uppercase;">Geoscope お問い合わせ</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
            <tr><td style="padding:8px 0;color:rgba(237,234,224,.4);width:80px;">名前</td><td style="padding:8px 0;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:rgba(237,234,224,.4);">メール</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#8b7cf8;">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:rgba(237,234,224,.4);">種別</td><td style="padding:8px 0;">${typeLabel}</td></tr>
          </table>
          <div style="background:rgba(255,255,255,.04);padding:20px;font-size:13px;line-height:1.8;white-space:pre-wrap;">${message}</div>
          <div style="margin-top:24px;font-size:10px;color:rgba(237,234,224,.2);">${new Date().toLocaleString('ja-JP')}</div>
        </div>
      `,
    });

    // ユーザー宛（自動返信）
    await sendMail(RESEND_KEY, {
      from: 'Geoscope <noreply@geoscope.jp>',
      to: email,
      subject: '[Geoscope] お問い合わせを受け付けました',
      html: `
        <div style="font-family:monospace;max-width:600px;background:#070710;color:#edeae0;padding:40px;border:1px solid rgba(255,255,255,.1);">
          <div style="font-size:11px;letter-spacing:3px;color:rgba(237,234,224,.4);margin-bottom:24px;text-transform:uppercase;">Geoscope</div>
          <p style="font-size:15px;margin-bottom:16px;">${name} 様</p>
          <p style="font-size:13px;color:rgba(237,234,224,.6);line-height:1.8;margin-bottom:24px;">
            お問い合わせありがとうございます。<br>
            内容を確認次第、ご返信いたします。
          </p>
          <div style="background:rgba(255,255,255,.04);padding:20px;font-size:12px;color:rgba(237,234,224,.4);line-height:1.8;white-space:pre-wrap;">${message}</div>
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:rgba(237,234,224,.2);">
            Geoscope — GEO Tracking SaaS<br>
            <a href="https://geoscope.jp" style="color:#8b7cf8;">geoscope.jp</a>
          </div>
        </div>
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Mail error:', e);
    return res.status(500).json({ error: 'メール送信に失敗しました: ' + e.message });
  }
}

async function sendMail(apiKey, payload) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Resend error ${resp.status}`);
  }
  return resp.json();
}
