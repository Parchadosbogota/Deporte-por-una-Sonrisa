-- TRAIL POR UNA SONRISA 2026
-- Ejecutar completo en Supabase > SQL Editor.
-- Antes de producción: revisar políticas, crear usuarios administradores y probar el flujo.
create extension if not exists pgcrypto;

create table if not exists public.admin_users(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()); $$;

create table if not exists public.communities(
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 logo_url text,
 contact_url text,
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.registrations(
 id uuid primary key default gen_random_uuid(),
 request_token uuid not null unique,
 registration_code text not null unique,
 first_name text not null,
 last_name text not null,
 document_type text not null,
 document_number text not null,
 age integer not null check(age between 1 and 110),
 phone text not null,
 email text not null,
 city text not null,
 community_id uuid references public.communities(id) on delete set null,
 activity text not null,
 discovery_source text,
 experience text,
 emergency_name text not null,
 emergency_phone text not null,
 emergency_relationship text not null,
 registration_amount integer not null default 25000 check(registration_amount=25000),
 extra_donation integer not null default 0 check(extra_donation>=0),
 toy_donation text not null default 'No',
 accept_terms boolean not null check(accept_terms),
 accept_data boolean not null check(accept_data),
 accept_waiver boolean not null check(accept_waiver),
 accept_image boolean not null default false,
 receipt_path text not null,
 payment_status text not null default 'Pendiente de revisión' check(payment_status in ('Pendiente de revisión','Pago confirmado','Pago rechazado')),
 admin_notes text,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create unique index if not exists registrations_document_event_unique on public.registrations(document_number);
create index if not exists registrations_created_at_idx on public.registrations(created_at desc);
create index if not exists registrations_status_idx on public.registrations(payment_status);

create table if not exists public.finance_movements(
 id uuid primary key default gen_random_uuid(),
 movement_type text not null check(movement_type in ('income','expense')),
 category text not null,
 concept text not null,
 amount integer not null check(amount>0),
 responsible text,
 movement_date date not null default current_date,
 notes text,
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create table if not exists public.toy_donations(
 id uuid primary key default gen_random_uuid(),
 donor_name text not null,
 quantity integer not null check(quantity>0),
 toy_type text not null,
 condition text not null,
 received_at date not null default current_date,
 received_by text not null,
 notes text,
 verified boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.faqs(
 id uuid primary key default gen_random_uuid(),
 question text not null,
 answer text not null,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create table if not exists public.gallery_items(
 id uuid primary key default gen_random_uuid(),
 media_url text not null,
 media_type text not null check(media_type in ('photo','gif')),
 alt_text text,
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);

-- Vista privada: solo la consulta del administrador está permitida por RLS.
create or replace view public.registrations_admin_view with (security_invoker=true) as
select r.*,c.name as community_name
from public.registrations r left join public.communities c on c.id=r.community_id;

-- Vista pública sin datos personales.
create or replace view public.public_gallery as
select id,media_url,media_type,alt_text,sort_order from public.gallery_items;

-- RLS
alter table public.admin_users enable row level security;
alter table public.communities enable row level security;
alter table public.registrations enable row level security;
alter table public.finance_movements enable row level security;
alter table public.toy_donations enable row level security;
alter table public.faqs enable row level security;
alter table public.gallery_items enable row level security;

create policy "admin users read own admin row" on public.admin_users for select to authenticated using(user_id=auth.uid());
create policy "public read active communities" on public.communities for select to anon,authenticated using(is_active=true or public.is_admin());
create policy "admin manage communities" on public.communities for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin read registrations" on public.registrations for select to authenticated using(public.is_admin());
create policy "admin update registrations" on public.registrations for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin manage finance" on public.finance_movements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin manage toys" on public.toy_donations for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "public read faqs" on public.faqs for select to anon,authenticated using(true);
create policy "admin manage faqs" on public.faqs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "public read gallery" on public.gallery_items for select to anon,authenticated using(true);
create policy "admin manage gallery" on public.gallery_items for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- No se habilita INSERT público directo a registrations. El alta se hace por RPC controlada.
revoke all on public.registrations from anon,authenticated;
grant select,update on public.registrations to authenticated;
grant select on public.registrations_admin_view to authenticated;
grant select on public.public_gallery to anon,authenticated;
grant select on public.communities,public.faqs,public.gallery_items to anon,authenticated;
grant all on public.communities,public.finance_movements,public.toy_donations,public.faqs,public.gallery_items to authenticated;

-- Storage: recibos privados; solo el usuario administrador puede listarlos/descargarlos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-receipts','payment-receipts',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','application/pdf'];
create policy "public upload payment receipts" on storage.objects for insert to anon,authenticated
with check(bucket_id='payment-receipts' and (storage.foldername(name))[1]='receipts');
create policy "admins read payment receipts" on storage.objects for select to authenticated
using(bucket_id='payment-receipts' and public.is_admin());
create policy "admins delete payment receipts" on storage.objects for delete to authenticated
using(bucket_id='payment-receipts' and public.is_admin());

-- RPC transaccional: crea el registro solo después de subir el recibo.
create or replace function public.submit_registration(p_payload jsonb,p_receipt_path text,p_request_token uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_code text; v_id uuid;
begin
 if p_receipt_path is null or p_receipt_path !~ '^receipts/[A-Za-z0-9-]+\.(jpg|jpeg|png|pdf)$' then
   raise exception 'Ruta de comprobante no válida';
 end if;
 if coalesce((p_payload->>'accept_terms')::boolean,false)=false
 or coalesce((p_payload->>'accept_data')::boolean,false)=false
 or coalesce((p_payload->>'accept_waiver')::boolean,false)=false then
   raise exception 'Debes aceptar los documentos obligatorios';
 end if;
 if (p_payload->>'registration_amount')::integer <> 25000 then raise exception 'Valor de inscripción inválido'; end if;
 v_code := 'TPS26-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
 insert into public.registrations(
 request_token,registration_code,first_name,last_name,document_type,document_number,age,phone,email,city,
 community_id,activity,discovery_source,experience,emergency_name,emergency_phone,emergency_relationship,
 registration_amount,extra_donation,toy_donation,accept_terms,accept_data,accept_waiver,accept_image,receipt_path
 ) values(
 p_request_token,v_code,trim(p_payload->>'first_name'),trim(p_payload->>'last_name'),p_payload->>'document_type',
 trim(p_payload->>'document_number'),(p_payload->>'age')::integer,trim(p_payload->>'phone'),lower(trim(p_payload->>'email')),
 trim(p_payload->>'city'),nullif(p_payload->>'community_id','')::uuid,p_payload->>'activity',
 nullif(p_payload->>'discovery_source',''),nullif(p_payload->>'experience',''),trim(p_payload->>'emergency_name'),
 trim(p_payload->>'emergency_phone'),trim(p_payload->>'emergency_relationship'),25000,
 greatest(coalesce((p_payload->>'extra_donation')::integer,0),0),coalesce(p_payload->>'toy_donation','No'),
 true,true,true,coalesce((p_payload->>'accept_image')::boolean,false),p_receipt_path
 ) returning id into v_id;
 return jsonb_build_object('id',v_id,'registration_code',v_code,'status','Pendiente de revisión');
end; $$;
revoke all on function public.submit_registration(jsonb,text,uuid) from public;
grant execute on function public.submit_registration(jsonb,text,uuid) to anon,authenticated;

-- Contadores públicos: nunca exponen datos personales.
create or replace function public.public_event_stats() returns jsonb
language sql stable security definer set search_path=public
as $$
 select jsonb_build_object(
 'registrations_received',(select count(*) from public.registrations),
 'participants_confirmed',(select count(*) from public.registrations where payment_status='Pago confirmado'),
 'communities_count',(select count(*) from public.communities where is_active=true),
 'money_raised',(select coalesce(sum(registration_amount+extra_donation),0) from public.registrations where payment_status='Pago confirmado')
   +(select coalesce(sum(amount),0) from public.finance_movements where movement_type='income'),
 'extra_donations',(select coalesce(sum(extra_donation),0) from public.registrations where payment_status='Pago confirmado'),
 'toys_verified',(select coalesce(sum(quantity),0) from public.toy_donations where verified=true)
 ); $$;
grant execute on function public.public_event_stats() to anon,authenticated;

create or replace function public.admin_dashboard_stats() returns jsonb
language sql stable security definer set search_path=public
as $$
 select case when public.is_admin() then jsonb_build_object(
 'registrations_received',(select count(*) from public.registrations),
 'pending',(select count(*) from public.registrations where payment_status='Pendiente de revisión'),
 'confirmed',(select count(*) from public.registrations where payment_status='Pago confirmado'),
 'rejected',(select count(*) from public.registrations where payment_status='Pago rechazado'),
 'income',(select coalesce(sum(amount),0) from public.finance_movements where movement_type='income')
   +(select coalesce(sum(registration_amount+extra_donation),0) from public.registrations where payment_status='Pago confirmado'),
 'expenses',(select coalesce(sum(amount),0) from public.finance_movements where movement_type='expense'),
 'extra_donations',(select coalesce(sum(extra_donation),0) from public.registrations where payment_status='Pago confirmado'),
 'toys_verified',(select coalesce(sum(quantity),0) from public.toy_donations where verified=true)
 ) else '{}'::jsonb end; $$;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- Datos iniciales de preguntas frecuentes
insert into public.faqs(question,answer,sort_order)
select v.q,v.a,v.n from (values
('¿Cuánto cuesta participar?','El valor de inscripción es de $25.000 COP.',1),
('¿Necesito experiencia en Trail Running?','No. Selecciona la actividad que mejor se adapte a tu experiencia.',2),
('¿Puedo participar solamente en zumba o meditación?','Sí. Selecciona la actividad correspondiente en el formulario.',3),
('¿Cómo realizo mi inscripción?','Completa el formulario, adjunta el comprobante y acepta los documentos requeridos.',4),
('¿Cómo sé si mi pago fue confirmado?','Tu registro se recibe como pendiente; la organización revisará el comprobante.',5),
('¿Puedo realizar una donación adicional?','Sí. Puedes añadir un aporte voluntario durante la inscripción.',6),
('¿Puedo donar juguetes sin participar?','Comunícate con la organización para coordinar la entrega.',7),
('¿Dónde se entregarán los juguetes?','La organización informará los detalles por sus canales oficiales.',8)
) as v(q,a,n)
where not exists(select 1 from public.faqs);
