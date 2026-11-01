# Drive sync progress — 1.1.26

Drive has its own chapter-check and per-file download bars. Counts distinguish
imported audio, compatible audio already saved, recordings missing from the Drive
catalog, and recordings rejected because prose or format differs. The displayed
Drive range uses printed chapter titles where available, while the requested mobile
range follows the mobile chapter list. Matching uses normalized titles and printed
chapter numbers to find candidates across EPUB index offsets, then still requires
actual prose equality before importing. An unrelated chapter with the same index
is not imported. The purple PC/library card is now explicitly labeled separately.

A result of zero imports and 15 unmatched chapters did not download 15 chapters.
It means none could be paired with acceptable Drive audio. Check the available
Drive range and generate the corresponding chapters in Colab, or use the same
EPUB/text version. Existing PC/library counts do not describe a new Drive transfer.

Colab reruns verify existing content identities and SHA-256 checksums and skip
completed matching audio. Incomplete/corrupted outputs are regenerated. Changing
text, voice or audio format creates a different content identity. No extra Colab
change or Google Cloud registration is needed for the progress update.
