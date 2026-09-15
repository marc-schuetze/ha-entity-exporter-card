// Self-check for groupDomains() — the fix for the hardcoded-domain-whitelist bug.
// Run: node test_domains.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The card is a browser module (needs customElements); pull the pure part out by source.
const src = readFileSync(new URL("./entity-exporter-card.js", import.meta.url), "utf8");
const start = src.indexOf("const DOMAIN_GROUPS");
const end = src.indexOf("console.log(\"[HA Entity Exporter] Registering");
assert.ok(start > -1 && end > start, "could not extract DOMAIN_GROUPS/groupDomains from card source");
const { DOMAIN_GROUPS, groupDomains } = await import(
  "data:text/javascript," + encodeURIComponent(src.slice(start, end) + "\nexport { DOMAIN_GROUPS, groupDomains };")
);

// The bug: camera was not in the old hardcoded whitelist, so camera entities
// were invisible. Unknown domains must now surface under "Other".
const g = groupDomains(["camera", "light", "sensor", "update", "lock", "sun"]);
assert.deepEqual(g.Devices, ["sensor", "light", "camera", "lock"]);
assert.deepEqual(g.Other, ["update", "sun"]);

// Empty groups are dropped, so "select group" checkboxes are never vacuously checked.
assert.deepEqual(Object.keys(groupDomains(["light"])), ["Devices"]);
assert.deepEqual(groupDomains([]), {});

// Every domain handed in comes back out exactly once.
const all = ["zone", "camera", "weather", "light", "input_button", "todo"];
const out = Object.values(groupDomains(all)).flat();
assert.deepEqual([...out].sort(), [...all].sort());
assert.equal(new Set(out).size, out.length, "a domain was duplicated across groups");

console.log("ok");
