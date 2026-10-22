# Browser smoke test on PRODUCTION (school.jsdevelop.ir) — provisioned throwaway school.
# Creates a test school via superadmin API, drives the UI, deletes the school at the end (zero residue).
import asyncio
import json
import os
import urllib.request

BASE = os.environ.get("BASE", "https://school.jsdevelop.ir")
TRPC = BASE + "/api/trpc"
SUPER = {"username": "sobh@n", "password": "A_15261526_a"}


def trpc(name, input_json, token=None, is_query=False):
    headers = {"content-type": "application/json", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36", "accept": "*/*"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    if is_query:
        qs = f"?batch=1&input={urllib.parse.quote(json.dumps({'0': {'json': input_json}}))}" if input_json else "?batch=1"
        req = urllib.request.Request(f"{TRPC}/{name}{qs}", headers=headers)
    else:
        req = urllib.request.Request(f"{TRPC}/{name}?batch=1", data=json.dumps({"0": {"json": input_json}}).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req) as r:
        part = json.loads(r.read())
        part = part[0] if isinstance(part, list) else part
        if part.get("error"):
            raise RuntimeError(part["error"].get("json", {}).get("message", "trpc error"))
        return part.get("result", {}).get("data", {}).get("json")


import urllib.parse  # noqa: E402  (used inside trpc)

async def main():
    stamp = str(abs(hash(str(os.times()))))[-6:]
    sup = trpc("auth.superLogin", SUPER)
    sup_token = sup["token"]
    username = f"ui{stamp.lower()}"
    school = trpc("superadmin.createSchool", {"name": f"آزمون UI {stamp}", "months": 1, "adminUsername": username, "adminPassword": "UiCheck!123"}, sup_token)
    code = school["code"]
    print(f"provisioned school: {code}")

    errors = []
    from playwright.async_api import async_playwright
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            await page.goto(BASE + "/admin", wait_until="networkidle")
            await page.fill("#login-school", code)
            await page.fill("#login-username", username)
            await page.fill("#login-password", "UiCheck!123")
            await page.click("button[type=submit]")
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2500)

            # ۱) خالی: هر ۹ تب باید بلافاصله رندر شوند (سناریوی مدرسه تازه‌ساخت)
            tabs_ok = 0
            for tab in ["نمای کلی", "ثبت", "امتیاز", "نمرات", "گزارش", "برنامه", "مدیریت"]:
                c = await page.get_by_role("button", name=tab).count()
                tabs_ok += 1 if c else 0
            print(f"nav tabs visible: {tabs_ok}/7")
            await page.get_by_role("button", name="نمرات").first.click()
            await page.wait_for_timeout(1800)
            ok_grades = await page.get_by_text("امتحان و نمرات").count()
            print(f"grades panel on fresh school: {ok_grades > 0}")
            await page.screenshot(path="/home/z/my-project/download/phase3-prod-grades.png", full_page=False)

            # ۲) تقویم: زیرتب ماهانه + ماه شمسی جاری
            await page.get_by_role("button", name="برنامه").first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_role("button", name="تقویم ماهانه").first.click()
            await page.wait_for_timeout(1800)
            ok_cal = await page.get_by_text("تقویم ماهانه").count()
            print(f"calendar on fresh school: {ok_cal > 0}")
            await page.screenshot(path="/home/z/my-project/download/phase3-prod-calendar.png", full_page=False)

            # ۳) سال تحصیلی: پیکر شمسی
            await page.get_by_role("button", name="مدیریت").first.click()
            await page.wait_for_timeout(1000)
            await page.get_by_role("button", name="سال تحصیلی").first.click()
            await page.wait_for_timeout(1500)
            greg = await page.locator("input[placeholder='2026-09-01']").count()
            pickers = await page.locator("button", has_text="انتخاب تاریخ").count()
            print(f"academic jalali: raw-gregorian={greg} (۰) pickers={pickers} (≥۲)")
            await page.screenshot(path="/home/z/my-project/download/phase3-prod-academic.png", full_page=False)

            print(f"console errors: {len(errors)}")
            for e in errors[:5]:
                print("  ERR:", e[:200])
            await browser.close()
            ok = tabs_ok == 7 and ok_grades and ok_cal and greg == 0 and pickers >= 2 and not errors
            print("PASS" if ok else "CHECK")
    finally:
        try:
            trpc("superadmin.deleteSchool", {"id": school["id"]}, sup_token)
            lst = trpc("superadmin.schools", None, sup_token, True)
            print("cleanup done, leftover:", len([s for s in lst if s["name"].startswith("آزمون UI")]))
        except Exception as e:
            print("cleanup failed:", e)

asyncio.run(main())
