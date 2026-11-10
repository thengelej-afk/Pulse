
-- PULSE SUPABASE SETUP - CORRECTED VERSION

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_direct boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
on public.messages (conversation_id, created_at);

-- Automatically create a profile when someone registers.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_username text;
begin
  chosen_username := lower(coalesce(
    new.raw_user_meta_data ->> 'username',
    split_part(coalesce(new.email, ''), '@', 1),
    ''
  ));

  if chosen_username !~ '^[a-z0-9_]{3,20}$'
     or exists (
       select 1 from public.profiles p
       where p.username = chosen_username
     )
  then
    chosen_username := 'user_' || substr(new.id::text, 1, 15);
  end if;

  insert into public.profiles (id, username)
  values (new.id, chosen_username);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Safe helper for checking conversation membership.
create or replace function public.is_conversation_member(_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = _conversation_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Create or retrieve a private conversation by username.
create or replace function public.create_direct_conversation(target_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  existing_id uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select p.id into target_id
  from public.profiles p
  where p.username = lower(target_username);

  if target_id is null then
    raise exception 'User not found';
  end if;

  if target_id = auth.uid() then
    raise exception 'You cannot message yourself';
  end if;

  select cm1.conversation_id into existing_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm1.conversation_id = cm2.conversation_id
  join public.conversations c
    on c.id = cm1.conversation_id
  where cm1.user_id = auth.uid()
    and cm2.user_id = target_id
    and c.is_direct = true
    and (
      select count(*)
      from public.conversation_members x
      where x.conversation_id = cm1.conversation_id
    ) = 2
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations default values
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (new_id, auth.uid()),
    (new_id, target_id);

  return new_id;
end;
$$;

revoke all on function public.create_direct_conversation(text) from public;
grant execute on function public.create_direct_conversation(text) to authenticated;

-- Enable row-level security.
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Profiles: signed-in users can find usernames.
drop policy if exists "Signed-in users can find usernames" on public.profiles;

create policy "Signed-in users can find usernames"
on public.profiles
for select to authenticated
using (true);

-- Conversations: only members can view them.
drop policy if exists "Members can view their conversations" on public.conversations;

create policy "Members can view their conversations"
on public.conversations
for select to authenticated
using (public.is_conversation_member(id));

-- Membership: users can see memberships in their own conversations.
drop policy if exists "Members can view conversation membership" on public.conversation_members;

create policy "Members can view conversation membership"
on public.conversation_members
for select to authenticated
using (public.is_conversation_member(conversation_id));

-- Messages: only conversation members can read messages.
drop policy if exists "Members can view messages" on public.messages;

create policy "Members can view messages"
on public.messages
for select to authenticated
using (public.is_conversation_member(conversation_id));

-- Messages: users can send as themselves in their own conversations.
drop policy if exists "Members can send messages as themselves" on public.messages;

create policy "Members can send messages as themselves"
on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
);

-- Enable realtime updates for messages.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
