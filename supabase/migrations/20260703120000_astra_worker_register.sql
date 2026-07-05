-- Register astra worker on chrysty.dev platform

insert into public.workers (slug, name, status)
values ('astra', 'Chrysty Astra', 'active')
on conflict (slug) do update
  set name = excluded.name,
      status = excluded.status;
