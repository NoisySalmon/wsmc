# Washington State Math Council (WSMC) Regional Scoring

A modern, web-based scoring and leaderboard system for the WSMC Regional Math Contest. Built with SvelteKit, Drizzle ORM, and Cloudflare D1.

## Features

- **Contest Management:** Create and manage regional math contests.
- **School & Student Roster:** Track schools, divisions, and student competitors.
- **Team Management:** Organically form teams for Project, Team Problem, and Topical contests.
- **Real-time Scoring:** Efficient score entry with instant validation.
- **Live Leaderboards:** Automated ranking based on WSMC scoring rules, including tie-breaking logic.
- **Cloud Native:** Designed to run on Cloudflare Pages and D1 for high availability and low latency.

## Tech Stack

- **Frontend:** SvelteKit (Svelte 5)
- **Database:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle ORM
- **Deployment:** Cloudflare Pages

## Getting Started

### Prerequisites

- Node.js (v20+)
- Cloudflare Wrangler CLI

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/NoisySalmon/wsmc.git
   cd wsmc
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize the local database:
   ```bash
   npx wrangler d1 migrations apply wsmc-db --local
   npm run seed
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## Deployment

The project is configured for Cloudflare Pages.

1. Build the project:
   ```bash
   npm run build
   ```

2. Deploy:
   ```bash
   npx wrangler pages deploy .svelte-kit/cloudflare
   ```

## License

MIT License - see [LICENSE](LICENSE) for details.
