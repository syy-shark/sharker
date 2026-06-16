#!/usr/bin/env python3
"""Extract shark icon only from top region of logo art."""

from PIL import Image
import sys

def saturation(r: int, g: int, b: int) -> float:
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == 0:
        return 0.0
    return (mx - mn) / mx

def luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b

def is_shark_blue(r: int, g: int, b: int, a: int) -> bool:
    if a < 10 or max(r, g, b) < 50:
        return False
    return b >= r - 5 and b >= g - 5 and saturation(r, g, b) >= 0.18

def is_transparent_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a < 10:
        return True
    if max(r, g, b) < 50:
        return True
    if min(r, g, b) > 188 and saturation(r, g, b) < 0.15:
        return True
    if saturation(r, g, b) < 0.12 and luminance(r, g, b) < 215:
        return True
    return False

def main() -> None:
    src = sys.argv[1] if len(sys.argv) > 1 else "src/assets/logo.png"
    dst = sys.argv[2] if len(sys.argv) > 2 else "src/assets/logo-shark.png"

    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    scan_h = int(h * 0.42)
    min_x, min_y = w, h
    max_x, max_y = 0, 0

    for y in range(scan_h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_shark_blue(r, g, b, a):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x <= min_x:
        print("No shark pixels found")
        sys.exit(1)

    pad = int(w * 0.02)
    im = im.crop(
        (
            max(0, min_x - pad),
            max(0, min_y - pad),
            min(w, max_x + pad),
            min(h, max_y + pad),
        )
    )

    px = im.load()
    cw, ch = im.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = px[x, y]
            if is_transparent_pixel(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)

    target_h = 128
    ratio = target_h / im.height
    new_w = max(1, int(im.width * ratio))
    im = im.resize((new_w, target_h), Image.Resampling.LANCZOS)
    im.save(dst, "PNG")
    print(f"Saved {dst} ({im.width}x{im.height})")

if __name__ == "__main__":
    main()
