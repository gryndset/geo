# Geoscope デプロイ手順

## 必要なもの（全部無料）
- GitHubアカウント
- Vercelアカウント（GitHub連携で作成）

---

## 手順（30分で完了）

### 1. GitHubにリポジトリ作成
1. github.com → 右上「+」→「New repository」
2. Repository name: `geoscope`
3. Private でOK
4. 「Create repository」クリック

### 2. ファイルをアップロード
1. 作成したリポジトリを開く
2. 「uploading an existing file」をクリック
3. このフォルダの中身を全部ドラッグ＆ドロップ
4. 「Commit changes」クリック

### 3. Vercelにデプロイ
1. vercel.com → 「Start Deploying」
2. GitHubでログイン
3. 「Import Git Repository」→ geoscope を選択
4. 設定はそのまま → 「Deploy」クリック
5. 2〜3分で完了 → URLが発行される

### 4. 動作確認
- 発行されたURL（例: geoscope.vercel.app）を開く
- ダッシュボードを開く
- APIキーを設定してスキャン実行

---

## APIキーの取得先

| AI | 取得URL | 無料枠 |
|---|---|---|
| Perplexity | perplexity.ai/settings/api | $5クレジット |
| OpenAI | platform.openai.com/api-keys | $5クレジット |
| Gemini | aistudio.google.com/app/apikey | 1500回/日 |
| Claude | console.anthropic.com/settings/keys | $5クレジット |

---

## ファイル構成

```
geoscope/
├── index.html          # LP
├── dashboard.html      # メイン機能
├── pricing.html        # 料金
├── faq-clean.html      # FAQ
├── geo-article.html    # GEO対策記事
├── geo-research-2026.html  # 市場レポート
├── support.html        # サポート
├── api/
│   └── scan/
│       └── index.js    # バックエンド（スキャン処理）
├── vercel.json         # Vercel設定
├── package.json
├── sitemap.xml
├── robots.txt
└── llms.txt            # AIクローラー向け
```
