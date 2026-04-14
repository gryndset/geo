-- ============================================================
-- Geoscope Database Schema
-- Supabase (PostgreSQL)
-- ============================================================

-- ユーザープロフィール（Supabase Authと連携）
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  notify_email TEXT,
  theme TEXT DEFAULT 'dark',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ブランド管理
CREATE TABLE brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8b7cf8',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 競合ブランド（ブランドに紐づく）
CREATE TABLE competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- スキャン結果
CREATE TABLE scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  brand_name TEXT NOT NULL,
  avg_rate INTEGER NOT NULL DEFAULT 0,
  rate_chatgpt INTEGER,
  rate_perplexity INTEGER,
  rate_gemini INTEGER,
  rate_claude INTEGER,
  total_citations INTEGER DEFAULT 0,
  raw_data JSONB,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);

-- 引用URL
CREATE TABLE citations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  ai_source TEXT DEFAULT 'perplexity'
);

-- アラート設定
CREATE TABLE alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rate_drop', 'rate_rise', 'new_citation', 'competitor_overtake')),
  threshold INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- アラート発火履歴
CREATE TABLE alert_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE NOT NULL,
  scan_id UUID REFERENCES scans(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  fired_at TIMESTAMPTZ DEFAULT NOW()
);

-- 共有URL
CREATE TABLE shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  is_public BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- カスタムプロンプト
CREATE TABLE custom_prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 週次スキャンスケジュール
CREATE TABLE scan_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly')),
  day_of_week INTEGER DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6),
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_schedules ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "自分のプロフィールのみ" ON profiles FOR ALL USING (auth.uid() = id);

-- brands
CREATE POLICY "自分のブランドのみ" ON brands FOR ALL USING (auth.uid() = user_id);

-- competitors
CREATE POLICY "自分のブランドの競合のみ" ON competitors FOR ALL
  USING (brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid()));

-- scans
CREATE POLICY "自分のスキャンのみ" ON scans FOR ALL USING (auth.uid() = user_id);

-- citations
CREATE POLICY "自分のスキャンの引用のみ" ON citations FOR ALL
  USING (scan_id IN (SELECT id FROM scans WHERE user_id = auth.uid()));

-- alerts
CREATE POLICY "自分のアラートのみ" ON alerts FOR ALL USING (auth.uid() = user_id);

-- alert_logs
CREATE POLICY "自分のアラートログのみ" ON alert_logs FOR ALL
  USING (alert_id IN (SELECT id FROM alerts WHERE user_id = auth.uid()));

-- shares（公開共有は全員読める）
CREATE POLICY "共有は全員読める" ON shares FOR SELECT USING (is_public = true);
CREATE POLICY "自分の共有のみ管理" ON shares FOR ALL USING (auth.uid() = user_id);

-- custom_prompts
CREATE POLICY "自分のプロンプトのみ" ON custom_prompts FOR ALL USING (auth.uid() = user_id);

-- scan_schedules
CREATE POLICY "自分のスケジュールのみ" ON scan_schedules FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Functions & Triggers
-- ============================================================

-- 新規ユーザー登録時にprofileを自動作成
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_atを自動更新
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_scans_user_id ON scans(user_id);
CREATE INDEX idx_scans_brand_id ON scans(brand_id);
CREATE INDEX idx_scans_scanned_at ON scans(scanned_at DESC);
CREATE INDEX idx_citations_scan_id ON citations(scan_id);
CREATE INDEX idx_brands_user_id ON brands(user_id);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_shares_slug ON shares(slug);
CREATE INDEX idx_schedules_next_run ON scan_schedules(next_run_at) WHERE is_active = true;

-- ============================================================
-- user_api_keys テーブル（APIキーのサーバーサイド保存）
-- ============================================================
CREATE TABLE user_api_keys (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  perplexity TEXT,
  openai TEXT,
  gemini TEXT,
  anthropic TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "自分のAPIキーのみ" ON user_api_keys FOR ALL USING (auth.uid() = user_id);
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON user_api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
