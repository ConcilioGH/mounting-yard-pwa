import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("./fixtures/racingnsw-rosehill-results.html", import.meta.url);
const html = await readFile(fixtureUrl, "utf8");

assert.match(html, /Key=2026Feb21,NSW,Rosehill Gardens/);
assert.deepEqual([...html.matchAll(/id="bobcontent(\d+)"/g)].map((match) => match[1]), ["1", "2"]);
assert.equal((html.match(/<th>Finish<\/th>/g) ?? []).length, 2);
assert.equal((html.match(/<th>Horse<\/th>/g) ?? []).length, 2);
assert.equal((html.match(/<th>SP<\/th>/g) ?? []).length, 2);

for (const raceNo of ["1", "2"]) {
  const block = new RegExp(`id="bobcontent${raceNo}"[\\s\\S]*?(?=id="bobcontent|</body>)`).exec(html)?.[0] ?? "";
  for (const position of [1, 2, 3]) {
    assert.match(block, new RegExp(`<td>${position}</td>[\\s\\S]*?<td>\\$[0-9]+(?:\\.[0-9]+)?F?</td>`));
  }
}

console.log("Racing NSW saved fixture contract passed.");
