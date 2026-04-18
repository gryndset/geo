// api/scan/index.js - Geoscope GEOスキャンAPI v2

const TIMEOUT_MS = 25000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('タイムアウト')), ms))
  ]);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // action=save: Supabaseにスキャン結果を保存
  if (req.query?.action === 'save') {
    try {
      const { requireAuth } = await import('../../lib/supabase.js');
      const user = await requireAuth(req, res);
      if (!user) return;
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const { scan_data, brand_id } = body || {};
      if (!scan_data) return res.status(400).json({ error: 'scan_dataが必要です' });
      const saved = await saveScanToDB(user.id, brand_id, scan_data.brand, scan_data);
      return res.status(200).json({ ok: true, scan: saved });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const { brand, competitors = [], apis = {}, industry = 'general' } = body;
  if (!brand || !brand.trim()) return res.status(400).json({ error: 'ブランド名が必要です' });
  if (Object.keys(apis).length === 0) return res.status(400).json({ error: 'APIキーが1つ以上必要です' });

  // AI数に応じてプロンプト数を調整（Vercel 25秒タイムアウト対策）
  const aiCount = Object.keys(apis).length;
  const PROMPT_LIMITS = { 1: 18, 2: 12, 3: 9, 4: 7 };
  const promptLimit = PROMPT_LIMITS[aiCount] || 7;

  // ===== 業種別プロンプトセット =====
  const INDUSTRY_PROMPTS = {
    saas: [
      `${brand}はどんなSaaSですか？`,
      `${brand}の主な機能を教えてください`,
      `${brand}の料金プランを教えてください`,
      `${brand}は使いやすいですか？`,
      `${brand}のAPI連携について教えてください`,
      `${brand}の導入事例を教えてください`,
      `${brand}のサポート体制はどうですか？`,
      `${brand}と似たSaaSを比較してください`,
      `${brand}の無料トライアルはありますか？`,
      `${brand}はセキュリティが高いですか？`,
    ],
    ec: [
      `${brand}の商品はどんなものがありますか？`,
      `${brand}で購入した人の口コミを教えてください`,
      `${brand}の配送・返品について教えてください`,
      `${brand}は安全に購入できますか？`,
      `${brand}のセール・クーポン情報を教えてください`,
      `${brand}の品質はどうですか？`,
      `${brand}のおすすめ商品は？`,
      `${brand}と他のショップを比較してください`,
      `${brand}での支払い方法を教えてください`,
    ],
    restaurant: [
      `${brand}はどんなお店ですか？`,
      `${brand}のおすすめメニューを教えてください`,
      `${brand}の雰囲気・内装はどうですか？`,
      `${brand}の評判・口コミを教えてください`,
      `${brand}の予約方法を教えてください`,
      `${brand}のコスパはどうですか？`,
      `${brand}はデートや接待に向いていますか？`,
      `${brand}の近くにある似たお店は？`,
    ],
    consulting: [
      `${brand}はどんなコンサルティング会社ですか？`,
      `${brand}の得意な分野を教えてください`,
      `${brand}の支援実績を教えてください`,
      `${brand}に相談するにはどうすればいいですか？`,
      `${brand}の料金体系を教えてください`,
      `${brand}と他のコンサル会社を比較してください`,
      `${brand}のコンサルタントの専門性は？`,
    ],
    media: [
      `${brand}はどんなメディアですか？`,
      `${brand}の主な記事・コンテンツを教えてください`,
      `${brand}の読者層はどんな人ですか？`,
      `${brand}は信頼できる情報源ですか？`,
      `${brand}の特徴的なコーナーを教えてください`,
      `${brand}の運営会社はどこですか？`,
    ],
    healthcare: [
      `${brand}はどんな医療・健康サービスですか？`,
      `${brand}の診療科・サービス内容を教えてください`,
      `${brand}は評判がいいですか？`,
      `${brand}の予約・受診方法を教えてください`,
      `${brand}の費用を教えてください`,
      `${brand}の医師・スタッフの専門性は？`,
    ],
    education: [
      `${brand}はどんな教育サービスですか？`,
      `${brand}のカリキュラムを教えてください`,
      `${brand}の合格実績・成果を教えてください`,
      `${brand}の料金を教えてください`,
      `${brand}は初心者でも始められますか？`,
      `${brand}と他の教育サービスを比較してください`,
      `${brand}のサポート体制はどうですか？`,
    ],
    // B-10修正: general業種に汎用プロンプトを追加（空配列だと共通のみになり精度が下がる）
    general: [
      `${brand}はどんな会社・サービスですか？`,
      `${brand}の強みや特徴を教えてください`,
      `${brand}を利用している人の評判を教えてください`,
      `${brand}はどんな人におすすめですか？`,
      `${brand}の主要な製品・サービスを教えてください`,
      `${brand}の歴史や背景を教えてください`,
      `${brand}の価格・料金体系を教えてください`,
      `${brand}と競合他社との違いを教えてください`,
      `${brand}の最新のニュースや動向は？`,
      `${brand}のサポートや問い合わせ方法を教えてください`,
    ],
  };

  // 共通プロンプト（全業種）
  const commonPrompts = [
    `${brand}について教えてください`,
    `${brand}はどんなサービスですか？`,
    `${brand}の評判を教えてください`,
    `${brand}はおすすめですか？`,
    `${brand}の特徴を教えてください`,
    `${brand}の口コミはどうですか？`,
    ...(competitors.length > 0 ? [
      `${brand}と${competitors[0]}どちらがいいですか？`,
      `${competitors[0]}の代わりになるサービスを教えてください`,
    ] : []),
  ];

  // 業種別プロンプトをマージ（業種別 → 共通の順）
  const industryPrompts = INDUSTRY_PROMPTS[industry] || [];
  const allPrompts = [...industryPrompts, ...commonPrompts];

  // 重複除去 & 上限適用
  const seen = new Set();
  const prompts = allPrompts.filter(p => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  }).slice(0, promptLimit);

  const results = {};
  const errors = {};

  const tasks = [];
  if (apis.perplexity) tasks.push(
    withTimeout(scanPerplexity(brand, prompts, apis.perplexity), TIMEOUT_MS)
      .then(r => { results.perplexity = r; })
      .catch(e => { errors.perplexity = e.message; })
  );
  if (apis.openai) tasks.push(
    withTimeout(scanOpenAI(brand, prompts, apis.openai), TIMEOUT_MS)
      .then(r => { results.openai = r; })
      .catch(e => { errors.openai = e.message; })
  );
  if (apis.gemini) tasks.push(
    withTimeout(scanGemini(brand, prompts, apis.gemini), TIMEOUT_MS)
      .then(r => { results.gemini = r; })
      .catch(e => { errors.gemini = e.message; })
  );
  if (apis.anthropic) tasks.push(
    withTimeout(scanAnthropic(brand, prompts, apis.anthropic), TIMEOUT_MS)
      .then(r => { results.anthropic = r; })
      .catch(e => { errors.anthropic = e.message; })
  );

  await Promise.all(tasks);

  if (Object.keys(results).length === 0) {
    return res.status(500).json({ error: 'すべてのスキャンが失敗しました', errors });
  }

  const summary = calcSummary(results, brand, competitors);
  return res.status(200).json({
    results,
    summary,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    scannedAt: new Date().toISOString(),
    brand,
    competitors,
  });
}

