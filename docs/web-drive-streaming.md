# Web Google Drive chapter streaming

Open a book's existing Listen page and select **Google Drive (Colab)** in the audio
source menu (open playback settings on small screens). The old
`/books/<book-id>/drive` link redirects here with Drive selected.
Connect Google Drive, select the Colab output folder,
choose Bella/Heart and the chapter, then press Play. Existing Colab WAV/JSON files
work unchanged. The web player does not create ZIPs, copy audio into the database,
or wait for a complete chapter Blob before playback. Browser controls support seek,
speed, the existing chapter index/transcript, sleep timer, previous/next chapters, and automatic next-chapter playback when permitted
by browser autoplay policy. An unavailable chapter stops with an explicit error.

## Google Cloud setup

Use the existing Cloud project, enabled Drive API, consent screen, read-only Drive
scope and test-user email configured for Android. Create an additional OAuth client
of type **Web application**. Keep the existing Android client unchanged.

Add Authorized JavaScript origins (origins only, without a trailing path):

- `http://localhost:3000`
- `https://my-ultimate-app-all.vercel.app` (or your actual production origin)

Set `GOOGLE_DRIVE_WEB_CLIENT_ID=<public-web-client-id>.apps.googleusercontent.com`
in the web deployment environment and local `.env`, then restart/redeploy. This is
a public client ID, not a client secret. The popup token flow does not require a
web client secret or an application OAuth redirect endpoint.

The server also needs `DRIVE_SESSION_SECRET` with at least 32 characters, or an
existing `JWT_SECRET` meeting that length. Never use the app's fallback default
secret for Drive encryption. Session secrets stay server-side; they must not use
a `NEXT_PUBLIC_` prefix. Rotation invalidates existing Drive sessions/tickets.

References: [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[authorized web origins](https://developers.google.com/identity/oauth2/web/guides/load-3p-authorization-library).

## Streaming and privacy

Google Identity Services grants read access. The short-lived Google access token
is sent once to a same-origin endpoint, validated against Drive, encrypted and
stored in an HttpOnly, SameSite cookie bound to the signed-in app account. It is
not saved in localStorage, exposed in media URLs or sent to the database. Folder
selection alone is saved per app-account/book in localStorage. Disconnect removes
the local cookie; it does not revoke the Google account-level grant.

An HTML audio element cannot attach Google's Authorization header. The stream path
is therefore **Drive → authenticated web streaming endpoint → browser**. Playback
uses an encrypted, expiring, account-bound ticket. Audio is passed through as a
ReadableStream, without a full Buffer/Blob or server disk copy. HTTP Range and
Content-Range handling support seeking. The API forwards only approved response
headers and fixed Google API URLs. Application hosting bandwidth and request
duration limits still apply; this is not an unlimited-duration public Drive link.

Before playback, the server matches actual chapter prose and spoken passages,
checks voice/model, timing continuity/duration, size, catalog identity and the WAV
header. It compares Drive's SHA-256 metadata when available. Full-byte hashing
before playback would require downloading the entire file, so web streaming cannot
provide that check when Drive's checksum metadata is absent. File version/size and
available checksum metadata are checked again for playback/seek requests to reject
changed files. Mobile download/import still performs its full SHA-256 check.

Drive tokens expire. Reconnect Google Drive and retry if playback reports expired
authorization. The app login cookie is renewed while this player is open so later
seek requests can authenticate. Background autoplay, lock-screen behavior and seek
support depend on the browser/device; no physical-browser claims are made from
unit tests alone. No Google credentials are needed in Colab.

## Validation

Automated tests cover authenticated encryption, expiry/purpose/account isolation,
byte-range validation, no full audio buffering, cancellation propagation, changed
file rejection and invalid upstream ranges. TypeScript and production route builds
are checked separately. Live Google authorization/playback requires the Web OAuth
client ID, authorized origin, deployment environment and on-device/browser testing.
