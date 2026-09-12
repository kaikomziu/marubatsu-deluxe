-- ============================================================
--  ○×DELUXE オンライン対戦 — Supabase スキーマ (v1.0)
--  共有プロジェクト kifnzvktwbomxthzvvgy の SQL Editor で実行する
--  (何度実行してもOK。存在チェック / add column if not exists 付き)
--
--  相乗り: 隠語クイズ / めっちゃカメレオン / 反射神経DELUXE / HOLD ON /
--          STONKS / PIXEL PLACE / HIT & BLOW 等。このサイトは接頭辞 "mb_" のみ。
--
--  設計方針:
--   - ○×ゲームには「相手に隠す秘密の情報」が無い(盤面は常に両者に見える)。
--     そのため HIT & BLOW のように秘密をサーバー側だけで扱う必要はなく、
--     盤面ロジック(勝敗判定など)は既存の js/game.js をそのまま両クライアントで
--     動かす「信頼できるクライアント」方式にした。
--   - サーバー(mb_matches)は「誰と誰が対戦していて、今まで何手指されたか」を
--     中継するだけの薄い層。指し手は moves 配列に追記されるだけで、
--     勝敗判定はクライアントが moves を再生して結果を出す(両者とも同じ
--     決定的ロジックなので結果は必ず一致する)。
-- ============================================================

