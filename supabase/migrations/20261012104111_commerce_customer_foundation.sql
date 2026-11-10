-- Customer/support foundation. No checkout, settlement, stock, or secret write API.
-- Existing CMS, pricing, memberships and Auth settings are not modified.
begin;
create table private.commerce_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete restrict,
 code text not null unique check(code ~ '^HB[A-F0-9]{16}$'),
 state text not null default 'pending_payment' check(state in ('pending_payment','paid','delivered','expired','cancelled','review_required','refunded')),
 subtotal_vnd bigint not null check(subtotal_vnd between 1 and 100000000000),
 discount_vnd bigint not null default 0 check(discount_vnd >= 0),
 total_vnd bigint not null check(total_vnd between 1 and 100000000000),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 check(total_vnd=subtotal_vnd-discount_vnd), check(expires_at>created_at)
);
create index commerce_orders_user_created on private.commerce_orders(user_id,created_at desc);
create table private.commerce_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references private.commerce_orders(id) on delete restrict,
 variant_id uuid not null references public.product_variants(id) on delete restrict,
 product_name text not null check(length(product_name) between 1 and 160),
 variant_label text not null check(length(variant_label) between 1 and 160),
 quantity smallint not null check(quantity between 1 and 20),
 price_vnd bigint not null check(price_vnd between 1 and 1000000000),
 unique(order_id,variant_id)
);
create index commerce_items_variant on private.commerce_order_items(variant_id);
create table private.commerce_payments (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references private.commerce_orders(id) on delete restrict,
 provider text not null check(provider in ('sepay','payos')),
 provider_transaction text not null check(length(provider_transaction) between 1 and 120),
 amount_vnd bigint not null check(amount_vnd between 1 and 100000000000),
 direction text not null check(direction in ('in','refund')),
 verification_state text not null check(verification_state in ('verified','reconciliation')),
 created_at timestamptz not null default now(), unique(provider,provider_transaction)
);
create index commerce_payments_order on private.commerce_payments(order_id);
create table private.support_tickets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete restrict,
 order_id uuid references private.commerce_orders(id) on delete restrict,
 request_key uuid not null, subject text not null check(length(subject) between 3 and 120),
 state text not null default 'open' check(state in ('open','closed')),
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(),
 unique(user_id,request_key)
);
create index support_tickets_user_created on private.support_tickets(user_id,created_at desc);
create index support_tickets_order on private.support_tickets(order_id);
create index support_tickets_created on private.support_tickets(created_at desc);
create table private.support_messages (
 id uuid primary key default gen_random_uuid(), ticket_id uuid not null references private.support_tickets(id) on delete restrict,
 author_id uuid not null references auth.users(id) on delete restrict,
 author_role text not null check(author_role in ('customer','owner')),
 body text not null check(length(body) between 3 and 3000), created_at timestamptz not null default now()
);
create index support_messages_ticket_time on private.support_messages(ticket_id,created_at);
create index support_messages_author on private.support_messages(author_id);
create table private.community_submissions (
 id uuid primary key default gen_random_uuid(), request_key uuid not null unique,
 user_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('feedback','review')),
 category text not null check(category in ('experience','product','idea','other','review')),
 body text not null check(length(body) between 10 and 1500),
 product_key text references public.products(catalog_key) on delete restrict,
 rating smallint check(rating between 1 and 5),
 state text not null default 'new' check(state in ('new','reviewed')),
 created_at timestamptz not null default now(),
 check((kind='review' and category='review' and product_key is not null and rating is not null and length(body)<=1000)
   or (kind='feedback' and category<>'review' and product_key is null and rating is null))
);
create index community_submissions_time on private.community_submissions(created_at desc);
create index community_submissions_user on private.community_submissions(user_id);
create index community_submissions_product on private.community_submissions(product_key);
create table private.commerce_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id) on delete restrict,
 action text not null check(action in ('support_reply','submission_reviewed')), target_id uuid not null,
 created_at timestamptz not null default now()
);
create index commerce_audit_actor on private.commerce_audit(actor_id);
create index commerce_audit_created on private.commerce_audit(created_at desc);
alter table private.commerce_orders enable row level security;
alter table private.commerce_order_items enable row level security;
alter table private.commerce_payments enable row level security;
alter table private.support_tickets enable row level security;
alter table private.support_messages enable row level security;
alter table private.community_submissions enable row level security;
alter table private.commerce_audit enable row level security;
revoke all on private.commerce_orders,private.commerce_order_items,private.commerce_payments,
 private.support_tickets,private.support_messages,private.community_submissions,private.commerce_audit from public,anon,authenticated,service_role;

