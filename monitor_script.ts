
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { TokenData, DevMonitoredTokens } from "./types";
import { createTokenMonitor } from "./monitor";
import { CollectWalletsInfo } from "./Wallets";
import { loadFilterConfig, applyFilter } from "./filter";
import { appendToCsv, readCsvCreators } from "./utils";
import { getDataSource } from "./database/data-source";
import { Token } from "./database/entities/Token";

type responseType = {
    code: number
    reason: string
    message: string;
    data: TokenData[]
}
async function Monitor() {
    puppeteer.use(StealthPlugin())
    const browser = await puppeteer.launch({ headless: false, userDataDir: 'profile' });
    const page = await browser.newPage();
    await page.setViewport({ height: 900, width: 1600 });

    const Monitor = createTokenMonitor(
        {
            maxHistorySize: 2,
            trackInitialSnapshot: true
        }
    );

    const filterConfig = await loadFilterConfig();
    const db = await getDataSource();
    const tokenRepo = db.getRepository(Token);

    try {
        await page.goto('https://gmgn.ai/trend/Q2Wot3l7?chain=sol&tab=surge',
            {
                timeout: 0,
                waitUntil: "networkidle2"
            }
        );
        while (true) {
            const tokens = await page.evaluate(async () => {
                const res = await fetch("https://gmgn.ai/vas/api/v1/token-signal/v2?device_id=a47fc4ed-5d51-4cca-a933-65e141a8feb3&fp_did=2070248d364ff97f8c1930891fc9f0a5&client_id=gmgn_web_20260226-11203-6e1aa24&from_app=gmgn&app_ver=20260226-11203-6e1aa24&tz_name=Africa%2FAlgiers&tz_offset=3600&app_lang=en-US&os=web&worker=0", {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "accept-language": "en-US,en;q=0.5",
                        "baggage": "sentry-environment=production,sentry-release=20260226-11203-6e1aa24,sentry-public_key=93c25bab7246077dc3eb85b59d6e7d40,sentry-trace_id=a2c7fbff673a4dcc9b19bdd46a2c41f7,sentry-org_id=4505147559706624,sentry-transaction=%2Ftrend%2F%5Bcode%5D,sentry-sampled=false,sentry-sample_rand=0.7174230078562596,sentry-sample_rate=0.01",
                        "content-type": "application/json",
                        "priority": "u=1, i",
                        "sec-ch-ua": "\"Not:A-Brand\";v=\"99\", \"Brave\";v=\"145\", \"Chromium\";v=\"145\"",
                        "sec-ch-ua-mobile": "?0",
                        "sec-ch-ua-platform": "\"Linux\"",
                        "sec-fetch-dest": "empty",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-site": "same-origin",
                        "sec-gpc": "1",
                        "sentry-trace": "a2c7fbff673a4dcc9b19bdd46a2c41f7-be9926c4727924d9-0"
                    },
                    "referrer": "https://gmgn.ai/trend/Q2Wot3l7?chain=sol&tab=surge",
                    "body": "{\"chain\":\"sol\",\"groups\":[{\"launchpad_platform\":[\"Pump.fun\",\"pump_mayhem\",\"letsbonk\",\"bonkers\",\"bags\",\"bankr\",\"zora\",\"surge\",\"anoncoin\",\"moonshot_app\",\"wendotdev\",\"heaven\",\"sugar\",\"token_mill\",\"believe\",\"trends_fun\",\"jup_studio\",\"Moonshot\",\"boop\",\"ray_launchpad\",\"meteora_virtual_curve\"],\"signal_type\":[1],\"total_fee_min\":1}]}",
                    "method": "POST",
                    "mode": "cors",
                    "credentials": "include"
                });


                return await res.json()
            }) as responseType

            console.log(tokens);

            const tokens_data = tokens.data.map((item) => {
                return {
                    name: item.data.name,
                    address: item.data.address,
                    chain: item.data.chain,
                    creator: item.data.creator,
                    creator_time: item.data.created_timestamp,
                }
            })

            const report = Monitor.analyze(tokens_data)
            const newTokens = report.newTokens as DevMonitoredTokens[]
            console.log('New Tokens Added ::', newTokens);

            if (newTokens.length > 0) {
                const seenCreators = await readCsvCreators('wallets.csv');
                const unseen = newTokens.filter(t => !seenCreators.has(t.creator));

                if (unseen.length === 0) {
                    console.log('All new token creators already processed, skipping.');
                } else {
                    console.log(`Scraping ${unseen.length} new creator(s)...`);
                    const walletResult = await CollectWalletsInfo(unseen.splice(0, 5), browser);

                    if (!walletResult.success) {
                        console.log('[ERROR] CollectWalletsInfo failed:', walletResult.error);
                    } else {
                        if (walletResult.value.errors.length > 0)
                            console.log('[WARN] Per-wallet errors:', walletResult.value.errors);

                        for (const wallet of walletResult.value.wallets) {
                            // DB — save every scraped wallet, no filter
                            const record = tokenRepo.create({
                                address: wallet.address,
                                name: wallet.name,
                                chain: wallet.chain,
                                creator: wallet.creator,
                                creator_time: wallet.creator_time,
                            });
                            await tokenRepo.upsert(record, ['address']);
                            console.log(`[DB] Saved wallet ${wallet.creator}`);

                            // CSV — only qualifying wallets
                            const passingTokens = applyFilter(wallet.tokens, filterConfig);
                            if (passingTokens.length === 0) continue;

                            await appendToCsv('wallets.csv', {
                                name: wallet.name,
                                address: wallet.address,
                                chain: wallet.chain,
                                creator: wallet.creator,
                            });
                            console.log(`[CSV] Saved wallet ${wallet.creator} (${passingTokens.length} qualifying token(s))`);
                        }
                    }
                }
            }

            await Bun.sleep(5000);

        }

    } catch (error) {
        console.log(error)
    }
}

Monitor();