# PROJECT2-SEC-1-SUPERIDOL-BE

Standalone Math Raining backend: Elysia + TypeScript + Bun + Prisma ORM + PostgreSQL.
The Vue frontend lives separately in the math-raining repository.

## Setup

Requires Bun 1.3+ and PostgreSQL.

```powershell
bun install --frozen-lockfile
Copy-Item .env.example .env
# Set DATABASE_URL in .env to your own PostgreSQL connection.
bun run db:generate
bun run db:migrate
bun run dev
```

API: http://localhost:5000. Set the frontend's VITE_BASE_URL to this API origin.
Configure CORS_ORIGINS with exact frontend origins separated by commas.
Database credentials belong only in .env or hosting secret environment variables.
Never publish .env or use a VITE_ prefix for database secrets.

The supplied database contains unrelated tables in public. Game tables use the
math_raining schema via DATABASE_URL's schema=math_raining parameter. If the URL
already has ?sslmode=require, append &schema=math_raining. Do not reset the shared
database. Committed migrations create the game tables without deleting existing tables.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /health | Database readiness (200/503) |
| POST | /auth/register | {email,password,userName}; account and profile created atomically |
| POST | /auth/login | {email,password}; returns {token,user} |
| POST | /auth/logout | Revoke current session |
| GET | /usersProfile?_page=1&_per_page=5&_sort=-rankingHighScore | Public leaderboard |
| GET | /usersProfile/:id | Read own full profile |
| PATCH / PUT | /usersProfile/:id | Update supplied profile fields |
| DELETE | /users/:id | Delete own account, profile and sessions |

Protected routes require Authorization: Bearer <token>. Tokens expire after seven
days and are stored as SHA-256 hashes. Passwords use Argon2id. PostgreSQL enforces
unique normalized email addresses. Registration requires 8-128 password characters;
login supports imported legacy passwords. Invalid input returns 422, duplicate
email 409, missing session 401 and another user's ID 403. Login throttling is per
email and per server process; multi-instance hosting needs a shared limiter.

Leaderboard responses contain {data,items,pages,first,prev,next,last}; each entry
contains only ID, username and high score. Profile arrays retain eight game levels.
profileConfig contains volumes from 0-100 and three badge IDs. Custom mode endScore
uses null for unlimited games. The legacy descrition field spelling is preserved.
PUT and PATCH update supplied fields and retain omitted fields. High scores cannot
decrease. Scores and achievements are still calculated by the existing frontend;
this backend does not implement server-authoritative scoring or anti-cheat checks.

## Optional legacy import

```powershell
bun run db:import C:/path/to/math-raining/data/db.json
```

Supply an explicit JSON path from the separate frontend repository. Import never
runs automatically. It hashes passwords, preserves IDs and progress, and skips
existing IDs or duplicate normalized emails without overwriting records. For
duplicate emails, the first account is imported and later duplicates are reported
by ID and skipped. Resolve duplicates in a private JSON copy to retain all accounts.

## Tests

```powershell
bun run typecheck
bun run test
# Optional integration suite; use a dedicated test database in CI:
$env:RUN_DB_TESTS = '1'
bun run test
Remove-Item Env:RUN_DB_TESTS
```

Integration tests create temporary users and clean them up. They cover readiness,
registration, hashing, unique emails, sessions, ownership, profile/settings/results,
achievements, custom modes, high scores, pagination and cascade deletion.

## Deployment

Set DATABASE_URL, PORT and CORS_ORIGINS on the host. Run bun install --frozen-lockfile,
bun run db:generate, bun run db:migrate, then bun run start from this repository root.
Use HTTPS for public access. The frontend is deployed separately.
