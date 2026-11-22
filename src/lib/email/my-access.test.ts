import assert from "node:assert/strict";
import test from "node:test";

import { escapeEmailHtml } from "./my-access";

// Every email body escapes through this one function: the five HTML specials only.
test("email text escapes exactly the five HTML specials", () => {
  assert.equal(
    escapeEmailHtml(`Tom & "Jerry" <b>'s</b> &amp;`),
    "Tom &amp; &quot;Jerry&quot; &lt;b&gt;&#39;s&lt;/b&gt; &amp;amp;",
  );
  assert.equal(escapeEmailHtml("Żółć — «ёлка» 💃"), "Żółć — «ёлка» 💃");
  assert.equal(escapeEmailHtml(""), "");
});
