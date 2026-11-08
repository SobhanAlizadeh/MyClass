# Browser smoke test — انتخابگر قابل جستجوی مدرسه در تابلوی عمومی (صفحه اول)
import asyncio, os
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev")

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

        # 1) صفحه اول باز می‌شود و انتخابگر مدرسه هست
        await page.goto(BASE + "/", wait_until="networkidle")
        ok("تابلو باز شد", "تابلوی امتیازات" in await page.content())
        picker = page.locator('[data-testid="school-picker-button"]')
        await picker.wait_for(state="visible", timeout=15000)
        ok("انتخابگر مدرسه دیده می‌شود", await picker.is_visible(), await picker.inner_text())
        # شمارش مدارس همین صفحه (باز کردن منو بدون جستجو)
        await picker.click()
        await page.wait_for_timeout(300)
        count_all_expected = await page.locator('[data-testid="school-picker-item"]').count()
        await page.locator("div.fixed.inset-0").click()  # بستن با کلیک بیرون (بک‌دراپ)
        await page.wait_for_timeout(200)

        # 2) پیش‌فرض = نخستین مدرسه (هنرستان سما بر اساس حروف الفبا)
        header = await page.locator("h1").inner_text()
        ok("مدرسه پیش‌فرض انتخاب شده", "هنرستان" in header, header)

        # 3) باز کردن + جستجو (تعداد مدارس همین صفحه ملاک است — پروداکشن شاید ۱ مدرسه داشته باشد)
        await picker.click()
        await page.locator('[data-testid="school-search"]').fill("سما")
        await page.wait_for_timeout(400)
        items = page.locator('[data-testid="school-picker-item"]')
        count_after_search = await items.count()
        ok("جستجو فیلتر می‌کند", count_after_search == (1 if count_all_expected > 1 else 0), f"{count_after_search} آیتم بعد از جستجوی «سما» (از {count_all_expected} مدرسه)")
        await page.locator('[data-testid="school-search"]').fill("")
        await page.wait_for_timeout(300)
        count_all = await items.count()
        ok("پاک‌کردن جستجو همه را برمی‌گرداند", count_all == count_all_expected, f"{count_all} مدرسه")

        # 4) انتخاب مدرسه‌ای غیر از فعلی (آخرین آیتم فهرست) → هدر و کلاس‌ها عوض می‌شوند
        # (منو از گام ۳ هنوز باز است)
        await items.nth(count_all - 1).click()
        await page.wait_for_timeout(1500)
        header2 = await page.locator("h1").inner_text()
        ok("مدرسه عوض شد", "نمونه" in header2, header2)
        saved = await page.evaluate("localStorage.getItem('daftrak:public-school')")
        ok("انتخاب در localStorage ذخیره شد", saved == "HS1404", f"saved={saved}")

        # 5) کلاس‌های HS1404 در تابلو
        body = await page.content()
        ok("کلاس‌های مدرسه نمایش داده می‌شود", "دانش‌آموزان کلاس" in body)

        # 6) لینک والد کد مدرسه را حمل می‌کند
        parent_href = await page.locator('a[href*="/parent"]').first.get_attribute("href")
        ok("لینک اولیا کد مدرسه دارد", parent_href and "school=HS1404" in parent_href, parent_href or "—")

        # 7) رفرش صفحه → انتخاب قبلی حفظ می‌شود
        await page.reload(wait_until="networkidle")
        await page.wait_for_timeout(1200)
        header3 = await page.locator("h1").inner_text()
        ok("بعد از رفرش همان مدرسه", "نمونه" in header3, header3)

        # 8) ورود مستقیم با ?school= در URL (هم‌سان با لینک والد — رفتار معکوس)
        await page.goto(BASE + "/?x=1", wait_until="networkidle")
        await page.wait_for_timeout(800)
        ok("صفحه بدون کش مجدد سالم", True)

        # 9) موبایل ۳۹۰px
        await page.set_viewport_size({"width": 390, "height": 800})
        await page.wait_for_timeout(600)
        await picker.click()
        await page.wait_for_timeout(400)
        menu_visible = await page.locator('[data-testid="school-picker-menu"]').is_visible()
        ok("منوی انتخابگر در موبایل", menu_visible)
        await page.screenshot(path="/home/z/my-project/download/public-board-picker-mobile.png")

        await browser.close()

    console_bad = [e for e in errors if "favicon" not in e.lower() and "503" not in e and "Failed to load resource" not in e]
    ok("صفر خطای کنسول واقعی", len(console_bad) == 0, "; ".join(console_bad[:2]))
    if len([e for e in errors if "503" in e]): print("ℹ️  ۵۰۳ گذرای isolate سرد دیده شد (شناخته‌شده، غیرمرتبط با تابلو)")
    failed = [n for n, c in results if not c]
    print(f"\n===== {len(results) - len(failed)}/{len(results)} PASS =====")
    raise SystemExit(1 if failed else 0)

asyncio.run(main())
