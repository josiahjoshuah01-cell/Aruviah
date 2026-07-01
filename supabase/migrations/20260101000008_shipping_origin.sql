-- Shipping origin visibility for CJ staging and live variants.

alter table staged_products
  add column if not exists ships_from_country text,
  add column if not exists is_fast_shipping boolean;

alter table product_variants
  add column if not exists ships_from_country text,
  add column if not exists is_fast_shipping boolean;

create index if not exists product_variants_fast_shipping_idx
  on product_variants (is_fast_shipping)
  where is_fast_shipping = true;
