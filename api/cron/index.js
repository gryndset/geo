// api/cron/index.js - Vercel Cron 週次自動スキャン
// vercel.json に以下を追加:
// "crons": [{ "path": "/api/cron", "schedule": "0 9 * * 1" }]
// → 毎週月曜9:00 (UTC) に実行

import { createServerClient } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Vercel Cronからのみ実行を許可
  const cronSecret = req.headers['x-cron-secret'] || req.headers.authorization?.replace('Bearer ', '');
  if (cronSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createServerClient();
  const now = new Date();

  console.log(`[CRON] 週次スキャン開始: ${now.toISOString()}`);

  try {
    // 実行すべきスケジュールを取得
    const { data: schedules, error } = await supabase
      .from('scan_schedules')
      .select(`
        *,
        brands(id, name),
        profiles!user_id(id, plan, notify_email)
      `)
      .eq('is_active', true)
      .lte('next_run_at', now.toISOString())
      .limit(50);

    if (error) throw error;
    if (!schedules || schedules.length === 0) {
      console.log('[CRON] 実行対象なし');
      return res.status(200).json({ ok: true, ran: 0 });
    }

    console.log(`[CRON] ${schedules.length}件のスケジュールを処理`);

    const results = [];
    for (const schedule of schedules) {
      try {
        const result = await runScheduledScan(supabase, schedule);
        results.push({ schedule_id: schedule.id, status: 'ok', ...result });
      } catch (e) {
        console.error(`[CRON] スキャン失敗 ${schedule.id}:`, e.message);
        results.push({ schedule_id: schedule.id, status: 'error', error: e.message });
      }

      // 次回実行日時を更新
      const nextRun = calcNextRun(schedule.frequency, schedule.day_of_week);
      await supabase.from('scan_schedules')
        .update({ last_run_at: now.toISOString(), next_run_at: nextRun })
        .eq('id', schedule.id);
    }

    console.log('[CRON] 完了:', results);
    return res.status(200).json({ ok: true, ran: results.length, results });

  } catch (e) {
    console.error('[CRON] エラー:', e);
    return res.status(500).json({ error: e.message });
  }
}

async function runScheduledScan(supabase, schedule) {
  const userId = schedule.user_id;
  const brand = schedule.brands;
  const profile = schedule.profiles;

  if (!brand) throw new Error('ブランドが見つかりません');

  // ユーザーのAPIキーを取得（暗号化して保存している場合はここで復号）
  const { data: apiKeys } = await supabase
    .from('user_api_keys')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!apiKeys || !apiKeys.perplexity) {
    throw new Error('APIキーが設定されていません');
  }

  // 競合を取得
  const { data: competitors } = await supabase
    .from('competitors').select('name').eq('brand_id', brand.id);
  const competitorNames = (competitors || []).map(c => c.name);

  // カスタムプロンプト取得
  const { data: customPrompts } = await supabase
    .from('custom_prompts').select('prompt')
    .eq('user_id', userId).eq('brand_id', brand.id).eq('is_active', true);
  const extraPrompts = (customPrompts || []).map(p => p.prompt);

  // スキャン実行（scan APIのロジックを再利用）
  const scanResp = await fetch(`${process.env.SITE_URL || 'https://geoscope.jp'}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brand: brand.name,
      competitors: competitorNames,
      apis: {
        perplexity: apiKeys.perplexity,
        openai: apiKeys.openai || undefined,
        gemini: apiKeys.gemini || undefined,
        anthropic: apiKeys.anthropic || undefined,
      },
      extra_prompts: extraPrompts,
    }),
  });

  const scanData = await scanResp.json();
  if (!scanResp.ok) throw new Error(scanData.error || 'スキャン失敗');

  // DBに保存
  const { data: savedScan } = await supabase.from('scans').insert({
    user_id: userId,
    brand_id: brand.id,
    brand_name: brand.name,
    avg_rate: scanData.summary.avgRate,
    rate_chatgpt: scanData.summary.byAI.chatgpt,
    rate_perplexity: scanData.summary.byAI.perplexity,
    rate_gemini: scanData.summary.byAI.gemini,
    rate_claude: scanData.summary.byAI.claude,
    total_citations: scanData.summary.totalCitations,
    raw_data: scanData,
  }).select().single();

  // 引用URLを保存
  if (savedScan && scanData.summary.citations?.length > 0) {
    await supabase.from('citations').insert(
      scanData.summary.citations.slice(0, 50).map(c => ({
        scan_id: savedScan.id, url: c.url, domain: c.domain, mention_count: c.count || 1,
      }))
    );
  }

  // アラートチェック
  if (savedScan) {
    const { evaluateAlerts } = await import('../alerts/index.js');
    const fired = await evaluateAlerts(supabase, userId, savedScan.id, {
      brand_id: brand.id, brand_name: brand.name, avg_rate: scanData.summary.avgRate,
    });

    // アラートメールを送信
    if (fired.length > 0 && profile?.notify_email) {
      await sendAlertMail(profile.notify_email, brand.name, fired);
    }
  }

  // 週次レポートメール
  if (profile?.notify_email) {
    const { data: prevScans } = await supabase
      .from('scans').select('avg_rate, scanned_at')
      .eq('brand_id', brand.id).eq('user_id', userId)
      .order('scanned_at', { ascending: false }).limit(8);

    await fetch(`${process.env.SITE_URL || 'https://geoscope.jp'}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'weekly',
        email: profile.notify_email,
        weeklyData: {
          brand: brand.name,
          thisWeek: scanData.summary.avgRate,
          lastWeek: prevScans?.[1]?.avg_rate || scanData.summary.avgRate,
          history: (prevScans || []).map(s => ({ scannedAt: s.scanned_at, avgRate: s.avg_rate })),
        },
      }),
    }).catch(() => {});
  }

  return { brand: brand.name, avg_rate: scanData.summary.avgRate };
}

async function sendAlertMail(email, brandName, firedAlerts) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return;

  const alertItems = firedAlerts.map(a => `<li style="padding:6px 0;">${a.message}</li>`).join('');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Geoscope <noreply@geoscope.jp>',
      to: email,
      subject: `[Geoscope] アラート: ${brandName}`,
      html: `
        <div style="font-family:monospace;max-width:600px;background:#070710;color:#edeae0;padding:40px;border:1px solid rgba(255,255,255,.1);">
          <div style="font-size:10px;letter-spacing:3px;color:rgba(237,234,224,.4);margin-bottom:16px;">Geoscope アラート</div>
          <div style="font-size:20px;margin-bottom:20px;">${brandName}</div>
          <ul style="font-size:13px;color:rgba(237,234,224,.7);line-height:1.8;padding-left:16px;">${alertItems}</ul>
          <div style="margin-top:24px;">
            <a href="${process.env.SITE_URL || 'https://geoscope.jp'}/dashboard.html" style="background:#edeae0;color:#070710;font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;text-decoration:none;display:inline-block;">確認する →</a>
          </div>
        </div>
      `,
    }),
  }).catch(e => console.error('Alert mail error:', e));
}

function calcNextRun(frequency, dayOfWeek) {
  const d = new Date();
  if (frequency === 'weekly') {
    const current = d.getDay();
    const diff = (dayOfWeek - current + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
  } else if (frequency === 'daily') {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
