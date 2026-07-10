alter table astra_companion_profiles
  add column if not exists preferred_language_code text,
  add column if not exists preferred_language_label text;

alter table astra_background_jobs
  add column if not exists artifact_language text not null default 'en';

alter table astra_generated_documents
  add column if not exists artifact_language text not null default 'en';

update astra_background_jobs
set artifact_language = 'en'
where artifact_language is null or btrim(artifact_language) = '';

update astra_generated_documents
set artifact_language = 'en'
where artifact_language is null or btrim(artifact_language) = '';
