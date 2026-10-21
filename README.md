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

## Local NovelFull browser verification

Run the development server and open the app at `http://127.0.0.1:3000`.
In Novel Scraper, select NovelFull and enter a specific novel URL. Click
**Open verification browser**, complete any verification yourself in the new
Chromium window, and then click **Generate** in the app. Chapter downloads reuse
that browser session. Keep the window open; an idle session closes after 15 minutes.

Chapters load one at a time. The browser waits up to two minutes for chapter text
to appear and settle, and the database save must finish before it opens the next
chapter. A load or save failure stops the sync at that chapter. Complete any
verification, then use **Sync** to retry; already saved chapters are skipped.

Running novel cards show **Stop**. This requests a pause after the current chapter
has been saved; **Stopping** remains visible until the worker acknowledges it.
The card then shows **Paused**, and **Sync** resumes at the first unsaved chapter.

Both `novelfull.net` and `novelfull.com` support this verification flow. Add/select
each domain as a separate source; verification cookies remain scoped to its domain.

To use FlareSolverr for blocked NovelFull searches and downloads, run its service
and set `FLARESOLVERR_URL=http://127.0.0.1:8191/v1` in `.env.local`, then restart
the app. Hosted deployments need a reachable, protected FlareSolverr service URL.

FlareSolverr sessions are reused per website and closed after two minutes of idle
time. Fast requests skip media downloads and fixed waits. Delayed/empty chapter
content is retried with media enabled and an additional rendering wait. Temporary
load failures get up to three attempts with backoff; HTTP 429 honors `Retry-After`
up to 30 seconds, then stops for a manual retry if a longer wait is needed. Database
save failures stop immediately without opening another chapter. Chapter logs include
load, save and total duration. Set `SCRAPER_CHAPTER_DELAY_MS` to add a successful
chapter delay when needed (default `0`, capped at `10000`).

This uses the project's existing Puppeteer dependency. If Chromium is missing, run
`npx puppeteer browsers install chrome`. Browser verification is restricted to
authenticated, same-origin requests on the local development server; hosted Vercel
deployments cannot open a browser on your computer. It does not automatically
solve CAPTCHAs or guarantee that Cloudflare will accept the browser session.

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

The book listen page supports Google free TTS (default), Gemini TTS, and Xiaomi MiMo. Choose the provider and voice in the player toolbar; preferences are saved in your browser. Older Gemini voice preferences migrate automatically to the Gemini provider.

To enable Gemini and/or Xiaomi MiMo, add server-only API keys to `.env` locally and to your hosting environment in production, then restart/redeploy:

```env
GEMINI_API_KEY=your_gemini_api_key
# Optional: Gemini model used for the built-in voices
GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview
MIMO_API_KEY=your_xiaomi_mimo_api_key
# Optional: override for your Xiaomi API region/account endpoint (include /v1)
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
# Optional: defaults to the current built-in-voice TTS model
MIMO_TTS_MODEL=mimo-v2.5-tts
```

MiMo uses the official [speech synthesis API](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/audio/speech-synthesis-v2.5). Available voices are Default, Mia, Chloe, Milo, and Dean. Chapter narration announces the chapter title before the body; an existing opening title is not repeated. Blank chapter bodies remain errors. Titles are kept out of grammar correction, and title or content changes invalidate narration cache identities. Long chapters are split at sentence/word boundaries and combined into one narration. Gemini/MiMo PCM WAV is converted to mono 64 kbps MP3 before storage and download using a server-side JavaScript encoder; no system FFmpeg installation is required. Already-compressed Google audio is kept unchanged. Unsupported audio or encoder failure retains the original playable file. Existing cached WAV entries are converted on their next read, preserving provider/voice and cache aliases without another TTS request; the converted file replaces the old chunks. Conversion adds CPU time once, while subsequent downloads reuse the smaller MP3. Requests are canceled when you change chapters or providers. If Gemini fails (including quota/resource exhaustion, missing credentials, or invalid audio), the server tries MiMo, then Google free TTS. Selecting MiMo starts at MiMo and falls back to Google; selecting Google uses Google only. Cancellation never starts a fallback request. Successful responses report the actual provider and voice. The player updates its settings and local preferences when that audio becomes current, with a fallback notice; future-chapter prefetch does not switch the active provider mid-chapter.

