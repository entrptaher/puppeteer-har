Allows you to capture all of the requests in a HAR format so you can convert it to WARC or view in HAR viewer tool. Original version has some issues with initial request, so I have modified this.

```ts
const puppeteer = require("puppeteer");
const PuppeteerHar = require("@entrptaher/puppeteer-har");

const capture = async (url, filePathBase) => {
	const browser = await puppeteer.launch({
		userDataDir: "/tmp/" + filePathBase,
		args: ["--window-size=3840,2160"],
		defaultViewport: { width: 3840, height: 2160, deviceScaleFactor: 2 },
	});
	const page = await browser.newPage();

	const har = new PuppeteerHar(page);
	await har.start({ path: filePathBase + ".har", saveResponse: true });

	console.log("Loading start");
	await page.goto(url, {
		waitUntil: "domcontentloaded",
		timeout: 120000,
	});

	console.log("Loading done");
	await har.stop();
	await browser.close();
};

(async () => {
	await capture("https://crawlbase.com", "crawlbase1");
	await capture(
		"https://crawlbase.com/crawling-api-avoid-captchas-blocks",
		"crawlbase2",
	);
})();
```