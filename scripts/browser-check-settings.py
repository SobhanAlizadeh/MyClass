# Browser smoke test: login → دعوت‌ها tab → verify settings card renders → screenshot
import asyncio
from playwright.async_api import async_playwright

BASE = "https://classroom-ledger.sobhan2alizadeh.workers.dev"

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(BASE + "/admin", wait_until="networkidle")
        # login (if login form visible)
        if await page.locator("#login-username").count():
            await page.fill("#login-username", "sobh@n")
            await page.fill("#login-password", "A_15261526_a")
            await page.click("button[type=submit]")
            await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1500)

        # open referrals panel
        await page.get_by_role("button", name="دعوت‌ها").first.click()
        await page.wait_for_timeout(1500)

        ok_settings = await page.get_by_text("تنظیمات امتیاز دعوت").count()
        ok_switch = await page.get_by_text("اگر عضو دعوت‌شده کانال را ترک کند").count()
        ok_badge = await page.get_by_text("دعوت موفق").count()
        print(f"settings card: {ok_settings>0} | leave-penalty toggle: {ok_switch>0} | stats badge: {ok_badge>0}")
        print(f"console errors: {len(errors)}")
        for e in errors[:5]:
            print("  ERR:", e[:200])
        await page.screenshot(path="/home/z/my-project/download/referrals-settings-panel.png", full_page=False)
        await browser.close()
        print("PASS" if ok_settings and ok_switch and not errors else "CHECK")

asyncio.run(main())
