# Trivial Trials

A multi-player, survey-says party game in the style of Family Feud, built for phones and tablets, with an optional read-only board display for a TV.

- **Host** creates a game, gets a 4-character code + QR, names two teams and drags players onto them, reads the questions and judges every answer.
- **Players** join with the code and a name. During a face-off one random player per team gets the big red buzzer; teammates see who is representing them.
- **Board display** (`/board/CODE`, or "Show the board on a TV" on the home screen) is a full-screen, read-only board for the room, with reveals, strikes, scores, sounds and confetti.

Needs at least 3 people: the host plus one player per team.

## How a game plays

1. **Face-off.** The host taps **Open Buzzers** while reading the question. Each buzzer times the press **on the player's own device**, from the moment it lit up, so network lag doesn't decide who was faster. The host marks the answer **Correct** (and taps the matching board answer) or **Wrong**. On Wrong, the other face-off player gets a chance; if both miss, a fresh pair faces off.
2. **Play or pass.** The face-off winner chooses on their phone (the host can override).
3. **Round.** The controlling team answers in turn. The host taps answers to reveal them or hits **Strike**.
4. **Steal.** After three strikes the other team's captain gets one answer to steal the whole bank.
5. Rounds use multipliers (default ×1, ×1, ×2, ×3). A tie at the end goes to sudden death. You can also play "first to 300/500".
6. **Fast Money.** Two players from the winning team type answers on their phones against a 20 s / 25 s clock. The host matches each answer to the survey (with suggestions) or marks it zero, flags duplicates, then reveals answer by answer. 200+ wins.

The host has **Undo** for the last judgment, score adjustments, and player management (move/kick, late joiners) at any time.

## Questions

All questions live in [`data/questions.json`](data/questions.json) (120 original questions; survey counts are illustrative):

```json
{
  "id": "q001",
  "text": "Name something people bring to the beach.",
  "category": "Leisure",
  "use": ["main", "fastMoney"],
  "surveyed": 100,
  "answers": [
    { "text": "Towel", "count": 38, "aliases": ["beach towel"] },
    { "text": "Sunscreen", "count": 24, "aliases": ["sunblock", "lotion"] }
  ]
}
```

- `answers` are 3–8 entries sorted by `count` (the points), highest first; counts can't add up to more than `surveyed`.
- `aliases` only power the host's match suggestions. **The host always decides** whether an answer counts.
- `use: ["main", "fastMoney"]` marks questions suitable for Fast Money.
- The file is server-side only: players' browsers never receive unrevealed answers.
- `npm run validate:questions` checks the file (it also runs on every build).

## Architecture

| Piece | Role |
|---|---|
| `src/shared/` | Types and a pure, unit-tested **reducer** holding every game rule. |
| `server/handlers.ts` | API: create, join, state, action, and host-only secrets. Token auth, optimistic concurrency. |
| `netlify/functions/api.mts` | Netlify Function serving `/api/*` from Supabase. `cleanup.mts` deletes idle games hourly. |
| `supabase/migrations/001_init.sql` | `games` (public state, streamed via Realtime) + `game_secrets` (answers, tokens, service role only), with atomic load/save functions. |
| `dev/devApi.ts` | Local dev backend: in-memory store + Server-Sent Events, so `npm run dev` works with no Supabase. |
| `src/` | React + Tailwind + Framer Motion UI; sounds are synthesized with Web Audio. |

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. To test multiplayer on one computer, use separate browser tabs: each tab is its own player. Phones on the same Wi-Fi can join via the Network URL Vite prints.

```bash
npm test              # rules engine unit tests
npm run test:e2e      # Playwright: host + 2 phones + board display
npm run build         # validates questions, typechecks, builds
```

## Deploy (Netlify + Supabase)

1. Create a Supabase project. In **Settings → API**, keep the Data API enabled. "Automatically expose new tables" can stay off, because the migration grants exactly what's needed.
2. Run `supabase/migrations/001_init.sql` in the SQL editor (or `supabase db push`).
3. In Netlify, connect this repo and set environment variables:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (used by functions only)
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (bundled into the browser app)
4. Deploy. The build command and publish directory come from `netlify.toml`.

The name lives in `src/config.ts` (`APP_NAME`).
