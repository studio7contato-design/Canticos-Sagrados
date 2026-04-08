import express, { Router } from "express";
import serverless from "serverless-http";
import Stripe from "stripe";
import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Request logger
app.use((req, res, next) => {
  console.log(`[API REQUEST] ${req.method} ${req.url}`);
  next();
});

const apiRouter = Router();

// Inicializa Supabase Admin
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl) console.error("[API] VITE_SUPABASE_URL is missing");
if (!supabaseServiceKey) console.error("[API] SUPABASE_SERVICE_ROLE_KEY is missing");

const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

if (supabaseAdmin) {
  console.log("[API] Supabase Admin initialized successfully");
} else {
  console.warn("[API] Supabase Admin NOT initialized - Webhooks and Profile Init will fail");
}

let lastWebhookError: string | null = null;
let lastWebhookEvent: string | null = null;

// Health check
apiRouter.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    supabase: supabaseAdmin ? "connected" : "not_connected",
    stripe: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured",
    webhook: process.env.STRIPE_WEBHOOK_SECRET ? "configured" : "not_configured",
    last_webhook: {
      event: lastWebhookEvent,
      error: lastWebhookError
    },
    env: {
      has_supabase_url: !!process.env.VITE_SUPABASE_URL,
      has_supabase_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      webhook_prefix: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 6)
    }
  });
});

// Stripe Webhook
apiRouter.post("/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecret) return res.status(500).send("Stripe secret key not configured");

  const stripe = new Stripe(stripeSecret);
  let event;

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      lastWebhookEvent = event.type;
      lastWebhookError = null;
    } else {
      event = JSON.parse(req.body.toString());
      lastWebhookEvent = event.type;
      lastWebhookError = "Warning: No signature validation";
    }
  } catch (err: any) {
    lastWebhookError = err.message;
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const userEmail = session.customer_details?.email;

    console.log(`[WEBHOOK] Checkout concluído. UserID: ${userId}, Email: ${userEmail}`);

    if (supabaseAdmin) {
      let targetUserId = userId;

      // Se o userId não veio no checkout, tenta achar pelo e-mail
      if (!targetUserId && userEmail) {
        console.log(`[WEBHOOK] UserID ausente. Buscando perfil pelo e-mail: ${userEmail}`);
        const { data: profileByEmail } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', userEmail)
          .maybeSingle();
        
        if (profileByEmail) {
          targetUserId = profileByEmail.id;
          console.log(`[WEBHOOK] UserID encontrado via e-mail: ${targetUserId}`);
        }
      }

      if (targetUserId) {
        const updateData: any = { 
          is_pro: true, 
          updated_at: new Date().toISOString() 
        };
        if (userEmail) updateData.email = userEmail;

        console.log(`[WEBHOOK] Atualizando perfil ${targetUserId} para PRO...`);
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', targetUserId);

        if (updateError) {
          console.error(`[WEBHOOK] Erro ao atualizar Supabase:`, updateError.message);
          const { error: insertError } = await supabaseAdmin
            .from('profiles')
            .upsert({ id: targetUserId, ...updateData });
          
          if (insertError) {
            console.error(`[WEBHOOK] Erro fatal no Upsert:`, insertError.message);
          } else {
            console.log(`[WEBHOOK] Perfil criado/atualizado com sucesso via Upsert.`);
          }
        } else {
          console.log(`[WEBHOOK] Perfil atualizado com sucesso para PRO.`);
        }
      } else {
        console.error(`[WEBHOOK] Falha: Não foi possível identificar o usuário (ID: ${userId}, Email: ${userEmail})`);
      }
    } else {
      console.error(`[WEBHOOK] Falha: supabaseAdmin ausente.`);
    }
  }

  res.json({ received: true });
});

apiRouter.use(express.json());

// Stripe Checkout
apiRouter.post("/create-checkout-session", async (req, res) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const { userId } = req.body;
  
  if (!secretKey || !priceId || !userId) {
    return res.status(400).json({ error: "Configuração incompleta ou userId ausente" });
  }

  const stripeClient = new Stripe(secretKey);

  try {
    const origin = req.headers.origin || 'https://canticossagradosmmc.netlify.app';
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ["card"],
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/?success=true`,
      cancel_url: `${origin}/?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync Subscription (Manual Fix)
apiRouter.post("/sync-subscription", async (req, res) => {
  const { userId, email } = req.body;

  if (!supabaseAdmin || !process.env.STRIPE_SECRET_KEY || !userId || !email) {
    return res.status(400).json({ error: "Configuração incompleta ou dados ausentes" });
  }

  try {
    const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    // Busca assinaturas ativas no Stripe para este e-mail
    console.log(`[SYNC] Buscando assinaturas no Stripe para: ${email}`);
    const customers = await stripeClient.customers.list({ email, limit: 1 });
    
    if (customers.data.length === 0) {
      return res.status(404).json({ error: "Nenhum cliente encontrado no Stripe com este e-mail." });
    }

    const customerId = customers.data[0].id;
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length > 0) {
      console.log(`[SYNC] Assinatura ativa encontrada! Atualizando Supabase para ${userId}`);
      
      const { error } = await supabaseAdmin
        .from('profiles')
        .upsert({ 
          id: userId, 
          email, 
          is_pro: true, 
          updated_at: new Date().toISOString() 
        });

      if (error) throw error;
      
      return res.json({ success: true, message: "Assinatura sincronizada com sucesso! Você agora é PRO." });
    } else {
      return res.status(404).json({ error: "Nenhuma assinatura ativa encontrada no Stripe para este e-mail." });
    }
  } catch (err: any) {
    console.error(`[SYNC ERROR]`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Init Profile
apiRouter.post("/init-profile", async (req, res) => {
  const { userId, email } = req.body;

  if (!supabaseAdmin || !userId) {
    const reason = !supabaseAdmin ? "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor" : "userId ausente";
    return res.status(400).json({ error: `Configuração incompleta: ${reason}` });
  }

  try {
    const { data: existing } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).single();

    if (existing) {
      if (email && existing.email !== email) {
        const { data: updated } = await supabaseAdmin.from('profiles').update({ email }).eq('id', userId).select().single();
        return res.json({ status: "updated", profile: updated || existing });
      }
      return res.json({ status: "exists", profile: existing });
    }

    const { data, error } = await supabaseAdmin.from('profiles').insert([{ id: userId, email, is_pro: false }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ status: "created", profile: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auth Callback
apiRouter.get("/auth-callback", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>Autenticando</title><meta charset="utf-8" /></head>
      <body>
        <script>
          const hash = window.location.hash;
          const search = window.location.search;
          if (window.opener) {
            window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS', hash, search }, window.location.origin);
            setTimeout(() => window.close(), 1000);
          } else { window.location.href = '/'; }
        </script>
      </body>
    </html>
  `);
});

// Mount the router on multiple possible base paths for maximum compatibility
app.use("/.netlify/functions/api", apiRouter);
app.use("/api", apiRouter);
app.use("/", apiRouter);

// Catch-all for 404s
app.use((req, res) => {
  console.log(`[API 404] ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "Endpoint não encontrado",
    method: req.method,
    path: req.url,
    suggestion: "Verifique se a rota POST /create-checkout-session está correta."
  });
});

export const handler = serverless(app);
