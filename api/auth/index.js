// api/auth/index.js - 認証エンドポイント

import { createClient } from '@supabase/supabase-js';
import { setCors, createServerClient, requireAuth } from '../../lib/supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    switch (action) {
      case 'signup':   return await signup(req, res);
      case 'login':    return await login(req, res);
      case 'logout':   return await logout(req, res);
      case 'me':       return await getMe(req, res);
      case 'update':   return await updateProfile(req, res);
      case 'reset':    return await resetPassword(req, res);
      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== サインアップ =====
async function signup(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'メールとパスワードが必要です' });
  if (password.length < 8) return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name || email.split('@')[0] } },
  });
  if (error) return res.status(400).json({ error: error.message });

  // profileのdisplay_nameを更新
  if (data.user && name) {
    const admin = createServerClient();
    await admin.from('profiles').update({ display_name: name }).eq('id', data.user.id);
  }

  return res.status(200).json({
    user: { id: data.user?.id, email: data.user?.email },
    session: data.session,
    message: '確認メールを送信しました',
  });
}

// ===== ログイン =====
async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'メールとパスワードが必要です' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'メールまたはパスワードが正しくありません' });

  // profileも一緒に返す
  const admin = createServerClient();
  const { data: profile } = await admin.from('profiles').select('*').eq('id', data.user.id).single();

  return res.status(200).json({
    user: data.user,
    session: data.session,
    profile,
  });
}

// ===== ログアウト =====
async function logout(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(200).json({ ok: true });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await supabase.auth.admin.signOut(token).catch(() => {});
  return res.status(200).json({ ok: true });
}

// ===== 自分の情報取得 =====
async function getMe(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'ログインが必要です' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: '無効なセッションです' });

  const admin = createServerClient();
  const { data: profile } = await admin.from('profiles').select('*').eq('id', user.id).single();

  // ブランド数・スキャン数も返す
  const { count: brandCount } = await admin.from('brands').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
  const { count: scanCount } = await admin.from('scans').select('*', { count: 'exact', head: true }).eq('user_id', user.id);

  return res.status(200).json({ user, profile, stats: { brands: brandCount, scans: scanCount } });
}

// ===== プロフィール更新 =====
async function updateProfile(req, res) {
  if (req.method !== 'PUT') return res.status(405).end();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'ログインが必要です' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: '認証エラー' });

  const { display_name, notify_email, theme } = req.body || {};
  const updates = {};
  if (display_name !== undefined) updates.display_name = display_name;
  if (notify_email !== undefined) updates.notify_email = notify_email;
  if (theme !== undefined) updates.theme = theme;

  const admin = createServerClient();
  const { data, error } = await admin.from('profiles').update(updates).eq('id', user.id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ profile: data });
}

// ===== パスワードリセット =====
async function resetPassword(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'メールアドレスが必要です' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.SITE_URL || 'https://geoscope.jp'}/reset-password.html`,
  });
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ message: 'パスワードリセットメールを送信しました' });
}
