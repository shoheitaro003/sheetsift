# SheetSift repository

Landing page, in-browser demo, waitlist and blog for SheetSift: a drop-in React importer for messy Excel and CSV files. Published with GitHub Pages at https://shoheitaro003.github.io/sheetsift/.

The owner (Tomoyuki, Japanese speaker, not an engineer) wants Claude to do the work and keep his effort near zero. Write reports to him in plain Japanese.

## Layout
- `index.html` — landing page, demo engine (`window.SheetSiftEngine`) and waitlist form (Web3Forms, access key in the form).
- `content/posts/*.html` — blog posts with a small front matter (`title`, `description`, `date`, optional `updated`), then `---`, then body HTML. `{{code:NAME}}` inserts a snippet from `tools/snippets.py`.
- `tools/build_blog.py` — renders posts into `blog/` and writes `sitemap.xml`. Never edit `blog/` by hand.
- `tools/make_article_tests.py` — writes `tests/article-examples.cjs` from the snippets so every code example on the site is executed.
- `tests/smoke.cjs` — page, demo, form and blog checks. `content/BACKLOG.md` — article ideas.
- `.github/workflows/check.yml` — runs everything on push and every morning.

## Before every push
```
python3 tools/build_blog.py
python3 tools/make_article_tests.py tests/article-examples.cjs
node tests/smoke.cjs             # offline: LOCAL_XLSX=<path to xlsx.full.min.js>
node tests/article-examples.cjs  # offline: XLSX_MODULE=<path to xlsx package>
```
Push only when all checks pass. Commit as `Claude <noreply@anthropic.com>`.

## Writing rules for blog posts
- English, for developers building SaaS apps. Practical: one problem, concrete steps, working code.
- Every code example goes in `tools/snippets.py` and gets a test in `tools/make_article_tests.py`. If you cannot test it, leave it out.
- Facts about other companies need a linked source and a date. Name competitors fairly. Never claim something about them you have not read in a source.
- No invented statistics, customers, quotes or testimonials. SheetSift is in early access: never say it has users or customers.
- End with the demo call to action and the disclosure line ("We build SheetSift ...").
- At most one post per day (decided by the owner on 2026-11-07). Quality over volume: mass-produced pages can be treated as spam by search engines and would hurt the whole site. If a post cannot meet every rule below on a given day, skip that day rather than publish a weak post.
- Each post must solve a different problem from every earlier post. Never publish two posts that answer the same search with reworded text.
- Before publishing, revise each post in five passes and fix what each pass finds:
  1. Facts: every claim about the world has a source you actually read; dates are current.
  2. Code: every example is in `tools/snippets.py`, tested, and passes.
  3. Reader: a developer can follow it without guessing; cut anything that doesn't help.
  4. Search: the title and description say what the reader searches for, in plain words.
  5. Fit: no claims about SheetSift users or customers; demo call to action and disclosure are present.

## Daily routine (scheduled task, every morning, Japan time)
**Every day:**
1. **Signups.** In Gmail, search `subject:"SheetSift waitlist"`. Count all signups and those since the last run. Summarise new answers (framework, current solution, would_pay, messiest file). Do not copy email addresses into the repo or any public place.
2. **Other mail.** Search Gmail for messages that mention SheetSift and are not waitlist notifications (questions, bug reports, GitHub failure emails). For each that needs an answer, create a Gmail draft reply. Never send email yourself.
3. **Site health.** Check the latest GitHub Actions runs. If anything failed, find the cause, fix it, run the tests and push.
4. **Learn from questions.** If a question or a "messiest file" answer shows a gap, add an idea to the top of `content/BACKLOG.md`, or fix the demo if the problem is a bug (add a test for it first).

5. **One article.** Take the top unchecked idea from `content/BACKLOG.md`, write the post following the rules above including the five revision passes, build, test, push, and tick it off. When fewer than 7 unchecked ideas remain, add new ones to the backlog (from questions people sent, problems seen in the demo, or real developer questions you found in a source you read).

**Saturday only:**
6. **Weekly report.** Update the project doc `claude/SheetSift_週次レポート.md` (newest week at the top) in Japanese: signups (total / this week), visits from GoatCounter (https://sheetsift.goatcounter.com, if it can be read; otherwise say so), what people answered, emails drafted, fixes made, articles published, and where we stand against the decision table in `claude/SheetSift_需要検証プラン.md` (stage 1 runs 90 days from 2026-11-05; target 50 signups). If a tool was unavailable, say so instead of guessing numbers.

On other days, do not write a report doc. If nothing changed, say so in one line.
