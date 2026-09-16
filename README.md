# Core Log

## Description

Core Log is a Node.js application that runs on your computer and stores logs, text, photos, and tags in local data files. You access it through a browser interface.

- Provides journaling and personal record management.
- Stores dated logs with text, photos, and tags.
- Provides qLinks for quick access to frequently used websites, with an optional hint.
- Supports pinned logs, date filtering, and tag/description search.
- Provides image reuse.
- Supports recoverable Trash management.

## Installation
### Setup
```bash
git clone https://github.com/gplei/CoreLog.git
cd CoreLog
npm install
npm run setup
npm run build
npm start
```
go to http://localhost:3001/

### Development 
```bash
npm run dev
```
go to http://localhost:3002/

## Usage of Core Log
Manage dated logs with text, uploaded photos, and tags.
- Create and browse dated logs.
- Add text, photos, and tags to logs.
- Use qLinks to quickly open frequently used websites and view their hints.
- Filter logs by month, month-and-day, or tag.
- Search logs by tag or description, and view pinned logs.
- Edit log text, dates, photos, and tags in the detail view.
- Restore deleted logs from Trash.

#### Image upload and reuse
The detail view provides an **Upload/Pick Images** action above a log's images. The Edit dialog is for log text, date, and tags only.

- **Upload** copies new image files into the configured `UPLOAD_DIR`. Each new upload receives a generated filename and is stored once.
- **Pick** links an image that already exists under `UPLOAD_DIR/favorite`. If the selected image is not there, Core Log copies it into `favorite` and links the copied image. Picking never removes the reusable favorite file.

Select **Pick** in the image dialog and choose an image. Existing files are linked from `UPLOAD_DIR/favorite`; a newly selected image is copied there automatically before it is linked. Pick supports files directly inside `favorite`; nested favorite directories are not supported.

In the detail view, photo cards can be reordered by drag and drop. The first photo is used as the log's cover image in the list view.

Do not move an image that is already used by a log; copy it into `favorite` so its existing log link remains valid. Images under a reusable subdirectory are preserved when removed from a log.

Thumbnails are stored under `UPLOAD_DIR/thumbnails` using the same relative structure. For example:

```text
Original:  uploads/favorite/example.jpg
Thumbnail: uploads/thumbnails/favorite/example.jpg
```

New uploads create their thumbnails immediately. When an existing or favorite image is displayed and its thumbnail is missing, the server regenerates it from the original and saves it for subsequent requests. If thumbnail generation fails, the UI falls back to the original image.

When a new log is submitted without an uploaded or picked image, the application links the image configured by `DEFAULT_IMAGE_PATH`. This default is not applied while editing an existing log.


#### Date filters

- Click a log's date to show all logs from that month.
- Click a date in the calendar to show that month-and-day across all years, which is useful for browsing anniversaries and recurring events.
- Use the calendar's month and year controls to browse a month; the log list follows the selected month.
- The active date filter appears above the log list and can be cleared with **Clear**.

#### Trash management

Logs are soft-deleted so they can be recovered. In the log list, hover beside a log date and click `×` to move that log to Trash; the detail-view **Delete** button does the same. The Trash button shows deleted logs. In Trash, use the restore icon to clear `deleted_at`, or use the second `×` to permanently delete one log immediately. **Empty Trash** permanently deletes every log in Trash and requires confirmation.

## Other modules

The following modules support the Core Log journal but are maintained separately from the Core Log module.

### Usage of Tool

Browse and edit SQLite tables, create or purge per-database backups through a selected browser folder, and create a dated full-data backup under `BACKUP_ROOT`.

The **Seed Data** section manages local image files. **Seed qLink Icons** reads each qLink's saved URL and downloads an icon only when its local icon file is missing or invalid. New qLinks download an icon when they are created; editing a qLink downloads a new icon only when its URL changes.

### Usage of Trade

Track accounts, symbols, trades, lots, matches, balances, and prices. Stock quotes and bulk price updates use Finnhub when `FINNHUB_API_KEY` is configured. A changed symbol fetches the quote for that symbol. Trade CSV files can be staged against an account, reviewed, and merged into `trd_log`.

### Usage of Transaction

Manage categories, subcategories, keywords, trips, sources, and category rules. The transaction workflow supports:

1. Selecting multiple CSV files and assigning each file to a source.
2. Loading files into the staging table using the source's `staging_params` expression.
3. Reviewing rows against `last_txn_date` and marking duplicates as `no_import`.
4. Purging obsolete or excluded staging rows.
5. Applying active category rules to uncategorized staging rows.
6. Merging selected staging rows into the transaction table.
7. Filtering transactions by period, trip, type, source, category, subcategory, and description.
8. Viewing detail rows or filtered summaries for expense, income, and transfer.

Credit-card payment rows are loaded as `transfer`; purchases are loaded as `expense`. Bank expense amounts are normalized for spending summaries without changing the stored transaction amount.

Category rules are prioritized by descending priority and apply only to uncategorized transactions. Rules can be added or updated manually, or rebuilt from real transaction data. Rebuilt rules are saved directly to the rule table.

## Project structure

