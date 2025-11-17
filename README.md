# sor-public

**Project:** School of Ranch — Web Application (public repository)

**Short description:** A responsive React + Vite dashboard using Supabase which syncs event/registration data and uses AI-assisted planning via an OpenAI integration. Built for School of Ranch to provide users with a more integrated and seemless experience with workshops and account information.

**Why this project matters**
- **Technical breadth:** Frontend (React, TypeScript, Vite, Tailwind-friendly CSS), backend edge functions (Deno + Supabase), and integrations with external APIs (RegFox/WebConnex, OpenAI).
- **Product impact:** Automates sync of user signups and registrations, also provides AI assisted planning features for in-workshop demonstration and assistance on larger user scales.
- **Engineering practices:** Environment-driven secrets, modular components, and CI-friendly build scripts.

**Key Features**
- **Admin dashboard:** Manage planners, forms, and registrants from a modern React UI (`src/pages/*`, `src/components/*`).
- **Supabase Edge Functions:** Background syncs and AI-assisted endpoints live in `supabase/functions/*` (they read secrets from env with `Deno.env.get(...)`).
- **RegFox/WebConnex integration:** Periodic fetch & upsert of open forms and registrants.
- **OpenAI integration:** Planner uses OpenAI Responses API to generate and refine question sets.

**Tech Stack**
- **Frontend:** React (TypeScript), Vite, Tailwind-compatible CSS.
- **Backend / Edge:** Supabase Edge Functions (Deno + `@supabase/supabase-js`).
- **Integrations:** OpenAI Responses API.
- **CI / Build:** `npm` scripts with `vite`, `tsc`, and `eslint`.

**Architecture**
- **Browser UI:** React app served by Vite during development, built for static hosting in production.
- **Edge functions:** Deployed to Supabase — handle scheduled syncs and AI calls; they connect to Supabase using the service-role key (supplied via env).
- **Database:** Postgres managed by Supabase with row-level security; edge functions use a service-role key for privileged ops.

**Run locally (Windows PowerShell)**
- Install dependencies and run dev server:

```powershell
npm install
npm run dev
```

- Build and preview production bundle:

```powershell
npm run build
npm run preview
```

**Environment for local dev**
- Copy `env.example` (recommended) or create `.env.local` with values for:

```
OPENAI_API_KEY=your_openai_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=some_random_secret
```