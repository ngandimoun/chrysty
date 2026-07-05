-- Astra worker storage bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'astra-uploads',
  'astra-uploads',
  false,
  26214400,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/json'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
