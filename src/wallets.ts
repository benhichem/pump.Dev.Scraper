import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { DevMonitoredTokens } from "./types";
import type { Browser } from "puppeteer";

puppeteer.use(StealthPlugin());

type Result<T, E> =
    | { success: true; value: T }
    | { success: false; error: E };

type WalletCollectError =
    | { type: 'BrowserLaunchError'; message: string }
    | { type: 'NotLoggedIn'; message: string }
    | { type: 'NavigationError'; message: string }
    | { type: 'NavigationTimeout'; message: string }
    | { type: 'FetchError'; message: string; creator: string }
    | { type: 'ResponseParseError'; message: string; creator: string }
    | { type: 'UnexpectedShape'; message: string; creator: string };

type CollectionResult = {
    wallets: Array<DevMonitoredTokens & { tokens: Array<any> }>;
    errors: WalletCollectError[];
};

const LOGIN_SELECTOR = '#MainLayouLeftContanerId > div > div:nth-child(1) > div.transition-opacity.will-change-auto.opacity-100.bg-bg-100.cursor-move > div.size-full.pt-12px > div > div.flex.flex-1.min-h-0.cursor-auto > div > div > div';

function buildApiUrl(
    token: Pick<DevMonitoredTokens, 'chain' | 'creator'>,
    params: { device_id: string; fp_did: string; client_id: string; app_ver: string }
): string {
    const qs = new URLSearchParams({
        device_id:  params.device_id,
        fp_did:     params.fp_did,
        client_id:  params.client_id,
        from_app:   'gmgn',
        app_ver:    params.app_ver,
        tz_name:    Intl.DateTimeFormat().resolvedOptions().timeZone,
        tz_offset:  String(-(new Date().getTimezoneOffset()) * 60),
        app_lang:   'en-US',
        os:         'web',
        worker:     '0',
        order_by:   'token_ath_mc',
        direction:  'desc',
    });
    return `https://gmgn.ai/api/v1/dev_created_tokens/${token.chain}/${token.creator}?${qs}`;
}

export async function CollectWalletsInfo(
    data: Array<DevMonitoredTokens>, browser: Browser
): Promise<Result<CollectionResult, WalletCollectError>> {

    const wallets: Array<DevMonitoredTokens & { tokens: Array<any> }> = [];
    const errors: WalletCollectError[] = [];

    const page = await browser.newPage();
    try {
        await page.setViewport({ height: 900, width: 1600 });

        // Navigate once to establish gmgn.ai origin + cookies
        console.log('[WALLET] Navigating to gmgn.ai/sol to establish session...');
        try {
            await page.goto('https://gmgn.ai/sol', { waitUntil: 'networkidle2' });
        } catch (error) {
            const isTimeout = error instanceof Error &&
                error.constructor.name === 'TimeoutError';
            const e: WalletCollectError = isTimeout
                ? { type: 'NavigationTimeout', message: `[WALLET] Navigation timed out for gmgn.ai/sol` }
                : { type: 'NavigationError', message: `[WALLET] Navigation failed for gmgn.ai/sol: ${String(error)}` };
            console.log(e.message);
            return { success: false, error: e };
        }

        await Bun.sleep(3000);

        // Check login once — fatal if logged out
        console.log('[WALLET] Checking login status...');
        const isLoggedOut = await page.evaluate((sel: string): boolean => {
            const el = document.querySelector(sel);
            return el !== null && (el.textContent?.includes('Log in') ?? false);
        }, LOGIN_SELECTOR);

        if (isLoggedOut) {
            return {
                success: false, error: {
                    type: 'NotLoggedIn',
                    message: '[ERROR] Not logged in — sign in to gmgn.ai via the "profile" browser session first'
                }
            };
        }

        // Extract dynamic query params from page context
        const pageParams = await page.evaluate(() => ({
            device_id: localStorage.getItem('device_id') ?? '',
            fp_did:    localStorage.getItem('fp_did') ?? '',
            client_id: (window as any).__app_ver ?? '',
            app_ver:   (window as any).__app_ver ?? '',
        }));

        console.log('[WALLET] Session established. Starting per-creator fetch loop...');

        for (let index = 0; index < data.length; index++) {
            const currentToken = data[index]!;
            const apiUrl = buildApiUrl(currentToken, pageParams);
            console.log(`[WALLET] (${index + 1}/${data.length}) Fetching tokens for creator ${currentToken.creator}...`);

            let jsonResponse: unknown;
            try {
                jsonResponse = await page.evaluate(async (url: string) => {
                    const res = await fetch(url, {
                        credentials: 'include',
                        headers: {
                            'accept': 'application/json, text/plain, */*',
                            'accept-language': 'en-US,en;q=0.6',
                        },
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                }, apiUrl);
            } catch (error) {
                const e: WalletCollectError = {
                    type: 'FetchError',
                    message: `[WALLET] Fetch failed for ${currentToken.creator}: ${String(error)}`,
                    creator: currentToken.creator,
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            // Validate shape
            const tokens = (jsonResponse as any)?.data?.tokens;
            if (!Array.isArray(tokens)) {
                const e: WalletCollectError = {
                    type: 'UnexpectedShape',
                    message: `[WALLET] Unexpected response shape for ${currentToken.creator}: "data.tokens" is ${typeof tokens}`,
                    creator: currentToken.creator,
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            console.log(`[WALLET] Got ${tokens.length} deployed token(s) for creator ${currentToken.creator}.`);
            wallets.push({ ...currentToken, tokens });
        }

    } finally {
        await page.close();
    }

    return { success: true, value: { wallets, errors } };
}

/* CollectWalletsInfo([{
    "name": "Spank",
    "address": "2UpYjo19bmn7DpwJYAZQxAH6HuA2FiZrnLTADqzyKrwB",
    "chain": "sol",
    "creator": "FSTNPYhiBNrbkCPeVnqavgBqRMuZTLMRMbfT2T9oizty",
    "creator_time": 1772243713
},
{
    "name": "Pre-Retogeum",
    "address": "1fkpzkh5wWAxMRdofy6n4JouytVz2sMvtCLRvp8pump",
    "chain": "sol",
    "creator": "7E9jfxCczubz4FXkkVKzUMHXGwzJxyppC4m7y3ew8ATg",
    "creator_time": 1772244571
}], browser).then((result) => {
    if (!result.success) {
        console.log('[ERROR] Fatal error, no data collected:', result.error);
        return;
    }
    console.log('All collected wallet info:', result.value.wallets);
    if (result.value.errors.length > 0)
        console.log('[WARN] Per-wallet errors:', result.value.errors);
});
 */
