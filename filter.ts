export type FilterConfig = {
    minAthMc?: number | null;        // Minimum ATH market cap in USD
    minPassRate?: number | null;     // Minimum fraction of tokens that must pass minAthMc (e.g. 0.8 = 80%)
    maxTokenAgeMins?: number | null; // Reserved for future use
};

export async function loadFilterConfig(): Promise<FilterConfig> {
    return Bun.file('./filter.json').json();
}

export function applyFilter<T extends { token_ath_mc?: unknown }>(
    tokens: T[], config: FilterConfig
): T[] {
    if (tokens.length === 0) return [];

    const passing = config.minAthMc != null
        ? tokens.filter(token => parseFloat(token.token_ath_mc as string) >= config.minAthMc!)
        : tokens;

    if (config.minPassRate != null) {
        return passing.length / tokens.length >= config.minPassRate ? tokens : [];
    }

    return passing;
}
