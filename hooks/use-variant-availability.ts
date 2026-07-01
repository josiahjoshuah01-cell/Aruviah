"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type VariantAvailability = {
  available: boolean;
  stock: number;
};

/**
 * Live cart availability: covers deleted variants, inactive product/variant, and zero stock.
 */
export function useVariantAvailability(
  variantIds: string[],
  enabled: boolean
) {
  const [loaded, setLoaded] = useState(false);
  const [availability, setAvailability] = useState<
    Map<string, VariantAvailability>
  >(new Map());

  useEffect(() => {
    if (!enabled || variantIds.length === 0) {
      setLoaded(false);
      setAvailability(new Map());
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("product_variants")
      .select("id, stock, is_active, product:products(is_active)")
      .in("id", variantIds)
      .then(({ data }) => {
        if (cancelled) return;
        const map = new Map<string, VariantAvailability>();

        for (const id of variantIds) {
          const row = (data ?? []).find((r) => r.id === id);
          if (!row) {
            map.set(id, { available: false, stock: 0 });
            continue;
          }
          const product = Array.isArray(row.product)
            ? row.product[0]
            : row.product;
          const active =
            row.is_active && product?.is_active !== false && row.stock > 0;
          map.set(id, { available: active, stock: row.stock });
        }

        setAvailability(map);
        setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, variantIds.join(",")]);

  return { loaded, availability };
}
