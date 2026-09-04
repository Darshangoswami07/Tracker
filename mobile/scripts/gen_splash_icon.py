"""Generate assets/splash-icon.png — the native splash mark.

Draws the DeliveryHub brand tile: a white rounded-square badge with a thin
purple border holding the purple cargo-truck glyph. Pixel-for-pixel the same
mark as the in-app `<Logo>` tile (src/components/Logo.tsx +
src/components/AnimatedTruck.tsx), so the native splash and the animated
in-app splash that follows it show an identical logo — no swap, no flicker.

    python scripts/gen_splash_icon.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

# Brand palette — copied verbatim from AnimatedTruck.tsx / theme primary.
BOX = (99, 91, 255, 255)        # #635BFF
BOX_MID = (115, 102, 247, 255)  # #7366F7
CABIN = (74, 63, 216, 255)      # #4A3FD8
WINDOW = (220, 213, 255, 255)   # #DCD5FF
WHEEL = (59, 52, 184, 255)      # #3B34B8
HUB = (106, 92, 255, 255)       # #6A5CFF
SPEED = (138, 124, 255, 255)    # #8A7CFF
PRIMARY = (99, 91, 255, 255)

S = 1024                        # master canvas (Expo downscales to imageWidth)
BADGE_MARGIN = int(S * 0.06)    # transparent breathing room around the tile
BADGE = S - 2 * BADGE_MARGIN
BADGE_RADIUS = int(BADGE * 0.25)
BORDER = max(2, int(BADGE * 0.022))


def _rounded(draw: ImageDraw.ImageDraw, box, radius, **kw) -> None:
    draw.rounded_rectangle(box, radius=radius, **kw)


def _alpha(color, a: float):
    return (color[0], color[1], color[2], int(255 * a))


def draw_truck(canvas: Image.Image, ox: int, oy: int, size: int) -> None:
    """TruckGlyph (viewBox 0 0 100 100) scaled to `size`, top-left at (ox,oy)."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    k = size / 100.0

    def R(x, y, w, h, r, fill):
        _rounded(d, [x * k, y * k, (x + w) * k, (y + h) * k], radius=r * k, fill=fill)

    def C(cx, cy, rad, fill):
        d.ellipse([(cx - rad) * k, (cy - rad) * k, (cx + rad) * k, (cy + rad) * k], fill=fill)

    # ground shadow
    d.ellipse([(52 - 40) * k, (84 - 5) * k, (52 + 40) * k, (84 + 5) * k], fill=_alpha(BOX, 0.14))
    # speed lines
    R(4, 40, 18, 5, 2.5, _alpha(SPEED, 0.50))
    R(2, 54, 14, 5, 2.5, _alpha(SPEED, 0.42))
    R(5, 68, 11, 4.5, 2.25, _alpha(SPEED, 0.34))
    # cargo box
    R(16, 30, 44, 42, 6, BOX)
    R(22, 35, 32, 6, 3, _alpha((255, 255, 255), 0.30))
    R(22, 48, 32, 17, 4, _alpha(BOX_MID, 0.50))
    R(42, 35, 2.5, 31, 1.25, _alpha((255, 255, 255), 0.28))
    # cabin
    R(62, 34, 26, 38, 8, CABIN)
    R(67, 39, 16, 16, 4, WINDOW)
    # wheels
    C(36, 74, 11, WHEEL); C(36, 74, 5, HUB)
    C(72, 74, 11, WHEEL); C(72, 74, 5, HUB)

    canvas.alpha_composite(layer, (ox, oy))


def main() -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    x0, y0 = BADGE_MARGIN, BADGE_MARGIN
    x1, y1 = x0 + BADGE, y0 + BADGE
    # white tile + purple border (matches Logo.tsx: bg #FFFFFF, borderColor primary)
    _rounded(d, [x0, y0, x1, y1], radius=BADGE_RADIUS, fill=(255, 255, 255, 255),
             outline=PRIMARY, width=BORDER)

    inner = int(BADGE * 0.66)
    off = x0 + (BADGE - inner) // 2
    # optical-centre nudge (the glyph is bottom-heavy with wheels)
    draw_truck(img, off, off - int(inner * 0.02), inner)

    out = os.path.join(os.path.dirname(__file__), "..", "assets", "splash-icon.png")
    img.save(os.path.abspath(out), "PNG")
    print("wrote", os.path.abspath(out), img.size)


if __name__ == "__main__":
    main()
