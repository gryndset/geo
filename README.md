# Geoscope — GEOトラッキングSaaS

AI検索（ChatGPT・Perplexity・Gemini・Claude）でのブランド出現率をリアルタイム計測するSaaS。

## 技術スタック
- フロントエンド: Vanilla HTML/CSS/JS（フレームワークなし）
- バックエンド: Vercel Serverless Functions (Node.js ESM)
- DB・認証: Supabase (PostgreSQL + Auth)
- メール: Resend
- ホスティング: Vercel

## ファイル構成
```
geoscope/
├── index.html              LP
├── dashboard.html          メインダッシュボード
├── brands.html             ブランド管理
├── alerts.html             アラート管理
├── settings.html           設定（プロフィール・APIキー・テーマ・エクスポート）
├── share.html              共有公開ページ
├── admin.html              管理者ダッシュボード
├── login.html              ログイン
├── signup.html             新規登録
├── reset-password.html     パスワードリセット
├── pricing.html            料金
├── faq-clean.html          FAQ（36問・Schema.org）
├── geo-article.html        GEO対策記事
├── geo-research-2026.html  市場調査レポート
├── support.html            サポート
├── 404.html                404ページ
├── gs-client.js            フロントエンド共通ライブラリ
├── themes.js               テーマ切り替え（5種類）
├── api/
│   ├── scan/index.js       スキャン処理（4AI横断）
│   ├── auth/index.js       認証（signup/login/logout/me）
│   ├── brands/index.js     ブランドCRUD
│   ├── alerts/index.js     アラート管理
│   ├── export/index.js     CSV/JSONエクスポート
│   ├── share/index.js      共有URL生成・表示
│   ├── cron/index.js       週次自動スキャン（Vercel Cron）
│   ├── contact/index.js    お問い合わせメール
│   ├── report/index.js     スキャン完了・週次レポートメール
│   └── admin/index.js      管理者機能・カスタムプロンプト
├── lib/
│   └── supabase.js         Supabaseクライアント共通
├── db/
│   └── schema.sql          DBスキーマ（RLS・トリガー・インデックス含む）
├── vercel.json             Vercel設定（Cron・ルーティング・ヘッダー）
├── package.json
├── sitemap.xml
├── robots.txt
└── llms.txt
```

## デプロイ手順（30分）

### 1. Supabaseセットアップ
1. supabase.com → 新規プロジェクト作成
2. SQL Editorで `db/schema.sql` を実行
3. Project Settings → API から URL・anon key・service key をメモ

### 2. Resendセットアップ（メール）
1. resend.com → 無料登録
2. ドメイン認証 or resend.devドメインで即使用可
3. APIキーをメモ

### 3. GitHubにアップロード
1. github.com → New repository → `geoscope`
2. ファイルを全部アップロード or git push

### 4. Vercelにデプロイ
1. vercel.com → Import → geoscope
2. Environment Variables に以下を追加：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `RESEND_API_KEY`
   - `CONTACT_TO_EMAIL` （問い合わせ受信先メール）
   - `CRON_SECRET` （任意のランダム文字列）
   - `SITE_URL` （例: https://geoscope.vercel.app）
   - `ADMIN_EMAIL` （管理者メール）
3. Deploy → 完了

### 5. 動作確認
- `/signup.html` でアカウント作成
- `/dashboard.html` でAPIキーを設定してスキャン実行

## APIキー取得先
| AI | URL | 無料枠 |
|---|---|---|
| Perplexity | perplexity.ai/settings/api | $5クレジット |
| OpenAI | platform.openai.com/api-keys | $5クレジット |
| Gemini | aistudio.google.com/app/apikey | 1500回/日 |
| Anthropic | console.anthropic.com/settings/keys | $5クレジット |
