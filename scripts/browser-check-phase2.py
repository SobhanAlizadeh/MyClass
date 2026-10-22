# Browser smoke test — فاز ۲: تب «برنامه» (SchedulePanel) + زیرتب «سال تحصیلی» (AcademicPanel)
# Runs on the demo school HS1404 of the PREVIEW worker. Read-only UI checks + screenshots.
import asyncio
import os
from playwright.async_api import async_playwright

BASE = os.environ.get("BASE", "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev")

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        await page.goto(BASE + "/admin", wait_until="networkidle")
        if await page.locator("#login-school").count():
            await page.fill("#login-school", "HS1404")
            await page.fill("#login-username", "manager")
            await page.fill("#login-password", "Manager!123")
            await page.click("button[type=submit]")
            await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)

        ok_tabs = await page.get_by_role("button", name="برنامه").count()
        print(f"nav tab برنامه: {ok_tabs > 0}")

        # 1) schedule tab
        await page.get_by_role("button", name="برنامه").first.click()
        await page.wait_for_timeout(1800)
        ok_sched_title = await page.get_by_text("برنامه هفتگی").count()
        ok_days = await page.get_by_text("شنبه").count() > 0 and await page.get_by_text("پنجشنبه").count() > 0
        ok_hint = await page.get_by_text("زنگ پرشده").count()
        print(f"schedule panel: title={ok_sched_title>0} days={ok_days} filled-badge={ok_hint>0}")
        await page.screenshot(path="/home/z/my-project/download/phase2-schedule.png", full_page=False)

        # 2) management → سال تحصیلی subtab
        await page.get_by_role("button", name="مدیریت").first.click()
        await page.wait_for_timeout(1200)
        await page.get_by_role("button", name="سال تحصیلی").first.click()
        await page.wait_for_timeout(1800)
        ok_years_title = await page.get_by_text("سال‌های تحصیلی").count()
        ok_wizard = await page.get_by_text("ویزارد ارتقای پایه (پایان سال)").count()
        ok_create = await page.get_by_placeholder("۱۴۰۵-۱۴۰۶").count()
        print(f"academic panel: years={ok_years_title>0} wizard={ok_wizard>0} create-input={ok_create>0}")
        await page.screenshot(path="/home/z/my-project/download/phase2-academic.png", full_page=False)

        # 3) attendance tab: period selector
        await page.get_by_role("button", name="ثبت").first.click()
        await page.wait_for_timeout(1200)
        ok_period_hint = await page.get_by_text("حالت زنگی").count()
        print(f"attendance period hint: {ok_period_hint>0}")

        # 4) mobile 390px — all tabs visible, no clipping of the new tab
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(800)
        ok_nav_mobile = await page.get_by_role("button", name="برنامه").first.is_visible()
        print(f"mobile nav برنامه visible: {ok_nav_mobile}")
        await page.screenshot(path="/home/z/my-project/download/phase2-mobile.png", full_page=False)

        print(f"console errors: {len(errors)}")
        for e in errors[:6]:
            print("  ERR:", e[:220])
        await browser.close()
        ok = ok_tabs and ok_sched_title and ok_days and ok_years_title and ok_wizard and ok_period_hint and not errors
        print("PASS" if ok else "CHECK")

asyncio.run(main())
