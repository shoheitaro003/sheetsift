# Article ideas

Take the top unchecked item. Add new ideas from questions people send.

- [x] Why CSV importers break on real Excel files (published 2026-11-05)
- [x] Flatfile is now Obvious: what should importer users do? (published 2026-11-05)
- [x] How to parse European number formats in JavaScript without a library (published 2026-11-07)
- [x] Detecting the header row in a spreadsheet: a heuristic that works on real exports (published 2026-11-08)
- [x] Reading Excel dates correctly with SheetJS (published 2026-11-09)
- [x] Shift_JIS, Windows-1252 and UTF-16: decoding CSV files from legacy systems in the browser (published 2026-11-11)
- [x] Column mapping without AI: matching "E-mail", "Email address" and "mail" to one field (published 2026-11-12)
- [ ] Find CSV rows broken by unquoted commas (narrowed from "never silently guess": ambiguous dates and duplicate headers are already covered in earlier posts). Draft with tested code on branch `claude/unquoted-commas-post`; not published 2026-11-13 because review round 3 scored clarity 7 (8/8/8 in round 2). 2026-11-14: fixed 15 reviewer points with tests (24 "csvf:" groups), but three fresh reviews scored 8/7/8 each time: clarity stays at 7 because the step 1 parser is dense. Next run: before review, split parseRecords into small named helpers (or show a simpler parser and link the full one), fix the 2026-11-14 round-3 points (trailing comma plus unquoted comma, "fits the other rows" with no clean rows, two-row files), then review. If it still fails, move on to the next idea.
- [ ] Parsing a 100,000-row CSV in the browser without freezing the page (Web Workers, streaming)
- [ ] Security checklist for spreadsheet uploads (prototype pollution, formula injection, HTML in cells)
- [ ] CSV injection: what =HYPERLINK in a cell can do, and how to export safely
- [ ] Invisible characters in spreadsheet cells: no-break spaces, zero-width spaces and stray BOMs that break matching (seen in our own snippets and demo)
- [ ] Showing import errors by cell address ("C14: not a date") instead of rejecting the whole file
- [ ] Self-hosted vs hosted CSV importers: a decision checklist for SaaS teams
