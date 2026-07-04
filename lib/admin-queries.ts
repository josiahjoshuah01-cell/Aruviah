import { createServiceClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/order-status";
import { FULFILLMENT_QUEUE_STATUSES, PAID_PLUS_ORDER_STATUSES } from "@/lib/order-status";
import type { CjPaymentStatus } from "@/lib/cj-payment-types";
import type { ShippingInfo } from "@/lib/types";
import {
  formatCjInterceptReasons,
  hasCjInterceptReasons,
} from "@/lib/cj-intercept-display";

export type AdminOrderRow = {
  id: string;
  user_id: string;
  customer_email: string | null;
  total: number;
  currency: string;
  status: string;
  paypal_order_id: string | null;
  cj_order_id: string | null;
  cj_shipment_order_id: string | null;
  cj_payment_status: CjPaymentStatus;
  cj_order_amount_usd: number | null;
  fulfillment_note: string | null;
  cj_intercept_reasons: unknown[] | null;
  tracking_number: string | null;
  cj_track_number: string | null;
  cj_tracking_provider: string | null;
  cj_tracking_url: string | null;
  cj_tracking_status: string | null;
  cj_last_mile_carrier: string | null;
  cj_last_mile_track_number: string | null;
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
  cjUnpaidCount: number;
};

export type AdminOverviewStats = {
  paidOrderCount: number;
  revenueUsd: number;
  grossProfitUsd: number;
  profitMarginPct: number | null;
  lineItemsWithCost: number;
  lineItemUnitsWithCost: number;
  lineItemsWithoutCost: number;
  lineItemUnitsWithoutCost: number;
};

export type CjAutoPayLogRow = {
  id: string;
  order_id: string;
  cj_shipment_order_id: string | null;
  amount_usd: number;
  outcome: string;
  error_message: string | null;
  created_at: string;
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
    cj_shipment_order_id: string | null;
    cj_payment_status: string;
    cj_order_amount_usd: number | null;
    fulfillment_note: string | null;
    cj_intercept_reasons: unknown[] | null;
    tracking_number: string | null;
    cj_track_number: string | null;
    cj_tracking_provider: string | null;
    cj_tracking_url: string | null;
    cj_tracking_status: string | null;
    cj_last_mile_carrier: string | null;
    cj_last_mile_track_number: string | null;
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
    cj_shipment_order_id: row.cj_shipment_order_id,
    cj_payment_status: row.cj_payment_status as CjPaymentStatus,
    cj_order_amount_usd:
      row.cj_order_amount_usd != null
        ? Number(row.cj_order_amount_usd)
        : null,
    fulfillment_note: row.fulfillment_note,
    cj_intercept_reasons: hasCjInterceptReasons(row.cj_intercept_reasons)
      ? row.cj_intercept_reasons
      : null,
    tracking_number: row.tracking_number,
    cj_track_number: row.cj_track_number,
    cj_tracking_provider: row.cj_tracking_provider,
    cj_tracking_url: row.cj_tracking_url,
    cj_tracking_status: row.cj_tracking_status,
    cj_last_mile_carrier: row.cj_last_mile_carrier,
    cj_last_mile_track_number: row.cj_last_mile_track_number,
    shipping: row.shipping as ShippingInfo,
    created_at: row.created_at,
  };
}

export async function getAdminNavBadges(): Promise<AdminNavBadges> {
  const supabase = createServiceClient();
  const [fulfillment, staging, cjUnpaid] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", FULFILLMENT_QUEUE_STATUSES),
    supabase
      .from("staged_products")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("cj_payment_status", "unpaid"),
  ]);

  return {
    fulfillmentCount: fulfillment.count ?? 0,
    stagingPendingCount: staging.count ?? 0,
    cjUnpaidCount: cjUnpaid.count ?? 0,
  };
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const supabase = createServiceClient();

  const [ordersRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total")
      .in("status", PAID_PLUS_ORDER_STATUSES),
    supabase
      .from("order_items")
      .select("qty, price, cost_price_usd, orders!inner(status)")
      .in("orders.status", PAID_PLUS_ORDER_STATUSES),
  ]);

  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;

  const paidOrderCount = ordersRes.data?.length ?? 0;
  const revenueUsd = (ordersRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.total),
    0
  );

  let grossProfitUsd = 0;
  let revenueOnCostedItems = 0;
  let lineItemsWithCost = 0;
  let lineItemUnitsWithCost = 0;
  let lineItemsWithoutCost = 0;
  let lineItemUnitsWithoutCost = 0;

  for (const row of itemsRes.data ?? []) {
    const qty = Number(row.qty);
    const price = Number(row.price);
    const cost =
      row.cost_price_usd != null ? Number(row.cost_price_usd) : null;

    if (cost != null) {
      lineItemsWithCost += 1;
      lineItemUnitsWithCost += qty;
      const lineRevenue = price * qty;
      revenueOnCostedItems += lineRevenue;
      grossProfitUsd += (price - cost) * qty;
    } else {
      lineItemsWithoutCost += 1;
      lineItemUnitsWithoutCost += qty;
    }
  }

  const profitMarginPct =
    revenueOnCostedItems > 0
      ? (grossProfitUsd / revenueOnCostedItems) * 100
      : null;

  return {
    paidOrderCount,
    revenueUsd,
    grossProfitUsd,
    profitMarginPct,
    lineItemsWithCost,
    lineItemUnitsWithCost,
    lineItemsWithoutCost,
    lineItemUnitsWithoutCost,
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
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, cj_shipment_order_id, cj_payment_status, cj_order_amount_usd, fulfillment_note, cj_intercept_reasons, tracking_number, cj_track_number, cj_tracking_provider, cj_tracking_url, cj_tracking_status, cj_last_mile_carrier, cj_last_mile_track_number, shipping, created_at"
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
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, cj_shipment_order_id, cj_payment_status, cj_order_amount_usd, fulfillment_note, cj_intercept_reasons, tracking_number, cj_track_number, cj_tracking_provider, cj_tracking_url, cj_tracking_status, cj_last_mile_carrier, cj_last_mile_track_number, shipping, created_at"
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
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, cj_shipment_order_id, cj_payment_status, cj_order_amount_usd, fulfillment_note, cj_intercept_reasons, tracking_number, cj_track_number, cj_tracking_provider, cj_tracking_url, cj_tracking_status, cj_last_mile_carrier, cj_last_mile_track_number, shipping, created_at"
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

export async function listRecentAutoPayLogs(
  limit = 20
): Promise<CjAutoPayLogRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("cj_auto_pay_logs")
    .select(
      "id, order_id, cj_shipment_order_id, amount_usd, outcome, error_message, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    amount_usd: Number(row.amount_usd),
  }));
}

