-- ============================================================
-- PAFWA APF — Supabase PostgreSQL Schema
-- Run this ENTIRE file in Supabase SQL Editor (one paste)
-- ============================================================

-- ── PROFILES (extends auth.users) ──────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  full_name  text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  active     boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

-- ── CATEGORIES ─────────────────────────────────────────────
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  created_at timestamptz not null default now()
);

-- ── INVENTORY ITEMS ────────────────────────────────────────
create table if not exists public.items (
  id                 uuid primary key default gen_random_uuid(),
  serial_number      text unique,
  name               text not null,
  category_id        uuid references public.categories(id),
  description        text default '',
  location           text default '',
  cost_price         numeric not null default 0,
  sale_price         numeric not null default 0,
  stock_qty          integer not null default 0,
  min_stock_threshold integer not null default 5,
  unit               text not null default 'pcs',
  discount_pct       numeric not null default 0,
  date_of_boc        date,
  image_url          text,
  image_path         text,
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── SALES ──────────────────────────────────────────────────
create table if not exists public.sales (
  id             uuid primary key default gen_random_uuid(),
  receipt_no     integer not null,
  customer_name  text not null,
  cashier        text,
  payment_method text not null default 'Cash',
  subtotal       numeric not null default 0,
  discount       numeric not null default 0,
  total          numeric not null default 0,
  paid           boolean not null default true,
  paid_at        timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

-- ── SALE ITEMS ─────────────────────────────────────────────
create table if not exists public.sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales(id) on delete cascade,
  item_id    uuid references public.items(id),
  item_name  text not null,
  item_sn    text,
  quantity   integer not null,
  unit_price numeric not null,
  total      numeric not null,
  unit       text default 'pcs'
);

-- ── LIABILITIES ────────────────────────────────────────────
create table if not exists public.liabilities (
  id         uuid primary key default gen_random_uuid(),
  amount     numeric not null,
  remarks    text not null,
  added_by   text,
  created_at timestamptz not null default now()
);

-- ── ACTIVITY LOGS ──────────────────────────────────────────
create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
  username   text,
  role       text,
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);

-- ── SETTINGS ───────────────────────────────────────────────
create table if not exists public.settings (
  key   text primary key,
  value text
);

-- ── SEED DEFAULT SETTINGS ──────────────────────────────────
insert into public.settings (key, value) values
  ('org_name',       'PAFWA APF'),
  ('location',       'PAC KAMRA'),
  ('receipt_footer', 'Received with Thanks'),
  ('next_receipt_no','1'),
  ('low_stock_thresh','5'),
  ('last_backup',    '')
on conflict (key) do nothing;

-- ── SEED DEFAULT CATEGORIES ────────────────────────────────
insert into public.categories (name) values
  ('General'),('Clothing'),('Accessories'),
  ('Handicrafts'),('Food & Beverages'),('Stationery')
on conflict (name) do nothing;

-- ── TRIGGER: auto-create profile on signup ─────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── TRIGGER: auto-update updated_at on items ───────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_updated_at on public.items;
create trigger items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- ── FUNCTION: get next receipt number (atomic) ─────────────
create or replace function public.get_next_receipt_no()
returns integer language plpgsql security definer as $$
declare
  current_val integer;
begin
  select value::integer into current_val
  from public.settings where key = 'next_receipt_no';
  
  update public.settings
  set value = (current_val + 1)::text
  where key = 'next_receipt_no';
  
  return current_val;
end;
$$;

-- ════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.items       enable row level security;
alter table public.sales       enable row level security;
alter table public.sale_items  enable row level security;
alter table public.liabilities enable row level security;
alter table public.logs        enable row level security;
alter table public.settings    enable row level security;

-- ── Helper function: get current user role ─────────────────
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ── PROFILES ───────────────────────────────────────────────
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id or public.get_my_role() = 'admin');

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.get_my_role() = 'admin');

-- ── CATEGORIES ─────────────────────────────────────────────
drop policy if exists "cats_select" on public.categories;
create policy "cats_select" on public.categories
  for select using (auth.uid() is not null);

drop policy if exists "cats_write" on public.categories;
create policy "cats_write" on public.categories
  for all using (public.get_my_role() = 'admin');

-- ── ITEMS ──────────────────────────────────────────────────
drop policy if exists "items_select" on public.items;
create policy "items_select" on public.items
  for select using (auth.uid() is not null);

drop policy if exists "items_write" on public.items;
create policy "items_write" on public.items
  for all using (public.get_my_role() = 'admin');

-- ── SALES ──────────────────────────────────────────────────
drop policy if exists "sales_select" on public.sales;
create policy "sales_select" on public.sales
  for select using (auth.uid() is not null);

drop policy if exists "sales_insert" on public.sales;
create policy "sales_insert" on public.sales
  for insert with check (auth.uid() is not null);

drop policy if exists "sales_update" on public.sales;
create policy "sales_update" on public.sales
  for update using (public.get_my_role() = 'admin');

-- ── SALE ITEMS ─────────────────────────────────────────────
drop policy if exists "si_select" on public.sale_items;
create policy "si_select" on public.sale_items
  for select using (auth.uid() is not null);

drop policy if exists "si_insert" on public.sale_items;
create policy "si_insert" on public.sale_items
  for insert with check (auth.uid() is not null);

-- ── LIABILITIES ────────────────────────────────────────────
drop policy if exists "liab_all" on public.liabilities;
create policy "liab_all" on public.liabilities
  for all using (public.get_my_role() = 'admin');

-- ── LOGS ───────────────────────────────────────────────────
drop policy if exists "logs_insert" on public.logs;
create policy "logs_insert" on public.logs
  for insert with check (auth.uid() is not null);

drop policy if exists "logs_select" on public.logs;
create policy "logs_select" on public.logs
  for select using (public.get_my_role() = 'admin');

-- ── SETTINGS ───────────────────────────────────────────────
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings
  for select using (auth.uid() is not null);

drop policy if exists "settings_write" on public.settings;
create policy "settings_write" on public.settings
  for all using (public.get_my_role() = 'admin' or true);

-- ── STORAGE BUCKET FOR ITEM IMAGES ─────────────────────────
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

drop policy if exists "img_public_read" on storage.objects;
create policy "img_public_read" on storage.objects
  for select using (bucket_id = 'item-images');

drop policy if exists "img_auth_write" on storage.objects;
create policy "img_auth_write" on storage.objects
  for insert with check (bucket_id = 'item-images' and auth.uid() is not null);

drop policy if exists "img_auth_delete" on storage.objects;
create policy "img_auth_delete" on storage.objects
  for delete using (bucket_id = 'item-images' and auth.uid() is not null);

-- ════════════════════════════════════════════════════════════
-- DONE! Schema is ready.
-- Next step: Go to the app and create your first admin account
-- ════════════════════════════════════════════════════════════
