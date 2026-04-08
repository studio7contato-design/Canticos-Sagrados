console.log("[SERVER] BOOTSTRAP: Carregando server.ts...");
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializa Supabase Admin (necessário para ignorar RLS no webhook)
let supabaseAdmin: any = null;
try {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (supabaseUrl && supabaseServiceKey && supabaseUrl.startsWith('http')) {
    try {
      // Basic URL validation
      new URL(supabaseUrl);
      supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      console.log("[SERVER] Supabase Admin inicializado com sucesso");
    } catch (urlErr) {
      console.error("[SERVER] URL do Supabase inválida:", supabaseUrl);
    }
  } else {
    console.warn("[SERVER] Supabase Admin não inicializado: URL ou Key ausentes/inválidos");
  }
} catch (err) {
  console.error("[SERVER] Erro fatal ao inicializar Supabase Admin:", err);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Root Logger to see ALL incoming requests
  app.use((req, res, next) => {
    console.log(`[ROOT] ${req.method} ${req.url}`);
    next();
  });

  // API Routes using Router
  const apiRouter = express.Router();

  // JSON Body Parser for API routes (except webhook which uses raw)
  // We'll define routes first, then mount the router
  
  // Health check
  apiRouter.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      supabase: supabaseAdmin ? "connected" : "not_connected",
      stripe: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured"
    });
  });

  // Stripe Webhook (needs raw body)
  apiRouter.post("/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    console.log(`[WEBHOOK] Recebido: ${req.method} ${req.url}`);
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).send("Stripe secret key not configured");
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    let event;

    try {
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const userEmail = session.customer_details?.email;

      console.log(`[WEBHOOK] PAGAMENTO APROVADO: Usuário=${userId}, Email=${userEmail}`);

      if (userId && supabaseAdmin) {
        const updateData: any = { 
          is_pro: true, 
          updated_at: new Date().toISOString() 
        };
        
        if (userEmail) {
          updateData.email = userEmail;
        }

        const { data, error } = await supabaseAdmin
          .from('profiles')
          .update(updateData)
          .eq('id', userId)
          .select();

        if (error) {
          console.error("[WEBHOOK] Erro ao atualizar perfil no Supabase:", error.message);
        } else {
          console.log(`[WEBHOOK] USUÁRIO LIBERADO COM SUCESSO NO SUPABASE:`, data);
        }
      }
    }

    res.json({ received: true });
  });

  // JSON Body Parser for remaining API routes
  apiRouter.use(express.json());

  // Log all API requests
  apiRouter.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`, req.body);
    next();
  });

  // Stripe Checkout Session Endpoint
  apiRouter.post("/create-checkout-session", async (req, res) => {
    console.log("[API] Recebendo pedido de checkout para:", req.body.userId);
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const { userId } = req.body;
    
    if (!secretKey) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY não configurada no servidor" });
    }

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    const stripeClient = new Stripe(secretKey);
    const priceId = process.env.STRIPE_PRICE_ID;

    if (!priceId || priceId.includes('seu_id_de_preco')) {
      return res.status(500).json({ error: "Configuração de pagamento incompleta (STRIPE_PRICE_ID ausente ou inválido)" });
    }

    try {
      const origin = req.headers.origin || 'http://localhost:3000';
      
      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ["card"],
        client_reference_id: userId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${origin}/?success=true`,
        cancel_url: `${origin}/?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('[API] ERRO NO STRIPE:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint para inicializar perfil (usa Supabase Admin para ignorar RLS)
  apiRouter.post("/init-profile", async (req, res) => {
    const { userId, email } = req.body;

    if (!supabaseAdmin) {
      return res.status(500).json({ error: "Supabase Admin não configurado no servidor" });
    }

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    try {
      console.log(`[API] Inicializando perfil para: ${userId} (${email || 'sem email'})`);
      
      // Tenta buscar primeiro
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (existing) {
        // Se o perfil existe mas o e-mail está faltando ou é diferente, atualizamos
        if (email && existing.email !== email) {
          console.log("[API] Sincronizando e-mail em perfil existente...");
          const { data: updated } = await supabaseAdmin
            .from('profiles')
            .update({ email: email })
            .eq('id', userId)
            .select()
            .single();
          return res.json({ status: "updated", profile: updated || existing });
        }
        return res.json({ status: "exists", profile: existing });
      }

      // Se não existe, cria do zero
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .insert([{ id: userId, email: email, is_pro: false }])
        .select()
        .single();

      if (error) {
        console.error("[API] Erro ao criar perfil:", error.message);
        return res.status(500).json({ error: error.message });
      }

      console.log("[API] Perfil criado com sucesso via Admin");
      res.json({ status: "created", profile: data });
    } catch (err: any) {
      console.error("[API] Erro fatal no init-profile:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Callback para OAuth (Google Login) via Popup
  apiRouter.get("/auth-callback", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Autenticando - Rádio Música Celeste</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9f9f9; color: #333; }
            .card { background: white; padding: 2rem; border-radius: 1rem; shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
            .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #ff3b30; border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <p><strong>Autenticação concluída!</strong></p>
            <p style="font-size: 13px; color: #666;">Sincronizando sua conta... Esta janela fechará automaticamente.</p>
          </div>
          <script>
            // Envia os tokens de volta para a janela principal (App)
            const hash = window.location.hash;
            const search = window.location.search;
            
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'SUPABASE_AUTH_SUCCESS', 
                hash: hash,
                search: search
              }, window.location.origin);
              
              // Fecha a janela após um pequeno delay para garantir o envio
              setTimeout(() => window.close(), 1000);
            } else {
              // Fallback caso não tenha opener
              window.location.href = '/';
            }
          </script>
        </body>
      </html>
    `);
  });

  // Catch-all for undefined API routes
  apiRouter.all("*", (req, res) => {
    res.status(404).json({ error: `Rota API não encontrada: ${req.method} ${req.url}` });
  });

  // Mount API Router
  app.use("/api", apiRouter);

  app.get("/api/test-direct", (req, res) => {
    res.json({ message: "Direct Express Route OK" });
  });

  console.log("[SERVER] Iniciando servidor...");

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback for SPA in dev mode
    app.get('*', async (req, res, next) => {
      if (req.url.startsWith('/api')) return next();
      try {
        const html = await vite.transformIndexHtml(req.url, `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <link rel="icon" type="image/svg+xml" href="/vite.svg" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Rádio Música Celeste</title>
            </head>
            <body>
              <div id="root"></div>
              <script type="module" src="/src/main.tsx"></script>
            </body>
          </html>
        `);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