```text
src/
  app.ts                              Express app and route registration
  server.ts                           HTTP server bootstrap and shutdown
  config/env.ts                       Environment and database paths
  controllers/                        Journal and tag HTTP handlers
  db/pool.ts                          Core Log SQLite handle
  repositories/journalRepository.ts   Journal queries and transactions
  routes/                             Journal and tag API routes
  server/apps/trade/                  Trade API, database, and quote logic
  server/apps/transaction/            Transaction API, staging, rules, and merge logic
  scripts/                            Database migration and import utilities
public/
  index.html                          Application landing page
  pages/apps/log.html                 Journal UI
  pages/apps/trade.html               Trading UI
  pages/apps/transaction.html         Transaction UI
  pages/apps/tool.html                Tool UI
  pages/apps/*.js                     Browser-side application logic
  styles.css                          Shared application styles
```

## Requirements

- Node.js with npm
- Finnhub API key for Trade quote features

## Installation

Assuming the project has been downloaded from GitHub, open a terminal in the project directory and install and initialize it:

```bash
cd node_dev
npm install
npm run setup
npm run build
npm start
```

`npm run setup` creates `.env.local` from `.env.example` when no local environment file exists, then creates the configured Core Log, Trade, and Transaction database files. Existing environment files and databases are preserved.

`npm run build` compiles the TypeScript server to `dist/`. Use `npm start` to run the compiled server, or use `npm run dev` during development for watch mode.

## Development 
For development, start the server with:

```bash
npm run dev
```

This watches the source files and restarts the server when changes are detected.

The server listens on `PORT` (default `3001`). Open `http://localhost:3001/` in a browser.

## Environment

```dotenv
PORT=3002
DATA_ROOT=./data
BACKUP_ROOT=../backup
SQLITE_DB_DIR=db
SQLITE_CORELOG_DB_DIR=corelog
SQLITE_TRADE_DB_DIR=trade
SQLITE_TRANSACTION_DB_DIR=transaction
SQLITE_HAYDAY_DB_DIR=hayday
UPLOAD_DIR=uploads
UPLOAD_PUBLIC_PATH=/uploads
DEFAULT_IMAGE_PATH=favorite/default.jpg
FAVICON_DIR=favicons
FAVICON_PUBLIC_PATH=/favicons
MAX_UPLOAD_MB=25
FINNHUB_API_KEY=your_finnhub_api_key
```

The application loads `.env.local` first and falls back to `.env`. Keep API keys in a local environment file and do not commit them.

## Database and time conventions

Core Log, Trade, and Transaction use separate SQLite databases under `DATA_ROOT/db`. Core Log stores qLinks in the `qlink_group` and `qlink` tables. The transaction database contains source, staging, transaction, transaction-line, category, subcategory, keyword, rule, and trip data.

All configured SQLite database files must already exist when the server starts. A missing path or file stops startup with an error; the application does not create an empty replacement database. For a fresh installation, run `npm run setup` explicitly to create the dedicated database directories, files, and schemas.

The Tool tab's **Backup Data** action copies the complete `DATA_ROOT` structure to `BACKUP_ROOT/YYMMDD`. Live databases are copied with SQLite's backup API. An existing backup for the current date is skipped. The existing per-database backup and purge controls continue to use the browser-selected database path.

Persist timestamps in UTC. Convert user-entered local times to UTC before saving, and convert database UTC timestamps to local time before displaying them in the UI. Date-only financial fields such as transaction dates are treated as calendar dates rather than instants.

## API overview

### General

- `GET /health`
- `GET /api/entries?tag=&date=&month=&trash=1` — `trash=1` lists only soft-deleted entries
  Returns the current page in `entries` and the full filtered count in `total`.
- `PATCH /api/entries/trash` — move entry IDs to Trash
- `PATCH /api/entries/restore` — restore entry IDs from Trash
- `DELETE /api/entries/trash` — permanently delete selected trashed entry IDs
- `DELETE /api/entries/trash/all` — permanently delete all trashed entries
- `GET /api/entries/dates`
- `POST /api/entry`
- `GET /api/entries/:id`
- `PUT /api/entries/:id`
- `GET /api/tags?search=`

### Trade

- `GET /api/quote/:symbol`
- `PUT /api/fetchallprices`
- `POST /api/trade/staging`
- `POST /api/trade/merge`
- `GET /api/trade`
- `GET /api/account`
- `GET /api/acctBalance/:date`
- Trade, symbol, account, institution, and match table endpoints

### Transaction

- `GET /api/transaction/table/:table`
- `POST /api/transaction/staging`
- `POST /api/transaction/staging/apply-rules`
- `POST /api/transaction/category-rules/generate`
- `POST /api/transaction/merge`
- `POST /api/transaction/staging/purge`
- Transaction table add, update, and delete endpoints

## Scripts

```bash
npm run dev        # Start the development server with watch mode
npm run build      # Compile TypeScript to dist/
npm run typecheck  # Type-check without emitting files
npm start          # Run the compiled server
```

## Upload workflow

For transaction imports, choose CSV files, assign the correct source, and click **Stage**. The source's `staging_params` controls the CSV-to-staging mapping. Review the staged rows and duplicate context, apply rules when needed, purge rows marked `no_import`, then click **Merge**.

## License

This is a private application and does not currently declare a public license.
