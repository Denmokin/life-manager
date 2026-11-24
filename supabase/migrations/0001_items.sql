-- Life Manager cloud storage. One user, one table.
-- Only the Edge Function (service role) touches it: RLS on, no policies,
-- and the functions below are not callable by anon/authenticated.

create sequence if not exists items_rev_seq;

create table if not exists items (
  id text primary key,
  doc jsonb not null,
  -- ISO timestamp string from the device, compared like the app does ("latest change wins").
  updated_at text not null,
  rev bigint not null default nextval('items_rev_seq'),
  -- Set while the AI is sorting this item, so two syncs never sort it twice.
  claimed_at timestamptz
);

create index if not exists items_rev_idx on items (rev);

alter table items enable row level security;

-- Apply changes from a device (or from the AI). Newer updatedAt wins.
create or replace function merge_items(changes jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into items (id, doc, updated_at)
  select c->>'id', c - 'rev', c->>'updatedAt'
  from jsonb_array_elements(changes) as c
  on conflict (id) do update
    set doc = excluded.doc,
        updated_at = excluded.updated_at,
        rev = nextval('items_rev_seq')
    where items.updated_at <= excluded.updated_at;
$$;

-- Everything changed after a device's last sync, plus the newest rev.
create or replace function changed_since(since bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rev', coalesce((select max(rev) from items), 0),
    'items', coalesce(
      (select jsonb_agg(doc || jsonb_build_object('rev', rev) order by rev) from items where rev > since),
      '[]'::jsonb
    )
  );
$$;

-- Hand out unsorted items to sort, each to only one caller at a time.
create or replace function claim_unsorted(max_items int default 10)
returns setof jsonb
language sql
security definer
set search_path = public
as $$
  update items set claimed_at = now()
  where id in (
    select id from items
    where doc->'kind' = 'null'::jsonb
      and coalesce((doc->>'deleted')::boolean, false) = false
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
    order by rev
    limit max_items
    for update skip locked
  )
  returning doc || jsonb_build_object('rev', rev);
$$;

revoke all on table items from anon, authenticated;
revoke execute on function merge_items(jsonb) from public, anon, authenticated;
revoke execute on function changed_since(bigint) from public, anon, authenticated;
revoke execute on function claim_unsorted(int) from public, anon, authenticated;
grant execute on function merge_items(jsonb) to service_role;
grant execute on function changed_since(bigint) to service_role;
grant execute on function claim_unsorted(int) to service_role;
