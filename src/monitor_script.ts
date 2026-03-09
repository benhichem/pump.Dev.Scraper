
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { withRetry, appendToCsv, readCsvCreators } from "./utils";
import { createTokenMonitor } from "./monitor";
import type { DevMonitoredTokens } from "./types";
import { CollectWalletsInfo } from "./wallets";
import { loadFilterConfig, applyFilter, type FilterConfig } from "./filter";
import { getDataSource } from "./database/data-source";
import { Token } from "./database/entities/Token";
import type { Repository } from "typeorm";

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

export async function Monitor() {
    puppeteer.use(StealthPlugin())
    const browser = await puppeteer.launch({ headless: false, userDataDir: 'profile' });
    const page = await browser.newPage();
    await page.setViewport({ height: 900, width: 1600 });

    const filterConfig = await loadFilterConfig();
    const db = await getDataSource();
    const tokenRepo = db.getRepository(Token);
    const scrapeQueue: DevMonitoredTokens[] = [];

    (async function scrapeWorker() {
        console.log('[WORKER] Background scrape worker started, waiting for queue...');
        while (true) {
            if (scrapeQueue.length < 5) {
                await Bun.sleep(1000);
                continue;
            }
            const batch = scrapeQueue.splice(0, 5);
            console.log(`[WORKER] Dequeued ${batch.length} creator(s) (${scrapeQueue.length} remaining). Starting gmgn.ai scrape...`);
            const result = await CollectWalletsInfo(batch, page);
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
        console.log('[MONITOR] Navigating to gmgn.ai...');
        await page.goto('https://gmgn.ai/?chain=sol&ref=YdZf4d2S', {
            timeout: 0,
            waitUntil: 'networkidle2',
        });

        const tokenMonitor = createTokenMonitor({ trackInitialSnapshot: true });
        const seenTokens: DevMonitoredTokens[] = [];

        const client = await page.createCDPSession();
        await client.send('Network.enable');

        client.on('Network.webSocketCreated', ({ url }: { url: string }) => {
            if (url.includes('gmgn.ai/ws')) {
                console.log('[WS] Intercepted connection:', url);
            }
        });

        client.on('Network.webSocketFrameReceived', ({ response }: { response: { payloadData: string } }) => {
            try {
                const msg = JSON.parse(response.payloadData);
                if (msg.channel !== 'public_broadcast') return;

                const items: any[] = msg.data ?? [];
                const creations = items.filter(
                    (item: any) => item.et === 'signal' && item.ed?.sig_op_t === 'create'
                );
                if (creations.length === 0) return;

                for (const item of creations) {
                    const token: DevMonitoredTokens = {
                        name:         item.ed.d.nm,
                        address:      item.ed.d.a,
                        chain:        item.ed.c,
                        creator:      item.ed.d.d_ct,
                        creator_time: item.ed.d.ct,
                    };
                    if (!seenTokens.find(t => t.address === token.address)) {
                        seenTokens.push(token);
                    }
                }

                const report = tokenMonitor.analyze(seenTokens);
                if (report.newTokens.length === 0) return;

                (async () => {
                    const newTokens = report.newTokens as DevMonitoredTokens[];
                    console.log(`[MONITOR] ${newTokens.length} new token(s) detected`);

                    const seenCreators = await readCsvCreators('wallets.csv');
                    const unseen = newTokens.filter(t => !seenCreators.has(t.creator));

                    if (unseen.length === 0) {
                        console.log('[MONITOR] All creators already in wallets.csv, skipping.');
                        return;
                    }

                    scrapeQueue.push(...unseen);
                    console.log(`[MONITOR] Queued ${unseen.length} creator(s). Queue depth: ${scrapeQueue.length}`);
                })();
            } catch {
                // non-JSON frame, ignore
            }
        });

        // Keep alive — WS listener and worker run in background
        console.log('[MONITOR] Listening for public_broadcast messages...');
        await new Promise<void>(() => { });

    } catch (error) {
        console.error('[MONITOR] Fatal error:', (error as Error).message);
        throw error;
    } finally {
        await browser?.close();
    }
}

if (import.meta.main) {
    withRetry(
        () => Monitor(),
        {
            maxAttempts: Infinity,
            baseDelayMs: 10_000,
            onRetry: (n, err) =>
                console.error(`[MONITOR] Crashed (attempt ${n}): ${err.message}. Restarting...`),
        }
    ).catch(err => {
        console.error('[MONITOR] Fatal, giving up:', err.message);
        process.exit(1);
    });
}
