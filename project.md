Analyzed read-only. I did not modify code.

**Project Summary**
Core Log is a small Express memory journal. Users can create, browse, filter, view, and edit dated journal entries with optional photos and comma-separated tags. Data is stored in SQLite; uploaded images are stored locally under `../uploads`.

**Functional Requirements**
- Show a home feed of journal entries ordered newest first.
- Create a new entry with required text, optional tags, and multiple image uploads.
- Automatically assign new entries to the current local date via SQLite `date('now', 'localtime')`.
- View a single entry with full text, tags, and all photos.
- Edit an existing entry’s text, tags, photos to remove, and new photos to add.
- Filter entries by exact date, month, tag, or multiple tags.
- Calendar UI shows months, selectable dates, and dates that contain entries.
- Search existing tags and show tag suggestions while typing.
- Use the first photo by lowest photo id as the feed cover image.

**API Endpoints**
- `GET /api/entries`
  - Query params: `tag`, `date`, `month`
  - Returns `{ entries }`
  - `date` takes precedence over `month`.
  - Multiple comma-separated tags require entries to have all requested tags.

- `GET /api/entries/dates`
  - Returns `{ dates }`, distinct entry dates in descending order.

- `POST /api/entry`
  - Multipart form data:
    - `raw_text`: required, trimmed
    - `tags`: optional comma-separated string
    - `photos`: optional multiple image files
  - Saves photos locally, creates entry, photos, and tag links.
  - Returns `{ id }` with `201`.

- `GET /api/entries/:id`
  - Validates positive integer id.
  - Returns `{ entry }` with photos and tags, or `404`.

- `PUT /api/entries/:id`
  - Multipart form data:
    - `raw_text`: required, trimmed
    - `tags`: optional comma-separated string
    - `removed_photo_ids`: JSON array of photo ids
    - `photos`: optional new image files
  - Updates text, replaces tag links, deletes selected photo rows/files, adds new photos.
  - Returns `{ id }`.

- `GET /api/tags`
  - Query param: `search`
  - Returns up to 20 matching tag names ordered ascending.
  - Empty search returns an empty array.

**Database Schema**
Defined in [schema.sql](/Users/ping/workspace/development/github/coreLog/node_dev/schema.sql:1).

- `entry`
  - `id integer primary key autoincrement`
  - `entry_date text not null`
  - `raw_text text not null`
  - `created_at text default current_timestamp`
  - `updated_at text default current_timestamp`
  - Index: `entry_created_at_idx(created_at)`

- `photo`
  - `id integer primary key autoincrement`
  - `entry_id integer not null`
  - `file_path text not null`
  - timestamps
  - FK: `entry_id -> entry.id on delete cascade`
  - Index: `photo_entry_id_idx(entry_id)`

- `tag`
  - `id integer primary key autoincrement`
  - `name text not null`
  - timestamps
  - Unique: `tag_name_uq(name)`
  - Index: `tag_name_idx(name)`

- `entry_tag`
  - `entry_id integer not null`
  - `tag_id integer not null`
  - timestamps
  - Primary key: `(entry_id, tag_id)`
  - FK: `entry_id -> entry.id on delete cascade`
  - FK: `tag_id -> tag.id on delete cascade`
  - Index: `entry_tag_tag_id_idx(tag_id)`

**Business Rules**
- Entry text is required for create and update.
- Tags are comma-separated, trimmed, empty values removed, and deduplicated before persistence.
- Tags are created with `insert or ignore`; existing tag names are reused.
- Updating an entry deletes all existing tag links, then recreates links from submitted tags.
- Tag filtering uses AND semantics: an entry must contain every requested tag.
- Date filtering beats month filtering when both are present.
- Uploaded files must have MIME type starting with `image/`.
- Non-JPEG images, plus HEIC/HEIF, are converted to JPEG using `sharp`.
- Uploaded filenames are randomized UUID `.jpg` names.
- Removed photo ids are constrained to the target entry before deletion.
- Missing local files during photo removal are ignored after DB deletion.
- API error responses expose detailed errors only in development.

**External Integrations**
- SQLite via `better-sqlite3`, configured by `SQLITE_DB_DIR` and `SQLITE_CORELOG_DB_DIR`.
- Local filesystem storage at `../uploads`.
- `sharp` for image rotation/conversion/compression.
- Express and vanilla browser assets for the web app.

One notable documentation drift: [README.md](/Users/ping/workspace/development/github/coreLog/dev/README.md:8) mentions `journal_entries` and `journal_photos`, but the actual schema and code use `entry`, `photo`, `tag`, and `entry_tag`.
