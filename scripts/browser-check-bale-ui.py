# Browser check — Task 38: کارت «اتصال بات مدرسه (تلگرام / بله)» در تنظیمات پروداکشن
# فقط خواندن + تعویض انتخاب پیام‌رسان در UI (بدون ذخیره) — هیچ تغییری در پیکربندی واقعی نمی‌دهد.
import asyncio
import os
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://school.jsdevelop.ir")

results = []
def ok(name, cond, detail=""):
    results.append(bool(cond))
    print(f"{'✅' if cond else '❌'} {name}{(' — ' + detail) if detail else ''}")

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(BASE + "/admin", wait_until="networkidle")
        await page.fill("#login-school", "HS1404")
        await page.fill("#login-username", "manager")
        await page.fill("#login-password", "Modir$1404")
        await page.click("button[type=submit]")
        await page.wait_for_timeout(3500)
        await page.get_by_role("button", name="تنظیمات").first.click()
        await page.wait_for_timeout(2500)

        ok("کارت «اتصال بات مدرسه (تلگرام / بله)» رندر شد", await page.get_by_text("اتصال بات مدرسه (تلگرام / بله)").count() > 0)
        ok("انتخابگر پیام‌رسان هست", await page.locator("#set-tg-messenger").count() > 0)
        ok("جعبه سبز «بات متصل است»", await page.get_by_text("بات متصل است").count() > 0)
        ok("راهنمای تلگرام پیش‌فرض است", await page.get_by_text("راهنمای اتصال تلگرام (۴ قدم)").count() > 0)
        ok("توکن ذخیره‌شده نمایش داده می‌شود", await page.get_by_text("توکن: …").count() > 0)

        # تعویض به بله — فقط UI (بدون ذخیره)
        await page.locator("#set-tg-messenger").click()
        await page.wait_for_timeout(500)
        await page.get_by_role("option", name="بله").click()
        await page.wait_for_timeout(500)
        ok("راهنمای بله بعد از انتخاب", await page.get_by_text("راهنمای اتصال بله (۴ قدم)").count() > 0)
        ok("لیبل توکن مخصوص بله", await page.get_by_text("توکن بات (از BotFather داخل بله)").count() > 0)
        ok("نکته محدودیت امتیاز دعوت در بله", await page.get_by_text("امتیاز دعوت کانال").count() > 0)

        # برگرداندن به تلگرام (حالت اولیه)
        await page.locator("#set-tg-messenger").click()
        await page.wait_for_timeout(400)
        await page.get_by_role("option", name="تلگرام").click()
        await page.wait_for_timeout(400)
        ok("بازگشت به راهنمای تلگرام", await page.get_by_text("راهنمای اتصال تلگرام (۴ قدم)").count() > 0)

        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(1200)
        body_overflow = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2")
        ok("موبایل ۳۹۰px بدون سرریز افقی", not body_overflow)
        await browser.close()

    console_errors = [e for e in errors if "favicon" not in e.lower()]
    ok("بدون خطای کنسول", len(console_errors) == 0, "; ".join(console_errors[:3]))

    n_pass = sum(results)
    print(f"\n{n_pass} پاس / {len(results) - n_pass} شکست")
    raise SystemExit(0 if n_pass == len(results) else 1)

asyncio.run(main())