All providers use a five-chapter sliding window that advances at its middle chapter: chapters 1-5 remain while chapter 2 plays; starting chapter 3 shifts the window to 3-7. A backward jump resets the window at the chosen chapter (for example, selecting chapter 2 resets it to 2-6), reusing matching retained audio and loading missing audio. The browser keeps up to five audio entries on disk, up to 100 MB total, with seven-day expiry; the byte limit can evict large chapters earlier. Prepared audio in memory targets a 150 MB budget, preserving the current and immediate next chapter even if that pair alone exceeds the budget; larger distant chapters remain cached in the database. Shifting the window, jumping backward, or changing narration settings removes entries outside the active window. Entries are isolated by user, chapter title/content, provider, voice, and grammar settings. Cached audio survives closing the tab/browser on the same device unless browser data is cleared or evicted; private browsing and storage quota may disable persistence. The player presents the same controls for cached and newly generated audio. Browser audio cache version 3 clears obsolete version 1/2 entries so older audio without a chapter-title announcement is not reused.

The database retains only one globally active book, with at most one audio entry per chapter in the same five-chapter window. Gemini, MiMo, and Google audio all use this cache. Cache keys include the narration version, chapter title/content, requested/actual provider and voice, and grammar settings; successful fallback audio can be reused without repeating the failed provider. Audio is split into 6 MiB records to stay below MongoDB document limits. Chunk records are ordered in application memory after lookup, avoiding MongoDB aggregation sort-memory limits on large binary chapters. Metadata publication checks the active window so stale writes cannot restore an old book or expired chapter; incomplete audio is never served. Older Google-only cache entries are removed when the new window activates. The Prisma models are TtsAudioCacheState and TtsAudioCacheChunk; `npx prisma db push` applies MongoDB collections/indexes, and `npm run build` regenerates the Prisma client. Database cache failures are best effort and do not block generation. After current audio is ready, the browser prepares the remaining future chapters in the window sequentially and reuses in-flight requests on advance. Lightweight window activation also runs when current audio came from device memory/cache. Authenticated audio responses are private and are not shared through a public CDN cache. The TTS route allows up to 300 seconds; the hosting plan must support that duration for long chapters.

Provider regression checks (mocked API and database, no credentials required):

```sh
node --test tests/*.test.cjs
```

Automatic playback keeps the audio element mounted across chapters and preserves explicit play/pause intent. Prepared next-chapter audio is started directly inside the ended event, before React updates or cache operations, to reduce background playback gaps. The same request is reused if synthesis is still running. Audio downloads retry transient HTTP/network failures and interrupted response bodies three times with abortable backoff; authorization and invalid requests do not retry. Explicit Retry audio bypasses device and server cache. Google generation bounds chunk concurrency to four, retries transient failures, and cancels sibling work on failure. Returning to the page or reconnecting can resume intended playback, refill the preparation window, or retry failed loading; manual pauses, sleep timers, and end-of-book remain respected. Browser/OS autoplay restrictions, tab suspension, network failures, or unfinished synthesis can still require a delay or a user tap.

The listen page silently renews expired access-token cookies using the refresh endpoint, then retries the original API request once. Concurrent requests share a renewal request. Refresh tokens use the same user identifier as login, and renewed access tokens include the identity fields required by the authenticated APIs.

Gemini TTS defaults to Gemini 3.1 Flash TTS Preview with Kore, Puck, Charon, Fenrir, or Zephyr. Its raw PCM responses are joined into a valid WAV file for browser playback. See the official [Gemini speech generation documentation](https://ai.google.dev/gemini-api/docs/speech-generation). Fallback audio is associated with its actual provider and voice rather than the provider that failed.
