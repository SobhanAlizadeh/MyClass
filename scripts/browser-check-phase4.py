# Browser smoke test — فاز ۴: کارنامه + اولیا + وایت‌لیبل + اکسل (فقط UI، بدون چاپ واقعی)
# Uses the throwaway school created by scripts/p4-browser-school.mjs (cleanup afterwards).
import asyncio
import json
import os
import sys
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev")
CREDS = json.load(open(os.environ.get("CREDS", "/tmp/p4-creds.json")))

async def main():
    errors = []
    results = []
    def ok(name, cond):
        results.append((name, bool(cond)))
        print(f"{'✅' if cond else '❌'} {name}")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ۱) صفحه والد با لینک مستقیم
        await page.goto(f"{BASE}/parent?school={CREDS['schoolCode']}&code={CREDS['parentCode']}", wait_until="networkidle")
        await page.wait_for_timeout(2500)
        ok("parent: جدول نمرات رندر شد", await page.locator("[data-testid=pr-subjects]").count() > 0)
        ok("parent: دکمه چاپ کارنامه", await page.locator("[data-testid=pr-print]").count() > 0)
        ok("parent: لوگوی وایت‌لیبل در سربرگ", await page.locator("header img").count() > 0)
        ok("parent: نام مدرسه", await page.get_by_text("آزمون مرورگر فاز۴").count() > 0)
        await page.screenshot(path="/home/z/my-project/download/phase4-parent.png", full_page=True)

        # ۲) فرم والد: کد اشتباه → پیام پیدا نشد
        await page.goto(f"{BASE}/parent", wait_until="networkidle")
        await page.fill("[data-testid=pr-school]", CREDS["schoolCode"])
        await page.fill("[data-testid=pr-code]", "WRONGCODE1")
        await page.click("[data-testid=pr-submit]")
        await page.wait_for_timeout(2000)
        ok("parent: کد اشتباه → پیام «پیدا نشد»", await page.get_by_text("کارنامه‌ای با این کدها پیدا نشد").count() > 0)

        # ۳) ورود مدیر → سربرگ با لوگو
        await page.goto(BASE + "/admin", wait_until="networkidle")
        await page.fill("#login-school", CREDS["schoolCode"])
        await page.fill("#login-username", CREDS["username"])
        await page.fill("#login-password", CREDS["password"])
        await page.click("button[type=submit]")
        try:
            await page.wait_for_selector("[data-testid=header-logo]", timeout=15000)
        except Exception:
            pass
        await page.wait_for_timeout(1500)
        ok("admin: ورود موفق", await page.locator("[data-testid=header-logo]").count() > 0)
        ok("admin: لوگوی سفارشی در سربرگ (img)", await page.locator("[data-testid=header-logo] img").count() > 0)

        # ۴) تب گزارش → باکس کارنامه
        await page.get_by_role("button", name="گزارش").first.click()
        await page.wait_for_timeout(2000)
        ok("reports: باکس کارنامه دانش‌آموز", await page.locator("[data-testid=report-card-box]").count() > 0)
        ok("reports: دکمه چاپ کارنامه فعال", await page.locator("[data-testid=print-report-card]").count() > 0)
        print_btn_disabled = await page.locator("[data-testid=print-report-card]").is_disabled()
        ok("reports: چاپ کارنامه غیرفعال نیست (کارنامه لود شد)", not print_btn_disabled)
        await page.screenshot(path="/home/z/my-project/download/phase4-reportcard.png", full_page=False)

        # ۵) مدیریت ← دانش‌آموزان: پنل اولیا + کد والد + دکمه اکسل
        await page.get_by_role("button", name="مدیریت").first.click()
        await page.wait_for_timeout(1200)
        await page.get_by_role("button", name="دانش‌آموزان").first.click()
        await page.wait_for_timeout(1500)
        ok("mgmt: پنل اولیا رندر شد", await page.locator("[data-testid=parents-box]").count() > 0)
        ok("mgmt: بج کد والد نمایش داده می‌شود", await page.locator("[data-testid=parent-code-badge]").count() > 0)
        ok("mgmt: فیلد نام والد پر از داده", await page.input_value("[data-testid=parent-name]") == "والد آزمون")
        ok("mgmt: دکمه خروجی اکسل", await page.get_by_role("button", name="خروجی اکسل").count() > 0)
        await page.screenshot(path="/home/z/my-project/download/phase4-parents.png", full_page=False)

        # ۶) تنظیمات → کارت وایت‌لیبل
        await page.get_by_role("button", name="تنظیمات").first.click()
        await page.wait_for_timeout(1500)
        ok("settings: کارت هویت بصری", await page.locator("[data-testid=branding-card]").count() > 0)
        ok("settings: پیش‌نمایش لوگو (img)", await page.locator("[data-testid=branding-preview] img").count() > 0)
        color_val = await page.locator("[data-testid=branding-color]").input_value()
        ok(f"settings: رنگ ذخیره‌شده خوانده شد ({color_val})", color_val.lower() == "#7c3aed")
        await page.screenshot(path="/home/z/my-project/download/phase4-branding.png", full_page=False)

        # ۷) تابلوی عمومی (مدرسه پیش‌فرض نمایش داده می‌شود — لینک والد مهم است)
        await page.goto(BASE + "/", wait_until="networkidle")
        await page.wait_for_timeout(2000)
        ok("public: باکس لوگو/آیکون رندر شد", await page.locator("[data-testid=public-board-logo]").count() > 0)
        ok("public: لینک ورود اولیا", await page.get_by_text("ورود اولیا").count() > 0)

        await browser.close()

    real_errors = [e for e in errors if "favicon" not in e.lower() and "404" not in e]
    ok(f"کنسول بدون خطا ({len(real_errors)} خطا)", len(real_errors) == 0)
    if real_errors: print("\n".join(real_errors[:5]))

    failed = [n for n, c in results if not c]
    print(f"\n═══ مرورگر فاز ۴: {len(results) - len(failed)}/{len(results)} پاس ═══")
    sys.exit(1 if failed else 0)

asyncio.run(main())
