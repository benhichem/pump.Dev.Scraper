import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'form' | 'menu';
type Mode  = 'monitor' | 'monitor_gmgn' | 'database' | 'login';
type Field = { key: string; value: string };

type BorderStyleValue = 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic' | 'arrow';

const FIELD_DESCRIPTIONS: Record<string, string> = {
    minAthMc:         'Minimum all-time-high market cap required',
    minPassRate:      'Minimum % of dev tokens that must pass the filter',
    minTokens:        'Minimum number of tokens deployed by the dev wallet',
    maxTokenAgeMins:  'Maximum token age in minutes to consider',
    maxTokens:        'Max qualifying tokens — wallets above this are saved to DB only, not CSV',
};

const MENU_OPTIONS: { label: string; mode: Mode; description: string }[] = [
    { label: 'Monitor Soulscan',        mode: 'monitor',      description: 'Scrape dev wallets via Solscan feed'              },
    { label: 'Monitor GMGN Trenches',   mode: 'monitor_gmgn', description: 'Monitor new tokens via gmgn.ai WebSocket'         },
    { label: 'Look from Database',      mode: 'database',     description: 'Query previously saved token data'                },
    { label: 'Login to gmgn.ai',        mode: 'login',        description: 'Open browser to sign in and save your session'   },
];

// ─── Theme ───────────────────────────────────────────────────────────────────

const T = {
    brand:   'magentaBright',  // header border / logo accent
    accent:  'greenBright',    // live indicator, active field, confirm
    label:   'cyanBright',     // active field label, panel titles
    dim:     'gray',           // inactive fields, hints, subtitle
    value:   'white',          // input values
    warning: 'yellowBright',   // database mode
    border:  'cyan',           // default panel border
} as const;

const W = 52;

// ─── Reusable components ──────────────────────────────────────────────────────

function Header() {
    return (
        <Box
            borderStyle="double"
            borderColor={T.brand}
            paddingX={2}
            width={W}
            flexDirection="column"
        >
            <Box>
                <Text color={T.accent} bold>◈  </Text>
                <Text color="white" bold>PUMP </Text>
                <Text color={T.accent} bold>SCRAPER</Text>
                <Box flexGrow={1} />
                <Text color={T.dim}>v1.0</Text>
            </Box>
            <Text color={T.dim}>   Solana Dev Wallet Monitor</Text>
        </Box>
    );
}

function Panel({ title, icon, children, borderStyle = 'round', borderColor = T.border, width = W }: {
    title?: string;
    icon?: string;
    children: React.ReactNode;
    borderStyle?: BorderStyleValue;
    borderColor?: string;
    width?: number;
}) {
    return (
        <Box
            borderStyle={borderStyle}
            borderColor={borderColor}
            flexDirection="column"
            paddingX={2}
            width={width}
        >
            {title && (
                <Box gap={1} marginTop={1} marginBottom={1}>
                    {icon && <Text color={T.label}>{icon}</Text>}
                    <Text color={T.label} bold>{title}</Text>
                </Box>
            )}
            {children}
        </Box>
    );
}

function HintBar({ children }: { children: React.ReactNode }) {
    return (
        <Box paddingX={2} gap={1}>
            <Text color={T.dim}>╌</Text>
            {children}
            <Text color={T.dim}>╌</Text>
        </Box>
    );
}

function FieldRow({ field, active, description, onChange }: {
    field: Field;
    active: boolean;
    description?: string;
    onChange: (val: string) => void;
}) {
    if (active) {
        return (
            <Box flexDirection="column">
                <Box borderStyle="round" borderColor={T.accent} paddingX={1} width={W - 8}>
                    <Box width={18}>
                        <Text color={T.label} bold>{field.key}</Text>
                    </Box>
                    <TextInput value={field.value} onChange={onChange} focus />
                </Box>
                {description && (
                    <Text color={T.dim}>  {description}</Text>
                )}
            </Box>
        );
    }
    return (
        <Box paddingX={1}>
            <Box width={18}>
                <Text color={T.dim}>{field.key}</Text>
            </Box>
            <Text color={T.dim}>{field.value}</Text>
        </Box>
    );
}

function MenuItem({ label, description, selected }: { label: string; description: string; selected: boolean }) {
    if (selected) {
        return (
            <Box flexDirection="column">
                <Box borderStyle="round" borderColor={T.accent} paddingX={1} width={W - 8}>
                    <Text color={T.accent} bold>◆  {label}</Text>
                </Box>
                <Text color={T.dim}>  {description}</Text>
            </Box>
        );
    }
    return (
        <Box flexDirection="column">
            <Box paddingX={2}>
                <Text color={T.dim}>◇  {label}</Text>
            </Box>
            <Text color={T.dim}>     {description}</Text>
        </Box>
    );
}

// ─── App ─────────────────────────────────────────────────────────────────────

