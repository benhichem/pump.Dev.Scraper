import type { HeadersInit } from "bun";
import { pipe } from "fp-ts/lib/function";

import {
    Left,
    Right,
    type Either,
    type FetchConfig,
    type gmgm_api_response,
    type HttpMethod,
    type TokenBasics,
    type TokenData
} from "./types";
import { createTokenMonitor } from "./monitor";
import { sendMessageToChannel } from "./telegram";
import { parseConfig } from "./utils";

const url = "https://gmgn.ai/vas/api/v1/token-signal/v2?device_id=9882ce86-8acb-4959-968d-c9fe38153cd9&fp_did=31e421019c57b96bf0f38f39fbce8147&client_id=gmgn_web_20260226-11203-6e1aa24&from_app=gmgn&app_ver=20260226-11203-6e1aa24&tz_name=Africa%2FAlgiers&tz_offset=3600&app_lang=en-US&os=web&worker=0"
const config = {
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
    body: "{\"chain\":\"sol\",\"groups\":[{\"launchpad_platform\":[\"Pump.fun\",\"pump_mayhem\",\"letsbonk\",\"bonkers\",\"bags\",\"bankr\",\"zora\",\"surge\",\"anoncoin\",\"moonshot_app\",\"wendotdev\",\"heaven\",\"sugar\",\"token_mill\",\"believe\",\"trends_fun\",\"jup_studio\",\"Moonshot\",\"boop\",\"ray_launchpad\",\"meteora_virtual_curve\"],\"signal_type\":[1],\"total_fee_min\":1}]}",
    "method": "POST"
}


const handleResponse = async (response: Response): Promise<Either<string, gmgm_api_response>> => {

    console.log(`response status :: ${response.status}`);
    if (!response.ok) {
        process.exit(1)
        return Left(`${response.statusText}`)
    } else {
        return Right((await response.json() as gmgm_api_response))
    }
}

type createConfig = (method: HttpMethod, headers: HeadersInit, body: string) => FetchConfig

const createFetchConfig: createConfig = (m, h, b) =>
    ({ method: m, headers: { ...h }, body: JSON.stringify(b) })



// Composable fetch wrapper
const fetchJson = (url: string) => (config: FetchConfig): Promise<Either<string, gmgm_api_response>> =>
    fetch(url, config).then(async response => await handleResponse(response));


const extractData = (response: gmgm_api_response): Array<TokenData> => response.data

const transformData = (tokens: Array<TokenData>): Array<TokenBasics> => {
    console.log(`coins collected length ::`, tokens.length)
    return tokens.map(item => ({ name: item.data.name, address: item.data.address }))
}

console.log('Starting Monitoring Stream ...');
const Monitor = createTokenMonitor({ maxHistorySize: 2, trackInitialSnapshot: false })

const runMonitoring = async () => {
    const Telegram_config = parseConfig()

    let results = pipe(
        await fetchJson(url)
            (createFetchConfig('POST', config.headers, config.body)),
        (e => e._tag === 'Left' ? [] : extractData(e.right)),
        transformData
    )


    const report = Monitor.analyze(results)
    console.log('Changes detected:', report.newTokens);


}
setInterval(runMonitoring, 1000);