create function private.customer_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(auth.jwt()->>'role','')<>'authenticated'
 or coalesce(auth.jwt()->>'is_anonymous','false')<>'false'
 or not exists(select 1 from private.role_memberships where user_id=auth.uid() and revoked_at is null)
 then raise insufficient_privilege using message='Verified account required'; end if;
 return auth.uid();
end $$;

create function private.commerce_order_projection(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'code',o.code,'created',floor(extract(epoch from o.created_at)*1000)::bigint,
 'expires',floor(extract(epoch from o.expires_at)*1000)::bigint,'state',o.state,'subtotal',o.subtotal_vnd,
 'discount',o.discount_vnd,'total',o.total_vnd,
 'paid',coalesce((select sum(amount_vnd) from private.commerce_payments where order_id=o.id and direction='in' and verification_state='verified'),0),
 'refunded',coalesce((select sum(amount_vnd) from private.commerce_payments where order_id=o.id and direction='refund' and verification_state='verified'),0),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product',i.product_name,'label',i.variant_label,'quantity',i.quantity,'price',i.price_vnd) order by i.id)
 from private.commerce_order_items i where i.order_id=o.id),'[]'::jsonb))
 from private.commerce_orders o where o.id=p_id;
$$;
create function private.support_projection(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'orderId',t.order_id,'subject',t.subject,'state',t.state,'version',t.version,
 'created',floor(extract(epoch from t.created_at)*1000)::bigint,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'role',m.author_role,'text',m.body,'at',floor(extract(epoch from m.created_at)*1000)::bigint) order by m.created_at,m.id)
 from private.support_messages m where m.ticket_id=t.id),'[]'::jsonb)) from private.support_tickets t where t.id=p_id;
$$;
create function private.customer_space() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.customer_actor();
begin
 return jsonb_build_object('orders',coalesce((select jsonb_agg(private.commerce_order_projection(o.id) order by o.created_at desc)
 from (select id,created_at from private.commerce_orders where user_id=actor order by created_at desc limit 100) o),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(private.support_projection(t.id) order by t.created_at desc)
 from (select id,created_at from private.support_tickets where user_id=actor order by created_at desc limit 100) t),'[]'::jsonb));
