"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useVariantStock(variantIds: string[], enabled: boolean) {
  const [stocks, setStocks] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled || variantIds.length === 0) return;

    const supabase = createClient();
    supabase
      .from("product_variants")
      .select("id, stock")
      .in("id", variantIds)
      .then(({ data }) => {
        setStocks(new Map((data ?? []).map((row) => [row.id, row.stock])));
      });
  }, [enabled, variantIds.join(",")]);

  return stocks;
}
