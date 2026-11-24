# CROWD CONTROL

A real-time party game for 2–8 players. Players join a room with a code, vote anonymously, play individual and team rounds, and compete on a live leaderboard.

## Deployment on Netlify

This repository is prepared for Netlify:

- Static frontend is published from `public/`.
- `netlify.toml` proxies `/api/*` requests to the existing Hatchable API at `https://crowd-control.hatchable.site`.
- The frontend polls room state every two seconds instead of requiring the Hatchable realtime browser client. This keeps room updates working on Netlify.
- The database and API remain hosted by Hatchable; this is a frontend hosting move, not a full backend/database migration.

### Publish

1. In Netlify, choose **Add new site → Import an existing project**.
2. Connect GitHub and select `ak0726/crowd-control`.
3. Use branch `main`. Build command: leave blank. Publish directory: `public` (also configured in `netlify.toml`).
4. Deploy the site.
5. Test create room, join by code from another device, anonymous voting, round reveal, and rematch.

No Netlify environment variables are required for this current proxy-based setup.

## Source layout

- `public/`: browser app
- `hatchable/api/`: source copy of the existing Hatchable API and realtime auth handler
- `hatchable/migrations/`: SQL schema migrations used by the existing backend

## Important architecture note

The backend and PostgreSQL database still run on Hatchable. Keep the Hatchable project active for the Netlify deployment to function. The `hatchable/` directory is a source backup; Netlify does not deploy it as serverless functions.
