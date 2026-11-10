# Draft: Read Shift_JIS, Windows-1252 and UTF-16 CSV files in JavaScript

Not published on 2026-11-10: the independent review (pass 10) reached 8/8/7 after three rounds
(round 1: 7/8/6, round 2: 8/8/7, round 3: 8/8/7). Trust stayed below 8, so the rule says skip.

Code and tests are already in the repo (DEC_* in tools/snippets.py, "dec:" tests), and the demo
uses the same decoder. Move the .html file back to content/posts/ (new date) when it passes.

Pass 2 note: WebFetch was not available in the 2026-11-10 run, so the post makes no outside
claims; every behaviour it states is checked by tests (Node 20/22, Chromium in smoke.cjs).

## Open points from review round 3 (fix before the next review)
1. DONE in code: utf8Damage now checks second-byte ranges (surrogates, overlong) - update text.
2. DONE in code: zero-byte reason now says "binary, or UTF-16 without a BOM" - update the limits bullet.
3. Blob.text() in Chromium honours a UTF-16 BOM (tested): give the Chromium version, or cut that half
   and only say "check the BOM yourself". A spec link needs a source opened in the run.
4. Intro/description over-promise "says when it is unsure": say "among the encodings you list", and
   that `sure` cannot catch an encoding missing from the list.
5. Truncated UTF-8 at end of file (cut by an upload limit) can fall to the legacy step: handle or list.
6. "line N" is a physical line, not a CSV record (quoted multi-line cells): say so.
7. Damaged UTF-8 returns options: [] - fill options with valid legacy candidates or say to use `legacy`.
8. Excel "Unicode Text" (UTF-16LE + BOM, tab-separated) is a known case - only mention with a source.
9. Cuts: "It is the right tool, but"; the 100,000-character sentence (code comment says it);
   "The short encoding check in the first of those posts is replaced by this one".
10. CTA: "decodes CSV files the same way" vs disclosure "simplified versions": use "the same approach".
11. "Every one of its 256 bytes maps..." -> add "in TextDecoder".
12. Add the actual scores to the not-sure rows of the table.