end $$;
create function private.customer_order(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.customer_actor();
begin
 if not exists(select 1 from private.commerce_orders where id=p_id and user_id=actor) then return null; end if;
 return private.commerce_order_projection(p_id);
end $$;
create function private.create_support_ticket(p_key uuid,p_order uuid,p_subject text,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.customer_actor(); tid uuid; existing private.support_tickets;
begin
 if p_key is null or p_subject is null or length(btrim(p_subject)) not between 3 and 120
 or p_body is null or length(btrim(p_body)) not between 3 and 3000 then raise invalid_parameter_value using message='Invalid support input'; end if;
 if p_order is not null and not exists(select 1 from private.commerce_orders where id=p_order and user_id=actor)
 then raise insufficient_privilege using message='Order not accessible'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.support',0));
 select * into existing from private.support_tickets where user_id=actor and request_key=p_key;
 if found then
   if existing.order_id is distinct from p_order or existing.subject<>btrim(p_subject)
   or (select body from private.support_messages where ticket_id=existing.id order by created_at,id limit 1)<>btrim(p_body)
   then raise invalid_parameter_value using message='Idempotency conflict'; end if;
   return existing.id;
 end if;
 if (select count(*) from private.support_tickets where user_id=actor and created_at>now()-interval '1 hour')>=5
 or (select count(*) from private.support_tickets)>=10000
 then raise sqlstate 'P0429' using message='Please wait before sending another ticket'; end if;
 insert into private.support_tickets(user_id,order_id,request_key,subject) values(actor,p_order,p_key,btrim(p_subject)) returning id into tid;
 insert into private.support_messages(ticket_id,author_id,author_role,body) values(tid,actor,'customer',btrim(p_body));
 return tid;
end $$;
create function private.submit_community(p_key uuid,p_kind text,p_category text,p_body text,p_product text,p_rating integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare existing private.community_submissions;
begin
 if p_key is null or p_kind is null or p_kind not in ('feedback','review') or p_body is null
 or length(btrim(p_body)) not between 10 and 1500 or p_category is null
 or p_category not in ('experience','product','idea','other','review') then raise invalid_parameter_value using message='Invalid submission'; end if;
 if p_kind='review' then
   if p_category<>'review' or p_product is null or p_rating is null or p_rating not between 1 and 5 or length(btrim(p_body))>1000
   or not exists(select 1 from public.products where catalog_key=p_product and status='published')
   then raise invalid_parameter_value using message='Invalid review'; end if;
 elsif p_category='review' or p_product is not null or p_rating is not null then
   raise invalid_parameter_value using message='Invalid feedback';
 end if;
 -- Intentionally public bounded submission endpoint. Global quotas cannot be
 -- bypassed by clearing cookies or calling PostgREST directly. No read grant.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.community',0));
 select * into existing from private.community_submissions where request_key=p_key;
 if found then
   if existing.kind<>p_kind or existing.category<>p_category or existing.body<>btrim(p_body)
   or existing.product_key is distinct from p_product or existing.rating is distinct from p_rating
   then raise invalid_parameter_value using message='Idempotency conflict'; end if;
   return true;
 end if;
 if (select count(*) from private.community_submissions where created_at>now()-interval '1 hour')>=100
 or (select count(*) from private.community_submissions)>=10000
 then raise sqlstate 'P0429' using message='Submission limit reached'; end if;
 insert into private.community_submissions(request_key,user_id,kind,category,body,product_key,rating)
 values(p_key,auth.uid(),p_kind,p_category,btrim(p_body),p_product,p_rating);
 return true;
end $$;
create function private.commerce_admin_space() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.hubby_owner() then raise insufficient_privilege using message='Owner required'; end if;
 return jsonb_build_object('orders',coalesce((select jsonb_agg(private.commerce_order_projection(o.id) order by o.created_at desc)
 from (select id,created_at from private.commerce_orders order by created_at desc limit 100) o),'[]'::jsonb),
 'tickets',coalesce((select jsonb_agg(private.support_projection(t.id) order by t.created_at desc)
 from (select id,created_at from private.support_tickets order by created_at desc limit 100) t),'[]'::jsonb),
 'submissions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'category',s.category,'message',s.body,'productId',s.product_key,
 'rating',s.rating,'state',s.state,'at',floor(extract(epoch from s.created_at)*1000)::bigint) order by s.created_at desc)
 from (select * from private.community_submissions order by created_at desc limit 100) s),'[]'::jsonb));
