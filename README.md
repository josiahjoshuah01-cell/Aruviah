# Aruviah

A Next.js 15 e-commerce MVP with Supabase, PayPal Checkout, and CJ Dropshipping integration stub.

## Tech stack

- **Next.js 15** App Router + React 19 + TypeScript
- **Supabase** — database, auth (email/password), RLS
- **PayPal Checkout SDK v2** — USD only
- **Tailwind CSS 4** + shadcn/ui + next-themes
- **Zustand** — persisted cart
- **CJ Dropshipping** — stub fulfillment (`lib/cj.ts`)

## Getting started

### 1. Clone and install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/20260101000000_initial_schema.sql` via the SQL Editor
3. Copy your project URL, anon key, and service role key into `.env.local`

### 3. PayPal sandbox

1. Create a sandbox app at [developer.paypal.com](https://developer.paypal.com)
2. Set `NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`

### 4. Seed catalog

```bash
npm run seed
```

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add all env vars from `.env.example`
4. Set `NEXT_PUBLIC_SITE_URL` to your production URL

## Out of scope (v1)

- Multi-currency / non-PayPal payments
- Coupons / discounts
- Star ratings / reviews
- Admin dashboard UI (use Supabase Studio)
- Email receipts (TODO: Resend)
- Faceted filters beyond category + text search

## Design

Aruviah's identity is built around the *stream/current* metaphor — products flow past you rather than sitting in a static hero banner. The signature teal "current" underline animates under search focus, active category pills, and add-to-cart actions.

Color tokens: `--mist`, `--current`, `--stream`, `--sun-glint`, `--coral-pulse`.
