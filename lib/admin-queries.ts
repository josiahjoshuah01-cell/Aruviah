import { createServiceClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/order-status";
import { FULFILLMENT_QUEUE_STATUSES } from "@/lib/order-status";
import type { ShippingInfo } from "@/lib/types";

export type AdminOrderRow = {
  id: string;
  user_id: string;
  customer_email: string | null;
  total: number;
  currency: string;
  status: string;
  paypal_order_id: string | null;
  cj_order_id: string | null;
  fulfillment_note: string | null;
  tracking_number: string | null;
  shipping: ShippingInfo;
  created_at: string;
};

export type AdminOrderItemRow = {
  id: string;
  qty: number;
  price: number;
  variant_id: string;
  sku: string;
  color: string | null;
  size: string | null;
  title: string;
  image_url: string | null;
};

export type AdminOrderDetail = AdminOrderRow & {
  items: AdminOrderItemRow[];
};

export type AdminNavBadges = {
  fulfillmentCount: number;
  stagingPendingCount: number;
};

async function emailsForUserIds(
  userIds: string[]
): Promise<Map<string, string | null>> {
  const supabase = createServiceClient();
  const unique = [...new Set(userIds)];
  const map = new Map<string, string | null>();

  await Promise.all(
    unique.map(async (id) => {
      const { data } = await supabase.auth.admin.getUserById(id);
      map.set(id, data.user?.email ?? null);
    })
  );

  return map;
}

function mapOrderRow(
  row: {
    id: string;
    user_id: string;
    total: number;
    currency: string;
    status: string;
    paypal_order_id: string | null;
    cj_order_id: string | null;
    fulfillment_note: string | null;
    tracking_number: string | null;
    shipping: unknown;
    created_at: string;
  },
  email: string | null
): AdminOrderRow {
  return {
    id: row.id,
    user_id: row.user_id,
    customer_email: email,
    total: Number(row.total),
    currency: row.currency,
    status: row.status,
    paypal_order_id: row.paypal_order_id,
    cj_order_id: row.cj_order_id,
    fulfillment_note: row.fulfillment_note,
    tracking_number: row.tracking_number,
    shipping: row.shipping as ShippingInfo,
    created_at: row.created_at,
  };
}

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const supabase = createServiceClient();
  const [fulfillment, staging] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", FULFILLMENT_QUEUE_STATUSES),
    supabase
      .from("staged_products")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    fulfillmentCount: fulfillment.count ?? 0,
    stagingPendingCount: staging.count ?? 0,
  };
}

export async function listAdminOrders(options: {
  status?: string;
  q?: string;
  sort?: "newest" | "oldest";
}): Promise<AdminOrderRow[]> {
  const supabase = createServiceClient();
  let query = supabase
    .from("orders")
    .select(
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, fulfillment_note, tracking_number, shipping, created_at"
    );

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const ascending = options.sort === "oldest";
  query = query.order("created_at", { ascending });

  const { data, error } = await query.limit(200);
  if (error) throw error;

  let rows = data ?? [];

  if (options.q?.trim()) {
    const needle = options.q.trim().toLowerCase();
    const emails = await emailsForUserIds(rows.map((r) => r.user_id));
    rows = rows.filter((r) => {
      const email = emails.get(r.user_id)?.toLowerCase() ?? "";
      return (
        r.id.toLowerCase().includes(needle) ||
        (r.paypal_order_id?.toLowerCase().includes(needle) ?? false) ||
        email.includes(needle)
      );
    });
  }

  const emails = await emailsForUserIds(rows.map((r) => r.user_id));
  return rows.map((r) => mapOrderRow(r, emails.get(r.user_id) ?? null));
}

export async function getAdminOrderDetail(
  orderId: string
): Promise<AdminOrderDetail | null> {
  const supabase = createServiceClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, fulfillment_note, tracking_number, shipping, created_at"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select(
      "id, qty, price, variant_id, variant:product_variants(sku, color, size, image_url, product:products(title))"
    )
    .eq("order_id", orderId);

  if (itemsError) throw itemsError;

  const emails = await emailsForUserIds([order.user_id]);
  const mappedItems: AdminOrderItemRow[] = (items ?? []).map((item) => {
    const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant;
    const product = Array.isArray(variant?.product)
      ? variant.product[0]
      : variant?.product;
    return {
      id: item.id,
      qty: item.qty,
      price: Number(item.price),
      variant_id: item.variant_id,
      sku: variant?.sku ?? "—",
      color: variant?.color ?? null,
      size: variant?.size ?? null,
      title: product?.title ?? "Product",
      image_url: variant?.image_url ?? null,
    };
  });

  return {
    ...mapOrderRow(order, emails.get(order.user_id) ?? null),
    items: mappedItems,
  };
}

export async function listFulfillmentQueue(): Promise<AdminOrderDetail[]> {
  const supabase = createServiceClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, fulfillment_note, tracking_number, shipping, created_at"
    )
    .in("status", FULFILLMENT_QUEUE_STATUSES)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!orders?.length) return [];

  const emails = await emailsForUserIds(orders.map((o) => o.user_id));
  const orderIds = orders.map((o) => o.id);

  const { data: allItems, error: itemsError } = await supabase
    .from("order_items")
    .select(
      "id, order_id, qty, price, variant_id, variant:product_variants(sku, color, size, image_url, product:products(title))"
    )
    .in("order_id", orderIds);

  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, AdminOrderItemRow[]>();
  for (const item of allItems ?? []) {
    const variant = Array.isArray(item.variant) ? item.variant[0] : item.variant;
    const product = Array.isArray(variant?.product)
      ? variant.product[0]
      : variant?.product;
    const row: AdminOrderItemRow = {
      id: item.id,
      qty: item.qty,
      price: Number(item.price),
      variant_id: item.variant_id,
      sku: variant?.sku ?? "—",
      color: variant?.color ?? null,
      size: variant?.size ?? null,
      title: product?.title ?? "Product",
      image_url: variant?.image_url ?? null,
    };
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(row);
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map((order) => ({
    ...mapOrderRow(order, emails.get(order.user_id) ?? null),
    items: itemsByOrder.get(order.id) ?? [],
  }));
}

export function inferFulfillmentStuckReason(order: AdminOrderRow): string {
  if (order.fulfillment_note) return order.fulfillment_note;
  if (order.status === "paid_needs_manual_fulfillment") {
    return "CJ auto-fulfillment skipped — one or more line-item SKUs lack a CJ variant mapping.";
  }
  if (order.status === "paid_fulfillment_pending") {
    return "CJ API error during auto-fulfillment — check server logs for details.";
  }
  return "Awaiting manual fulfillment.";
}

export async function updateOrderStatusAdmin(
  orderId: string,
  status: OrderStatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markOrderManuallyFulfilled(
  orderId: string,
  trackingNumber?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("orders")
    .update({
      status: "shipped",
      tracking_number: trackingNumber?.trim() || null,
    })
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
