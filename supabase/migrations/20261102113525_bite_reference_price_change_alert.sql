begin;

-- Capture changes to every exposed source-price field without changing
-- merchant pricing or existing alert history.
create or replace function private.capture_bite_catalog_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  changes text[] := array[]::text[];
  change_kind text := 'updated';
  before_data jsonb;
  after_data jsonb;
begin
  if not exists (select 1 from private.bite_catalog_sync where id and last_success is not null) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    changes := array['new'];
    change_kind := 'new';
  else
    if old.active and not new.active then
      changes := array['active'];
      change_kind := 'removed';
    elsif not old.active and new.active then
      changes := array['active'];
      change_kind := 'returned';
    end if;
    if old.price is distinct from new.price or old.currency is distinct from new.currency then
      changes := array_append(changes, 'price');
    end if;
    if old.normal_price is distinct from new.normal_price then
      changes := array_append(changes, 'normal_price');
    end if;
    if old.previous_price is distinct from new.previous_price then
      changes := array_append(changes, 'reference_price');
    end if;
    if old.stock is distinct from new.stock or old.in_stock is distinct from new.in_stock then
      changes := array_append(changes, 'stock');
    end if;
    if old.name is distinct from new.name or old.description is distinct from new.description
      or old.delivery is distinct from new.delivery or old.category is distinct from new.category then
      changes := array_append(changes, 'details');
    end if;
    if old.promotion is distinct from new.promotion then
      changes := array_append(changes, 'promotion');
    end if;
  end if;

  if cardinality(changes) = 0 then return new; end if;
  if tg_op = 'UPDATE' then
    before_data := jsonb_build_object(
      'name', old.name, 'description', old.description, 'category', old.category,
      'delivery', old.delivery, 'promotion', old.promotion, 'price', old.price,
      'normalPrice', old.normal_price, 'previousPrice', old.previous_price,
      'currency', old.currency, 'stock', old.stock, 'inStock', old.in_stock,
      'active', old.active
    );
  end if;
  after_data := jsonb_build_object(
    'name', new.name, 'description', new.description, 'category', new.category,
    'delivery', new.delivery, 'promotion', new.promotion, 'price', new.price,
    'normalPrice', new.normal_price, 'previousPrice', new.previous_price,
    'currency', new.currency, 'stock', new.stock, 'inStock', new.in_stock,
    'active', new.active
  );
  insert into private.bite_catalog_changes (external_id, kind, fields, before_value, after_value)
  values (new.external_id, change_kind, changes, before_data, after_data);
  return new;
end $$;

commit;
