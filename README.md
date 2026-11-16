# Pakka: Family Habit Tracker

Habits jo pakki hon. Family ke saath.

A private, gamified habit tracker PWA for a close circle of family and friends:
accountability partners, fair "Saza Cards", shared group tasks, group chat with
stickers and reactions, achievements, weekly leaderboard and push notifications.

- Frontend: React + Vite PWA (`src/`), deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`
- Backend: Supabase (Postgres + RLS, Auth with Google, Storage, Realtime, Edge Function `push`)
- Database migrations: `supabase/migrations/` (local tests in `supabase/test/`)

The values in `.env.production` are public by design (Supabase publishable key, VAPID public key).
All private keys live in Supabase Vault, never in this repo.
