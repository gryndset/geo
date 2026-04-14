// api/admin/index.js - カスタムプロンプト・APIキー管理・管理者機能

import { setCors, createServerClient, requireAuth, checkPlanLimit } from '../../lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = createServerClient();
  const { action } = req.query;

  try {
    switch (action) {
      // APIキー管理
      case 'keys_save':   return await saveApiKeys(req, res, supabase, user);
      case 'keys_get':    return await getApiKeys(req, res, supabase, user);
      case 'keys_delete': return await deleteApiKey(req, res, supabase, user);

      // カスタムプロンプト
      case 'prompts_list':   return await listPrompts(req, res, supabase, user);
      case 'prompts_create': return await createPrompt(req, res, supabase, user);
      case 'prompts_update': return await updatePrompt(req, res, supabase, user);
      case 'prompts_delete': return await deletePrompt(req, res, supabase, user);

      // スケジュール
      case 'schedule_list':   return await listSchedules(req, res, supabase, user);
      case 'schedule_update': return await updateSchedule(req, res, supabase, user);

      // 管理者
      case 'stats': return await adminStats(req, res, supabase, user);

      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Admin error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== APIキー保存（暗号化なし・Supabase RLS任せ） =====
async function saveApiKeys(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { perplexity, openai, gemini, anthropic } = req.body || {};

  const updates = {};
  if (perplexity !== undefined) updates.perplexity = perplexity || null;
  if (openai !== undefined) updates.openai = openai || null;
  if (gemini !== undefined) updates.gemini = gemini || null;
  if (anthropic !== undefined) updates.anthropic = anthropic || null;

  // upsert（なければ作成）
  const { data, error } = await supabase
    .from('user_api_keys')
    .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  // マスクして返す（セキュリティ）
  return res.status(200).json({
    ok: true,
    keys: {
      perplexity: data.perplexity ? maskKey(data.perplexity) : null,
      openai: data.openai ? maskKey(data.openai) : null,
      gemini: data.gemini ? maskKey(data.gemini) : null,
      anthropic: data.anthropic ? maskKey(data.anthropic) : null,
    },
  });
}

async function getApiKeys(req, res, supabase, user) {
  const { data } = await supabase.from('user_api_keys').select('*').eq('user_id', user.id).single();
  if (!data) return res.status(200).json({ keys: {} });
  return res.status(200).json({
    keys: {
      perplexity: data.perplexity ? maskKey(data.perplexity) : null,
      openai: data.openai ? maskKey(data.openai) : null,
      gemini: data.gemini ? maskKey(data.gemini) : null,
      anthropic: data.anthropic ? maskKey(data.anthropic) : null,
    },
  });
}

async function deleteApiKey(req, res, supabase, user) {
  if (req.method !== 'DELETE') return res.status(405).end();
  const { key_name } = req.body || {};
  if (!['perplexity','openai','gemini','anthropic'].includes(key_name)) {
    return res.status(400).json({ error: '無効なkey_nameです' });
  }
  await supabase.from('user_api_keys').update({ [key_name]: null }).eq('user_id', user.id);
  return res.status(200).json({ ok: true });
}

function maskKey(key) {
  if (!key) return null;
  return key.slice(0, 8) + '...' + key.slice(-4);
}

// ===== カスタムプロンプト =====
async function listPrompts(req, res, supabase, user) {
  const { brand_id } = req.query;
  let query = supabase.from('custom_prompts').select('*, brands(name)').eq('user_id', user.id).order('created_at');
  if (brand_id) query = query.eq('brand_id', brand_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ prompts: data });
}

async function createPrompt(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { prompt, brand_id, category = 'general' } = req.body || {};
  if (!prompt?.trim()) return res.status(400).json({ error: 'プロンプトが必要です' });

  const { limit } = await checkPlanLimit(supabase, user.id, 'prompts');
  if (limit === 0) return res.status(403).json({ error: 'カスタムプロンプトはProプラン以上の機能です' });

  const { count } = await supabase.from('custom_prompts')
    .select('*', { count: 'exact', head: true }).eq('user_id', user.id);
  if (count >= limit) return res.status(403).json({ error: `プロンプトは最大${limit}件までです` });

  const { data, error } = await supabase.from('custom_prompts')
    .insert({ user_id: user.id, brand_id: brand_id || null, prompt: prompt.trim(), category })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ prompt: data });
}

async function updatePrompt(req, res, supabase, user) {
  if (req.method !== 'PUT') return res.status(405).end();
  const { id } = req.query;
  const { prompt, category, is_active } = req.body || {};
  const updates = {};
  if (prompt) updates.prompt = prompt.trim();
  if (category) updates.category = category;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase.from('custom_prompts')
    .update(updates).eq('id', id).eq('user_id', user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ prompt: data });
}

async function deletePrompt(req, res, supabase, user) {
  if (req.method !== 'DELETE') return res.status(405).end();
  const { id } = req.query;
  await supabase.from('custom_prompts').delete().eq('id', id).eq('user_id', user.id);
  return res.status(200).json({ ok: true });
}

// ===== スケジュール管理 =====
async function listSchedules(req, res, supabase, user) {
  const { data, error } = await supabase
    .from('scan_schedules').select('*, brands(name, color)')
    .eq('user_id', user.id).order('created_at');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ schedules: data });
}

async function updateSchedule(req, res, supabase, user) {
  if (req.method !== 'PUT') return res.status(405).end();
  const { id } = req.query;
  const { frequency, day_of_week, is_active } = req.body || {};

  // Proプランのみdaily
  if (frequency === 'daily') {
    const { plan } = await checkPlanLimit(supabase, user.id, 'scans_per_day');
    if (plan === 'free') return res.status(403).json({ error: '日次スキャンはProプラン以上の機能です' });
  }

  const updates = {};
  if (frequency) updates.frequency = frequency;
  if (day_of_week !== undefined) updates.day_of_week = day_of_week;
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase.from('scan_schedules')
    .update(updates).eq('id', id).eq('user_id', user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ schedule: data });
}

// ===== 管理者統計（ADMIN_EMAILのみ） =====
async function adminStats(req, res, supabase, user) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return res.status(403).json({ error: '管理者権限が必要です' });
  }

  const [
    { count: userCount },
    { count: scanCount },
    { count: brandCount },
    { data: recentScans },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('scans').select('*', { count: 'exact', head: true }),
    supabase.from('brands').select('*', { count: 'exact', head: true }),
    supabase.from('scans').select('brand_name, avg_rate, scanned_at').order('scanned_at', { ascending: false }).limit(10),
  ]);

  const { data: planDist } = await supabase.from('profiles').select('plan');
  const plans = { free: 0, pro: 0, business: 0 };
  planDist?.forEach(p => { plans[p.plan] = (plans[p.plan] || 0) + 1; });

  return res.status(200).json({
    users: userCount,
    scans: scanCount,
    brands: brandCount,
    plan_distribution: plans,
    recent_scans: recentScans,
  });
}
