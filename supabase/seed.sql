-- Generated from sources/registry.json by pnpm seed:generate.
-- Candidates only; no unverified endpoint URLs or automatic trust activation.
insert into public.sources (id, slug, name, status, authority_type, created_at, updated_at) values
('00000000-0000-4000-8000-000000000001', 'osym', 'Ölçme, Seçme ve Yerleştirme Merkezi', 'candidate', 'public_authority', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-8000-000000000002', 'meb', 'Millî Eğitim Bakanlığı', 'candidate', 'public_authority', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-8000-000000000003', 'yok', 'Yükseköğretim Kurulu', 'candidate', 'public_authority', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-8000-000000000004', 'gsb', 'Gençlik ve Spor Bakanlığı', 'candidate', 'public_authority', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-8000-000000000005', 'yokak', 'Yükseköğretim Kalite Kurulu', 'candidate', 'public_authority', '2026-09-08T00:00:00Z', '2026-09-08T00:00:00Z')
on conflict (slug) do nothing;

insert into public.allowed_hosts (id, source_id, hostname, include_subdomains, status, created_at) values
('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'osym.gov.tr', false, 'candidate', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002', 'meb.gov.tr', false, 'candidate', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000003', 'yok.gov.tr', false, 'candidate', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000004', 'gsb.gov.tr', false, 'candidate', '2026-09-08T00:00:00Z'),
('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-8000-000000000005', 'yokak.gov.tr', false, 'candidate', '2026-09-08T00:00:00Z')
on conflict (source_id, hostname) do nothing;
