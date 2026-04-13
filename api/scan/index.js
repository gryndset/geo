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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const { brand, competitors = [], apis = {} } = body;
  if (!brand || !brand.trim()) return res.status(400).json({ error: 'ブランド名が必要です' });
  if (Object.keys(apis).length === 0) return res.status(400).json({ error: 'APIキーが1つ以上必要です' });

  // 20種類の多様なプロンプト（会話形式・GEO引用されやすいパターン）
  const prompts = [
    `${brand}について教えてください`,
    `${brand}はどんなサービスですか？`,
    `${brand}の評判を教えてください`,
    `${brand}はおすすめですか？`,
    `${brand}を使ってみた感想を教えてください`,
    `${brand}と競合サービスを比較してください`,
    `${brand}の料金はいくらですか？`,
    `${brand}の特徴を教えてください`,
    `${brand}はどんな企業ですか？`,
    `${brand}の口コミはどうですか？`,
    ...(competitors.length > 0 ? [
      `${brand}と${competitors[0]}どちらがいいですか？`,
      `${competitors[0]}の代わりになるサービスを教えてください`,
    ] : []),
    `日本のGEOトラッキングツールのおすすめは？`,
    `AI検索で出現率を上げる無料ツールは？`,
    `ChatGPTに引用されるか調べるツールはありますか？`,
    `GEO対策ができるSaaSを教えてください`,
    `Perplexityに自社が引用されているか確認する方法は？`,
    `AI検索向けのSEOツールで無料のものはありますか？`,
  ].slice(0, 20);

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
