// Fills the shared head/header/footer into every page, between <!--@name--> and <!--/@name--> markers,
// and marks the current page in the nav. Run after editing anything in partials/:  node build.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const part = (n) => readFileSync(join(root, "partials", n + ".html"), "utf8").trim();
const parts = { head: part("head"), header: part("header"), footer: part("footer") };

for (const file of readdirSync(root).filter((f) => f.endsWith(".html"))) {
  let html = readFileSync(join(root, file), "utf8");
  const page = (html.match(/<body[^>]*data-page="([^"]+)"/) || [])[1];
  for (const [name, body] of Object.entries(parts)) {
    let block = body;
    if (name === "header" && page) block = block.replace(`data-nav="${page}"`, `data-nav="${page}" aria-current="page"`);
    const re = new RegExp(`<!--@${name}-->[\\s\\S]*?<!--/@${name}-->`);
    if (re.test(html)) html = html.replace(re, `<!--@${name}-->\n${block}\n<!--/@${name}-->`);
  }
  writeFileSync(join(root, file), html);
  console.log("built", file);
}
