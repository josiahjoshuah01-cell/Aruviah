-- Nav rail: Home before Electronics
update categories set sort_order = 1 where slug = 'home';
update categories set sort_order = 2 where slug = 'electronics';
