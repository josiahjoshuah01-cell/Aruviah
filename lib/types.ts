export type Category = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type Product = {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  price_usd: number;
  image_url: string | null;
  sku: string;
  stock: number;
  sold_count: number;
  is_active: boolean;
  created_at: string;
};

export type Order = {
  id: string;
  user_id: string;
  total: number;
  currency: string;
  status: string;
  paypal_order_id: string | null;
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
  product_id: string;
  qty: number;
  price: number;
  product?: Pick<Product, "title" | "image_url">;
};

export type CartItem = {
  productId: string;
  title: string;
  price: number;
  qty: number;
  image: string | null;
};
