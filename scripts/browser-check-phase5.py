# Browser smoke test — فاز ۵: کارت پیام‌رسانی تلگرام در تب تنظیمات (سوییچ‌ها + پیام همگانی + شمارش متصل‌ها)
# Uses the throwaway school created by scripts/p5-browser-school.mjs (cleanup afterwards).
import asyncio
import json
import os
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev")
CREDS = json.load(open(os.environ.get("CREDS", "/tmp/p5-creds.json")))

async def main():
    errors = []
    results = []
    def ok(name, cond, detail=""):
        results.append((name, bool(cond)))
        print(f"{'✅' if cond else '❌'} {name}{(' — ' + detail) if detail else ''}")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        # dialogهای confirm باید همیشه accept شوند (قبل از هر کلیکی که confirm می‌دهد)
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))

        # ورود مدیر
        await page.goto(BASE + "/admin", wait_until="networkidle")
        await page.fill("#login-school", CREDS["schoolCode"])
        await page.fill("#login-username", CREDS["username"])
        await page.fill("#login-password", CREDS["password"])
        await page.click("button[type=submit]")
        await page.wait_for_timeout(3000)

        # تب تنظیمات
        await page.get_by_role("button", name="تنظیمات").first.click()
        await page.wait_for_timeout(2500)

        # کارت پیام‌رسانی
        ok("messaging: کارت پیام‌رسانی رندر شد", await page.get_by_text("پیام‌رسانی تلگرام").count() > 0)
        ok("messaging: سوییچ امتحان جدید", await page.locator("#notif-exam").count() > 0)
        ok("messaging: سوییچ نمره", await page.locator("#notif-score").count() > 0)
        ok("messaging: سوییچ غیبت", await page.locator("#notif-att").count() > 0)
        ok("messaging: سوییچ امتیاز", await page.locator("#notif-points").count() > 0)
        ok("messaging: بج شمارش متصل — ۱ از ۳", await page.get_by_text("1 از 3 متصل").count() > 0 or await page.get_by_text("۱ از ۳ متصل").count() > 0)
        ok("messaging: جمع کل متصل", await page.get_by_text("جمع: 1 متصل").count() > 0 or await page.get_by_text("جمع: ۱ متصل").count() > 0)
        await page.screenshot(path="/home/z/my-project/download/phase5-messaging-card.png", full_page=True)

        # تغییر سوییچ امتحان → دکمه فعال → ذخیره → توست
        await page.locator("#notif-exam").click()
        await page.wait_for_timeout(400)
        save_btn = page.get_by_role("button", name="ذخیره تنظیم اعلان‌ها")
        ok("messaging: دکمه ذخیره بعد از تغییر فعال شد", await save_btn.count() > 0)
        await save_btn.click()
        await page.wait_for_timeout(2500)
        ok("messaging: توست ذخیره", await page.get_by_text("تنظیم اعلان‌ها ذخیره شد").count() > 0)
        # برگرداندن سوییچ (حالت اولیه)
        await page.locator("#notif-exam").click()
        await page.wait_for_timeout(300)
        await page.get_by_role("button", name="ذخیره تنظیم اعلان‌ها").click()
        await page.wait_for_timeout(2000)

        # پیام همگانی بدون بات → هشدار وصل نبودن (confirm خودکار accept می‌شود)
        await page.locator("#bc-text").fill("تست پیام همگانی مرورگر")
        await page.get_by_role("button", name="ارسال پیام").click()
        await page.wait_for_timeout(1200)
        await page.wait_for_timeout(2500)
        ok("messaging: هشدار بات وصل نیست", await page.get_by_text("بات تلگرام هنوز وصل نیست").count() > 0)

        # موبایل ۳۹۰px
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(1200)
        await page.screenshot(path="/home/z/my-project/download/phase5-messaging-mobile.png", full_page=True)
        body_overflow = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
        ok("messaging: موبایل بدون سرریز افقی", not body_overflow)

        await browser.close()

    console_errors = [e for e in errors if "favicon" not in e.lower()]
    ok("بدون خطای کنسول", len(console_errors) == 0, "; ".join(console_errors[:3]))

    failed = [n for n, c in results if not c]
    print(f"\n═══ نتیجه مرورگر فاز ۵: {len(results) - len(failed)} پاس / {len(failed)} شکست ═══")
    if failed:
        print("شکست‌ها:", " | ".join(failed))
    exit(1 if failed else 0)

asyncio.run(main())
