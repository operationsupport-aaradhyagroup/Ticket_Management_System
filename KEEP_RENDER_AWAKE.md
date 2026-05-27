# Keep Render Awake

This repo now includes a GitHub Actions workflow:

- [.github/workflows/keep-render-awake.yml](/D:/Ticekt/.github/workflows/keep-render-awake.yml:1)

## What it does

- Pings the deployed Render health endpoint every 10 minutes:
  - `https://ticket-management-system-th5i.onrender.com/api/health`

## How to use it

1. Commit and push this repo to GitHub.
2. Make sure GitHub Actions are enabled for the repository.
3. Keep the workflow file on the default branch (`main`).

## Notes

- This is a best-effort wakeup workaround, not a guaranteed replacement for a paid no-sleep plan.
- GitHub scheduled workflows can sometimes run with small delays.
- If the deployed URL changes, update the workflow file.
