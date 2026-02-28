import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import type { DevMonitoredTokens } from "./types";


async function CollectWalletsInfo(data: Array<DevMonitoredTokens>) {
    puppeteer.use(StealthPlugin());

    try {
        const browser = await puppeteer.launch({ headless: false, userDataDir: "profile" });
        const page = await browser.newPage();
        await page.setViewport({ height: 900, width: 1600 });



    } catch (error) {
        console.log(error);
    } finally {

    }
}

CollectWalletsInfo([]);