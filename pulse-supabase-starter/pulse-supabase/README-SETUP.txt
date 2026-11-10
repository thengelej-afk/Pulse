PULSE + SUPABASE: SETUP GUIDE

1) Create a free project at https://supabase.com.
2) In Supabase, open SQL Editor > New query. Paste all of supabase/setup.sql and click Run.
3) In Supabase, open Project Settings > API (or Data API / API Keys depending on dashboard layout).
   Copy the Project URL and the anon/public or publishable key. Do NOT use the service_role or secret key.
4) Open java/app.js. Replace:
   YOUR_SUPABASE_PROJECT_URL
   YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
   with your own values (keep the quotation marks).
5) In Supabase Authentication > URL Configuration, add your Live Server URL to Site URL / Redirect URLs.
   For local testing, add http://127.0.0.1:5500/** and http://localhost:5500/** if Live Server uses port 5500.
6) In Authentication > Providers > Email, decide whether to require email confirmation.
   If confirmation is on, users must confirm their email before signing in.
7) In VS Code, open the pulse-supabase folder (File > Open Folder), then right-click html/index.html > Open with Live Server.

Folder structure:
pulse-supabase/
  html/index.html
  css/style.css
  java/app.js
  supabase/setup.sql

This is a starter MVP: email/password accounts, username lookup, private one-to-one chats, persistent messages and realtime incoming messages.
Use HTTPS when deploying. Never put a Supabase service_role/secret key in browser JavaScript.
