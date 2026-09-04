"""Generate the launcher / app-icon asset set from the DeliveryHub truck brand.

Same artwork as `assets/splash-icon.png` (and the in-app `<Logo>`): a purple
cargo-truck on a white rounded-square background with a purple border. This
script wires that identity into every platform icon slot:

  assets/icon.png                     1024  opaque   iOS + web + fallback
  assets/android-icon-foreground.png  1024  alpha    Android adaptive foreground
  assets/android-icon-monochrome.png  1024  alpha    Android 13+ themed icon
  assets/favicon.png                   256  alpha    web favicon

Android adaptive background is a flat colour (`#FFFFFF`) set in app.json, so
`android-icon-background.png` is no longer used.

The truck is drawn from its exact vector source
(src/components/AnimatedTruck.tsx, viewBox 0 0 100 100), then optically
centred by its own bounding box and sized to sit inside the Android circular
safe-zone (foreground/monochrome use ~52% of the canvas; well under the 66%
guaranteed-visible area) so no launcher mask ever clips it.

    python scripts/gen_app_icons.py
"""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

BOX = (99, 91, 255, 255)        # #635BFF
BOX_MID = (115, 102, 247, 255)  # #7366F7
CABIN = (74, 63, 216, 255)      # #4A3FD8
WINDOW = (220, 213, 255, 255)   # #DCD5FF
WHEEL = (59, 52, 184, 255)      # #3B34B8
HUB = (106, 92, 255, 255)       # #6A5CFF
SPEED = (138, 124, 255, 255)    # #8A7CFF
PRIMARY = (99, 91, 255, 255)
WHITE = (255, 255, 255, 255)

ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets"))


def _a(c, alpha: float):
    return (c[0], c[1], c[2], int(round(255 * alpha)))


def _truck_layer(size: int, *, mono: bool = False) -> Image.Image:
    """TruckGlyph rasterised at `size`x`size`, then cropped to its bbox so the
    caller can centre the *content*, not the padded viewBox."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    k = size / 100.0
    solid = (0, 0, 0, 255)  # Android tints the monochrome layer itself

    def R(x, y, w, h, r, fill):
        d.rounded_rectangle([x * k, y * k, (x + w) * k, (y + h) * k], radius=r * k, fill=fill)

    def C(cx, cy, rad, fill):
        d.ellipse([(cx - rad) * k, (cy - rad) * k, (cx + rad) * k, (cy + rad) * k], fill=fill)

    if mono:
        # Flat truck silhouette: cargo box + a gapped cab + two wheels that
        # clearly protrude below the body, so it still reads as a truck when
        # Android tints it a single colour.
        R(14, 26, 42, 40, 6, solid)          # cargo box
        R(60, 32, 26, 34, 8, solid)          # cab (2u gap from the box)
        d.rectangle([56 * k, 58 * k, 62 * k, 66 * k], fill=solid)  # coupling
        C(34, 72, 13, solid)                 # rear wheel
        C(75, 72, 13, solid)                 # front wheel
        return layer.crop(layer.getbbox())

    d.ellipse([(52 - 40) * k, (84 - 5) * k, (52 + 40) * k, (84 + 5) * k], fill=_a(BOX, 0.14))
    R(4, 40, 18, 5, 2.5, _a(SPEED, 0.50))
    R(2, 54, 14, 5, 2.5, _a(SPEED, 0.42))
    R(5, 68, 11, 4.5, 2.25, _a(SPEED, 0.34))
    R(16, 30, 44, 42, 6, BOX)
    R(22, 35, 32, 6, 3, _a(WHITE, 0.30))
    R(22, 48, 32, 17, 4, _a(BOX_MID, 0.50))
    R(42, 35, 2.5, 31, 1.25, _a(WHITE, 0.28))
    R(62, 34, 26, 38, 8, CABIN)
    R(67, 39, 16, 16, 4, WINDOW)
    C(36, 74, 11, WHEEL); C(36, 74, 5, HUB)
    C(72, 74, 11, WHEEL); C(72, 74, 5, HUB)
    return layer.crop(layer.getbbox())


def _centre(canvas: Image.Image, sprite: Image.Image, *, frac: float, dy: float = 0.0) -> None:
    """Scale `sprite` so its longest side is `frac` of the canvas, paste centred."""
    cw = canvas.size[0]
    target = int(cw * frac)
    scale = target / max(sprite.size)
    s = sprite.resize((max(1, int(sprite.size[0] * scale)), max(1, int(sprite.size[1] * scale))), Image.LANCZOS)
    x = (cw - s.size[0]) // 2
    y = (canvas.size[1] - s.size[1]) // 2 + int(cw * dy)
    canvas.alpha_composite(s, (x, y))


def build_icon(size: int = 1024) -> Image.Image:
    """Opaque master icon: white field, inset purple-bordered rounded square,
    truck centred. iOS/launcher masks round the outer corners."""
    img = Image.new("RGBA", (size, size), WHITE)
    d = ImageDraw.Draw(img)
    # Border inset far enough (11%) that the iOS super-ellipse mask never
    # clips its corners — the brand's purple frame stays intact.
    m = int(size * 0.11)
    border = max(2, int(size * 0.02))
    d.rounded_rectangle([m, m, size - m, size - m], radius=int(size * 0.22),
                        fill=WHITE, outline=PRIMARY, width=border)
    _centre(img, _truck_layer(size), frac=0.52)
    return img.convert("RGB")


def build_foreground(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _centre(img, _truck_layer(size), frac=0.55)  # inside the 66% adaptive safe zone
    return img


def build_monochrome(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _centre(img, _truck_layer(size, mono=True), frac=0.52)
    return img


def build_favicon(size: int = 256) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.235),
                        fill=WHITE, outline=PRIMARY, width=max(2, int(size * 0.03)))
    _centre(img, _truck_layer(size), frac=0.62)
    return img


def main() -> None:
    outputs = {
        "icon.png": build_icon(),
        "android-icon-foreground.png": build_foreground(),
        "android-icon-monochrome.png": build_monochrome(),
        "favicon.png": build_favicon(),
    }
    for name, im in outputs.items():
        p = os.path.join(ASSETS, name)
        im.save(p, "PNG")
        print(f"wrote {name:32} {im.size} {im.mode}")
    stale = os.path.join(ASSETS, "android-icon-background.png")
    if os.path.exists(stale):
        os.remove(stale)
        print("removed android-icon-background.png (replaced by adaptiveIcon.backgroundColor)")


if __name__ == "__main__":
    main()