// ===== Perplexity =====
async function scanPerplexity(brand, prompts, apiKey) {
  // バリデーション
  if (!apiKey.startsWith('pplx-')) throw new Error('Perplexity APIキーの形式が正しくありません（pplx-で始まる必要があります）');

  let mentionCount = 0;
  const appearances = [];
  const citationMap = {};

  // 並列で投げる（3並列）
  const chunks = chunkArray(prompts, 3);
  for (const chunk of chunks) {
    await Promise.all(chunk.map(async prompt => {
      try {
        const resp = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{ role: 'user', content: prompt }],
            return_citations: true,
            max_tokens: 400,
          }),
        });
        if (resp.status === 401) throw new Error('APIキーが無効です');
        if (resp.status === 429) throw new Error('レート制限に達しました。しばらく待ってから再試行してください');
        if (!resp.ok) throw new Error(`APIエラー: ${resp.status}`);

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        const mentioned = text.toLowerCase().includes(brand.toLowerCase());
        if (mentioned) mentionCount++;
        appearances.push({ prompt, mentioned, snippet: text.slice(0, 150) });

        if (Array.isArray(data.citations)) {
          data.citations.forEach(url => {
            try {
              const domain = new URL(url).hostname;
              if (!citationMap[url]) citationMap[url] = { url, domain, count: 0 };
              citationMap[url].count++;
            } catch {}
          });
        }
      } catch (e) {
        appearances.push({ prompt, mentioned: false, error: e.message });
        if (e.message.includes('無効') || e.message.includes('401')) throw e;
      }
    }));
  }

  const citations = Object.values(citationMap).sort((a, b) => b.count - a.count);
  const rate = Math.round((mentionCount / prompts.length) * 100);
  return { rate, mentionCount, totalPrompts: prompts.length, appearances, citations };
}

// ===== OpenAI =====
async function scanOpenAI(brand, prompts, apiKey) {
  if (!apiKey.startsWith('sk-')) throw new Error('OpenAI APIキーの形式が正しくありません（sk-で始まる必要があります）');

  let mentionCount = 0;
  const appearances = [];
  const chunks = chunkArray(prompts, 3);

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async prompt => {
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
          }),
        });
        if (resp.status === 401) throw new Error('OpenAI APIキーが無効です');
        if (resp.status === 429) throw new Error('OpenAI レート制限。しばらく待ってください');
        if (resp.status === 402) throw new Error('OpenAI クレジット不足');
        if (!resp.ok) throw new Error(`OpenAI APIエラー: ${resp.status}`);

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        const mentioned = text.toLowerCase().includes(brand.toLowerCase());
        if (mentioned) mentionCount++;
        appearances.push({ prompt, mentioned, snippet: text.slice(0, 150) });
      } catch (e) {
        appearances.push({ prompt, mentioned: false, error: e.message });
        if (e.message.includes('無効') || e.message.includes('401')) throw e;
      }
    }));
  }

  const rate = Math.round((mentionCount / prompts.length) * 100);
  return { rate, mentionCount, totalPrompts: prompts.length, appearances, citations: [] };
}

