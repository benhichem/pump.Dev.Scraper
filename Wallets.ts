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
    | { type: 'NavigationError'; message: string; walletUrl: string; creator: string }
    | { type: 'NavigationTimeout'; message: string; walletUrl: string; creator: string }
    | { type: 'ButtonNotFound'; message: string; walletUrl: string; creator: string }
    | { type: 'ResponseTimeout'; message: string; walletUrl: string; creator: string }
    | { type: 'ResponseParseError'; message: string; walletUrl: string; creator: string }
    | { type: 'UnexpectedShape'; message: string; walletUrl: string; creator: string };

type CollectionResult = {
    wallets: Array<DevMonitoredTokens & { tokens: Array<any> }>;
    errors: WalletCollectError[];
};

const LOGIN_SELECTOR = '#MainLayouLeftContanerId > div > div:nth-child(1) > div.transition-opacity.will-change-auto.opacity-100.bg-bg-100.cursor-move > div.size-full.pt-12px > div > div.flex.flex-1.min-h-0.cursor-auto > div > div > div';

function getDevAccountUrl(token: Pick<DevMonitoredTokens, 'chain' | 'creator'>): string {
    return `https://gmgn.ai/${token.chain}/address/${token.creator}`;
}

export async function CollectWalletsInfo(
    data: Array<DevMonitoredTokens>, browser: Browser
): Promise<Result<CollectionResult, WalletCollectError>> {

    const wallets: Array<DevMonitoredTokens & { tokens: Array<any> }> = [];
    const errors: WalletCollectError[] = [];
    /*     let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    
        try {
            browser = await puppeteer.launch({ headless: false, userDataDir: "profile" });
        } catch (error) {
            const e: WalletCollectError = {
                type: 'BrowserLaunchError',
                message: `[ERROR] Browser launch failed: ${String(error)}`
            };
            console.log(e.message);
            return { success: false, error: e };
        } */

    try {
        const page = await browser.newPage();
        await page.setViewport({ height: 900, width: 1600 });
        await page.setRequestInterception(true);
        page.on('request', (req) => { req.continue(); });

        for (let index = 0; index < data.length; index++) {
            const currentToken = data[index]!;
            const devWalletUrl = getDevAccountUrl(currentToken);
            const ctx = { walletUrl: devWalletUrl, creator: currentToken.creator };

            // Navigation
            try {
                await page.goto(devWalletUrl);
            } catch (error) {
                const isTimeout = error instanceof Error &&
                    error.constructor.name === 'TimeoutError';
                const e: WalletCollectError = isTimeout
                    ? { type: 'NavigationTimeout', message: `[WARN] Navigation timed out for ${devWalletUrl}`, ...ctx }
                    : { type: 'NavigationError', message: `[WARN] Navigation failed for ${devWalletUrl}: ${String(error)}`, ...ctx };
                console.log(e.message);

                errors.push(e);
                continue;
            }

            await Bun.sleep(9000);

            // NotLoggedIn check — fatal, exits the entire function
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

            // Button existence check (textContent is layout-independent, unlike innerText)
            const buttonExists = await page.evaluate((): boolean => {
                return Array.from(document.querySelectorAll('button'))
                    .some(btn => (btn.textContent ?? '').includes('Deployed Tokens'));
            });

            if (!buttonExists) {
                const e: WalletCollectError = {
                    type: 'ButtonNotFound',
                    message: `[WARN] "Deployed Tokens" button not found at ${devWalletUrl}`,
                    ...ctx
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            // Await XHR response — Promise.all ensures waitForResponse is registered
            // before the click fires, preventing the response from being missed
            let response: Awaited<ReturnType<typeof page.waitForResponse>>;
            try {
                [response] = await Promise.all([
                    page.waitForResponse(
                        (res) => res.url().includes('dev_created_tokens'),
                        { timeout: 15000 }
                    ),
                    page.evaluate((): void => {
                        const btn = Array.from(document.querySelectorAll('button'))
                            .find(btn => (btn.textContent ?? '').includes('Deployed Tokens')) as HTMLButtonElement | undefined;
                        btn?.click();
                    })
                ]);
            } catch (error) {
                const e: WalletCollectError = {
                    type: 'ResponseTimeout',
                    message: `[WARN] Response timed out for ${currentToken.creator}`,
                    ...ctx
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            // Parse JSON
            let JsonResponse: unknown;
            try {
                JsonResponse = await response.json();
            } catch (error) {
                const e: WalletCollectError = {
                    type: 'ResponseParseError',
                    message: `[ERROR] Failed to parse response for ${currentToken.creator}: ${String(error)}`,
                    ...ctx
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            // Validate shape
            const tokens = (JsonResponse as any)?.data?.tokens;
            if (!Array.isArray(tokens)) {
                const e: WalletCollectError = {
                    type: 'UnexpectedShape',
                    message: `[ERROR] Unexpected response shape for ${currentToken.creator}: "data.tokens" is ${typeof tokens}`,
                    ...ctx
                };
                console.log(e.message);
                errors.push(e);
                continue;
            }

            console.log(`Tokens for wallet ${currentToken.creator}:`, JsonResponse);
            wallets.push({ ...currentToken, tokens });
        }

    } finally {

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
}]).then((result) => {
    if (!result.success) {
        console.log('[ERROR] Fatal error, no data collected:', result.error);
        return;
    }
    console.log('All collected wallet info:', result.value.wallets);
    if (result.value.errors.length > 0)
        console.log('[WARN] Per-wallet errors:', result.value.errors);
});
 */