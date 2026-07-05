/**
 * Quick checks for sanitizeCjTitle().
 * Usage: npx tsx scripts/test-cj-title.ts
 */
import { sanitizeCjTitle } from "../lib/cj-title";

const cases = [
  "For T Oyota 2018-2022 Camry Sedan MUG Style Window Visors Rain Sun Guard Vent 4Pc",
  "Grey Carpet Dash Mat Compatible With T Oyota Camry 1992-1993 Dash Cover",
  "This Shampoo Deeply Moisturizes The Scalp, Controls Frizz, And Is Suitable For Dry And Damaged Hair. It Enhances Hair Shine, Makes It Easier To Comb, Moisturizes Hair Follicles To Keep Them Soft And S",
  "Elevated Dog Bed For Large Dogs XL, Raised Dog Bed Cot With Washable Pillow, Indoor & Outdoor Cooling Dog Bed Hammock, Heavy Duty Steel Frame Dog Bed With Breathable Teslin Mesh, Grey",
  "USB C Charger Block Free Shipping Hot Sale 24W PD Power Adapter Fast Charging",
  "Mobile Phone Screen Cleaner Artifact Storage Integrated Mobile Phone Portable Computer Screen Cleaner Set",
];

console.log("=== sanitizeCjTitle samples ===\n");
for (const raw of cases) {
  const cleaned = sanitizeCjTitle(raw);
  console.log(`RAW (${raw.length}): ${raw}`);
  console.log(`OUT (${cleaned.length}): ${cleaned}`);
  console.log();
}
