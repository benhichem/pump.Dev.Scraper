import { type Either, left, right } from 'fp-ts/Either';
import Papa from 'papaparse';
import { appendFile } from 'fs/promises';

type Config = {
    botToken: string;
    channelId: string;
};

type ConfigError = string;

export const parseConfig = (): Either<ConfigError, Config> => {
    const botToken = process.env.BOT_TOKEN;
    const channelId = process.env.CHANNEL_ID;

    if (!botToken) return left('BOT_TOKEN is required');
    if (!channelId) return left('CHANNEL_ID is required');

    return right({ botToken, channelId });
};

export const appendToCsv = async <T extends Record<string, unknown>>(
    filePath: string,
    data: T
): Promise<Either<string, void>> => {
    try {
        const fileExists = await Bun.file(filePath).exists();

        if (!fileExists) {
            await Bun.write(filePath, Papa.unparse([data]));
        } else {
            const row = Papa.unparse([data], { header: false });
            await appendFile(filePath, '\n' + row, 'utf8');
        }

        return right(undefined);
    } catch (error) {
        return left(`Failed to write CSV at "${filePath}": ${String(error)}`);
    }
};

export const readCsvCreators = async (filePath: string): Promise<Set<string>> => {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Set();
    const text = await file.text();
    const { data } = Papa.parse<Record<string, string>>(text, { header: true });
    return new Set(data.map(row => row['creator']).filter(Boolean) as string[]);
};