end $$;
create function private.reply_support(p_id uuid,p_version integer,p_body text,p_close boolean) returns integer
language plpgsql security definer set search_path='' as $$
declare ticket private.support_tickets;
begin
 if not private.hubby_owner() then raise insufficient_privilege using message='Owner required'; end if;
 if p_version is null or p_close is null or p_body is null or length(btrim(p_body)) not between 3 and 3000
 then raise invalid_parameter_value using message='Invalid reply'; end if;
 select * into ticket from private.support_tickets where id=p_id for update;
 if not found then raise invalid_parameter_value using message='Ticket unavailable'; end if;
 if ticket.version<>p_version then raise serialization_failure using message='Ticket changed'; end if;
 if (select count(*) from private.support_messages where ticket_id=p_id)>=200
 then raise sqlstate 'P0429' using message='Ticket message limit reached'; end if;
 insert into private.support_messages(ticket_id,author_id,author_role,body) values(p_id,auth.uid(),'owner',btrim(p_body));
 update private.support_tickets set state=case when p_close then 'closed' else 'open' end,version=version+1 where id=p_id;
 insert into private.commerce_audit(actor_id,action,target_id) values(auth.uid(),'support_reply',p_id);
 return ticket.version+1;
end $$;
create function private.review_submission(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.hubby_owner() then raise insufficient_privilege using message='Owner required'; end if;
 update private.community_submissions set state='reviewed' where id=p_id and state='new';
 if found then insert into private.commerce_audit(actor_id,action,target_id) values(auth.uid(),'submission_reviewed',p_id); end if;
 return true;
end $$;
-- Only guarded private implementations are elevated; API wrappers are invoker.
create function public.customer_space() returns jsonb language sql security invoker set search_path='' as $$select private.customer_space()$$;
create function public.customer_order(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.customer_order(p_id)$$;
create function public.create_support_ticket(p_key uuid,p_order uuid,p_subject text,p_body text) returns uuid language sql security invoker set search_path='' as $$select private.create_support_ticket(p_key,p_order,p_subject,p_body)$$;
create function public.submit_community(p_key uuid,p_kind text,p_category text,p_body text,p_product text default null,p_rating integer default null) returns boolean language sql security invoker set search_path='' as $$select private.submit_community(p_key,p_kind,p_category,p_body,p_product,p_rating)$$;
create function public.commerce_admin_space() returns jsonb language sql security invoker set search_path='' as $$select private.commerce_admin_space()$$;
create function public.reply_support(p_id uuid,p_version integer,p_body text,p_close boolean) returns integer language sql security invoker set search_path='' as $$select private.reply_support(p_id,p_version,p_body,p_close)$$;
create function public.review_submission(p_id uuid) returns boolean language sql security invoker set search_path='' as $$select private.review_submission(p_id)$$;
revoke all on function private.customer_actor(),private.commerce_order_projection(uuid),private.support_projection(uuid) from public,anon,authenticated,service_role;
revoke all on function private.customer_space(),private.customer_order(uuid),private.create_support_ticket(uuid,uuid,text,text),private.submit_community(uuid,text,text,text,text,integer),
private.commerce_admin_space(),private.reply_support(uuid,integer,text,boolean),private.review_submission(uuid) from public,anon,authenticated,service_role;
revoke all on function public.customer_space(),public.customer_order(uuid),public.create_support_ticket(uuid,uuid,text,text),public.submit_community(uuid,text,text,text,text,integer),
public.commerce_admin_space(),public.reply_support(uuid,integer,text,boolean),public.review_submission(uuid) from public,anon,authenticated,service_role;
grant execute on function private.customer_space(),private.customer_order(uuid),private.create_support_ticket(uuid,uuid,text,text),private.commerce_admin_space(),private.reply_support(uuid,integer,text,boolean),private.review_submission(uuid) to authenticated;
grant execute on function public.customer_space(),public.customer_order(uuid),public.create_support_ticket(uuid,uuid,text,text),public.commerce_admin_space(),public.reply_support(uuid,integer,text,boolean),public.review_submission(uuid) to authenticated;
grant execute on function private.submit_community(uuid,text,text,text,text,integer),public.submit_community(uuid,text,text,text,text,integer) to anon,authenticated;
commit;
