-- CJ leaf category mapping (flat — no hierarchy)

alter table categories
  add column if not exists cj_category_id text;

create unique index if not exists categories_cj_category_id_key
  on categories (cj_category_id)
  where cj_category_id is not null;

comment on column categories.cj_category_id is 'CJ leaf categoryId from GET /product/getCategory — NULL on legacy Aruviah categories until manually mapped';
