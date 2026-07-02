-- Live carrier tracking from GET /logistic/trackInfo (synced via syncCjOrderTracking)

alter table orders
  add column if not exists cj_tracking_status text,
  add column if not exists cj_last_mile_carrier text,
  add column if not exists cj_last_mile_track_number text;

comment on column orders.cj_tracking_status is 'CJ trackInfo trackingStatus e.g. In transit, Delivered';
comment on column orders.cj_last_mile_carrier is 'CJ trackInfo lastMileCarrier';
comment on column orders.cj_last_mile_track_number is 'CJ trackInfo lastTrackNumber (last-mile carrier tracking #)';
