#!/usr/bin/env python3
"""Visual parity check: hero board (StaticBoard) vs the real game board.

Renders both boards at mobile / tablet / desktop widths, normalises them to the
same resolution and reports the share of differing pixels. Fails if any
viewport drifts beyond THRESHOLD_PCT.

Usage:  python3 scripts/board-parity-snapshot.py [base-url]
"""

import asyncio
import json
import sys

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = "/tmp/board-parity"
SIZES = [(390, 844), (820, 1180), (1280, 900)]
THRESHOLD_PCT = 1.5

# Coordinates are a gameplay affordance the hero art omits on purpose.
SETTINGS = {"showCoordinates": False, "animations": False, "soundEnabled": False}


def diff_pct(a: str, b: str) -> float:
    ia = Image.open(a).convert("RGB").resize((512, 512), Image.LANCZOS)
    ib = Image.open(b).convert("RGB").resize((512, 512), Image.LANCZOS)
    px = list(ImageChops.difference(ia, ib).getdata())
    bad = sum(1 for p in px if max(p) > 24)
    return round(100 * bad / len(px), 3)


async def main() -> int:
    import os

    os.makedirs(OUT, exist_ok=True)
    report: dict[str, float] = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for w, h in SIZES:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            await ctx.add_init_script(
                f"localStorage.setItem('nexus-chess.settings.v1', {json.dumps(json.dumps(SETTINGS))})"
            )
            page = await ctx.new_page()

            hero = f"{OUT}/hero-{w}.png"
            real = f"{OUT}/real-{w}.png"

            await page.goto(f"{BASE}/", wait_until="domcontentloaded")
            el = page.locator("[data-static-board] .grid").first
            await el.wait_for(state="visible", timeout=30000)
            await page.wait_for_timeout(1200)
            await el.screenshot(path=hero)

            await page.goto(f"{BASE}/analysis", wait_until="domcontentloaded")
            el = page.locator("[data-board-root]").first
            await el.wait_for(state="visible", timeout=30000)
            await page.wait_for_timeout(1500)
            await el.screenshot(path=real)

            report[f"{w}px"] = diff_pct(hero, real)
            await ctx.close()
        await browser.close()

    print(json.dumps(report, indent=2))
    failed = {k: v for k, v in report.items() if v > THRESHOLD_PCT}
    if failed:
        print(f"FAIL: board drift above {THRESHOLD_PCT}% at {failed}")
        return 1
    print(f"PASS: hero board matches the real board within {THRESHOLD_PCT}% everywhere")
    return 0


raise SystemExit(asyncio.run(main()))