create table if not exists public.mb_matches (
  id         uuid primary key default gen_random_uuid(),
  size       int  not null,                        -- 3 | 4 | 5
  mode       text not null,                         -- normal | misere | gravity | wild | randomblock | timeattack | stack
  room_code  text,                                  -- 合言葉ルーム。NULL = ランダムマッチング
  p1         text not null,
  p2         text,
  p1_name    text not null default '',
  p2_name    text not null default '',
  p1_seen    timestamptz not null default now(),
  p2_seen    timestamptz,
  state      text not null default 'setup',         -- setup | playing | finished
  init       jsonb,                                  -- 初期盤面情報(空盤面/ブロックマス/駒の手持ち数など)。ホスト(p1)が設定
  moves      jsonb not null default '[]'::jsonb,     -- [{mover:'p1'|'p2', r, c, sym, size?}, ...] 追記のみ
  end_reason text,                                    -- leave | timeout | cancel (通常の勝敗はクライアント側の再生で判定)
  rematch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mb_matches enable row level security;

create index if not exists mb_matches_lobby on public.mb_matches (size, mode, created_at)
  where state = 'setup' and p2 is null and room_code is null;
create index if not exists mb_matches_room on public.mb_matches (room_code)
  where room_code is not null;

-- ============================================================
--  内部ヘルパー(anon への grant はしない)
-- ============================================================

-- 放置ロビー掃除 & 生存確認切れの対戦をタイムアウト処理
create or replace function public.mb_cleanup()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.mb_matches
   where state = 'setup' and p2 is null and created_at < now() - interval '50 seconds';

  update public.mb_matches
     set state = 'finished', end_reason = 'timeout', updated_at = now()
   where state in ('setup', 'playing')
     and p2 is not null
     and greatest(coalesce(p1_seen, created_at), coalesce(p2_seen, created_at))
         < now() - interval '35 seconds';

  delete from public.mb_matches where state = 'finished' and updated_at < now() - interval '12 minutes';
end $$;

-- ============================================================
--  公開 RPC
-- ============================================================

-- ランダムマッチング(同じ size・mode 同士のみ)。match id を返す。
create or replace function public.mb_matchmake(p_player text, p_name text, p_size int, p_mode text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare mid uuid;
begin
  if p_size not in (3,4,5) then p_size := 3; end if;
  perform public.mb_cleanup();

  -- 既に自分が参加中の対戦があればそれを返す(再ポーリング対策)
  select id into mid from public.mb_matches
   where state in ('setup', 'playing')
     and ( (p1 = p_player and p2 is not null) or p2 = p_player )
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;

  select id into mid from public.mb_matches
   where state = 'setup' and p2 is null and room_code is null
     and p1 <> p_player and size = p_size and mode = p_mode
   order by created_at asc
   limit 1 for update skip locked;

  if mid is not null then
    update public.mb_matches
       set p2 = p_player, p2_name = p_name, p2_seen = now(), updated_at = now()
     where id = mid;
    return mid;
  end if;

  -- 自分の待機ロビーが既にあればそれを返す
  select id into mid from public.mb_matches
   where state = 'setup' and p2 is null and room_code is null
     and p1 = p_player and size = p_size and mode = p_mode
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;

  insert into public.mb_matches(size, mode, p1, p1_name, p1_seen)
  values (p_size, p_mode, p_player, p_name, now())
  returning id into mid;
  return mid;
end $$;

-- 合言葉ルーム。p_size/p_mode が NULL なら「参加」(既存ルームの設定を継承)、
-- 指定されていれば「作成」を意図した呼び出しとして扱う。
create or replace function public.mb_room(
  p_code text, p_player text, p_name text, p_size int, p_mode text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare mid uuid; code text;
begin
  perform public.mb_cleanup();
  code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(code) < 4 or length(code) > 10 then return null; end if;

  -- 既に自分がこのコードで参加中ならそれを返す
  select id into mid from public.mb_matches
   where room_code = code and state in ('setup', 'playing')
     and (p1 = p_player or p2 = p_player)
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;

  -- 空いている同コードの部屋に参加
  select id into mid from public.mb_matches
   where room_code = code and state = 'setup' and p2 is null and p1 <> p_player
   order by created_at asc limit 1 for update skip locked;
  if mid is not null then
    update public.mb_matches
       set p2 = p_player, p2_name = p_name, p2_seen = now(), updated_at = now()
     where id = mid;
    return mid;
  end if;

  -- 無ければ作成(p_size/p_modeが必須)
  if p_size is null or p_mode is null then return null; end if;
  if p_size not in (3,4,5) then p_size := 3; end if;

  insert into public.mb_matches(size, mode, p1, p1_name, p1_seen, room_code)
  values (p_size, p_mode, p_player, p_name, now(), code)
  returning id into mid;
  return mid;
end $$;

-- 初期盤面をセットして対戦開始(ホスト=p1のみ・1回だけ)
create or replace function public.mb_init(p_match uuid, p_player text, p_init jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches;
begin
  select * into m from public.mb_matches where id = p_match for update;
  if not found or m.p1 <> p_player or m.init is not null or m.p2 is null then return; end if;
  update public.mb_matches
     set init = p_init, state = 'playing', p1_seen = now(), updated_at = now()
   where id = p_match;
end $$;

-- 指し手を追記する(勝敗判定はクライアント側の再生に委ねる)
create or replace function public.mb_move(p_match uuid, p_player text, p_move jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches;
begin
  select * into m from public.mb_matches where id = p_match for update;
  if not found or m.state <> 'playing' then return; end if;
  if m.p1 <> p_player and m.p2 <> p_player then return; end if;
  if jsonb_array_length(m.moves) > 500 then return; end if;

  update public.mb_matches
     set moves = m.moves || jsonb_build_array(p_move),
         updated_at = now(),
         p1_seen = case when p1 = p_player then now() else p1_seen end,
         p2_seen = case when p2 = p_player then now() else p2_seen end
   where id = p_match;
end $$;

-- 状態取得。呼ぶたびに生存時刻を更新。
create or replace function public.mb_state(p_match uuid, p_player text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches; me text; opp_name text; opp_seen timestamptz;
begin
  select * into m from public.mb_matches where id = p_match;
  if not found then return jsonb_build_object('gone', true); end if;

  if m.p1 = p_player then
    update public.mb_matches set p1_seen = now() where id = p_match;
    me := 'p1'; opp_name := m.p2_name; opp_seen := m.p2_seen;
  elsif m.p2 = p_player then
    update public.mb_matches set p2_seen = now() where id = p_match;
    me := 'p2'; opp_name := m.p1_name; opp_seen := m.p1_seen;
  else
    return jsonb_build_object('gone', true);
  end if;

  return jsonb_build_object(
    'me',         me,
    'size',       m.size,
    'mode',       m.mode,
    'room_code',  m.room_code,
    'state',      m.state,
    'init',       m.init,
    'moves',      m.moves,
    'opp_name',   coalesce(opp_name, ''),
    'opp_joined', (case when me = 'p1' then m.p2 else m.p1 end) is not null,
    'opp_online', (opp_seen is not null and opp_seen > now() - interval '15 seconds'),
    'end_reason', m.end_reason,
    'rematch_id', m.rematch_id
  );
end $$;

-- 同じ相手ともう一戦。先後入れ替え、新しい match id を返す。
create or replace function public.mb_rematch(p_match uuid, p_player text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches; nid uuid;
begin
  select * into m from public.mb_matches where id = p_match for update;
  if not found then return null; end if;
  if m.p1 <> p_player and m.p2 <> p_player then return null; end if;
  if m.p2 is null then return null; end if;
  if m.rematch_id is not null then return m.rematch_id; end if;

  insert into public.mb_matches(size, mode, room_code, p1, p2, p1_name, p2_name, p1_seen, p2_seen)
  values (m.size, m.mode, m.room_code, m.p2, m.p1, m.p2_name, m.p1_name, now(), now())
  returning id into nid;

  update public.mb_matches set rematch_id = nid, updated_at = now() where id = p_match;
  return nid;
end $$;

-- 自分から退出。対戦中なら相手の勝ちとして end_reason を残す。
create or replace function public.mb_leave(p_match uuid, p_player text)
returns void
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches;
begin
  select * into m from public.mb_matches where id = p_match for update;
  if not found or m.state = 'finished' then return; end if;
  if m.p1 <> p_player and m.p2 <> p_player then return; end if;

  update public.mb_matches
     set state = 'finished',
         end_reason = case when m.state = 'playing' then 'leave' else 'cancel' end,
         updated_at = now()
   where id = p_match;
end $$;

-- 相手切断時に勝ちを確定(相手が18秒以上無応答のときだけ)
create or replace function public.mb_forfeit(p_match uuid, p_player text)
returns void
language plpgsql security definer set search_path = public
as $$
declare m public.mb_matches; opp_seen timestamptz;
begin
  select * into m from public.mb_matches where id = p_match for update;
  if not found or m.state = 'finished' then return; end if;
  if m.p1 <> p_player and m.p2 <> p_player then return; end if;

  opp_seen := case when m.p1 = p_player then m.p2_seen else m.p1_seen end;
  if m.p2 is null then
    update public.mb_matches set state = 'finished', end_reason = 'cancel', updated_at = now() where id = p_match;
    return;
  end if;
  if coalesce(opp_seen, m.created_at) > now() - interval '18 seconds' then return; end if;

  update public.mb_matches set state = 'finished', end_reason = 'timeout', updated_at = now() where id = p_match;
end $$;

grant execute on function public.mb_matchmake(text, text, int, text)   to anon, authenticated;
grant execute on function public.mb_room(text, text, text, int, text)  to anon, authenticated;
grant execute on function public.mb_init(uuid, text, jsonb)            to anon, authenticated;
grant execute on function public.mb_move(uuid, text, jsonb)            to anon, authenticated;
grant execute on function public.mb_state(uuid, text)                  to anon, authenticated;
grant execute on function public.mb_rematch(uuid, text)                to anon, authenticated;
grant execute on function public.mb_leave(uuid, text)                  to anon, authenticated;
grant execute on function public.mb_forfeit(uuid, text)                to anon, authenticated;
grant execute on function public.mb_cleanup()                          to anon, authenticated;
