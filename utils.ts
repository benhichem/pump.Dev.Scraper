import { type Either, left, right } from 'fp-ts/Either';

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