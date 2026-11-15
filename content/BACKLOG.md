# Article ideas

Take the top unchecked item. Add new ideas from questions people send.

- [x] Why CSV importers break on real Excel files (published 2026-11-05)
- [x] Flatfile is now Obvious: what should importer users do? (published 2026-11-05)
- [x] How to parse European number formats in JavaScript without a library (published 2026-11-07)
- [x] Detecting the header row in a spreadsheet: a heuristic that works on real exports (published 2026-11-08)
- [x] Reading Excel dates correctly with SheetJS (published 2026-11-09)
- [x] Shift_JIS, Windows-1252 and UTF-16: decoding CSV files from legacy systems in the browser (published 2026-11-11)
- [x] Column mapping without AI: matching "E-mail", "Email address" and "mail" to one field (published 2026-11-12)
- [ ] Parsing a 100,000-row CSV in the browser without freezing the page (Web Workers, streaming)
- [ ] Security checklist for spreadsheet uploads (prototype pollution, formula injection, HTML in cells)
- [ ] CSV injection: what =HYPERLINK in a cell can do, and how to export safely
- [ ] Invisible characters in spreadsheet cells: no-break spaces, zero-width spaces and stray BOMs that break matching (seen in our own snippets and demo)
- [ ] Showing import errors by cell address ("C14: not a date") instead of rejecting the whole file
- [ ] Self-hosted vs hosted CSV importers: a decision checklist for SaaS teams
- [ ] (Parked 2026-11-15, after three days of reviews) Find CSV rows broken by unquoted commas. Draft with tested code on branch `claude/unquoted-commas-post` (parser split into helpers, 32 test groups). Last review 8/8/7. Before trying again, fix the round-3 gaps with tests: rows with the right count are not checked against column kinds (`Ken,Acme, Inc` with Amount missing is imported), `guessDelimiter` ignores `headerIndex`, a quoted `" Inc"` counts as a comma inside a sentence; show the import line for `examples/check-csv.js`; use one example file throughout.
