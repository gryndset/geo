// api/brands/index.js - ブランド管理API

import { setCors, createServerClient, requireAuth, checkPlanLimit } from '../../lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = createServerClient();
  const { action, id } = req.query;

  try {
    switch (action) {
      case 'list':        return await listBrands(req, res, supabase, user);
      case 'create':      return await createBrand(req, res, supabase, user);
      case 'update':      return await updateBrand(req, res, supabase, user, id);
      case 'delete':      return await deleteBrand(req, res, supabase, user, id);
      case 'get':         return await getBrand(req, res, supabase, user, id);
      case 'competitors': return await manageCompetitors(req, res, supabase, user, id);
      case 'stats':       return await getBrandStats(req, res, supabase, user, id);
      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Brands error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== ブランド一覧 =====
async function listBrands(req, res, supabase, user) {
  const { data: brands, error } = await supabase
    .from('brands')
    .select(`
      *,
      competitors(*),
      scans(avg_rate, scanned_at, id)
    `)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // 直近スキャンの情報を整形
  const result = brands.map(b => {
    const sorted = (b.scans || []).sort((a, z) => new Date(z.scanned_at) - new Date(a.scanned_at));
    return {
      ...b,
      scans: undefined,
      latest_scan: sorted[0] || null,
      scan_count: sorted.length,
    };
  });

  return res.status(200).json({ brands: result });
}

// ===== ブランド詳細 =====
async function getBrand(req, res, supabase, user, id) {
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  const { data: brand, error } = await supabase
    .from('brands')
    .select('*, competitors(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !brand) return res.status(404).json({ error: 'ブランドが見つかりません' });
  return res.status(200).json({ brand });
}

// ===== ブランド作成 =====
async function createBrand(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { name, description, color, competitors: compNames = [] } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'ブランド名が必要です' });

  // プラン制限チェック
  const { limit } = await checkPlanLimit(supabase, user.id, 'brands');
  const { count } = await supabase
    .from('brands').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('is_active', true);

  if (count >= limit) {
    return res.status(403).json({ error: `プランの上限（${limit}ブランド）に達しました。アップグレードしてください。` });
  }

  // ブランド作成
  const { data: brand, error } = await supabase
    .from('brands')
    .insert({ user_id: user.id, name: name.trim(), description, color: color || '#8b7cf8' })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  // 競合追加
  if (compNames.length > 0) {
    const comps = compNames.filter(Boolean).map(n => ({ brand_id: brand.id, name: n.trim() }));
    await supabase.from('competitors').insert(comps);
  }

  // デフォルトアラートを作成
  await supabase.from('alerts').insert([
    { user_id: user.id, brand_id: brand.id, type: 'rate_drop', threshold: 10 },
  ]);

  // デフォルトスケジュール作成（Free: 週1）
  const nextMonday = getNextMonday();
  await supabase.from('scan_schedules').insert({
    user_id: user.id, brand_id: brand.id,
    frequency: 'weekly', day_of_week: 1,
    next_run_at: nextMonday,
  });

  const { data: full } = await supabase.from('brands').select('*, competitors(*)').eq('id', brand.id).single();
  return res.status(201).json({ brand: full });
}

// ===== ブランド更新 =====
async function updateBrand(req, res, supabase, user, id) {
  if (req.method !== 'PUT') return res.status(405).end();
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  const { name, description, color } = req.body || {};
  const updates = {};
  if (name) updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (color) updates.color = color;

  const { data, error } = await supabase
    .from('brands').update(updates)
    .eq('id', id).eq('user_id', user.id)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ brand: data });
}

// ===== ブランド削除（論理削除） =====
async function deleteBrand(req, res, supabase, user, id) {
  if (req.method !== 'DELETE') return res.status(405).end();
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  const { error } = await supabase
    .from('brands').update({ is_active: false })
    .eq('id', id).eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ===== 競合管理 =====
async function manageCompetitors(req, res, supabase, user, brandId) {
  if (!brandId) return res.status(400).json({ error: 'brand idが必要です' });

  // 自分のブランドか確認
  const { data: brand } = await supabase.from('brands').select('id').eq('id', brandId).eq('user_id', user.id).single();
  if (!brand) return res.status(404).json({ error: 'ブランドが見つかりません' });

  if (req.method === 'GET') {
    const { data } = await supabase.from('competitors').select('*').eq('brand_id', brandId);
    return res.status(200).json({ competitors: data || [] });
  }

  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: '競合名が必要です' });

    // プラン制限
    const { limit } = await checkPlanLimit(supabase, user.id, 'competitors');
    const { count } = await supabase.from('competitors').select('*', { count: 'exact', head: true }).eq('brand_id', brandId);
    if (count >= limit) return res.status(403).json({ error: `競合は最大${limit}社までです` });

    const { data, error } = await supabase.from('competitors').insert({ brand_id: brandId, name: name.trim() }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ competitor: data });
  }

  if (req.method === 'DELETE') {
    const { competitor_id } = req.body || {};
    if (!competitor_id) return res.status(400).json({ error: 'competitor_idが必要です' });
    await supabase.from('competitors').delete().eq('id', competitor_id).eq('brand_id', brandId);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

// ===== ブランド統計 =====
async function getBrandStats(req, res, supabase, user, id) {
  if (!id) return res.status(400).json({ error: 'idが必要です' });

  // スキャン履歴（直近30件）
  const { data: scans } = await supabase
    .from('scans').select('*')
    .eq('brand_id', id).eq('user_id', user.id)
    .order('scanned_at', { ascending: false })
    .limit(30);

  if (!scans || scans.length === 0) return res.status(200).json({ stats: null });

  const latest = scans[0];
  const prev = scans[1];
  const diff = prev ? latest.avg_rate - prev.avg_rate : 0;

  // AI別平均
  const aiAvg = (key) => {
    const vals = scans.map(s => s[key]).filter(v => v !== null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };

  // 週次トレンド（直近8週）
  const weeklyTrend = scans.slice(0, 8).reverse().map(s => ({
    date: s.scanned_at,
    rate: s.avg_rate,
  }));

  return res.status(200).json({
    stats: {
      latest_rate: latest.avg_rate,
      diff,
      ai_avg: {
        chatgpt: aiAvg('rate_chatgpt'),
        perplexity: aiAvg('rate_perplexity'),
        gemini: aiAvg('rate_gemini'),
        claude: aiAvg('rate_claude'),
      },
      weekly_trend: weeklyTrend,
      total_scans: scans.length,
    },
  });
}

function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? 1 : 8 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
