# Conectachat — AI-powered customer service platform

Automate 80% of customer conversations with an AI agent trained on your business content. Deploy across WhatsApp, Instagram, Facebook, Slack and your own website.

```
monorepo/
├── src/              # Node.js + Express backend  → Railway
├── dashboard/        # Next.js 14 dashboard       → Vercel
├── widget/           # Vanilla JS embeddable chat → Vercel CDN
└── hostinger/        # Static landing page        → Hostinger FTP
```

---

## Part 1 — Backend on Railway

### Prerequisites
```bash
npm install -g @railway/cli
railway login
```

### Deploy
```bash
cd ~/conectachat

# Link to a new Railway project (first time)
railway init

# Set every env variable listed in "Environment variables" below
railway variables set NODE_ENV=production
railway variables set SUPABASE_URL=https://oxlhmndvpogpdjutfxzr.supabase.co
railway variables set SUPABASE_SERVICE_ROLE_KEY=eyJ...
# ... (repeat for every variable in the list below)

# Deploy
railway up
```

Railway auto-detects `Procfile` (`web: node src/index.js`) and runs the healthcheck at `/health`.

### Custom domain
In Railway → Settings → Domains, add `api.conectachat.com` and copy the CNAME value to Hostinger DNS.

---

## Part 2 — Dashboard on Vercel

### Prerequisites
```bash
npm install -g vercel
vercel login
```

### Deploy
```bash
cd ~/conectachat/dashboard

# First deploy (creates project)
vercel

# Follow prompts:
#   Set up and deploy? Yes
#   Which scope? <your account>
#   Link to existing project? No
#   Project name: conectachat-dashboard
#   Directory: ./   (already in dashboard/)
#   Override build settings? No

# Production deploy
vercel --prod
```

### Environment variables (set in Vercel dashboard → Settings → Environment Variables)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oxlhmndvpogpdjutfxzr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon key) |
| `NEXT_PUBLIC_API_URL` | `https://api.conectachat.com` |
| `NEXT_PUBLIC_WIDGET_URL` | `https://cdn.conectachat.com/dist/widget.min.js` |

### Custom domain
In Vercel → Domains, add `app.conectachat.com`.

---

## Part 3 — Widget CDN on Vercel

### Build widget first
```bash
cd ~/conectachat/widget
npm run build          # outputs dist/widget.min.js
```

### Deploy
```bash
cd ~/conectachat/widget
vercel --prod
```

Set custom domain `cdn.conectachat.com` in Vercel → Domains.

`dist/widget.min.js` is served with:
- `Cache-Control: public, max-age=31536000, immutable`
- `Access-Control-Allow-Origin: *`

### Embed on any website
```html
<script src="https://cdn.conectachat.com/dist/widget.min.js"></script>
<script>
  ConectachatWidget.init({
    apiKey:         'cc_your_api_key_here',
    agentName:      'Asistente IA',
    welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
    primaryColor:   '#6366f1',
    position:       'bottom-right',
  });
</script>
```

---

## Part 4 — Landing page on Hostinger

1. Log in to Hostinger → File Manager (or use FTP)
2. Navigate to `public_html/`
3. Upload `hostinger/index.html` → rename to `index.html`
4. Done — `conectachat.com` now serves the landing page

---

## Part 5 — DNS configuration (Hostinger)

Go to **Hostinger → DNS Zone** and add:

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `api` | `<Railway provided domain>` | 3600 |
| `CNAME` | `app` | `cname.vercel-dns.com` | 3600 |
| `CNAME` | `cdn` | `cname.vercel-dns.com` | 3600 |
| `A` | `@` | Hostinger IP (auto-set) | 3600 |

> Vercel will verify domain ownership automatically once the CNAME resolves.

---

## Environment variables — Backend (Railway)

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Set automatically by Railway |
| `SUPABASE_URL` | `https://oxlhmndvpogpdjutfxzr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `OPENAI_API_KEY` | `sk-proj-...` (for embeddings) |
| `META_APP_SECRET` | Meta App secret (HMAC verification) |
| `META_VERIFY_TOKEN` | Global fallback verify token |
| `SLACK_SIGNING_SECRET` | Global fallback Slack signing secret |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from Stripe dashboard) |
| `STRIPE_STARTER_PRICE_ID` | Stripe price ID for Starter plan |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan |
| `FRONTEND_URL` | `https://app.conectachat.com` |

---

## Local development

```bash
# Backend
cd ~/conectachat
cp .env.example .env   # fill in your keys
npm install
npm run dev            # http://localhost:3000

# Dashboard
cd ~/conectachat/dashboard
cp .env.production.example .env.local   # fill in keys
npm install
npm run dev            # http://localhost:3001

# Widget (watch mode)
cd ~/conectachat/widget
npm install
npm run dev            # rebuilds on file change
```

---

## API overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Healthcheck |
| `POST` | `/api/messages/chat` | API key | Widget chat endpoint |
| `GET` | `/api/agents` | JWT | List agents |
| `POST` | `/api/agents` | JWT owner/admin | Create agent |
| `GET` | `/api/channels` | JWT | List channels |
| `POST` | `/api/channels/:id/meta/connect` | JWT owner/admin | Connect Instagram/Facebook |
| `POST` | `/api/channels/:id/slack/connect` | JWT owner/admin | Connect Slack |
| `GET` | `/api/webhooks/meta` | HMAC | Meta webhook handshake |
| `POST` | `/api/webhooks/meta` | HMAC | Instagram + Facebook events |
| `POST` | `/api/webhooks/whatsapp` | HMAC | WhatsApp events |
| `POST` | `/api/webhooks/slack` | HMAC | Slack events |
| `POST` | `/api/billing/checkout` | JWT | Create Stripe checkout |
| `GET` | `/api/billing/subscription` | JWT | Current plan |

Full reference: `src/routes/`

---

## Tech stack

| Layer | Technology |
|---|---|
| AI | Claude claude-sonnet-4-6 (Anthropic) + prompt caching |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Vector search | Supabase pgvector + ivfflat cosine index |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Backend | Node.js 18+ · Express 4 · Zod · Helmet |
| Dashboard | Next.js 14 App Router · Tailwind · shadcn/ui |
| Widget | Vanilla JS · esbuild · 5.3 KB gzipped |
| Payments | Stripe subscriptions + webhooks |
| Hosting | Railway · Vercel · Hostinger |
