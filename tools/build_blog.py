"""Build the SheetSift blog.

Each post lives in content/posts/<slug>.html:

    title: Post title
    description: One-sentence summary for search results
    date: 2026-11-06
    ---
    <p>Body HTML. Use {{code:NAME}} to insert a tested snippet from tools/snippets.py.</p>

Run from the repository root:  python3 tools/build_blog.py
Writes blog/<slug>/index.html, blog/index.html and sitemap.xml.
(A robots.txt would have no effect: crawlers only read it at the domain root.)
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import snippets  # noqa: E402

SITE = "https://shoheitaro003.github.io/sheetsift"
FONTS = ("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800"
         "&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400&display=swap")
LOGO = ('<svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">'
        '<rect x="1" y="1" width="24" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>'
        '<path d="M1 9h24M9 9v16" stroke="currentColor" stroke-width="2"/>'
        '<rect x="11" y="12" width="12" height="4" fill="var(--mark)"/></svg>')


def page(title, description, canonical, body, depth, extra_head=""):
    up = "../" * depth
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(description)}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(description)}">
<meta property="og:url" content="{canonical}">
<meta property="og:site_name" content="SheetSift">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{up}blog.css">
{extra_head}</head>
<body>
<header class="top"><div class="wrap">
  <a class="logo" href="{up}">{LOGO} SheetSift</a>
  <nav class="nav"><a href="{up}blog/">Blog</a><a class="btn" href="{up}#try">Try the demo</a></nav>
</div></header>
<main><div class="wrap">
{body}
</div></main>
<footer><div class="wrap"><span>SheetSift · a drop-in importer for messy Excel and CSV files</span><a href="{up}#waitlist">Join the waitlist</a></div></footer>
</body>
</html>
"""


def read_post(path):
    raw = open(path, encoding="utf-8").read()
    head, body = raw.split("\n---\n", 1)
    meta = dict(line.split(": ", 1) for line in head.strip().splitlines())
    meta["slug"] = os.path.splitext(os.path.basename(path))[0]

    def code(m):
        name = m.group(1)
        return "<pre><code>" + html.escape(getattr(snippets, name)) + "</code></pre>"

    meta["body"] = re.sub(r"\{\{code:([A-Z_]+)\}\}", code, body)
    return meta


def main():
    posts_dir = os.path.join(ROOT, "content", "posts")
    posts = [read_post(os.path.join(posts_dir, f)) for f in sorted(os.listdir(posts_dir)) if f.endswith(".html")]
    posts.sort(key=lambda p: p["date"], reverse=True)

    for p in posts:
        url = f"{SITE}/blog/{p['slug']}/"
        ld = json.dumps({
            "@context": "https://schema.org", "@type": "Article", "headline": p["title"],
            "description": p["description"], "datePublished": p["date"], "dateModified": p.get("updated", p["date"]),
            "mainEntityOfPage": url, "publisher": {"@type": "Organization", "name": "SheetSift"},
        })
        head = (f'<meta property="og:type" content="article">\n'
                f'<meta property="article:published_time" content="{p["date"]}">\n'
                f'<script type="application/ld+json">{ld}</script>\n')
        updated = f' · Updated {p["updated"]}' if p.get("updated") else ""
        body = (f'<article>\n<h1>{html.escape(p["title"])}</h1>\n'
                f'<p class="meta"><time datetime="{p["date"]}">{p["date"]}</time>{updated}</p>\n'
                f'{p["body"]}\n</article>')
        out = os.path.join(ROOT, "blog", p["slug"])
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(
            page(p["title"] + " | SheetSift", p["description"], url, body, depth=2, extra_head=head))

    items = "\n".join(
        f'<li><a href="{p["slug"]}/">{html.escape(p["title"])}</a>'
        f'<p>{html.escape(p["description"])}</p></li>' for p in posts)
    index_body = (f'<h1>The SheetSift blog</h1>\n<p class="meta">Practical notes on importing the spreadsheets '
                  f'real customers send.</p>\n<ul class="posts">\n{items}\n</ul>')
    os.makedirs(os.path.join(ROOT, "blog"), exist_ok=True)
    open(os.path.join(ROOT, "blog", "index.html"), "w", encoding="utf-8").write(
        page("SheetSift blog", "Practical notes on importing messy Excel and CSV files in web apps.",
             f"{SITE}/blog/", index_body, depth=1))

    urls = [f"{SITE}/", f"{SITE}/blog/"] + [f"{SITE}/blog/{p['slug']}/" for p in posts]
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
               + "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    open(os.path.join(ROOT, "sitemap.xml"), "w").write(sitemap)
    print(f"Built {len(posts)} post(s)")


if __name__ == "__main__":
    main()
