alter table astra_generated_documents
  add column if not exists read_at timestamptz;

create index if not exists astra_generated_documents_astra_key_read_idx
  on astra_generated_documents(astra_key, read_at);
