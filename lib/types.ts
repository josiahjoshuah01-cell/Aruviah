export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  cj_category_id?: string | null;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  cj_variant_id: string | null;
  color: string | null;
  size: string | null;
  sku: string;
  price_usd: number;
  shipping_cost_usd: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  ships_from_country: string | null;
  is_fast_shipping: boolean;
};

/** Listing-level product; price/stock/sku come from default active variant. */
export type Product = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  sold_count: number;
  is_active: boolean;
  created_at: string;
  price_usd: number;
  sku: string;
  stock: number;
  shipping_cost_usd: number;
  default_variant_id: string;
};

export type Review = {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type Order = {
  id: string;
  user_id: string;
  total: number;
  currency: string;
  status: string;
  paypal_order_id: string | null;
  cj_track_number: string | null;
  cj_tracking_provider: string | null;
  cj_tracking_url: string | null;
  cj_tracking_status: string | null;
  cj_last_mile_carrier: string | null;
  cj_last_mile_track_number: string | null;
  shipping: ShippingInfo;
  created_at: string;
};

export type ShippingInfo = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  variant_id: string;
  qty: number;
  price: number;
  variant?: {
    sku: string;
    color: string | null;
    size: string | null;
    image_url: string | null;
    shipping_cost_usd: number;
    product?: Pick<Product, "title" | "image_url">;
  };
};

export type UserOrderSummary = Order & {
  order_items: {
    qty: number;
    variant: {
      image_url: string | null;
      product: { image_url: string | null; title: string } | null;
    } | null;
  }[];
};

export type CartItem = {
  variantId: string;
  productId: string;
  title: string;
  color: string | null;
  size: string | null;
  price: number;
  shippingCost: number;
  qty: number;
  image: string | null;
};

export type ReviewWithAuthor = Review & {
  author_name: string;
};

export type ReviewSummary = {
  average_rating: number;
  review_count: number;
};

export type ReviewEligibility =
  | { status: "anonymous" }
  | { status: "not_eligible" }
  | { status: "eligible"; orderId: string }
  | { status: "already_reviewed" };

export type CatalogSort =
  | "price-asc"
  | "price-desc"
  | "newest"
  | "bestselling";

export type CatalogFilters = {
  categorySlug?: string;
  search?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: CatalogSort;
  limit?: number;
  trending?: boolean;
};

export type ProductWithVariants = Product & {
  variants: ProductVariant[];
};
