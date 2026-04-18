// api/share/index.js - スキャン結果共有API

import { setCors, createServerClient, requireAuth } from '../../lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, slug } = req.query;
  const supabase = createServerClient();

  try {
    // 公開ページ取得（認証不要）
    if (action === 'view' && slug) return await viewShare(req, res, supabase, slug);

    // 以下は認証必要
    const user = await requireAuth(req, res);
    if (!user) return;

    switch (action) {
      case 'create':  return await createShare(req, res, supabase, user);
      case 'list':    return await listShares(req, res, supabase, user);
      case 'delete':  return await deleteShare(req, res, supabase, user, slug);
      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Share error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== 共有URL作成 =====
async function createShare(req, res, supabase, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { scan_id, expires_in_days } = req.body || {};
  if (!scan_id) return res.status(400).json({ error: 'scan_idが必要です' });

  // 自分のスキャンか確認
  const { data: scan } = await supabase.from('scans').select('id, brand_name').eq('id', scan_id).eq('user_id', user.id).single();
  if (!scan) return res.status(404).json({ error: 'スキャンが見つかりません' });

  // 既存の共有があれば返す
  const { data: existing } = await supabase.from('shares').select('slug').eq('scan_id', scan_id).eq('user_id', user.id).single();
  if (existing) {
    const shareUrl = `${process.env.SITE_URL || 'https://geoscope.jp'}/share.html?s=${existing.slug}`;
    return res.status(200).json({ slug: existing.slug, url: shareUrl, existing: true });
  }

  const slug = generateSlug();
  const expires_at = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('shares')
    .insert({ scan_id, user_id: user.id, slug, expires_at, is_public: true })
    .select().single();

  if (error) return res.status(500).json({ error: error.message });

  const shareUrl = `${process.env.SITE_URL || 'https://geoscope.jp'}/share.html?s=${slug}`;
  return res.status(201).json({ slug, url: shareUrl, expires_at });
}

// ===== 共有ページデータ取得（公開） =====
async function viewShare(req, res, supabase, slug) {
  const { data: share, error } = await supabase
    .from('shares')
    .select('*, scans(*, citations(url, domain, mention_count))')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error || !share) return res.status(404).json({ error: '共有ページが見つかりません' });

  // 期限チェック
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return res.status(410).json({ error: 'この共有リンクは有効期限切れです' });
  }

  // 閲覧数インクリメント
  await supabase.from('shares').update({ view_count: (share.view_count || 0) + 1 }).eq('id', share.id);

  return res.status(200).json({
    brand_name: share.scans?.brand_name,
    scanned_at: share.scans?.scanned_at,
    avg_rate: share.scans?.avg_rate,
    by_ai: {
      chatgpt: share.scans?.rate_chatgpt,
      perplexity: share.scans?.rate_perplexity,
      gemini: share.scans?.rate_gemini,
      claude: share.scans?.rate_claude,
    },
    total_citations: share.scans?.total_citations,
    citations: share.scans?.citations || [],
    view_count: share.view_count,
  });
}

// ===== 共有一覧 =====
async function listShares(req, res, supabase, user) {
  const { data, error } = await supabase
    .from('shares')
    .select('slug, created_at, expires_at, view_count, scans(brand_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const siteUrl = process.env.SITE_URL || 'https://geoscope.jp';
  const result = (data || []).map(s => ({
    ...s,
    url: `${siteUrl}/share.html?s=${s.slug}`,
    brand_name: s.scans?.brand_name,
    scans: undefined,
  }));

  return res.status(200).json({ shares: result });
}

// ===== 共有削除 =====
async function deleteShare(req, res, supabase, user, slug) {
  if (req.method !== 'DELETE') return res.status(405).end();
  if (!slug) return res.status(400).json({ error: 'slugが必要です' });

  const { error } = await supabase.from('shares').delete().eq('slug', slug).eq('user_id', user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

function generateSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
