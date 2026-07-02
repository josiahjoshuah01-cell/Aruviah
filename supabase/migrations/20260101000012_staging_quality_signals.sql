-- Staging quality signals: verified warehouse + CJ supplier review summary (staging-only reviews)

alter table staged_products
  add column if not exists is_verified_warehouse boolean,
  add column if not exists cj_review_count integer,
  add column if not exists cj_review_avg_score numeric(4, 2);

alter table product_variants
  add column if not exists is_verified_warehouse boolean;

comment on column staged_products.is_verified_warehouse is 'True when all variants use CJ verified warehouse stock; false if any unverified; null if unknown/mixed';
comment on column staged_products.cj_review_count is 'CJ supplier review count from productComments — admin staging only, not copied to live products';
comment on column staged_products.cj_review_avg_score is 'CJ supplier review average score — admin staging only, not copied to live products';
comment on column product_variants.is_verified_warehouse is 'CJ verifiedWarehouse flag: true=verified (1), false=unverified (2), null=unknown';
