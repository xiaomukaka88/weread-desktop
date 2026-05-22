const { Builder, Browser } = require("selenium-webdriver");
const ChromeOptions = require("selenium-webdriver/chrome").Options;

async function test() {
  console.log("[1/3] Building Chrome driver with setChromeOptions...");
  const options = new ChromeOptions();
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-gpu");
  options.addArguments("--user-data-dir=C:\\Users\\i\\Desktop\\微信读书\\.weread\\test-profile");

  const builder = new Builder().forBrowser(Browser.CHROME);
  builder.setChromeOptions(options);

  const driver = await builder.build();
  console.log("[2/3] Chrome started OK");

  await driver.get("https://weread.qq.com/");
  console.log("[3/3] Navigated to weread.qq.com - QR should be visible");
  console.log("SUCCESS: setChromeOptions works!");

  await driver.sleep(3000);
  await driver.quit();
  console.log("Test complete.");
}

test().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
