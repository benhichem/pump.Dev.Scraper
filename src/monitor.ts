import { pipe } from "fp-ts/lib/function";
import * as A from 'fp-ts/Array';
import type { TokenBasics } from "./types";
import { getStateM } from "fp-ts/lib/StateT";

/* type TokenSnapshot = {
    address: string;
    name: string;
};
 */
type DiffReport = {
    newTokens: TokenBasics[];  // Tokens in new snapshot but not in old
    totalOld: number;
    totalNew: number;
    newCount: number;
};

type MonitorState = {
    previousSnapshot: readonly TokenBasics[];
    history: readonly DiffReport[];
    lastUpdate: number;
    totalScans: number;
};

// ============================================================================
// Monitor Interface (Return Type)
// ============================================================================

type TokenMonitor = {
    /**
     * Analyze new snapshot and return new tokens
     * Side effect: Updates internal state
     */
    analyze: (newSnapshot: TokenBasics[]) => DiffReport;

    /**
     * Get current state (immutable copy)
     */
    getState: () => MonitorState;

    /**
     * Get only the previous snapshot
     */
    getPreviousSnapshot: () => readonly TokenBasics[];

    /**
     * Get full history of reports
     */
    getHistory: () => readonly DiffReport[];

    /**
     * Get the latest report
     */
    getLatestReport: () => DiffReport | null;

    /**
     * Get history length
     */
    getHistoryLength: () => number;

    /**
     * Reset all state
     */
    reset: () => void;

    /**
     * Get summary statistics
     */
    getStats: () => {
        totalScans: number;
        lastUpdate: number;
        currentTokenCount: number;
        totalNewTokensFound: number;
    };
};

type MonitorOptions = {
    /**
     * Maximum number of reports to keep in history
     * @default undefined (unlimited)
     */
    maxHistorySize?: number;

    /**
     * Whether to track initial snapshot as new tokens
     * @default false
     */
    trackInitialSnapshot?: boolean;
};


const createTokenMonitor = (M?: MonitorOptions): TokenMonitor => {
    // Internal mutable state (encapsulated)
    let previousSnapshot: TokenBasics[] = [];
    let history: DiffReport[] = [];
    let lastUpdate: number = 0;
    let totalScans: number = 0;

    // Default options
    const opts: Required<MonitorOptions> = {
        maxHistorySize: M?.maxHistorySize ?? Infinity,
        trackInitialSnapshot: M?.trackInitialSnapshot ?? false
    };

    // Helper Functions 
    const findNewTokens = (oldList: TokenBasics[], newList: TokenBasics[]) => {
        return newList.filter(item => !oldList.find(x => x.address === item.address))
    }
    // Helper: Create diff report
    const createDiffReport = (
        oldList: TokenBasics[],
        newList: TokenBasics[]
    ): DiffReport => {
        const newTokens = findNewTokens(oldList, newList);

        return {
            newTokens,
            totalOld: oldList.length,
            totalNew: newList.length,
            newCount: newTokens.length
        };
    };


    return {
        analyze: (S: TokenBasics[]): DiffReport => {
            totalScans++;
            lastUpdate = Date.now()

            if (previousSnapshot.length === 0) {
                const report: DiffReport = {
                    newTokens: opts.trackInitialSnapshot ? S : [],
                    totalOld: 0,
                    totalNew: S.length,
                    newCount: opts.trackInitialSnapshot ? S.length : 0
                };
                previousSnapshot = [...S];
                if (opts.trackInitialSnapshot) {
                    history = [report];
                }
                return report
            }
            // Create diff report (find new tokens)
            const report = createDiffReport(previousSnapshot, S);
            previousSnapshot = [...S];
            history = [...history, report]
            // Trim history if needed
            if (history.length > opts.maxHistorySize) {
                history = history.slice(-opts.maxHistorySize);
            }

            return report
        },

        getState: (): MonitorState => ({
            previousSnapshot: [...previousSnapshot],
            history: [...history],
            lastUpdate,
            totalScans
        }),
        getPreviousSnapshot: (): readonly TokenBasics[] => [...previousSnapshot],
        getHistory: (): readonly DiffReport[] => [...history],
        getLatestReport: (): DiffReport | null => history.length > 0 ? history[history.length - 1]! : null,
        getHistoryLength: (): number => history.length,
        reset: (): void => {
            previousSnapshot = [];
            history = [];
            lastUpdate = 0;
            totalScans = 0;
        },
        getStats: () => ({
            totalScans,
            lastUpdate,
            currentTokenCount: previousSnapshot.length,
            totalNewTokensFound: pipe(
                history,
                A.chain(report => report.newTokens),
                A.uniq({ equals: (a, b) => a.address === b.address })
            ).length
        })
    };


}

export type {
    DiffReport,
    MonitorState,
    TokenMonitor,
    MonitorOptions
};

export { createTokenMonitor };