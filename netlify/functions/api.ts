import express, { Router } from "express";
import serverless from "serverless-http";
import Stripe from "stripe";
import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";

dotenv.config();

const app = express();
const apiRouter = Router();

// Inicializa Supabase Admin
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Health check
apiRouter.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    supabase: supabaseAdmin ? "connected" : "not_connected",
    stripe: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured"
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
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const userEmail = session.customer_details?.email;

    if (userId && supabaseAdmin) {
      const updateData: any = { is_pro: true, updated_at: new Date().toISOString() };
      if (userEmail) updateData.email = userEmail;

      await supabaseAdmin.from('profiles').update(updateData).eq('id', userId);
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

// Init Profile
apiRouter.post("/init-profile", async (req, res) => {
  const { userId, email } = req.body;

  if (!supabaseAdmin || !userId) {
    return res.status(400).json({ error: "Configuração incompleta ou userId ausente" });
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

// Mount the router at both the root and the expected Netlify path for maximum compatibility
app.use("/api", apiRouter);
app.use("/.netlify/functions/api", apiRouter);
app.use("/", apiRouter);

export const handler = serverless(app);