function App({ onLaunch }: { onLaunch: (mode: Mode) => void }) {
    const { exit }                  = useApp();
    const [phase, setPhase]         = useState<Phase>('form');
    const [fields, setFields]       = useState<Field[]>([]);
    const [activeField, setActive]  = useState(0);
    const [menuIndex, setMenuIndex] = useState(0);

    useEffect(() => {
        Bun.file('./filter.json').json().then((config: Record<string, unknown>) => {
            setFields(
                Object.entries(config).map(([key, val]) => ({
                    key,
                    value: val != null ? String(val) : '',
                }))
            );
        });
    }, []);

    const saveConfig = async () => {
        const config: Record<string, number | null> = {};
        for (const { key, value } of fields) {
            const n = parseFloat(value);
            config[key] = isNaN(n) ? null : n;
        }
        await Bun.write('./filter.json', JSON.stringify(config, null, 4));
    };

    useInput((_input, key) => {
        if (phase === 'form') {
            if (key.tab) {
                setActive(prev =>
                    key.shift
                        ? Math.max(0, prev - 1)
                        : (prev + 1) % fields.length
                );
            }
            if (key.return) {
                if (activeField < fields.length - 1) {
                    setActive(prev => prev + 1);
                } else {
                    saveConfig().then(() => setPhase('menu'));
                }
            }
        }

        if (phase === 'menu') {
            if (key.escape)    setPhase('form');
            if (key.upArrow   || (key.tab && key.shift)) setMenuIndex(prev => Math.max(0, prev - 1));
            if (key.downArrow || (key.tab && !key.shift)) setMenuIndex(prev => (prev + 1) % MENU_OPTIONS.length);
            if (key.return) {
                const selected = MENU_OPTIONS[menuIndex]!.mode;
                onLaunch(selected);
                exit();
            }
        }
    });

    if (fields.length === 0) {
        return (
            <Box flexDirection="column" gap={1}>
                <Header />
                <Text color={T.dim}> Loading filter config...</Text>
            </Box>
        );
    }

    // ── Form ────────────────────────────────────────────────────────────────
    if (phase === 'form') {
        return (
            <Box flexDirection="column" gap={1}>
                <Header />
                <Panel title="Filter Configuration" icon="⚙">
                    <Box flexDirection="column" marginBottom={1}>
                        {fields.map((field, i) => (
                            <FieldRow
                                key={field.key}
                                field={field}
                                active={i === activeField}
                                description={FIELD_DESCRIPTIONS[field.key]}
                                onChange={val =>
                                    setFields(prev =>
                                        prev.map((f, fi) =>
                                            fi === i ? { ...f, value: val } : f
                                        )
                                    )
                                }
                            />
                        ))}
                    </Box>
                </Panel>
                <HintBar>
                    <Text color={T.label}>⇥ Tab</Text>
                    <Text color={T.dim}> · </Text>
                    <Text color={T.label}>⇧Tab</Text>
                    <Text color={T.dim}> navigate · </Text>
                    <Text color={T.label}>↵ Enter</Text>
                    <Text color={T.dim}> on last field</Text>
                </HintBar>
            </Box>
        );
    }

    // ── Menu ────────────────────────────────────────────────────────────────
    if (phase === 'menu') {
        return (
            <Box flexDirection="column" gap={1}>
                <Header />
                <Panel title="Select Mode" icon="◈">
                    <Box flexDirection="column" gap={1} marginBottom={1}>
                        {MENU_OPTIONS.map(({ label, description }, i) => (
                            <MenuItem
                                key={label}
                                label={label}
                                description={description}
                                selected={i === menuIndex}
                            />
                        ))}
                    </Box>
                </Panel>
                <HintBar>
                    <Text color={T.label}>↑ ↓</Text>
                    <Text color={T.dim}> · </Text>
                    <Text color={T.label}>⇥ Tab</Text>
                    <Text color={T.dim}> navigate · </Text>
                    <Text color={T.label}>↵ Enter</Text>
                    <Text color={T.dim}> to launch · </Text>
                    <Text color={T.label}>Esc</Text>
                    <Text color={T.dim}> back</Text>
                </HintBar>
            </Box>
        );
    }

    return null;
}

let pendingMode: Mode | null = null;
const { waitUntilExit } = render(
    <App onLaunch={(mode) => { pendingMode = mode; }} />
);
await waitUntilExit();

if (pendingMode) {
    const scripts: Record<Mode, string> = {
        monitor:      'src/soulScrape.ts',
        monitor_gmgn: 'src/monitor_script.ts',
        database:     'src/db_script.ts',
        login:        'src/login_script.ts',
    };
    const proc = Bun.spawn(['bun', scripts[pendingMode]], {
        stdio: ['inherit', 'inherit', 'inherit'],
    });
    process.exitCode = await proc.exited;
}
