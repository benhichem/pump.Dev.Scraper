import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { DevMonitoredTokens } from "./types";
import { createTokenMonitor } from "./monitor";
import { CollectWalletsInfo } from "./wallets";
import { loadFilterConfig, applyFilter, type FilterConfig } from "./filter";
import { appendToCsv, readCsvCreators, withRetry } from "./utils";
import { getDataSource } from "./database/data-source";
import { Token } from "./database/entities/Token";
import type { Repository } from "typeorm";

type SolscanResponse = {
    success: boolean;
    data: Array<{
        trans_id: string;
        block_time: number;
        from_address: string;
        amount_info: unknown;
    }>;
};

async function saveWallets(
    wallets: Array<DevMonitoredTokens & { tokens: Array<any> }>,
    tokenRepo: Repository<Token>,
    filterConfig: FilterConfig,
) {
    for (const wallet of wallets) {
        const record = tokenRepo.create({
            address: wallet.address,
            name: wallet.name,
            chain: wallet.chain,
            creator: wallet.creator,
            creator_time: wallet.creator_time,
        });
        await tokenRepo.upsert(record, ['address']);
        console.log(`[DB] Saved wallet ${wallet.creator}`);

        const passingTokens = applyFilter(wallet.tokens, filterConfig);
        if (passingTokens.length === 0) continue;

        if (filterConfig.maxTokens != null && passingTokens.length > filterConfig.maxTokens) {
            console.log(`[CSV] Skipping wallet ${wallet.creator} — ${passingTokens.length} qualifying tokens exceeds maxTokens (${filterConfig.maxTokens}), DB only.`);
            continue;
        }

        await appendToCsv('wallets.csv', { address: wallet.address });
        console.log(`[CSV] Saved wallet ${wallet.creator} (${passingTokens.length} qualifying token(s))`);
    }
}

