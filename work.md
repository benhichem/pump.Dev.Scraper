# Work Log — `monitoring-and-filtering-dev-wallets` branch

## Goal
Build a pipeline that monitors gmgn.ai for newly surging Pump.fun tokens, scrapes the deploying wallet's full token history, filters it against configurable criteria, and writes qualifying wallets to a CSV — deduplicating on creator address across runs.

---

## Files Created / Modified

### `monitor.ts` — Token snapshot diffing
Factory function `createTokenMonitor` that takes an optional config (`maxHistorySize`, `trackInitialSnapshot`) and returns a stateful `TokenMonitor` object. On each call to `analyze(snapshot)` it diffs the new list against the previous one by `address`, returns a `DiffReport` (`newTokens`, `totalOld`, `totalNew`, `newCount`), and maintains a bounded history. Uses fp-ts `pipe` + `A.uniq` for dedup stats.

### `Wallets.ts` — Dev wallet Puppeteer scraper
`CollectWalletsInfo(data: DevMonitoredTokens[])` launches a non-headless Chromium session (using the persistent `profile/` directory for cookies/login state), navigates to each creator's gmgn.ai address page, waits 9 s for client-side rendering, checks login state, clicks the "Deployed Tokens" button, and intercepts the `dev_created_tokens` XHR response. Returns `Result<CollectionResult, WalletCollectError>` where `CollectionResult = { wallets, errors }`.

Key implementation decisions:
- `puppeteer.use(StealthPlugin())` called once at module level, not inside the function.
- `setRequestInterception(true)` + `page.on('request', req => req.continue())` set once before the loop, not per-iteration.
- `Promise.all([waitForResponse(...), page.evaluate(click)])` avoids the race where the response fires before the listener is registered.
- Per-wallet errors (nav timeout, button missing, parse fail, wrong shape) are collected and returned without aborting the whole run; only `NotLoggedIn` is a fatal early return.

Changes in this session:
- Added `export` keyword to `CollectWalletsInfo` so it can be imported by `monitor_script.ts`.
- Removed the module-level `await getDataSource()` side effect and its unused import, so importing the file no longer triggers a DB connection.

### `filter.ts` — Token filter
`FilterConfig` type with two optional fields: `minAthMc` (minimum ATH market cap in USD) and `maxTokenAgeMins` (max age since creation). `loadFilterConfig()` reads `filter.json` at runtime. `applyFilter<T>(tokens, config)` is a generic filter that works on any token shape (including `Array<any>` returned by the scraper) by casting internally.

`filter.json` (runtime config, gitignored):
```json
{ "minAthMc": 4000, "maxTokenAgeMins": 60 }
```

### `utils.ts` — CSV helpers
- `appendToCsv(filePath, data)` — uses PapaParse to write a CSV. Creates the file with a header row if it doesn't exist; appends a headerless row otherwise. Returns `Either<string, void>`.
- `readCsvCreators(filePath)` — reads the CSV file, parses it with PapaParse (header mode), and returns a `Set<string>` of all `creator` column values. Returns an empty set if the file doesn't exist yet. Used for dedup.

### `monitor_script.ts` — Main polling loop
Launches a headless Puppeteer browser, navigates to the gmgn.ai surge trend page, and polls every 5 seconds by executing a `fetch` call from within the page context (to inherit session cookies). Maps the API response to `DevMonitoredTokens[]` and feeds it to `createTokenMonitor`.

**Pipeline when new tokens are detected:**
1. `readCsvCreators('wallets.csv')` — load already-processed creators as a `Set`.
2. Filter `report.newTokens` to drop any token whose `creator` is in the set.
3. If none are unseen, log and skip.
4. Otherwise call `CollectWalletsInfo(unseen)` to scrape each creator's deployed tokens.
5. On fatal error, log and continue to the next poll cycle.
6. For each returned wallet, run `applyFilter(wallet.tokens, filterConfig)`.
7. If no tokens pass the filter, skip the wallet entirely.
8. Otherwise call `appendToCsv('wallets.csv', { name, address, chain, creator, creator_time, qualifying_tokens })`.

The old behavior of writing `output.json` was replaced entirely by this CSV pipeline.

### `database/` — TypeORM setup (created, currently decoupled)
`database/data-source.ts` defines a SQLite TypeORM `DataSource` using `pump_scraper.db`. `database/entities/Token.ts` defines a `Token` entity. These were created as part of the initial commit but are not actively used in the current pipeline after removing the `getDataSource()` call from `Wallets.ts`.

---

## Data Flow (current state)

```
gmgn.ai token-signal API (polled every 5s via in-page fetch)
  └─ createTokenMonitor.analyze()
       └─ report.newTokens (DevMonitoredTokens[])
            └─ readCsvCreators('wallets.csv')  →  Set<creator>
                 └─ filter out already-seen creators
                      └─ CollectWalletsInfo(unseen)
                           └─ Puppeteer → gmgn.ai /address/{creator}
                                └─ dev_created_tokens XHR  →  wallet.tokens (any[])
                                     └─ applyFilter(wallet.tokens, filterConfig)
                                          └─ appendToCsv('wallets.csv', walletRow)
```

## Output Schema (`wallets.csv`)
| Column | Source |
|---|---|
| `name` | Token name from the surge feed |
| `address` | Token contract address |
| `chain` | Chain (e.g. `sol`) |
| `creator` | Creator wallet address (dedup key) |
| `creator_time` | Token creation timestamp (unix seconds) |
| `qualifying_tokens` | Count of tokens passing the filter |

---

## Stack
- Runtime: Bun
- Language: TypeScript (strict, `noUncheckedIndexedAccess`)
- Scraping: puppeteer-extra + puppeteer-extra-plugin-stealth (persistent `profile/` session)
- CSV: PapaParse
- FP utilities: fp-ts
- DB (unused in pipeline): TypeORM + SQLite