// ===== Gemini =====
async function scanGemini(brand, prompts, apiKey) {
  let mentionCount = 0;
  const appearances = [];
  const chunks = chunkArray(prompts, 3);

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async prompt => {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 300 } }),
          }
        );
        if (resp.status === 400) throw new Error('Gemini APIキーが無効です');
        if (resp.status === 429) throw new Error('Gemini レート制限。しばらく待ってください');
        if (!resp.ok) throw new Error(`Gemini APIエラー: ${resp.status}`);

        const data = await resp.json();
        if (data.promptFeedback?.blockReason) {
          appearances.push({ prompt, mentioned: false, error: 'コンテンツフィルター' });
          return;
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const mentioned = text.toLowerCase().includes(brand.toLowerCase());
        if (mentioned) mentionCount++;
        appearances.push({ prompt, mentioned, snippet: text.slice(0, 150) });
      } catch (e) {
        appearances.push({ prompt, mentioned: false, error: e.message });
        if (e.message.includes('無効') || e.message.includes('400')) throw e;
      }
    }));
  }

  const rate = Math.round((mentionCount / prompts.length) * 100);
  return { rate, mentionCount, totalPrompts: prompts.length, appearances, citations: [] };
}

// ===== Anthropic =====
async function scanAnthropic(brand, prompts, apiKey) {
  if (!apiKey.startsWith('sk-ant-')) throw new Error('Anthropic APIキーの形式が正しくありません（sk-ant-で始まる必要があります）');

  let mentionCount = 0;
  const appearances = [];
  const chunks = chunkArray(prompts, 2); // Anthropicは2並列に抑える

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async prompt => {
      try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (resp.status === 401) throw new Error('Anthropic APIキーが無効です');
        if (resp.status === 429) throw new Error('Anthropic レート制限。しばらく待ってください');
        if (!resp.ok) throw new Error(`Anthropic APIエラー: ${resp.status}`);

        const data = await resp.json();
        const text = data.content?.[0]?.text || '';
        const mentioned = text.toLowerCase().includes(brand.toLowerCase());
        if (mentioned) mentionCount++;
        appearances.push({ prompt, mentioned, snippet: text.slice(0, 150) });
      } catch (e) {
        appearances.push({ prompt, mentioned: false, error: e.message });
        if (e.message.includes('無効') || e.message.includes('401')) throw e;
      }
    }));
  }

  const rate = Math.round((mentionCount / prompts.length) * 100);
  return { rate, mentionCount, totalPrompts: prompts.length, appearances, citations: [] };
}

// ===== 集計 =====
function calcSummary(results, brand, competitors) {
  const byAI = {
    chatgpt:    results.openai?.rate     ?? null,
    perplexity: results.perplexity?.rate ?? null,
    gemini:     results.gemini?.rate     ?? null,
    claude:     results.anthropic?.rate  ?? null,
  };
  const rates = Object.values(byAI).filter(v => v !== null);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
  const citations = results.perplexity?.citations || [];

  return { brand, avgRate, byAI, totalCitations: citations.length, citations: citations.slice(0, 30) };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ===== DB保存（認証済みユーザー向け） =====
// このエンドポイントはapi/scan?action=saveで呼ぶ
async function saveScanToDB(userId, brandId, brandName, scanData) {
  const { createServerClient } = await import('../../lib/supabase.js');
  const supabase = createServerClient();

  const { data: saved, error } = await supabase.from('scans').insert({
    user_id: userId,
    brand_id: brandId || null,
    brand_name: brandName,
    avg_rate: scanData?.summary?.avgRate ?? null,
    rate_chatgpt:    scanData?.summary?.byAI?.chatgpt ?? null,
    rate_perplexity: scanData?.summary?.byAI?.perplexity ?? null,
    rate_gemini:     scanData?.summary?.byAI?.gemini ?? null,
    rate_claude:     scanData?.summary?.byAI?.claude ?? null,
    total_citations: scanData?.summary?.totalCitations ?? null,
    raw_data: scanData,
  }).select().single();

  if (error) throw new Error(error.message);

  // 引用URLを保存
  if (saved && scanData?.summary?.citations?.length > 0) {
    const citationRows = scanData.summary.citations.slice(0, 50).map(c => ({
      scan_id: saved.id,
      url: c.url,
      domain: c.domain,
      mention_count: c.count || 1,
      ai_source: 'perplexity',
    }));
    await supabase.from('citations').insert(citationRows).catch(() => {});
  }

  return saved;
}
