-- CJ shipment tracking from getOrderDetail (trackNumber, trackingProvider, trackingUrl)

alter table orders
  add column if not exists cj_track_number text,
  add column if not exists cj_tracking_provider text,
  add column if not exists cj_tracking_url text;

comment on column orders.cj_track_number is 'CJ trackNumber from getOrderDetail when order ships';
comment on column orders.cj_tracking_provider is 'CJ trackingProvider (carrier/logistics name)';
comment on column orders.cj_tracking_url is 'CJ trackingUrl for customer tracking link';