export async function listOrdersNeedingCjPayment(): Promise<AdminOrderRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, total, currency, status, paypal_order_id, cj_order_id, cj_shipment_order_id, cj_payment_status, cj_order_amount_usd, fulfillment_note, cj_intercept_reasons, tracking_number, cj_track_number, cj_tracking_provider, cj_tracking_url, cj_tracking_status, cj_last_mile_carrier, cj_last_mile_track_number, shipping, created_at"
    )
    .eq("cj_payment_status", "unpaid")
    .order("created_at", { ascending: true });

  if (error) throw error;
  const emails = await emailsForUserIds((data ?? []).map((r) => r.user_id));
  return (data ?? []).map((r) => mapOrderRow(r, emails.get(r.user_id) ?? null));
}

export type FulfillmentStuckKind =
  | "cj_intercept"
  | "unmapped_sku"
  | "api_error"
  | "live_stock"
  | "other";

export function getFulfillmentStuckKind(
  order: AdminOrderRow
): FulfillmentStuckKind {
  if (hasCjInterceptReasons(order.cj_intercept_reasons)) {
    return "cj_intercept";
  }
  if (
    order.status === "paid_needs_manual_fulfillment" &&
    order.fulfillment_note?.startsWith("Unmapped SKU")
  ) {
    return "unmapped_sku";
  }
  if (
    order.status === "paid_needs_manual_fulfillment" &&
    order.fulfillment_note?.includes("live stock")
  ) {
    return "live_stock";
  }
  if (order.status === "paid_fulfillment_pending") {
    return "api_error";
  }
  return "other";
}

export function inferFulfillmentStuckReason(order: AdminOrderRow): string {
  if (hasCjInterceptReasons(order.cj_intercept_reasons)) {
    return formatCjInterceptReasons(order.cj_intercept_reasons).join(" · ");
  }
  if (order.fulfillment_note) return order.fulfillment_note;
  if (order.status === "paid_needs_manual_fulfillment") {
    return "CJ auto-fulfillment skipped — one or more line-item SKUs lack a CJ variant mapping.";
  }
  if (order.status === "paid_fulfillment_pending") {
    return "CJ API error during auto-fulfillment — check server logs for details.";
  }
  return "Awaiting manual fulfillment.";
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  created_at: string;
  adminKind: "founder" | "granted" | null;
};

export async function listAllUsers(): Promise<AdminUserRow[]> {
  const supabase = createServiceClient();
  const founderEmail = process.env.ADMIN_EMAIL?.trim() ?? null;

  const { data: adminRows } = await supabase
    .from("admin_users")
    .select("user_id");
  const adminSet = new Set((adminRows ?? []).map((r) => r.user_id));

  const {
    data: { users },
  } = await supabase.auth.admin.listUsers({ perPage: 1000 });

  return (users ?? []).map((u) => {
    let adminKind: "founder" | "granted" | null = null;
    if (founderEmail && u.email === founderEmail) {
      adminKind = "founder";
    } else if (adminSet.has(u.id)) {
      adminKind = "granted";
    }
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at,
      adminKind,
    };
  });
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

export type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  section: string | null;
  product_count: number;
};

/** All categories with active product counts — for admin section assignment. */
export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  const supabase = createServiceClient();

  const { data: categories, error: catError } = await supabase
    .from("categories")
    .select("id, name, slug, sort_order, section")
    .order("sort_order", { ascending: true });

  if (catError) throw catError;
  if (!categories?.length) return [];

  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("category_id")
    .eq("is_active", true)
    .not("category_id", "is", null);

  if (prodError) throw prodError;

  const counts = new Map<string, number>();
  for (const p of products ?? []) {
    if (p.category_id) {
      counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
    }
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sort_order: c.sort_order,
    section: c.section ?? null,
    product_count: counts.get(c.id) ?? 0,
  }));
}

/** Distinct non-empty section labels already in use — for admin dropdown suggestions. */
export async function listCategorySections(): Promise<string[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("categories")
    .select("section")
    .not("section", "is", null);

  if (error) throw error;

  const unique = new Set<string>();
  for (const row of data ?? []) {
    const s = row.section?.trim();
    if (s) unique.add(s);
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}
