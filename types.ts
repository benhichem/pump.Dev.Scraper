import type { HeadersInit } from "bun"

export type Either<E, A> = Left<E> | Right<A>

export interface Left<E> {
    _tag: 'Left',
    left: E
}
export interface Right<A> {
    _tag: 'Right',
    right: A
}

export const Left = <E, A>(e: E): Either<E, A> => ({
    _tag: 'Left',
    left: e
})

export const IsLeft = <E, A>(e: Either<E, A>) => e._tag === 'Left'


export const Right = <E, A>(e: A): Either<E, A> => ({
    _tag: 'Right',
    right: e
})
export type TokenData = {
    "signal_type": number,
    "ath": number,
    "market_cap": number,
    "trigger_at": number,
    "trigger_mc": number,
    "signal_times": number,
    "signal_times_by_type": {
        "1": number,
        "7": number,
        "10": number
    },
    data: {
        chain: string;
        address: string;
        pool_address: string;
        quote_address: string;
        logo: string;
        symbol: string;
        name: string;
        trans_symbol: string;
        trans_name: string;
        trans_symbol_zhcn: string;
        trans_name_zhcn: string;
        launchpad: string;
        launchpad_platform: string;
        creation_tool: string;
        exchange: string;
        creator_token_status: string;
        dev_token_burn_amount: number;
        dev_token_burn_ratio: number;
        progress: number;
        total_supply: number;
        usd_market_cap: number;
        market_cap: number;
        swaps_1h: number;
        volume_1h: number;
        buys_1h: number;
        sells_1h: number;
        net_buy_1h: number;
        swaps_1m: number;
        buys_1m: number;
        sells_1m: number;
        net_buy_1m: number;
        volume_1m: number;
        swaps_6h: number;
        volume_6h: number;
        buys_6h: number;
        sells_6h: number;
        net_buy_6h: number;
        swaps_24h: number;
        volume_24h: number;
        buys_24h: number;
        sells_24h: number;
        net_buy_24h: number;
        top_10_holder_rate: number;
        creator_balance_rate: number;
        rat_trader_amount_rate: number;
        bundler_trader_amount_rate: number;
        bundler_mhr: number;
        renowned_count: number;
        bot_degen_rate: number;
        start_live_timestamp: number;
        end_live_timestamp: number;
        sniper_count: number;
        bot_degen_count: number;
        holder_count: number;
        liquidity: number;
        creator: string;
        creator_created_open_count: number;
        creator_created_open_ratio: number;
        creator_created_count: number;
        fund_from: string;
        fund_from_ts: number;
        rug_ratio: number;
        created_timestamp: number;
        created_timestamp_us: number;
        open_timestamp: number;
        open_timestamp_us: number;
        buy_tips: number;
        total_fee: number;
        priority_fee: number;
        tip_fee: number;
        fee_params: null | any;
        new_wallet_volume: number;
        entrapment_ratio: number;
        is_wash_trading: boolean;
        renounced_mint: boolean;
        renounced_freeze_account: boolean;
        burn_status: string;
        is_honeypot: string;
        open_source: string;
        owner_renounced: string;
        dev_team_hold_rate: number;
        suspected_insider_hold_rate: number;
        is_token_live: boolean;
        top70_sniper_hold_rate: number;
        private_vault_hold_rate: number;
        has_at_least_one_social: boolean;
        twitter_is_tweet: boolean;
        twitter: string;
        website: string;
        telegram: string;
        instagram: string;
        tiktok: string;
        fracaster: null | string;
        zora_social_info: null | any;
        dexscr_ad: boolean;
        dexscr_update_link: boolean;
        dexscr_trending_bar: boolean;
        dexscr_boost_fee: number;
        cto_flag: boolean;
        offchain: boolean;
        twitter_rename_count: number;
        twitter_del_post_token_count: number;
        twitter_create_token_count: number;
        twitter_handle: string;
        tc_name: string;
        tcid: string;
        image_dup: number;
        status: number;
        tg_call_count: number;
        fresh_wallet_rate: number;
        trade_fee: number;
        twitter_dup: number;
        telegram_dup: number;
        website_dup: number;
        complete_timestamp: number;
        complete_cost_time: number;
    }

};



export interface gmgm_api_response {
    code: number,
    reason: string,
    message: string
    data: Array<TokenData>
}

export interface TokenBasics {
    name: string;
    address: string
}


export interface DevMonitoredTokens extends TokenBasics {
    creator: string;
    creator_time: number;
    chain: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface FetchConfig extends RequestInit {
    method: HttpMethod;
    headers: HeadersInit;
    body: string;
}