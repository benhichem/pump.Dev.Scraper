# Pump Scraper

Pump Scraper is a Node.js-based project designed to monitor token launches on the Solana blockchain and send notifications to a Telegram channel. It uses functional programming principles with the `fp-ts` library to ensure composability, error handling, and maintainability.

## Features

- **Token Monitoring**: Tracks new token launches and detects changes in token data.
- **Telegram Notifications**: Sends formatted messages to a specified Telegram channel using the `grammy` library.
- **Functional Programming**: Implements functional programming patterns with `fp-ts` for better error handling and composability.
- **Configurable**: Easily configurable via environment variables.

## Prerequisites

- **Node.js**: Ensure you have `bun` as the runtime.
- **Telegram Bot**: Create a Telegram bot and obtain the bot token.
- **Environment Variables**:
  - `BOT_TOKEN`: Your Telegram bot token.
  - `CHANNEL_ID`: The ID of the Telegram channel where messages will be sent.

## Installation

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add the following:
   ```env
   BOT_TOKEN=your-telegram-bot-token
   CHANNEL_ID=your-telegram-channel-id
   ```

## Usage

1. Start the monitoring script:

   ```bash
   bun start
   ```

2. The script will:
   - Fetch token data from the specified API.
   - Analyze the data for new tokens.
   - Send notifications to the configured Telegram channel.

## Project Structure

- `index.ts`: Entry point for the application. Handles the main monitoring logic.
- `telegram.ts`: Contains functions for interacting with the Telegram API.
- `utils.ts`: Utility functions, including configuration parsing.
- `types.ts`: Type definitions for the project.
- `monitor.ts`: Token monitoring logic.

## Example Output

When a new token is detected, the bot sends a message to the Telegram channel in the following format:

```
🆕 New Token Detected!

📛 Name: The Samurai Baby
📍 Address: 8peDodxEYYqT5kEKdd72wsJZVcXNTkwNpw5fTkHYpump
```

Happy monitoring!
