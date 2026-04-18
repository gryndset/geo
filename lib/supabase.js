// lib/supabase.js - Supabaseクライアント共通

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // サーバーサイド用（全権限）
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;       // クライアント用

// サーバーサイド用（APIルート内で使う）
export function createServerClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL または SUPABASE_SERVICE_KEY が未設定です');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ユーザーのJWTを検証してuserを返す
export async function getUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// APIルートの認証ミドルウェア
export async function requireAuth(req, res) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'ログインが必要です' });
    return null;
  }
  return user;
}

// プラン制限チェック
export async function checkPlanLimit(supabase, userId, resource) {
  const { data: profile } = await supabase
    .from('profiles').select('plan').eq('id', userId).single();
  const plan = profile?.plan || 'free';

  const limits = {
    free:     { brands: 1, scans_per_day: 1, competitors: 2, prompts: 0, alerts: 1 },
    pro:      { brands: 5, scans_per_day: 5, competitors: 10, prompts: 20, alerts: 10 },
    business: { brands: 999, scans_per_day: 999, competitors: 999, prompts: 999, alerts: 999 },
  };

  return { plan, limits: limits[plan], limit: limits[plan][resource] };
}

// CORS ヘッダー
// B-09修正: デフォルトを '*' ではなく SITE_URL に変更
export function setCors(res) {
  const origin = process.env.ALLOWED_ORIGIN || process.env.SITE_URL || 'https://geoscope.jp';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
