# Browser smoke test — فاز ۳ + شمسی‌سازی سال تحصیلی
# HS1404 demo school on the PREVIEW worker. Mostly read-only (creates one event, deletes it back).
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
        await page.wait_for_timeout(2500)

        # 1) تب «نمرات» — ساخت امتحان نمی‌کنیم؛ فقط رندر پنل + فرم امتحان جدید
        ok_nav = await page.get_by_role("button", name="نمرات").count()
        print(f"nav tab نمرات: {ok_nav > 0}")
        await page.get_by_role("button", name="نمرات").first.click()
        await page.wait_for_timeout(2000)
        ok_title = await page.get_by_text("امتحان و نمرات").count()
        ok_new = await page.get_by_text("امتحان جدید").count()
        ok_avg_card = await page.get_by_text("میانگین دروس کلاس").count()
        ok_convert = await page.get_by_text("تبدیل امتیاز به نمره").count()
        print(f"grades panel: title={ok_title>0} new-exam-form={ok_new>0} avg-table={ok_avg_card>0} converter={ok_convert>0}")
        await page.screenshot(path="/home/z/my-project/download/phase3-grades.png", full_page=False)

        # 2) انتخابگر شمسی در فرم امتحان: دکمه پیکر باید تاریخ شمسی نشان دهد
        date_btn = page.locator("button", has_text="انتخاب تاریخ")
        print(f"datepicker placeholder count: {await date_btn.count()}")

        # 3) برنامه → زیرتب تقویم ماهانه (شمسی)
        await page.get_by_role("button", name="برنامه").first.click()
        await page.wait_for_timeout(1200)
        await page.get_by_role("button", name="تقویم ماهانه").first.click()
        await page.wait_for_timeout(2000)
        ok_cal_title = await page.get_by_text("تقویم ماهانه").count()
        ok_month = await page.get_by_text("فروردین").count() > 0 or await page.get_by_text("مهر").count() > 0 or await page.get_by_text("آبان").count() > 0 or await page.get_by_text("آذر").count() > 0 or await page.get_by_text("دی").count() > 0 or await page.get_by_text("بهمن").count() > 0 or await page.get_by_text("اسفند").count() > 0 or await page.get_by_text("اردیبهشت").count() > 0 or await page.get_by_text("خرداد").count() > 0 or await page.get_by_text("تیر").count() > 0 or await page.get_by_text("مرداد").count() > 0 or await page.get_by_text("شهریور").count() > 0
        ok_days = await page.get_by_text("جمعه").count() > 0
        ok_new_event = await page.get_by_role("button", name="رویداد جدید").count()
        print(f"calendar: title={ok_cal_title>0} jalali-month={ok_month} friday-col={ok_days} new-event-btn={ok_new_event>0}")
        await page.screenshot(path="/home/z/my-project/download/phase3-calendar.png", full_page=False)

        # 4) ساخت و حذف یک رویداد تقویمی (خودپاک‌ساز)
        await page.get_by_role("button", name="رویداد جدید").first.click()
        await page.wait_for_timeout(700)
        await page.get_by_placeholder("مثلاً امتحان ریاضی فصل ۳").fill("رویداد آزمون مرورگر")
        await page.get_by_role("button", name="ثبت رویداد").first.click()
        ok_created = False
        try:
            await page.get_by_text("رویداد آزمون مرورگر").first.wait_for(state="visible", timeout=8000)
            ok_created = True
        except Exception:
            pass
        print(f"event created visible on grid: {ok_created}")
        deleted = False
        if ok_created:
            # حذف همان رویداد از دیالوگ ویرایش (خودپاک‌ساز)
            await page.get_by_text("رویداد آزمون مرورگر").first.click()
            await page.wait_for_timeout(700)
            page.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
            try:
                # دکمه حذف = دکمه با کلاس text-red-600 داخل دیالوگ
                btns = page.locator("div.fixed button")
                n = await btns.count()
                for i in range(n):
                    b = btns.nth(i)
                    cls = (await b.get_attribute("class")) or ""
                    if "text-red-600" in cls:
                        await b.click()
                        deleted = True
                        break
            except Exception:
                pass
            await page.wait_for_timeout(1500)
        print(f"event deleted back (zero residue): {deleted}")
        print(f"console errors so far: {len(errors)}")

        # 5) مدیریت ← سال تحصیلی: پیکر شمسی جای ورودی میلادی
        await page.get_by_role("button", name="مدیریت").first.click()
        await page.wait_for_timeout(1200)
        await page.get_by_role("button", name="سال تحصیلی").first.click()
        await page.wait_for_timeout(1500)
        gregorian_inputs = await page.locator("input[placeholder='2026-09-01']").count()
        ok_jalali_btns = await page.locator("button", has_text="انتخاب تاریخ").count()
        print(f"academic: raw-gregorian-inputs={gregorian_inputs} (باید ۰ باشد) jalali-pickers={ok_jalali_btns} (باید ≥۲)")
        await page.screenshot(path="/home/z/my-project/download/phase3-academic-jalali.png", full_page=False)

        # 6) موبایل ۳۹۰px — تب نمرات و ناوبری
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(800)
        ok_nav_mobile = await page.get_by_role("button", name="نمرات").first.is_visible()
        await page.get_by_role("button", name="نمرات").first.click()
        await page.wait_for_timeout(1500)
        ok_grades_mobile = await page.get_by_text("امتحان و نمرات").count()
        print(f"mobile: nav-نمرات={ok_nav_mobile} grades-visible={ok_grades_mobile>0}")
        await page.screenshot(path="/home/z/my-project/download/phase3-mobile.png", full_page=False)

        print(f"console errors: {len(errors)}")
        for e in errors[:6]:
            print("  ERR:", e[:220])
        await browser.close()
        ok = ok_nav and ok_title and ok_new and ok_avg_card and ok_convert and ok_cal_title and ok_month and ok_days and gregorian_inputs == 0 and ok_jalali_btns >= 2 and ok_nav_mobile and ok_created and deleted and not errors
        print("PASS" if ok else "CHECK")

asyncio.run(main())