export async function SoulScrape() {
    puppeteer.use(StealthPlugin());

    console.log('[INIT] Launching browser...');
    const browser = await puppeteer.launch({ headless: false, userDataDir: 'profile' });
    const page = await browser.newPage();
    await page.setViewport({ height: 900, width: 1600 });
    console.log('[INIT] Browser ready.');

    console.log('[INIT] Navigating gmgn.ai session page...');
    const gmgnPage = await browser.newPage();
    await gmgnPage.goto('https://gmgn.ai/sol', { waitUntil: 'networkidle2' });
    await Bun.sleep(3000);
    console.log('[INIT] gmgn.ai session ready.');

    const Monitor = createTokenMonitor({ maxHistorySize: 2, trackInitialSnapshot: true });

    console.log('[INIT] Loading filter config...');
    const filterConfig = await loadFilterConfig();
    console.log('[INIT] Filter config loaded.');

    console.log('[INIT] Connecting to database...');
    const db = await getDataSource();
    const tokenRepo = db.getRepository(Token);
    console.log('[INIT] Database connected.');

    const scrapeQueue: DevMonitoredTokens[] = [];

    (async function scrapeWorker() {
        console.log('[WORKER] Background scrape worker started, waiting for queue...');
        while (true) {
            if (scrapeQueue.length === 0) {
                await Bun.sleep(1000);
                continue;
            }
            const batch = scrapeQueue.splice(0, 5);
            console.log(`[WORKER] Dequeued ${batch.length} creator(s) (${scrapeQueue.length} remaining). Starting gmgn.ai scrape...`);
            const result = await CollectWalletsInfo(batch, gmgnPage);
            if (!result.success) {
                console.log('[WORKER] CollectWalletsInfo failed:', result.error);
            } else {
                const { wallets, errors } = result.value;
                if (errors.length > 0)
                    console.log(`[WORKER] ${errors.length} per-wallet error(s):`, errors);
                console.log(`[WORKER] Scrape complete. Got ${wallets.length} wallet(s). Saving...`);
                await saveWallets(wallets, tokenRepo, filterConfig);
                console.log(`[WORKER] Finished saving batch of ${wallets.length} wallet(s).`);
            }
        }
    })();

    try {
        console.log('[MONITOR] Navigating to Solscan PumpFun activity feed...');
        await page.goto(
            'https://solscan.io/amm/pumpfun?activity_type=ACTIVITY_SPL_INIT_MINT&page_size=10',
            { timeout: 0, waitUntil: 'networkidle2' }
        );
        console.log('[MONITOR] Page loaded. Starting poll loop (every 5s)...');

        let iteration = 0;
        while (true) {
            iteration++;
            console.log(`\n[MONITOR] --- Iteration #${iteration} ---`);
            try {
                console.log('[MONITOR] Fetching latest PumpFun mint activity from Solscan API...');
                const response = await page.evaluate(async () => {
                    const res = await fetch(
                        "https://api-v2.solscan.io/v2/defi/amm/activity?app_id=pumpfun&page=1&page_size=10&activity_type[]=ACTIVITY_SPL_INIT_MINT",
                        {
                            "headers": {
                                "accept": "application/json, text/plain, */*",
                                "accept-language": "en-US,en;q=0.7",
                                "if-none-match": "W/\"3452-M6/fxcAs5/cnkIc0JnovZTAhjSI\"",
                                "priority": "u=1, i",
                                "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Brave\";v=\"145\", \"Chromium\";v=\"145\"",
                                "sec-ch-ua-mobile": "?0",
                                "sec-ch-ua-platform": "\"Linux\"",
                                "sec-fetch-dest": "empty",
                                "sec-fetch-mode": "cors",
                                "sec-fetch-site": "same-site",
                                "sec-gpc": "1"
                            },
                            "referrer": "https://solscan.io/",
                            "body": null,
                            "method": "GET",
                            "mode": "cors",
                            "credentials": "include"
                        }
                    );
                    return await res.json();
                }) as SolscanResponse;

                const tokens_data = response.data.map(item => ({
                    name: '',
                    address: item.trans_id,
                    chain: 'sol',
                    creator: item.from_address,
                    creator_time: item.block_time,
                }));

                console.log(`[MONITOR] Received ${tokens_data.length} token(s) from API. Running diff against history...`);

                const report = Monitor.analyze(tokens_data);
                const newTokens = report.newTokens as DevMonitoredTokens[];

                if (newTokens.length === 0) {
                    console.log('[MONITOR] No new tokens since last poll.');
                } else {
                    console.log(`[MONITOR] ${newTokens.length} new token(s) detected:`, newTokens.map(t => t.address));

                    const seenCreators = await readCsvCreators('wallets.csv');
                    const unseen = newTokens.filter(t => !seenCreators.has(t.creator));
                    const alreadySeen = newTokens.length - unseen.length;

                    if (alreadySeen > 0)
                        console.log(`[MONITOR] ${alreadySeen} creator(s) already in wallets.csv, skipping.`);

                    if (unseen.length === 0) {
                        console.log('[MONITOR] All new token creators already processed, nothing to queue.');
                    } else {
                        scrapeQueue.push(...unseen);
                        console.log(`[MONITOR] Queued ${unseen.length} new creator(s). Queue is now ${scrapeQueue.length} deep.`);
                    }
                }

                console.log('[MONITOR] Sleeping 5s before next poll...');
                await Bun.sleep(5000);

            } catch (iterErr) {
                console.error('[MONITOR] Iteration error, will retry in 5s:', (iterErr as Error).message);
                await Bun.sleep(5000);
            }
        }
    } catch (error) {
        console.error('[SOUL SCRAPE] Fatal error:', (error as Error).message);
        throw error;
    } finally {
        console.log('[SOUL SCRAPE] Shutting down browser...');
        await gmgnPage?.close();
        await browser?.close();
    }
}

if (import.meta.main) {
    withRetry(
        () => SoulScrape(),
        {
            maxAttempts: Infinity,
            baseDelayMs: 10_000,
            onRetry: (n, err) =>
                console.error(`[SOUL SCRAPE] Crashed (attempt ${n}): ${err.message}. Restarting...`),
        }
    ).catch(err => {
        console.error('[SOUL SCRAPE] Fatal, giving up:', err.message);
        process.exit(1);
    });
}
