/**
 * Seed script — run with: npm run seed
 * Loads .env.local automatically. Requires SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CATEGORIES = [
  { name: "Home", slug: "home", sort_order: 1 },
  { name: "Electronics", slug: "electronics", sort_order: 2 },
  { name: "Beauty", slug: "beauty", sort_order: 3 },
  { name: "Fashion", slug: "fashion", sort_order: 4 },
  { name: "Toys", slug: "toys", sort_order: 5 },
  { name: "Sports", slug: "sports", sort_order: 6 },
  { name: "Kitchen", slug: "kitchen", sort_order: 7 },
  { name: "Garden", slug: "garden", sort_order: 8 },
];

const PRODUCT_TITLES: Record<string, string[]> = {
  electronics: [
    "Wireless Bluetooth Earbuds Pro",
    "USB-C Fast Charging Cable 3-Pack",
    "Portable Power Bank 20000mAh",
    "Smart Watch Fitness Tracker",
    "Phone Ring Light Clip",
    "Mini Bluetooth Speaker",
    "Wireless Charging Pad",
    "LED Desk Lamp with USB Port",
    "Laptop Stand Adjustable",
    "HD Webcam 1080p",
    "Mechanical Keyboard RGB",
    "Wireless Mouse Ergonomic",
    "Tablet Stand Foldable",
    "Cable Management Box",
    "Screen Protector Tempered Glass",
  ],
  home: [
    "Memory Foam Pillow Set of 2",
    "Blackout Curtains 2 Panels",
    "Scented Candle Gift Set",
    "Wall Art Canvas Print",
    "Throw Blanket Soft Fleece",
    "Desk Organizer Bamboo",
    "Coat Hooks Wall Mounted",
    "Shoe Rack 4-Tier",
    "Laundry Hamper Collapsible",
    "Picture Frame Set of 3",
    "Door Draft Stopper",
    "Shelf Brackets Floating",
    "Bathroom Mat Non-Slip",
    "Clothes Hangers Velvet 50pk",
    "Drawer Dividers Adjustable",
  ],
  beauty: [
    "Vitamin C Serum 30ml",
    "Hydrating Face Moisturizer",
    "Makeup Brush Set 12pc",
    "Hair Dryer Ionic",
    "Nail Polish Set 6 Colors",
    "Facial Cleansing Brush",
    "Lip Gloss Set Matte",
    "Eye Shadow Palette Nude",
    "Hair Straightener Ceramic",
    "Body Lotion Shea Butter",
    "Sunscreen SPF 50",
    "Makeup Sponge Set",
    "Hair Clips Set Decorative",
    "Face Mask Sheet 10pk",
    "Perfume Roller Travel Size",
  ],
  fashion: [
    "Cotton T-Shirt Basic Fit",
    "Denim Jacket Classic",
    "Running Sneakers Lightweight",
    "Leather Belt Genuine",
    "Sunglasses Polarized UV400",
    "Canvas Tote Bag",
    "Wool Beanie Winter",
    "Silk Scarf Print",
    "Ankle Socks 6-Pack",
    "Crossbody Bag Mini",
    "Baseball Cap Adjustable",
    "Leggings High Waist",
    "Cardigan Knit Open Front",
    "Flip Flops Comfort",
    "Wallet RFID Blocking",
  ],
  toys: [
    "Building Blocks 500pc Set",
    "Plush Teddy Bear 12in",
    "Remote Control Car",
    "Puzzle 1000 Pieces Landscape",
    "Board Game Family Night",
    "Action Figure Collectible",
    "Art Supplies Kit Kids",
    "Bubble Machine Automatic",
    "Stuffed Animal Unicorn",
    "Science Experiment Kit",
    "Play Dough 24 Colors",
    "Yo-Yo Professional",
    "Kite Rainbow Large",
    "Doll House Miniature",
    "Card Game Strategy",
  ],
  sports: [
    "Yoga Mat 6mm Thick",
    "Resistance Bands Set",
    "Water Bottle Insulated 32oz",
    "Jump Rope Speed",
    "Dumbbells Pair 10lb",
    "Gym Bag Duffel",
    "Fitness Tracker Band",
    "Foam Roller Muscle",
    "Tennis Balls 3-Pack",
    "Soccer Ball Size 5",
    "Swim Goggles Anti-Fog",
    "Cycling Gloves Padded",
    "Hiking Backpack 30L",
    "Knee Support Brace",
    "Sports Headband 3-Pack",
  ],
  kitchen: [
    "Non-Stick Frying Pan 10in",
    "Knife Set Stainless 6pc",
    "Cutting Board Bamboo Large",
    "Food Storage Containers 10pc",
    "Electric Kettle 1.7L",
    "Coffee Maker Drip",
    "Silicone Spatula Set",
    "Measuring Cups Stainless",
    "Blender Personal Size",
    "Dish Drying Rack",
    "Oven Mitts Heat Resistant",
    "Spice Rack Wall Mount",
    "Lunch Box Insulated",
    "Wine Opener Electric",
    "Ice Cube Tray Silicone",
  ],
  garden: [
    "Garden Tool Set 5pc",
    "Plant Pots Ceramic 3pk",
    "Hose Nozzle 8-Pattern",
    "Garden Gloves Leather",
    "Seed Starter Kit",
    "Pruning Shears Sharp",
    "Watering Can 2 Gallon",
    "Solar Garden Lights 6pk",
    "Bird Feeder Hanging",
    "Compost Bin Small",
    "Garden Kneeler Pad",
    "Plant Labels 50pk",
    "Garden Trowel Stainless",
    "Outdoor Thermometer",
    "Wind Chimes Bamboo",
  ],
};

function randomPrice(): number {
  return Math.round((Math.random() * 80 + 5) * 100) / 100;
}

function randomStock(): number {
  const r = Math.random();
  if (r < 0.1) return Math.floor(Math.random() * 8) + 1; // low stock
  return Math.floor(Math.random() * 200) + 10;
}

function randomSold(): number {
  return Math.floor(Math.random() * 500);
}

async function seed() {
  console.log("Seeding Aruviah catalog…");

  // Upsert categories
  const { data: categories, error: catError } = await supabase
    .from("categories")
    .upsert(CATEGORIES, { onConflict: "slug" })
    .select();

  if (catError) {
    console.error("Category seed failed:", catError);
    process.exit(1);
  }

  const categoryMap = new Map(categories!.map((c) => [c.slug, c.id]));

  const products = [];
  let skuIndex = 1;

  for (const [slug, titles] of Object.entries(PRODUCT_TITLES)) {
    const categoryId = categoryMap.get(slug);
    for (const title of titles) {
      products.push({
        category_id: categoryId,
        title,
        description: `High-quality ${title.toLowerCase()} — ships fast from our warehouse.`,
        price_usd: randomPrice(),
        image_url: `https://picsum.photos/seed/${skuIndex}/400/400`,
        sku: `ARV-${String(skuIndex).padStart(5, "0")}`,
        stock: randomStock(),
        sold_count: randomSold(),
        is_active: true,
      });
      skuIndex++;
    }
  }

  const { error: prodError } = await supabase
    .from("products")
    .upsert(products, { onConflict: "sku" });

  if (prodError) {
    console.error("Product seed failed:", prodError);
    process.exit(1);
  }

  console.log(`Seeded ${categories!.length} categories and ${products.length} products.`);
}

seed().catch(console.error);
