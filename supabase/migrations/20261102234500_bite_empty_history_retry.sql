begin;
create table private.supplier_reconciled_retries (
 job_id uuid primary key references private.supplier_jobs(id),
 actor_id uuid not null references auth.users(id),
 previous_submitted_at timestamptz not null,
 previous_issue text not null,
 previous_attempts integer not null,
 created_at timestamptz not null default now()
);
alter table private.supplier_reconciled_retries enable row level security;
revoke all on private.supplier_reconciled_retries from public,anon,authenticated,service_role;
create function private.retry_bite_after_empty_history(p_actor uuid,p_job uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders;
begin
 if p_actor is null then raise insufficient_privilege; end if;
 perform private.require_supplier_service(p_actor);
 select c.* into o from private.commerce_orders c join private.supplier_jobs s on s.order_id=c.id where s.id=p_job for update of c;
 select * into j from private.supplier_jobs where id=p_job for update;
 if j.id is null or o.state<>'paid' or j.state<>'uncertain' or j.provider_order_id is not null
   or j.purchase_attempts<>1 or j.last_issue not in ('network_unavailable','network_timeout','source_redirect')
   or j.submitted_at<now()-interval '1 hour' or coalesce(j.lease_until,'epoch')>=now()
   or exists(select 1 from private.supplier_reconciled_retries where job_id=p_job)
   or not exists(select 1 from private.commerce_payments where order_id=o.id and provider='payos' and direction='in' and verification_state='verified')
 then return false; end if;
 insert into private.supplier_reconciled_retries(job_id,actor_id,previous_submitted_at,previous_issue,previous_attempts)
 values(j.id,p_actor,j.submitted_at,j.last_issue,j.purchase_attempts);
 -- The request body, source identity and Idempotency-Key remain unchanged.
 update private.supplier_jobs set state='queued',submitted_at=null,purchase_attempts=0,next_poll=now(),lease_until=null where id=j.id;
 return true;
end $$;
create function public.retry_bite_after_empty_history(p_actor uuid,p_job uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.retry_bite_after_empty_history(p_actor,p_job) $$;
revoke all on function private.retry_bite_after_empty_history(uuid,uuid),public.retry_bite_after_empty_history(uuid,uuid) from public,anon,authenticated;
grant execute on function private.retry_bite_after_empty_history(uuid,uuid),public.retry_bite_after_empty_history(uuid,uuid) to service_role;
commit;
