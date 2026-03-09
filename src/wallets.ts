import type { DevMonitoredTokens } from "./types";
import type { Page } from "puppeteer";

type Result<T, E> =
    | { success: true; value: T }
    | { success: false; error: E };

type WalletCollectError =
    | { type: 'FetchError'; message: string; creator: string }
    | { type: 'ResponseParseError'; message: string; creator: string }
    | { type: 'UnexpectedShape'; message: string; creator: string };

type CollectionResult = {
    wallets: Array<DevMonitoredTokens & { tokens: Array<any> }>;
    errors: WalletCollectError[];
};

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
    data: Array<DevMonitoredTokens>, page: Page
): Promise<Result<CollectionResult, WalletCollectError>> {

    const wallets: Array<DevMonitoredTokens & { tokens: Array<any> }> = [];
    const errors: WalletCollectError[] = [];

    // Extract dynamic query params from the already-open gmgn.ai page
    const pageParams = await page.evaluate(() => ({
        device_id: localStorage.getItem('device_id') ?? '',
        fp_did:    localStorage.getItem('fp_did') ?? '',
        client_id: (window as any).__app_ver ?? '',
        app_ver:   (window as any).__app_ver ?? '',
    }));

    console.log('[WALLET] Starting per-creator fetch loop...');

    for (let index = 0; index < data.length; index++) {
        const currentToken = data[index]!;
        const apiUrl = buildApiUrl(currentToken, pageParams);
        console.log(`[WALLET] (${index + 1}/${data.length}) Fetching tokens for creator ${currentToken.creator}...`);

        let jsonResponse: unknown;
        try {
            jsonResponse = await page.evaluate(async (url: string) => {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15_000);
                try {
                    const res = await fetch(url, {
                        credentials: 'include',
                        signal: controller.signal,
                        headers: {
                            'accept': 'application/json, text/plain, */*',
                            'accept-language': 'en-US,en;q=0.6',
                        },
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                } finally {
                    clearTimeout(timeout);
                }
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

    return { success: true, value: { wallets, errors } };
}
