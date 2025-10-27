# Status Page

This is a status page for monitoring service uptime and availability with a hybrid approach: detailed recent checks and daily aggregated snapshots.

## Project Structure

```
.
├── index.html              # Main HTML file
├── status-results.json     # Current status results
├── status-history.json     # Detailed recent status checks (last 100 checks) - for recent status viewing
├── status-day.json         # Daily status snapshots (last 60 days) - for long-term history and external API access
├── README.md               # Documentation
├── src/
│   ├── css/
│   │   └── style.css       # Stylesheet for the status page
│   └── js/
│       └── script.js       # JavaScript logic for the status page
├── scripts/
│   └── check-status.js     # Script to check service status and manage both detailed and daily snapshots
```

## How It Works

The system maintains two types of history:
- `status-history.json`: Detailed checks (every 5 minutes) limited to last 100 entries for recent status viewing
- `status-day.json`: Daily snapshots (one per day) containing the last check from each day, kept for 60 days for long-term history

When the script runs:
1. It performs the current status check
2. It examines the existing `status-history.json` for any "completed" days (days with no more upcoming entries)
3. For each completed day, it takes the chronologically last check from that day and adds it to `status-day.json`
4. It adds the current check to `status-history.json`

This provides:
- Recent detailed history via `status-history.json` (last 100 checks)
- Long-term historical data via `status-day.json` (last 60 days with one snapshot per day)
- Easy external API access via `status-day.json` for daily status information

## Real-time Updates

The status page automatically updates every 30 seconds to check for new data. The GitHub Action runs every 5 minutes by schedule, but you can trigger it manually or via external services:

### Manual Trigger
You can manually trigger a status check using GitHub's repository dispatch API:
```bash
curl -X POST \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  https://api.github.com/repos/lhmchyd/status-honmaku/dispatches \
  -d '{"event_type":"status-check"}'
```

### Automated Trigger with External Service
You can use a service like cron-job.org to trigger checks more frequently:

**Option 1: Direct API Call**
- URL: `https://api.github.com/repos/lhmchyd/status-honmaku/dispatches`
- Method: `POST`
- Headers: 
  - `Authorization: Bearer YOUR_GITHUB_TOKEN`
  - `Content-Type: application/json`
- Body: `{"event_type": "status-check"}`

**Option 2: Serverless Function (for token security)**
Deploy the API function to Vercel and trigger that instead:
1. Deploy this project to Vercel
2. Set up an environment variable `GITHUB_TOKEN` with your GitHub token
3. Call your deployed endpoint: `https://your-project.vercel.app/api/trigger`

### Command Line Trigger
Run the included script:
```bash
GITHUB_TOKEN=your_token node scripts/trigger-github-action.js
```

## Local Development

To run this locally, you need a web server due to CORS restrictions when loading JSON files. You can:

- Use Python's built-in server: `python -m http.server 8000`
- Use Node's http-server: `npx http-server`
- Use any other local web server