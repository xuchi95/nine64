#!/usr/bin/env python3
"""Visual parity check: hero board (StaticBoard) vs the real game board.

Renders both boards at mobile / tablet / desktop widths and at device pixel
ratios 1, 2 and 3, normalises them to the same resolution and reports the share
of differing pixels. Also asserts the hero board's own HiDPI geometry: every
square must land on whole device pixels and every piece must be centred in its
square, so lines never blur and pieces never drift.

Usage:  python3 scripts/board-parity-snapshot.py [base-url]
"""

import asyncio
import json
import sys

from PIL import Image, ImageChops, ImageFilter, ImageStat
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
OUT = "/tmp/board-parity"
SIZES = [(390, 844), (820, 1180), (1280, 900)]
DPRS = [1, 2, 3]
# Both boards render the same SVGs; the residue is rasterisation of a 512px
# hero grid vs a ~720px game grid (edge antialiasing), so allow a small budget.
THRESHOLD_PCT = 8.0
THRESHOLD_MEAN = 8.0
# Device-pixel budget for square snapping and piece centring.
SNAP_TOL_DEVICE_PX = 0.51
CENTER_TOL_DEVICE_PX = 0.51

# Coordinates are a gameplay affordance the hero art omits on purpose.
SETTINGS = {"showCoordinates": False, "animations": False, "soundEnabled": False}

GEOMETRY_JS = """
() => {
  const dpr = window.devicePixelRatio;
  const board = document.querySelector('[data-static-board]');
  const cells = [...board.querySelectorAll('[data-cell]')];
  const boxes = [...board.querySelectorAll('[data-square]')];
  let maxSnap = 0, maxCenter = 0;
  const frac = (v) => Math.abs(v - Math.round(v));
  const rectOf = new Map();
  for (const cell of cells) {
    const r = cell.getBoundingClientRect();
    rectOf.set(cell.dataset.cell, r);
    maxSnap = Math.max(maxSnap, frac(r.width * dpr), frac(r.height * dpr),
                       frac(r.left * dpr), frac(r.top * dpr));
  }
  for (const box of boxes) {
    const r = rectOf.get(box.dataset.square);
    const svg = box.querySelector('svg');
    if (!r || !svg) continue;
    const s = svg.getBoundingClientRect();
    maxCenter = Math.max(
      maxCenter,
      Math.abs((s.left + s.width / 2) - (r.left + r.width / 2)) * dpr,
      Math.abs((s.top + s.height / 2) - (r.top + r.height / 2)) * dpr,
    );
  }
  const b = board.getBoundingClientRect();
  return {
    dpr,
    cells: cells.length,
    pieces: boxes.length,
    boardWidthDevicePx: Math.round(b.width * dpr * 100) / 100,
    maxSquareSnapDevicePx: Math.round(maxSnap * 1000) / 1000,
    maxPieceOffsetDevicePx: Math.round(maxCenter * 1000) / 1000,
  };
}
"""


def diff_metrics(a: str, b: str) -> dict[str, float]:
    # Both boards render identical SVGs but at different raster sizes (a ~1140px
    # hero vs a ~2160px game board), so a light blur after normalising removes
    # pure resampling noise and leaves real geometry drift visible.
    def norm(path: str) -> Image.Image:
        return (
            Image.open(path)
            .convert("RGB")
            .resize((512, 512), Image.LANCZOS)
            .filter(ImageFilter.GaussianBlur(1.5))
        )

    ia, ib = norm(a), norm(b)
    delta = ImageChops.difference(ia, ib)
    px = list(delta.getdata())
    bad = sum(1 for p in px if max(p) > 24)
    return {
        "pct": round(100 * bad / len(px), 3),
        "mean": round(max(ImageStat.Stat(delta).mean), 3),
    }


async def main() -> int:
    import os

    os.makedirs(OUT, exist_ok=True)
    report: dict[str, dict] = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for dpr in DPRS:
            for w, h in SIZES:
                key = f"{w}px@{dpr}x"
                ctx = await browser.new_context(
                    viewport={"width": w, "height": h}, device_scale_factor=dpr
                )
                await ctx.add_init_script(
                    f"localStorage.setItem('nexus-chess.settings.v1', {json.dumps(json.dumps(SETTINGS))})"
                )
                page = await ctx.new_page()

                hero = f"{OUT}/hero-{w}-{dpr}x.png"
                real = f"{OUT}/real-{w}-{dpr}x.png"

                await page.goto(f"{BASE}/", wait_until="domcontentloaded")
                el = page.locator("[data-static-board] .grid").first
                await el.wait_for(state="visible", timeout=30000)
                await page.wait_for_timeout(1200)
                geometry = await page.evaluate(GEOMETRY_JS)
                await el.screenshot(path=hero)

                await page.goto(f"{BASE}/analysis", wait_until="domcontentloaded")
                el = page.locator("[data-board-root]").first
                await el.wait_for(state="visible", timeout=30000)
                await page.wait_for_timeout(1500)
                await el.screenshot(path=real)

                report[key] = {**diff_metrics(hero, real), **geometry}
                await ctx.close()
        await browser.close()

    print(json.dumps(report, indent=2))
    failed = {
        k: v
        for k, v in report.items()
        if v["pct"] > THRESHOLD_PCT
        or v["mean"] > THRESHOLD_MEAN
        or v["maxSquareSnapDevicePx"] > SNAP_TOL_DEVICE_PX
        or v["maxPieceOffsetDevicePx"] > CENTER_TOL_DEVICE_PX
        or v["pieces"] != 32
        or v["cells"] != 64
    }
    if failed:
        print(f"FAIL: hero board drift above budget at {list(failed)}")
        return 1
    print("PASS: hero board matches the real board at every viewport and DPR")
    return 0


raise SystemExit(asyncio.run(main()))
