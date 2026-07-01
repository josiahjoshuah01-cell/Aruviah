const res = await fetch("http://localhost:3000/", {
  headers: { Accept: "text/html" },
});
const html = await res.text();
const navMatch = html.match(
  /<nav[^>]*aria-label="Categories"[^>]*>([\s\S]*?)<\/nav>/
);
if (!navMatch) {
  console.log("HTTP", res.status);
  console.log("NAV NOT FOUND");
  process.exit(1);
}
const navHtml = navMatch[1];
const pills = [...navHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map(
  (m) => ({ href: m[1], label: m[2].trim() })
);
console.log("HTTP", res.status);
console.log("CATEGORY_RAIL_PILLS_JSON:", JSON.stringify(pills, null, 2));
console.log("PILL_COUNT:", pills.length);
const expected = [
  { href: "/", label: "All" },
  { href: "/category/home", label: "Home" },
  { href: "/category/electronics", label: "Electronics" },
  { href: "/category/fashion", label: "Fashion" },
  { href: "/category/kitchen", label: "Kitchen" },
];
const labels = pills.map((p) => p.label);
const match =
  pills.length === expected.length &&
  expected.every((e, i) => pills[i].href === e.href && pills[i].label === e.label);
console.log("MATCHES_EXPECTED:", match);
console.log("LABELS_ONLY:", labels.join(" | "));
const hasCj = pills.some((p) =>
  /scarves|face masks|belts|cummerbunds/i.test(p.label)
);
console.log("HAS_CJ_LEAF_NAMES:", hasCj);
