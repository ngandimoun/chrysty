-- Register chrysty worker; retire astra slug

insert into public.workers (slug, name, status)
values ('chrysty', 'Chrysty', 'active')
on conflict (slug) do update
  set name = excluded.name,
      status = excluded.status;

update public.workers set status = 'coming_soon' where slug = 'astra';

update public.worker_workspaces
set worker_slug = 'chrysty'
where worker_slug = 'astra';
