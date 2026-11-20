// Safe markdown → HTML for the document API. Run: node --experimental-strip-types --test supabase/functions/tests/md-html.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { embedPage, markdownToHtml } from "../_shared/md-html.ts";

test("renders the board's markdown subset", () => {
  const h = markdownToHtml("# Title\nIntro **bold** and *it* and `x`\n\n- a\n- b\n\n3. c\n4. d\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n> note\n\n---");
  assert.match(h, /<h2>Title<\/h2>/); assert.match(h, /<strong>bold<\/strong>/); assert.match(h, /<em>it<\/em>/); assert.match(h, /<code>x<\/code>/);
  assert.match(h, /<ul><li>a<\/li><li>b<\/li><\/ul>/); assert.match(h, /<ol start="3">/); assert.match(h, /<th>A<\/th>/); assert.match(h, /<td>2<\/td>/);
  assert.match(h, /<blockquote>note<\/blockquote>/); assert.match(h, /<hr>/);
});

test("nothing executable survives", () => {
  const h = markdownToHtml('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n**<b onmouseover=x>**\n\n| <svg/onload=1> | x |\n|---|---|\n| "q" | \'s\' |');
  const tags = h.match(/<[^>]+>/g) ?? [];
  assert.ok(tags.every((t) => /^<\/?(p|strong|em|code|table|thead|tbody|tr|th|td|br)>$/.test(t)), tags.join(" "));   // only plain tags, no attributes
  assert.match(h, /&lt;script&gt;/);
  assert.match(embedPage('<x>"t"', h, "m"), /<title>&lt;x&gt;&quot;t&quot;<\/title>/);
  assert.ok(!/<script/i.test(embedPage("t", h, "m")));
});
