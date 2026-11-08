# Browser smoke test — پورتال دانش‌آموز/والد (Task 37): تب‌ها، برنامه هفتگی، تکالیف، نمرات
# Usage: python3 scripts/browser-check-portal.py [BASE_URL] [SCHOOL_CODE] [ACCESS_CODE]
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev"
SCHOOL = sys.argv[2] if len(sys.argv) > 2 else "HS1404"
CODE = sys.argv[3] if len(sys.argv) > 3 else "2JRGZJMHCV"

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

        # 1) کد غلط → پیام «پیدا نشد»
        await page.goto(f"{BASE}/parent?school={SCHOOL}&code=WRONGCODE1", wait_until="networkidle")
        await page.locator('[data-testid="pr-notfound"]').wait_for(state="visible", timeout=15000)
        ok("کد غلط پیام خطا می‌دهد", "پیدا نشد" in await page.locator('[data-testid="pr-notfound"]').inner_text())

        # 2) ورود با لینک مستقیم (school + code) → هویت + تب‌ها
        await page.goto(f"{BASE}/parent?school={SCHOOL}&code={CODE}", wait_until="networkidle")
        await page.locator('[data-testid="portal-tabs"]').wait_for(state="visible", timeout=15000)
        content = await page.content()
        ok("پورتال باز شد (کارنامه پیش‌فرض)", "کارنامه" in content and ("نمرات درس‌ها" in content or "هنوز نمره‌ای" in content))
        ok("نام دانش‌آموز نشان داده شد", "رضایی" in content or "احمدی" in content, "")
        ok("بج نوع ورود (کد والد)", "ورود با کد والد" in content or "ورود با کد دانش‌آموزی" in content)

        # 3) تب برنامه هفتگی — جدول روز×زنگ
        await page.locator('[data-testid="tab-schedule"]').click()
        await page.wait_for_timeout(500)
        slots = await page.locator('[data-testid^="slot-"]').count()
        filled = 0
        for i in range(await page.locator('[data-testid^="slot-"]').count()):
            t = (await page.locator('[data-testid^="slot-"]').nth(i).inner_text()).strip()
            if t and t != "—": filled += 1
        ok("برنامه هفتگی رندر شد", slots >= 24 and filled > 0, f"{slots} خانه، {filled} پر")
        sched_txt = await page.locator('[data-testid="panel-schedule"]').inner_text()
        ok("نام درس در جدول هست", "ریاضی" in sched_txt or "دینی" in sched_txt or "فیزیک" in sched_txt)
        ok("روزها شنبه تا پنجشنبه", all(d in sched_txt for d in ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه"]))

        # 4) تب تکالیف و جلسات
        await page.locator('[data-testid="tab-events"]').click()
        await page.wait_for_timeout(500)
        ev_txt = await page.locator('[data-testid="panel-events"]').inner_text()
        ok("تکلیف/جلسه دیده می‌شود", ("تکلیف" in ev_txt or "جلسه" in ev_txt or "فعالیت" in ev_txt or "ثبت نشده" in ev_txt), ev_txt[:80].replace("\n", " "))
        ok("بخش امتحان‌های پیش‌رو هست", "امتحان‌های پیش‌رو" in ev_txt)

        # 5) تب نمرات اخیر
        await page.locator('[data-testid="tab-grades"]').click()
        await page.wait_for_timeout(400)
        gr_txt = await page.locator('[data-testid="panel-grades"]').inner_text()
        ok("نمرات اخیر رندر شد", ("آخرین نمره" in gr_txt) and ("ثبت نشده" in gr_txt or "از ۲۰" in gr_txt or "از 20" in gr_txt), gr_txt[:60].replace("\n", " "))

        # 6) برگشت به کارنامه → چاپ + جدول نمرات
        await page.locator('[data-testid="tab-card"]').click()
        await page.wait_for_timeout(400)
        ok("دکمه چاپ کارنامه هست", await page.locator('[data-testid="pr-print"]').is_visible())
        ok("جدول نمرات کارنامه هست", await page.locator('[data-testid="pr-subjects"]').count() == 1)

        # 7) مسیر /student همان پورتال است
        await page.goto(f"{BASE}/student?school={SCHOOL}&code={CODE}", wait_until="networkidle")
        await page.locator('[data-testid="portal-tabs"]').wait_for(state="visible", timeout=15000)
        ok("مسیر /student هم پورتال را باز می‌کند", True)

        # 8) موبایل — بدون سرریز افقی
        await page.set_viewport_size({"width": 390, "height": 800})
        await page.wait_for_timeout(400)
        overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        ok("موبایل بدون سرریز افقی", overflow <= 2, f"overflow={overflow}px")
        await page.screenshot(path="/home/z/my-project/download/portal-mobile.png", full_page=False)

        # اسکرین‌شات دسکتاپ از تب برنامه هفتگی
        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.locator('[data-testid="tab-schedule"]').click()
        await page.wait_for_timeout(400)
        await page.screenshot(path="/home/z/my-project/download/portal-schedule-desktop.png", full_page=False)

        await browser.close()

    fails = [n for n, c in results if not c]
    real_errors = [e for e in errors if "favicon" not in e.lower() and "404" not in e]
    print(f"\n== {len(results) - len(fails)}/{len(results)} چک سبز ==")
    if real_errors: print("⚠️ خطاهای کنسول:", real_errors[:3])
    if fails: print("❌ شکست‌ها:", fails); sys.exit(1)
    if real_errors: sys.exit(1)
    print("PORTAL BROWSER CHECK: PASS")

asyncio.run(main())
