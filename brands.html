// api/alerts/index.js - アラート管理API

import { setCors, createServerClient, requireAuth } from '../../lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = createServerClient();
  const { action, id } = req.query;

  try {
    switch (action) {
      case 'list':   return await listAlerts(req, res, supabase, user);
      case 'create': return await createAlert(req, res, supabase, user);
      case 'update': return await updateAlert(req, res, supabase, user, id);
      case 'delete': return await deleteAlert(req, res, supabase, user, id);
      case 'logs':   return await getAlertLogs(req, res, supabase, user);
      case 'check':  return await checkAlerts(req, res, supabase, user);
      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Alerts error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== アラート一覧 =====
async function listAlerts(req, res, supabase, user) {
  const { data, error } = await supabase
    .from('alerts')
    .select('*, brands(name, color)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ alerts: data });
}

// ===== アラート作成 =====
async function createAlert(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { brand_id, type, threshold = 10, notify_email = true } = req.body || {};

  if (!brand_id || !type) return res.status(400).json({ error: 'brand_idとtypeが必要です' });

  // 自分のブランドか確認
  const { data: brand } = await supabase.from('brands').select('id').eq('id', brand_id).eq('user_id', user.id).single();
  if (!brand) return res.status(404).json({ error: 'ブランドが見つかりません' });

  const { data, error } = await supabase
    .from('alerts')
    .insert({ user_id: user.id, brand_id, type, threshold, notify_email })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ alert: data });
}

// ===== アラート更新 =====
async function updateAlert(req, res, supabase, user, id) {
  if (req.method !== 'PUT') return res.status(405).end();
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  const { threshold, is_active, notify_email } = req.body || {};
  const updates = {};
  if (threshold !== undefined) updates.threshold = threshold;
  if (is_active !== undefined) updates.is_active = is_active;
  if (notify_email !== undefined) updates.notify_email = notify_email;

  const { data, error } = await supabase
    .from('alerts').update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ alert: data });
}

// ===== アラート削除 =====
async function deleteAlert(req, res, supabase, user, id) {
  if (req.method !== 'DELETE') return res.status(405).end();
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  const { error } = await supabase.from('alerts').delete().eq('id', id).eq('user_id', user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ===== アラートログ =====
async function getAlertLogs(req, res, supabase, user) {
  const { brand_id, limit = 50 } = req.query;

  // まず自分のアラートIDを取得（RLSの問題を回避）
  let alertQuery = supabase
    .from('alerts')
    .select('id')
    .eq('user_id', user.id);
  if (brand_id) alertQuery = alertQuery.eq('brand_id', brand_id);
  const { data: userAlerts } = await alertQuery;

  if (!userAlerts || userAlerts.length === 0) {
    return res.status(200).json({ logs: [] });
  }

  const alertIds = userAlerts.map(a => a.id);

  const { data, error } = await supabase
    .from('alert_logs')
    .select('*, alerts(type, threshold, brands(name, color))')
    .in('alert_id', alertIds)
    .order('fired_at', { ascending: false })
    .limit(parseInt(limit));

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ logs: data || [] });
}

// ===== スキャン後にアラートを評価（内部呼び出し用） =====
export async function evaluateAlerts(supabase, userId, scanId, scanData) {
  const { brand_id, brand_name, avg_rate } = scanData;

  // このブランドのアクティブなアラートを取得
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('brand_id', brand_id)
    .eq('is_active', true);

  if (!alerts || alerts.length === 0) return [];

  // 前回スキャンを取得
  const { data: prevScans } = await supabase
    .from('scans')
    .select('avg_rate, rate_chatgpt, rate_perplexity, rate_gemini, rate_claude')
    .eq('brand_id', brand_id)
    .eq('user_id', userId)
    .order('scanned_at', { ascending: false })
    .limit(2);

  const prev = prevScans?.[1]; // 今回が[0]、前回が[1]
  const firedAlerts = [];

  for (const alert of alerts) {
    let fired = false;
    let message = '';

    if (alert.type === 'rate_drop' && prev) {
      const drop = prev.avg_rate - avg_rate;
      if (drop >= alert.threshold) {
        fired = true;
        message = `${brand_name}の出現率が${drop}pt下落しました（${prev.avg_rate}% → ${avg_rate}%）`;
      }
    }

    if (alert.type === 'rate_rise' && prev) {
      const rise = avg_rate - prev.avg_rate;
      if (rise >= alert.threshold) {
        fired = true;
        message = `${brand_name}の出現率が${rise}pt上昇しました（${prev.avg_rate}% → ${avg_rate}%）`;
      }
    }

    if (alert.type === 'competitor_overtake' && prev) {
      // 競合に抜かれた場合（実装省略 - スキャンデータに競合情報が必要）
      // TODO: 競合比較ロジック
    }

    if (fired) {
      // アラートログに記録
      await supabase.from('alert_logs').insert({ alert_id: alert.id, scan_id: scanId, message });
      firedAlerts.push({ ...alert, message });
    }
  }

  return firedAlerts;
}

// ===== 手動でアラートチェック =====
async function checkAlerts(req, res, supabase, user) {
  const { scan_id } = req.query;
  if (!scan_id) return res.status(400).json({ error: 'scan_idが必要です' });

  const { data: scan } = await supabase.from('scans').select('*').eq('id', scan_id).eq('user_id', user.id).single();
  if (!scan) return res.status(404).json({ error: 'スキャンが見つかりません' });

  const fired = await evaluateAlerts(supabase, user.id, scan_id, {
    brand_id: scan.brand_id,
    brand_name: scan.brand_name,
    avg_rate: scan.avg_rate,
  });

  return res.status(200).json({ fired_count: fired.length, alerts: fired });
}
