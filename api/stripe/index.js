// api/stripe/index.js - Stripe決済API

import { setCors, createServerClient, requireAuth } from '../../lib/supabase.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SITE_URL = process.env.SITE_URL || 'https://geoscope.jp';

// Stripe価格ID（Stripeダッシュボードで作成後に設定）
const PRICE_IDS = {
  pro_monthly:      process.env.STRIPE_PRICE_PRO_MONTHLY,
  business_monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  // Webhookだけ認証不要
  if (action === 'webhook') return await handleWebhook(req, res);

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    switch (action) {
      case 'create_checkout': return await createCheckout(req, res, user);
      case 'create_portal':   return await createPortal(req, res, user);
      case 'status':          return await getStatus(req, res, user);
      default:
        return res.status(400).json({ error: `不明なアクション: ${action}` });
    }
  } catch (e) {
    console.error('Stripe error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ===== Stripe API共通呼び出し =====
async function stripeRequest(path, method = 'GET', body = null) {
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEYが未設定です');
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) {
    opts.body = new URLSearchParams(body).toString();
  }
  const resp = await fetch(`https://api.stripe.com/v1${path}`, opts);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Stripeエラー');
  return data;
}

// ===== チェックアウトセッション作成 =====
async function createCheckout(req, res, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const { plan } = req.body || {};

  const priceId = PRICE_IDS[`${plan}_monthly`];
  if (!priceId) return res.status(400).json({ error: '無効なプランです' });

  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id, email').eq('id', user.id).single();

  // Stripeカスタマー取得 or 作成
  let customerId = profile?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripeRequest('/customers', 'POST', {
      email: profile?.email || user.email,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  // チェックアウトセッション作成
  const session = await stripeRequest('/checkout/sessions', 'POST', {
    customer: customerId,
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${SITE_URL}/settings.html?upgraded=1`,
    cancel_url: `${SITE_URL}/pricing.html?canceled=1`,
    'subscription_data[metadata][user_id]': user.id,
    'subscription_data[metadata][plan]': plan,
    allow_promotion_codes: 'true',
    locale: 'ja',
  });

  return res.status(200).json({ url: session.url });
}

// ===== カスタマーポータル（プラン変更・解約） =====
async function createPortal(req, res, user) {
  if (req.method !== 'POST') return res.status(405).end();
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles').select('stripe_customer_id').eq('id', user.id).single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'サブスクリプションがありません' });
  }

  const session = await stripeRequest('/billing_portal/sessions', 'POST', {
    customer: profile.stripe_customer_id,
    return_url: `${SITE_URL}/settings.html`,
  });

  return res.status(200).json({ url: session.url });
}

// ===== 現在のサブスク状態取得 =====
async function getStatus(req, res, user) {
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles').select('plan, stripe_customer_id').eq('id', user.id).single();

  return res.status(200).json({
    plan: profile?.plan || 'free',
    has_subscription: !!profile?.stripe_customer_id,
  });
}

// ===== Webhook（Stripeからの通知） =====
async function handleWebhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  // 署名検証（本番環境では必須）
  // B-02修正: STRIPE_WEBHOOK_SECRET未設定時は400を返す（スキップしない）
  if (!STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'STRIPE_WEBHOOK_SECRETが未設定です' });
  }
  if (!sig) {
    return res.status(400).json({ error: 'stripe-signatureヘッダーがありません' });
  }

  let event;
  try {
    event = verifyWebhookSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: `Webhook署名エラー: ${e.message}` });
  }

  const supabase = createServerClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.user_id || session.subscription_data?.metadata?.user_id;
      const plan = session.metadata?.plan || 'pro';
      if (userId) {
        await supabase.from('profiles').update({ plan }).eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        const plan = sub.status === 'active'
          ? (sub.metadata?.plan || 'pro')
          : 'free';
        await supabase.from('profiles').update({ plan }).eq('id', userId);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId);
      }
      break;
    }

    case 'invoice.payment_failed': {
      // 支払い失敗時はメール通知のみ（プランは維持・猶予期間あり）
      console.error('Payment failed:', event.data.object.customer);
      break;
    }
  }

  return res.status(200).json({ received: true });
}

// HMAC-SHA256署名検証（Stripe公式アルゴリズム）
// B-01修正: 同期関数内でawait importは使えないため、require('crypto')を使用
import crypto from 'crypto';

function verifyWebhookSignature(payload, sig, secret) {
  const parts = sig.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('署名形式が不正です');

  // タイムスタンプ検証（5分以内）
  const tolerance = 300;
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > tolerance) {
    throw new Error('Webhookのタイムスタンプが古すぎます');
  }

  // HMAC検証（Node.js crypto使用）
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (expected !== signature) throw new Error('署名が一致しません');

  return JSON.parse(payload);
}
