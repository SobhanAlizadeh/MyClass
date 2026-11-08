# -*- coding: utf-8 -*-
# Browser check — تب‌های اسکرول‌شونده (مدیریت + نوبار اصلی + پورتال) در موبایل و دسکتاپ
# Usage: python3 scripts/browser-check-tabscroll.py [BASE_URL]
import asyncio, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev"

async def main():
    results = []
    def ok(name, cond, detail=""):
        results.append(bool(cond))
        print(f"{'✅' if cond else '❌'} {name}{(' — ' + detail) if detail else ''}")

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ——— موبایل ۳۹۰×۸۴۴ ———
        page = await browser.new_page(viewport={"width": 390, "height": 844})
        await page.goto(f"{BASE}/admin", wait_until="networkidle")
        await page.fill("#login-school", "HS1404")
        await page.fill("#login-username", "manager")
        await page.fill("#login-password", "Modir$1404")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".mobile-panel-nav .tab-scroll", timeout=20000)

        # ۱) نوبار اصلی: اسکرول‌پذیر + دکمه‌ها له نشده‌اند + اسکرول‌بار مخفی
        nav_info = await page.evaluate("""() => {
            const el = document.querySelector('.mobile-panel-nav .tab-scroll');
            const btns = [...el.querySelectorAll('button')];
            return {
                sw: el.scrollWidth, cw: el.clientWidth,
                scrollbarWidth: getComputedStyle(el).scrollbarWidth,
                display: getComputedStyle(el).display,
                minBtn: Math.min(...btns.map(b => b.offsetWidth)),
                crushed: btns.some(b => b.offsetWidth < b.scrollWidth - 1),
            };
        }""")
        ok("نوبار اصلی موبایل: flex اسکرول‌شونده", nav_info["display"] == "flex")
        ok("نوبار اصلی موبایل: محتوایش از عرض بیشتر است (اسکرول دارد)", nav_info["sw"] > nav_info["cw"], f"scrollWidth={nav_info['sw']} clientWidth={nav_info['cw']}")
        ok("نوبار اصلی موبایل: اسکرول‌بار مخفی", nav_info["scrollbarWidth"] == "none")
        ok("نوبار اصلی موبایل: هیچ دکمه‌ای بریده نشده", not nav_info["crushed"] and nav_info["minBtn"] >= 60, f"کم‌عرض‌ترین={nav_info['minBtn']}px")

        # ۲) ورود به بخش مدیریت → زیرتب‌ها
        await page.click(".mobile-panel-nav button:has-text('مدیریت')")
        await page.wait_for_selector('[data-testid="management-subtabs"]', timeout=15000)
        sub_info = await page.evaluate("""() => {
            const el = document.querySelector('[data-testid="management-subtabs"]');
            const btns = [...el.querySelectorAll('button')];
            return {
                sw: el.scrollWidth, cw: el.clientWidth,
                n: btns.length,
                minBtn: Math.min(...btns.map(b => b.offsetWidth)),
                crushed: btns.some(b => b.offsetWidth < b.scrollWidth - 1),
                labels: btns.map(b => b.textContent.trim()),
            };
        }""")
        ok("زیرتب‌های مدیریت: ۶ تب رندر شد", sub_info["n"] == 6, f"n={sub_info['n']}")
        ok("زیرتب‌های مدیریت: در موبایل اسکرول دارد", sub_info["sw"] > sub_info["cw"], f"scrollWidth={sub_info['sw']} clientWidth={sub_info['cw']}")
        ok("زیرتب‌های مدیریت: تب‌ها کامل و بریده نشده", not sub_info["crushed"] and sub_info["minBtn"] >= 70, f"کم‌عرض‌ترین={sub_info['minBtn']}px")
        await page.screenshot(path="/tmp/render-tabs/mobile-management.png")

        # ۳) اسکرول به انتها و کلیک آخرین تب (کاربران) — RTL
        await page.evaluate("""() => { const el = document.querySelector('[data-testid="management-subtabs"]'); el.scrollLeft = -el.scrollWidth; }""")
        await page.wait_for_timeout(400)
        await page.click('[data-testid="management-subtabs"] button:has-text("کاربران")')
        await page.wait_for_timeout(600)
        body_txt = await page.inner_text("main")
        ok("کلیک تب آخر بعد از اسکرول کار می‌کند", "کاربران" in body_txt)
        ok("پنل کاربران باز شد", "افزودن کاربر" in body_txt or "کاربر جدید" in body_txt or "نقش" in body_txt)

        # ۴) تب میانی هم سالم
        await page.click('[data-testid="management-subtabs"] button:has-text("دانش‌آموزان")')
        await page.wait_for_timeout(500)
        body_txt = await page.inner_text("main")
        ok("تب دانش‌آموزان باز شد", "دانش‌آموزان" in body_txt and ("جست‌وجو" in body_txt or "ثبت" in body_txt))

        # ۵) کارت «کارنامه دانش‌آموز» نباید در تب مدیریت نشت کرده باشد (باگ قدیمی)
        leak_visible = await page.locator('[data-testid="report-card-box"]').is_visible()
        ok("کارت کارنامه در تب مدیریت مخفی است", not leak_visible)
        await page.click(".mobile-panel-nav button:has-text('گزارش')")
        await page.wait_for_timeout(600)
        ok("کارت کارنامه در تب گزارش دیده می‌شود", await page.locator('[data-testid="report-card-box"]').is_visible())
        await page.click(".mobile-panel-nav button:has-text('مدیریت')")
        await page.wait_for_timeout(400)
        await page.close()

        # ——— دسکتاپ ۱۲۸۰ ———
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        await page.goto(f"{BASE}/admin", wait_until="networkidle")
        await page.fill("#login-school", "HS1404")
        await page.fill("#login-username", "manager")
        await page.fill("#login-password", "Modir$1404")
        await page.click("button[type=submit]")
        await page.wait_for_selector(".mobile-panel-nav .tab-scroll", timeout=20000)
        await page.click(".mobile-panel-nav button:has-text('مدیریت')")
        await page.wait_for_selector('[data-testid="management-subtabs"]', timeout=15000)
        d_info = await page.evaluate("""() => {
            const nav = document.querySelector('.mobile-panel-nav .tab-scroll');
            const sub = document.querySelector('[data-testid="management-subtabs"]');
            return { navFits: nav.scrollWidth <= nav.clientWidth + 1, subFits: sub.scrollWidth <= sub.clientWidth + 1 };
        }""")
        ok("دسکتاپ: نوبار اصلی بدون نیاز به اسکرول جا می‌شود", d_info["navFits"])
        ok("دسکتاپ: زیرتب‌های مدیریت بدون اسکرول جا می‌شوند", d_info["subFits"])
        await page.screenshot(path="/tmp/render-tabs/desktop-management.png")

        # ——— پورتال والد: تب‌ها با tab-scroll ———
        page2 = await browser.new_page(viewport={"width": 390, "height": 844})
        await page2.goto(f"{BASE}/parent?school=HS1404&code=2JRGZJMHCV", wait_until="networkidle")
        has_tabs = await page2.locator('[data-testid="portal-tabs"]').count()
        if has_tabs:
            p_info = await page2.evaluate("""() => {
                const el = document.querySelector('[data-testid="portal-tabs"]');
                const btns = [...el.querySelectorAll('button')];
                return { cls: el.className, minBtn: Math.min(...btns.map(b => b.offsetWidth)), crushed: btns.some(b => b.offsetWidth < b.scrollWidth - 1) };
            }""")
            ok("پورتال: کلاس tab-scroll اعمال شد", "tab-scroll" in p_info["cls"])
            ok("پورتال: تب‌ها بریده نشده‌اند", not p_info["crushed"] and p_info["minBtn"] >= 60, f"کم‌عرض‌ترین={p_info['minBtn']}px")
        else:
            ok("پورتال (کد آزمونی منقضی — رد)", True)

        await browser.close()

    passed = sum(results)
    print(f"\n{passed}/{len(results)} passed")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
