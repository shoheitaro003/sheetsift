// SheetSift landing page checks. Run: node tests/smoke.cjs
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright");

const PAGE = "file://" + path.resolve(__dirname, "..", "index.html");
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(detail)));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Offline runs: serve SheetJS from a local copy instead of the CDN.
  if (process.env.LOCAL_XLSX) {
    await page.route(/xlsx\.full\.min\.js/, (route) => route.fulfill({ path: process.env.LOCAL_XLSX, contentType: "application/javascript" }));
  }
  await page.goto(PAGE);
  await page.waitForTimeout(800);

  const run = (text) => page.evaluate((t) => {
    const E = window.SheetSiftEngine;
    const res = E.process(E.parseCSV(t));
    return { h: res.headerRow, skipped: res.skipped.length, cols: res.columns.map(c => c.type),
             rows: res.rows.map(r => r.cells.map(c => c.value + "|" + c.status)), counts: res.counts };
  }, text);
  const safe = async (name, text) => {
    try { return await run(text); } catch (e) { check(name + " does not crash", false, String(e)); return null; }
  };

  // 1. Built-in sample
  let r = await page.evaluate(() => {
    const E = window.SheetSiftEngine; const res = E.process(E.parseCSV(window.__sheetsiftSample));
    return { h: res.headerRow, counts: res.counts, rows: res.rows.length };
  });
  check("sample: header on row 3", r.h === 3, r);
  check("sample: 5 data rows", r.rows === 5, r);
  check("sample: 1 bad, 1 ambiguous", r.counts.bad === 1 && r.counts.warn === 1, r);

  // 2. German export with semicolons and decimal commas
  r = await safe("german", "Kundenliste;;\n;;\nKunde;Datum;Betrag\nA GmbH;31/01/2026;1.234,50\nB AG;05/02/2026;99,90\nSumme;;1.334,40\n");
  if (r) {
    check("german: header row 3", r.h === 3, r);
    check("german: totals row skipped", r.rows.length === 2, r);
    check("german: day-first dates", r.rows[1][1] === "2026-02-05|fixed", r.rows);
    check("german: decimal comma", r.rows[0][2] === "1234.50|fixed", r.rows);
  }

  // 3. Japanese headers, yen, Japanese dates
  r = await safe("japanese", "顧客一覧,,,\n氏名,メール,登録日,金額\n田中,tanaka@example.jp,2026年4月3日,\"¥1,200\"\n佐藤,sato@example.jp,2026/04/05,800円\n鈴木,suzuki@example.jp,2026-04-06,1500\n合計,,,3500\n");
  if (r) {
    check("japanese: header row 2", r.h === 2, r);
    check("japanese: totals skipped", r.rows.length === 3, r);
    check("japanese: email column", r.cols[1] === "email", r.cols);
    check("japanese: date normalised", r.rows[0][2] === "2026-04-03|fixed", r.rows);
    check("japanese: yen parsed", r.rows[0][3].startsWith("1200") && r.rows[1][3].startsWith("800"), r.rows);
  }

  // 4. Edge cases that must not crash
  for (const [name, text] of [
    ["empty file", ""],
    ["only whitespace", "\n\n  \n"],
    ["header only", "Name,Email\n"],
    ["single column", "Name\nA\nB\n"],
    ["quoted newline", "Name,Note\nA,\"line one\nline two\"\nB,ok\n"],
    ["BOM and CRLF", "﻿Name,Email\r\nA,a@example.com\r\nB,b@example.com\r\n"],
    ["tab separated", "Name\tEmail\nA\ta@example.com\n"],
    ["garbage", "\u0000\u0001PK\u0003\u0004 binary junk ��"],
    ["unclosed quote", "Name,Note\nA,\"never closed\nB,x\n"],
    ["ragged rows", "a,b,c\n1\n1,2,3,4,5\n"],
  ]) {
    const res = await safe(name, text);
    if (res) check(name + " does not crash", true);
  }

  // 5. Performance: 20,000 rows under 2 seconds
  const big = ["Name,Email,Date,Amount"].concat(Array.from({ length: 20000 }, (_, i) =>
    `User ${i},user${i}@example.com,2026/0${(i % 9) + 1}/1${i % 9},"${i},50"`)).join("\n");
  const t0 = Date.now(); r = await safe("20k rows", big); const ms = Date.now() - t0;
  check("20k rows under 2s (" + ms + "ms)", r && ms < 2000, ms);

  // 6. Excel upload through the real file input
  const xlsxB64 = await page.evaluate(() => {
    const ws = XLSX.utils.aoa_to_sheet([["Report"], [], ["Name", "Joined", "Amount"], ["A", new Date(Date.UTC(2026, 3, 3)), 10.5], ["B", new Date(Date.UTC(2026, 3, 4)), 20], ["Total", "", 30.5]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  });
  const xlsxPath = path.join(os.tmpdir(), "sheetsift-test.xlsx");
  fs.writeFileSync(xlsxPath, Buffer.from(xlsxB64, "base64"));
  await page.setInputFiles("#file", xlsxPath);
  await page.waitForTimeout(800);
  const xs = await page.locator("#summary").innerText();
  const firstDate = await page.locator("#out tbody tr:first-child td:nth-child(3)").innerText().catch(() => "");
  check("xlsx: header found on row 3", /row 3/.test(xs), xs);
  check("xlsx: date cell is ISO", /^2026-04-0[34]$/.test(firstDate.trim()), firstDate);

  // 6b. Excel with an empty first sheet uses the sheet that has data
  const multiB64 = await page.evaluate(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Email"], ["A", "a@example.com"], ["B", "b@example.com"]]), "Data");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  });
  const multiPath = path.join(os.tmpdir(), "sheetsift-multi.xlsx");
  fs.writeFileSync(multiPath, Buffer.from(multiB64, "base64"));
  await page.setInputFiles("#file", multiPath);
  await page.waitForTimeout(800);
  check("xlsx: skips an empty first sheet", (await page.locator("#out tbody tr").count()) === 2, await page.locator("#summary").innerText());

  // 6c. Hostile file content is shown as text, never run as HTML
  const evilPath = path.join(os.tmpdir(), "sheetsift-evil.csv");
  fs.writeFileSync(evilPath, "Name,Email\n\"'><img src=x onerror=window.__pwned=1>\",bad'mail\nB,b@example.com\n");
  await page.setInputFiles("#file", evilPath);
  await page.waitForTimeout(500);
  check("hostile cell text is not executed", (await page.evaluate(() => !window.__pwned && !document.querySelector("#out img"))), "");

  // 7. Unsupported file type is refused politely
  const pdfPath = path.join(os.tmpdir(), "sheetsift-test.pdf");
  fs.writeFileSync(pdfPath, "%PDF-1.4 fake");
  await page.setInputFiles("#file", pdfPath);
  await page.waitForTimeout(300);
  const ps = await page.locator("#summary").innerText();
  check("pdf: refused with a message", /CSV or Excel/i.test(ps), ps);

  // 8. Waitlist form
  const key = await page.locator('#wl input[name="access_key"]').inputValue();
  if (key === "YOUR_ACCESS_KEY") {
    await page.fill("#email", "test@example.com");
    await page.click('#wl button[type="submit"]');
    await page.waitForTimeout(200);
    const m = await page.locator("#form-msg").innerText();
    check("form: placeholder key shows 'not connected'", /connected yet/.test(m), m);
  } else {
    check("form: access key looks valid", /^[0-9a-f-]{36}$/i.test(key), key);
  }
  await page.goto(PAGE + "?joined=1");
  await page.waitForTimeout(300);
  check("form: thank-you message after redirect", /on the list/.test(await page.locator("#form-msg").innerText()));

  // 9. Layout: no sideways scroll on a phone, light and dark
  for (const scheme of ["light", "dark"]) {
    const p2 = await browser.newPage({ viewport: { width: 375, height: 800 }, colorScheme: scheme });
    await p2.goto(PAGE); await p2.waitForTimeout(500);
    const w = await p2.evaluate(() => document.documentElement.scrollWidth);
    check("phone " + scheme + ": no horizontal scroll (" + w + ")", w <= 375, w);
    await p2.close();
  }

  check("no script errors on the page", errors.length === 0, errors);
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
