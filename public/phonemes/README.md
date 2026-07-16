# Static phoneme audio bank

This folder holds the ~44 English phoneme recordings played during the
Stuck-Word Autopsy sound-out (`{id}.mp3`, e.g. `ch.mp3`, `ar.mp3`).

Rules (ARCHITECTURE.md §2, §7 rule 4):

- **Never TTS.** Isolated phonemes must come from these static files only —
  neural TTS hallucinates a trailing schwa on isolated plosives ("buh" for
  /b/), which is pedagogically harmful for dyslexic learners.
- **Openly licensed.** Source from CC-licensed IPA recordings on Wikimedia
  Commons; self-record gap-fill only where a licensed file is missing or poor.
- **Every file's license must be verified and attributed** — record source URL
  and license per file in `ATTRIBUTIONS.md` (create it alongside the first
  file you add).
- Grapheme ordering and phonics behaviour anchor to an established, published
  phonics scope-and-sequence — never invent pedagogy.

Status: bank not yet curated (open item — spec §8).
