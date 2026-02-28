import { Bot } from "grammy";
import type { TokenBasics } from "./types";
import type { tryCatch } from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";
import { Extension } from "typescript";

const BotToken = '8247782994:AAFD2jUlvUD0Lw4IOh13ruzlOJZTJ5WJa9c'
const telegram_channel_id = "-1003526344807"


type telegramConfig = {
    BotToken: string;
    channelId: string
}
type Result<T, E> =
    | { success: true; value: T }
    | { success: false; error: E };

type SendMessageError =
    | { type: 'BotInitError'; message: string }
    | { type: 'SendError'; message: string; tokenAddress: string }
    | { type: 'EmptyMessages'; message: string };


/**
 * Format a single token message
 */
const formatTokenMessage = (token: TokenBasics[]): string[] => token.map(item =>
    `🆕 New Token Detected!\n\n` +
    `📛 Name: ${item.name}\n` +
    `📍 Address: <code>${item.address}</code>\n` +
    `\n`)


type SendResult = {
    sent: number;
    failed: number;
    errors: SendMessageError[];
};

const createInitialResult = (): SendResult => ({
    sent: 0,
    failed: 0,
    errors: []
});

const addSuccess = (result: SendResult): SendResult => ({
    ...result,
    sent: result.sent + 1
});

const addFailure = (result: SendResult, error: SendMessageError): SendResult => ({
    ...result,
    failed: result.failed + 1,
    errors: [...result.errors, error]
});

const validateMessages = (tokens: TokenBasics[]): Result<TokenBasics[], SendMessageError> =>
    tokens.length === 0 ? { success: false, error: { type: 'EmptyMessages', message: 'No messages to send' } } : { success: true, value: tokens }



const createBot = async (botToken: string): Promise<Result<Bot, SendMessageError>> => {
    try {
        const bot = new Bot(botToken);
        return { success: true, value: bot };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'BotInitError',
                message: `Failed to initialize bot:${String(error)}`
            }
        }
    }
}



const sendSingleMessage = async (
    bot: Bot,
    channelId: string,
    message: string,
    token: TokenBasics
): Promise<Result<void, SendMessageError>> => {
    try {
        await bot.api.sendMessage(channelId, message, {
            parse_mode: "HTML"
        });
        return { success: true, value: undefined };
    } catch (error) {
        return {
            success: false,
            error: {
                type: 'SendError',
                message: String(error),
                tokenAddress: token.address
            }
        };
    }
};


const sendAllMessages = async (
    bot: Bot,
    channelId: string,
    tokens: TokenBasics[],
    messages: string[]
): Promise<SendResult> => {
    // Use reduce to accumulate results functionally
    const results = await tokens.reduce(
        async (accPromise, token, index) => {
            const acc = await accPromise;
            const message = messages[index];

            if (!message) return acc;

            const result = await sendSingleMessage(bot, channelId, message, token);

            return result.success
                ? addSuccess(acc)
                : addFailure(acc, result.error);
        },
        Promise.resolve(createInitialResult())
    );

    return results;
};

export const sendMessageToChannel = async (
    config: telegramConfig,
    tokens: TokenBasics[]
)/* : Promise<Result<SendResult, SendMessageError>> */ => {
    // 1. Validate messages
    const validation = validateMessages(tokens);
    if (!validation.success) {
        return validation;
    }

    // 2. Format messages (pure)
    const messages = formatTokenMessage(validation.value);

    // 3. Create bot (effectful)
    const botResult = await createBot(config.BotToken);
    if (!botResult.success) {
        return botResult;
    }

    // 4. Send all messages (effectful)
    const sendResult = await sendAllMessages(
        botResult.value,
        config.channelId,
        validation.value,
        messages
    );

    return { success: true, value: sendResult };
};


/* 
await sendMessageToChannel({ BotToken: BotToken, channelId: telegram_channel_id }, [{
    "name": "The Samurai Baby",
    "address": "8peDodxEYYqT5kEKdd72wsJZVcXNTkwNpw5fTkHYpump"
},
{
    "name": "i am ai",
    "address": "PRvbP56QUPSfZmNiXaXHXQq7kXdx76pywHbq7d7pump"
}]) */