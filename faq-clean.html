// api/export/index.js - スキャン結果エクスポート

import { setCors, createServerClient, requireAuth } from '../../lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const supabase = createServerClient();
  const { format = 'csv', brand_id, limit = 100, from, to } = req.query;

  try {
    // スキャンデータ取得
    let query = supabase
      .from('scans')
      .select('*, brands(name), citations(url, domain, mention_count)')
      .eq('user_id', user.id)
      .order('scanned_at', { ascending: false })
      .limit(Math.min(parseInt(limit), 500));

    if (brand_id) query = query.eq('brand_id', brand_id);
    if (from) query = query.gte('scanned_at', from);
    if (to) query = query.lte('scanned_at', to);

    const { data: scans, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    if (!scans || scans.length === 0) return res.status(404).json({ error: 'データがありません' });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="geoscope_export_${dateStr()}.json"`);
      return res.status(200).json({ exported_at: new Date().toISOString(), count: scans.length, scans });
    }

    if (format === 'csv') {
      const csv = buildCSV(scans);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="geoscope_export_${dateStr()}.csv"`);
      // BOM（Excelで文字化けしないように）
      return res.status(200).send('\uFEFF' + csv);
    }

    if (format === 'citations_csv') {
      const csv = buildCitationsCSV(scans);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="geoscope_citations_${dateStr()}.csv"`);
      return res.status(200).send('\uFEFF' + csv);
    }

    return res.status(400).json({ error: 'formatはcsv・json・citations_csvのいずれかです' });

  } catch (e) {
    console.error('Export error:', e);
    return res.status(500).json({ error: e.message });
  }
}

function buildCSV(scans) {
  const headers = [
    'スキャン日時', 'ブランド名', '平均出現率(%)',
    'ChatGPT(%)', 'Perplexity(%)', 'Gemini(%)', 'Claude(%)',
    '引用URL数',
  ];

  const rows = scans.map(s => [
    new Date(s.scanned_at).toLocaleString('ja-JP'),
    s.brand_name,
    s.avg_rate,
    s.rate_chatgpt ?? '',
    s.rate_perplexity ?? '',
    s.rate_gemini ?? '',
    s.rate_claude ?? '',
    s.total_citations ?? (s.citations?.length || 0),
  ]);

  return [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

function buildCitationsCSV(scans) {
  const headers = ['スキャン日時', 'ブランド名', 'ドメイン', 'URL', '引用回数', 'AIソース'];
  const rows = [];

  scans.forEach(s => {
    (s.citations || []).forEach(c => {
      rows.push([
        new Date(s.scanned_at).toLocaleString('ja-JP'),
        s.brand_name,
        c.domain,
        c.url,
        c.mention_count,
        c.ai_source || 'perplexity',
      ]);
    });
  });

  return [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

function dateStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
