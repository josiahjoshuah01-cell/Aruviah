-- Persist why CJ fulfillment stalled + manual shipment tracking.

alter table orders
  add column if not exists fulfillment_note text,
  add column if not exists tracking_number text;

comment on column orders.fulfillment_note is 'Why auto-fulfillment failed or was skipped (unmapped SKU, CJ API error, etc.)';
comment on column orders.tracking_number is 'Carrier tracking number when manually marked shipped';
