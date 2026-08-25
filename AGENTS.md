<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Database Migrations Rule
- ALWAYS record any database schema, Row-Level Security (RLS) policy (e.g. CREATE/DROP/ALTER POLICY), function, trigger, extension, or data changes into timestamped migration SQL files inside `supabase/migrations/`.
- Every migration file should be timestamped (e.g. `YYYYMMDDHHMMSS_description.sql`) so that all changes applied during testing/development can be executed directly on the main/production database later.


