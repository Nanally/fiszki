create extension if not exists "pgcrypto";

create table if not exists public.hsk_reference (
    id uuid primary key default gen_random_uuid(),
    hanzi text not null,
    pinyin text not null,
    meaning_en text not null,
    meaning_pl text,
    audio_url text,
    level text not null default 'HSK1',
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create unique index if not exists hsk_reference_hanzi_pinyin_idx on public.hsk_reference (hanzi, pinyin);

create table if not exists public.flashcards (
    id uuid primary key default gen_random_uuid(),
    polish text not null,
    hanzi text not null,
    pinyin text not null,
    audio_url text,
    comment text,
    is_mastered boolean not null default false,
    hsk_reference_id uuid references public.hsk_reference (id),
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists flashcards_created_at_idx on public.flashcards (created_at desc);
create index if not exists flashcards_is_mastered_idx on public.flashcards (is_mastered);

create table if not exists public.collections (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    color text,
    created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists public.flashcard_collections (
    flashcard_id uuid references public.flashcards (id) on delete cascade,
    collection_id uuid references public.collections (id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()),
    primary key (flashcard_id, collection_id)
);

create index if not exists flashcard_collections_collection_idx on public.flashcard_collections (collection_id);
create index if not exists flashcard_collections_flashcard_idx on public.flashcard_collections (flashcard_id);
