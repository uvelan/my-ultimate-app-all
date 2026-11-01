# Validated library exports

The library export button offers EPUB and JSON on web and Android. The download
endpoint remains `/api/books/<id>/download`; add `?format=json` for JSON. EPUB is
the default. Owner/admin access checks apply to both formats.

Before returning a file, export validates every chapter: supported text blocks,
nonempty paragraphs, unique nonnegative reading order, Unicode, and absence of
`[object Object]` placeholders. Rich-text leaves are joined as inline text and
formatted into escaped EPUB paragraphs. A failed chapter blocks the whole export
with HTTP 422 and a chapter-specific error report; no placeholder chapter is added.

EPUB generation is followed by ZIP integrity, mimetype, container, manifest resource,
spine order/count, title and paragraph round-trip checks. This is application-level
validation, not a claim of certification by the external EPUBCheck CLI.

JSON uses `ultimate-library-book`, version 1, with metadata and ordered chapters.
Each chapter retains its original rich `content` and normalized `paragraphs` for
portable text processing. Serialization is parsed and checked before delivery.
The format remains compatible with library JSON upload and Colab's JSON loader.
JSON metadata retains the cover; no account credentials or generated audio are exported.

Validated responses include `X-Book-Export-Validated`, chapter count, byte count,
and SHA-256 headers. The web downloader checks the checksum before downloading.
Android checks the response and writes the exact binary bytes, then reads the
destination back to verify them. Update the web server before using the new mobile
exporter; older responses without validation headers are intentionally rejected.

On Android, choose **EPUB** or **JSON backup**, then **Save to folder** or **Share
file**. Save to folder uses Android's directory picker and confirms success only
after the selected provider's file passes read-back verification. Cancelling the
picker creates no file. Sharing writes a verified temporary file and opens the
share sheet, without claiming another app has saved it.

Old EPUBs containing only `[object Object]` cannot recover their lost prose from
that file. Re-export from the original library containing the rich-text chapters.
