import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { DevMonitoredTokens } from "./types";
import { CollectWalletsInfo } from "./wallets";
import { loadFilterConfig, applyFilter } from "./filter";
import { appendToCsv, withRetry } from "./utils";
import { getDataSource } from "./database/data-source";
import { Token } from "./database/entities/Token";

puppeteer.use(StealthPlugin());

export async function DatabaseLookup() {
    const filterConfig = await loadFilterConfig();
    const db = await getDataSource();
    const tokenRepo = db.getRepository(Token);

    // One entry per unique creator (Token shape matches DevMonitoredTokens directly)
    const allTokens = await tokenRepo.find();
    const seenCreators = new Set<string>();
    const uniqueCreators: DevMonitoredTokens[] = [];
    for (const token of allTokens) {
        if (!seenCreators.has(token.creator)) {
            seenCreators.add(token.creator);
            uniqueCreators.push(token);
        }
    }

    console.log(`[DB LOOKUP] Found ${uniqueCreators.length} unique creator(s) in database`);

    const date = new Date().toISOString().slice(0, 10);
    const outputPath = `wallets_${date}.csv`;

    const browser = await puppeteer.launch({ headless: false, userDataDir: 'profile' });
    const gmgnPage = await browser.newPage();
    await gmgnPage.goto('https://gmgn.ai/sol', { waitUntil: 'networkidle2' });
    await Bun.sleep(3000);
    try {
        const result = await CollectWalletsInfo(uniqueCreators, gmgnPage);

        if (!result.success) {
            console.log('[ERROR] CollectWalletsInfo failed:', result.error);
            return;
        }

        if (result.value.errors.length > 0)
            console.log('[WARN] Per-wallet errors:', result.value.errors);

        let saved = 0;
        for (const wallet of result.value.wallets) {
            const passing = applyFilter(wallet.tokens, filterConfig);
            if (passing.length === 0) continue;

            if (filterConfig.maxTokens != null && passing.length > filterConfig.maxTokens) {
                console.log(`[CSV] Skipping wallet ${wallet.creator} — ${passing.length} qualifying tokens exceeds maxTokens (${filterConfig.maxTokens}), DB only.`);
                continue;
            }

            await appendToCsv(outputPath, { address: wallet.address });
            saved++;
            console.log(`[CSV] Saved ${wallet.creator} (${passing.length} qualifying token(s))`);
        }

        console.log(`[DB LOOKUP] Done. ${saved}/${uniqueCreators.length} wallets exported to ${outputPath}`);
    } finally {
        await browser.close();
    }
}

if (import.meta.main) {
    withRetry(
        () => DatabaseLookup(),
        {
            maxAttempts: 5,
            baseDelayMs: 5_000,
            onRetry: (n, err) =>
                console.error(`[DB LOOKUP] Attempt ${n} failed: ${err.message}. Retrying...`),
        }
    ).catch(err => {
        console.error('[DB LOOKUP] All attempts exhausted:', err.message);
        process.exit(1);
    });
}
