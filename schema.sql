pragma foreign_keys = on;

create table if not exists entry (
  id integer primary key autoincrement,
  entry_date text not null,
  raw_text text not null,
  pin integer not null default 0,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists entry_created_at_idx
  on entry (created_at);

create trigger if not exists entry_updated_at_trg
after update on entry
for each row
when new.updated_at = old.updated_at
begin
  update entry
  set updated_at = current_timestamp
  where id = new.id;
end;

create table if not exists photo (
  id integer primary key autoincrement,
  entry_id integer not null,
  file_path text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint photo_entry_id_fk
    foreign key (entry_id) references entry (id)
    on delete cascade
);

create index if not exists photo_entry_id_idx
  on photo (entry_id);

create trigger if not exists photo_updated_at_trg
after update on photo
for each row
when new.updated_at = old.updated_at
begin
  update photo
  set updated_at = current_timestamp
  where id = new.id;
end;

create table if not exists tag (
  id integer primary key autoincrement,
  name text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create unique index if not exists tag_name_uq
  on tag (name);

create index if not exists tag_name_idx
  on tag (name);

create trigger if not exists tag_updated_at_trg
after update on tag
for each row
when new.updated_at = old.updated_at
begin
  update tag
  set updated_at = current_timestamp
  where id = new.id;
end;

create table if not exists entry_tag (
  entry_id integer not null,
  tag_id integer not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  primary key (entry_id, tag_id),
  constraint entry_tag_entry_id_fk
    foreign key (entry_id) references entry (id)
    on delete cascade,
  constraint entry_tag_tag_id_fk
    foreign key (tag_id) references tag (id)
    on delete cascade
);

create index if not exists entry_tag_tag_id_idx
  on entry_tag (tag_id);

create trigger if not exists entry_tag_updated_at_trg
after update on entry_tag
for each row
when new.updated_at = old.updated_at
begin
  update entry_tag
  set updated_at = current_timestamp
  where entry_id = new.entry_id
    and tag_id = new.tag_id;
end;

create table if not exists media (
  id integer primary key autoincrement,
  file_path text not null unique,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index if not exists media_file_path_idx
  on media (file_path);

create trigger if not exists media_updated_at_trg
after update on media
for each row
when new.updated_at = old.updated_at
begin
  update media
  set updated_at = current_timestamp
  where id = new.id;
end;

create table if not exists entry_media (
  id integer primary key autoincrement,
  entry_id integer not null,
  media_id integer not null,
  sort_order integer not null default 0,
  is_cover integer not null default 0,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp,
  constraint entry_media_entry_id_fk
    foreign key (entry_id) references entry (id)
    on delete cascade,
  constraint entry_media_media_id_fk
    foreign key (media_id) references media (id)
    on delete restrict,
  constraint entry_media_entry_media_uq
    unique (entry_id, media_id)
);

create index if not exists entry_media_entry_id_idx
  on entry_media (entry_id);

create index if not exists entry_media_media_id_idx
  on entry_media (media_id);

create index if not exists entry_media_entry_sort_idx
  on entry_media (entry_id, sort_order);

create unique index if not exists entry_media_one_cover_uq
  on entry_media (entry_id)
  where is_cover = 1;

create trigger if not exists entry_media_updated_at_trg
after update on entry_media
for each row
when new.updated_at = old.updated_at
begin
  update entry_media
  set updated_at = current_timestamp
  where id = new.id;
end;
