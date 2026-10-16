# Next.js End-to-End Auth System

A production-ready Authentication System built with Next.js 16 (App Router), React 19, MongoDB, Prisma, and Bootstrap 5.

## Features

- **Authentication**: Custom implementation using JWT (Access + Refresh tokens) and HttpOnly cookies.
- **Security**: Password hashing (bcrypt), CSRF protection, Protected Routes (Middleware).
- **Roles**: Granular access control (Admin/User).
- **UI/UX**: Modern Glassmorphism design with Bootstrap 5 and customized Tailwind utilities.
- **Admin Dashboard**: Manage users, promote/demote roles, delete accounts.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Server Actions)
- **Language**: TypeScript
- **Database**: MongoDB (Atlas or Local)
- **ORM**: Prisma
- **Styling**: Bootstrap 5 + Tailwind CSS (for utilities)
- **Auth**: Custom JWT (jsonwebtoken, jose for edge)

## Setup Instructions

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Rename `.env.example` to `.env` (or create `.env`) and populate:
    ```env
    DATABASE_URL="mongodb+srv://..."
    JWT_SECRET="complex-secret-here"
    JWT_REFRESH_SECRET="another-complex-secret"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    ```
4.  **Database Setup**:
    ```bash
    npx prisma generate
    # If using MongoDB Atlas, ensure IP whitelist allows connection
    ```
5.  **Seed Admin User**:
    You can run the seed script to create an initial Admin user:
    ```bash
    npx ts-node --compiler-options {\"module\":\"CommonJS\"} src/prisma/seed.ts
    ```
    *(Note: You might need to install ts-node: `npm install -D ts-node`)*

6.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Deployment (Vercel)

1.  Push code to GitHub.
2.  Import project in Vercel.
3.  Add Environment Variables (`DATABASE_URL`, `JWT_SECRET`, etc.) in Vercel Project Settings.
4.  Deploy!

## MongoDB Atlas Guide

1.  Create a cluster (Free Tier M0 is fine).
2.  Create a database user (username/password).
3.  Network Access: Allow access from anywhere (0.0.0.0/0) for testing, or whitelist Vercel IPs.
4.  Get Connection String: `mongodb+srv://<username>:<password>@cluster0.rew3a.mongodb.net/myFirstDatabase`

## Audiobook speech providers

The book listen page supports Google (default) and Xiaomi MiMo. Choose the provider and voice in the player toolbar; preferences are saved in your browser. Existing Google accents and Gemini voice options remain available under Google.

To enable Xiaomi MiMo, add a server-only API key to `.env` locally and to your hosting environment in production, then restart/redeploy:

```env
MIMO_API_KEY=your_xiaomi_mimo_api_key
# Optional: override for your Xiaomi API region/account endpoint (include /v1)
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
# Optional: defaults to the current built-in-voice TTS model
MIMO_TTS_MODEL=mimo-v2.5-tts
```

MiMo uses the official [speech synthesis API](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/speech-synthesis-v2.5). Available voices are Default, Mia, Chloe, Milo, and Dean. Long chapters are split at sentence/word boundaries and combined into one WAV narration. Requests are canceled when you change chapters or providers. Missing credentials or provider errors appear in the player; MiMo does not silently fall back to Google.

Both providers use a persistent browser audio cache containing only the active chapter and its next chapter (maximum two audio entries, up to 100 MB total, seven-day expiry). Advancing, jumping chapters, or changing narration settings removes entries outside that active pair. Entries are isolated by user, chapter content, provider, voice, and grammar settings. Cached audio survives closing the tab/browser on the same device unless browser data is cleared or evicted; private browsing and storage quota may disable persistence. The player shows whether audio came from the device cache, server cache, or was newly generated.

Google also retains its database cache for default English with grammar off, keeping only the current/next chapter window per book. Audio above 15 MB skips the database cache to avoid MongoDB document limits. MiMo bypasses the Google database cache. After the active chapter is ready, the browser prepares only the next chapter using the selected provider, voice, and grammar settings. In-flight prefetch is reused when that chapter becomes current, even if persistent browser storage is unavailable. The player reuses the fetched audio locally so playback does not generate it a second time. Authenticated audio responses are private and are not shared through a public CDN cache. The TTS route allows up to 300 seconds; the hosting plan must support that duration for long chapters.

Provider regression checks (mocked API and database, no credentials required):

```sh
node --test tests/*.test.cjs
```

Automatic playback keeps the audio element mounted across chapters and preserves explicit play/pause intent. The next chapter is prepared while listening; the same request is reused if it is still generating at chapter end. Sleep timers and end-of-book stop playback intentionally. Browser/OS autoplay restrictions, tab suspension, network failures, or unfinished synthesis can still require a delay or a user tap.
