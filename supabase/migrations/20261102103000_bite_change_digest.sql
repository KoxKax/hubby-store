begin;

-- Keep every supplier snapshot change in the audit trail. Only the unread
-- inbox groups recurring stock-only changes from the same product.
create or replace function private.bite_catalog_changes_page(
  p_actor uuid, p_page integer, p_unread_only boolean
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb; total_count bigint;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_page is null or p_page not between 1 and 100000 or p_unread_only is null then
    raise invalid_parameter_value;
  end if;

  if p_unread_only then
    select count(distinct case
      when kind='updated' and fields=array['stock']::text[] then 'stock:'||external_id
      else 'event:'||id::text end)
    into total_count
    from private.bite_catalog_changes where acknowledged_at is null;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', newest.id, 'externalId', newest.external_id,
      'kind', newest.kind, 'fields', newest.fields,
      'before', oldest.before_value, 'after', newest.after_value,
      'createdAt', newest.created_at, 'read', false,
      'occurrences', grouped.occurrences
    ) order by newest.id desc), '[]'::jsonb)
    into rows
    from (
      select min(id) as first_id, max(id) as last_id, count(*) as occurrences
      from private.bite_catalog_changes
      where acknowledged_at is null
      group by case when kind='updated' and fields=array['stock']::text[]
        then 'stock:'||external_id else 'event:'||id::text end
      order by max(id) desc
      offset (p_page-1)*50 limit 50
    ) grouped
    join private.bite_catalog_changes oldest on oldest.id=grouped.first_id
    join private.bite_catalog_changes newest on newest.id=grouped.last_id;
  else
    select count(*) into total_count from private.bite_catalog_changes;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'externalId', external_id, 'kind', kind,
      'fields', fields, 'before', before_value, 'after', after_value,
      'createdAt', created_at, 'read', acknowledged_at is not null,
      'occurrences', 1
    ) order by id desc), '[]'::jsonb)
    into rows
    from (select * from private.bite_catalog_changes order by id desc
      offset (p_page-1)*50 limit 50) c;
  end if;
  return jsonb_build_object(
    'unread', (select count(distinct case
      when kind='updated' and fields=array['stock']::text[] then 'stock:'||external_id
      else 'event:'||id::text end)
      from private.bite_catalog_changes where acknowledged_at is null),
    'total', total_count, 'items', rows);
end $$;

create or replace function private.bite_catalog_unread_count(p_actor uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return (select count(distinct case
    when kind='updated' and fields=array['stock']::text[] then 'stock:'||external_id
    else 'event:'||id::text end)::integer
    from private.bite_catalog_changes where acknowledged_at is null);
end $$;

-- Acknowledging the latest event in a displayed stock digest acknowledges
-- only that product's preceding stock-only events, never newer ones.
create or replace function private.bite_catalog_ack_page(p_actor uuid,p_ids bigint[])
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_ids is null or cardinality(p_ids) not between 1 and 50 then
    raise invalid_parameter_value;
  end if;
  update private.bite_catalog_changes c
    set acknowledged_at=now(), acknowledged_by=p_actor
    where c.acknowledged_at is null and (
      c.id=any(p_ids) or (
        c.kind='updated' and c.fields=array['stock']::text[] and
        exists (select 1 from private.bite_catalog_changes selected
          where selected.id=any(p_ids)
            and selected.kind='updated' and selected.fields=array['stock']::text[]
            and selected.external_id=c.external_id and c.id<=selected.id)
      )
    );
  get diagnostics n=row_count;
  return n;
end $$;

-- Newly listed item; retain source details and an editorial review gate.
insert into private.bite_catalog_copy(external_id,description_vi,review_status)
select '845',
  'Liên kết kích hoạt Gemini Plus trong 6 tháng trên tài khoản Google của người nhận. Theo mô tả từ Bite, không cần thẻ thanh toán khi đổi liên kết; nguồn nêu có thể mời tối đa 5 tài khoản và có quyền truy cập một số tính năng Gemini, dung lượng lưu trữ và điểm Flow. Bite chỉ công bố bảo hành liên kết trong 24 giờ. Cần kiểm tra quyền lợi, giới hạn sử dụng, tài khoản đủ điều kiện và cách kích hoạt trước khi bán.',
  'needs_review'
where exists(select 1 from private.bite_catalog where external_id='845')
on conflict(external_id) do nothing;

commit;
