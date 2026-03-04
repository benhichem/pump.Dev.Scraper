import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

async function Login() {
    console.log([
        '',
        '  PUMP SCRAPER — Login Mode',
        '',
        '  A browser window will open. Sign in to your gmgn.ai account.',
        '  Close the browser window when you are done.',
        '',
    ].join('\n'));

    const browser = await puppeteer.launch({ headless: false, userDataDir: 'profile' });
    await browser.newPage().then(page => page.goto('https://gmgn.ai/'));

    await new Promise<void>(resolve => browser.on('disconnected', resolve));

    console.log([
        '',
        '  ✔  Session saved. You can now run Monitor or Database mode.',
        '',
    ].join('\n'));
}

if (import.meta.main) Login();
