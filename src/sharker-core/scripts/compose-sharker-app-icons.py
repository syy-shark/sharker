# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Stamp the Sharker shark mark onto every shipped app-icon tile.

    python3 scripts/compose-sharker-app-icons.py
    python3 scripts/compose-sharker-app-icons.py --check
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DESKTOP_ASSETS = os.path.abspath(os.path.join(HERE, "..", "apps", "desktop", "assets"))
UI_MARK = os.path.abspath(os.path.join(HERE, "..", "packages", "ui", "src", "sharker-mark.png"))
MARK_PATH = os.path.join(DESKTOP_ASSETS, "sharker-mark.png")
ICON_DIR = os.path.join(DESKTOP_ASSETS, "app-icons")
DEFAULT_ICON = os.path.join(DESKTOP_ASSETS, "icon.png")
SOURCE_CANDIDATES = [
    os.path.join(REPO, "src", "assets", "logo-shark.png"),
    os.path.join(REPO, "resources", "icon.png"),
]

SIZE = 1024
MARGIN = 100
CORNER = 184  # inner-tile radius after the 100px macOS margin
MARK_INSET = 0.14


def load_variants() -> list[dict]:
    path = os.path.join(HERE, "generate-app-icons.py")
    spec = importlib.util.spec_from_file_location("sharker_app_icons", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load generate-app-icons.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.VARIANTS)


def hex_rgba(value: str) -> tuple[int, int, int, int]:
    raw = value.removeprefix("#")
    if len(raw) == 6:
        r, g, b = int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)
        return (r, g, b, 255)
    raise ValueError(f"unsupported color {value}")


def saturation(r: int, g: int, b: int) -> float:
    mx, mn = max(r, g, b), min(r, g, b)
    return 0.0 if mx == 0 else (mx - mn) / mx


def luminance(r: int, g: int, b: int) -> float:
    return 0.299 * r + 0.587 * g + 0.114 * b


def extract_mark(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12:
                px[x, y] = (0, 0, 0, 0)
                continue
            sat = saturation(r, g, b)
            lum = luminance(r, g, b)
            # Knock out the black plate and pale paper around the shark.
            if max(r, g, b) < 42:
                px[x, y] = (0, 0, 0, 0)
                continue
            if sat < 0.12 and lum > 188:
                px[x, y] = (0, 0, 0, 0)
                continue
            if sat < 0.10 and lum < 80:
                px[x, y] = (0, 0, 0, 0)
                continue
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
    if max_x <= min_x:
        raise RuntimeError("no shark pixels found")
    pad = max(4, int(w * 0.015))
    cropped = im.crop(
        (max(0, min_x - pad), max(0, min_y - pad), min(w, max_x + pad + 1), min(h, max_y + pad + 1))
    )
    return cropped


def ensure_mark() -> Image.Image:
    if os.path.exists(MARK_PATH):
        return Image.open(MARK_PATH).convert("RGBA")
    for candidate in SOURCE_CANDIDATES:
        if not os.path.exists(candidate):
            continue
        mark = extract_mark(Image.open(candidate))
        os.makedirs(os.path.dirname(MARK_PATH), exist_ok=True)
        mark.save(MARK_PATH, "PNG")
        os.makedirs(os.path.dirname(UI_MARK), exist_ok=True)
        mark.save(UI_MARK, "PNG")
        print(f"extracted mark -> {MARK_PATH}")
        return mark
    raise FileNotFoundError("sharker-mark.png missing and no source logo found")


def rounded_mask() -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(mask)
    box = (MARGIN, MARGIN, SIZE - MARGIN - 1, SIZE - MARGIN - 1)
    draw.rounded_rectangle(box, radius=CORNER, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(0.55))


def paint_bg(bg) -> Image.Image:
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    if isinstance(bg, str):
        return Image.new("RGBA", (SIZE, SIZE), hex_rgba(bg))
    if isinstance(bg, tuple) and len(bg) == 2 and isinstance(bg[0], str):
        return gradient_layer(hex_rgba(bg[0]), hex_rgba(bg[1]), 90)
    if isinstance(bg, tuple) and bg and bg[0] == "grad":
        return gradient_layer(hex_rgba(bg[1]), hex_rgba(bg[2]), bg[3])
    raise TypeError(f"unsupported background {bg!r}")


def gradient_layer(c1, c2, angle: float) -> Image.Image:
    ramp = Image.linear_gradient("L").resize((SIZE, SIZE), Image.Resampling.BILINEAR)
    if abs(angle - 90) > 1:
        ramp = ramp.rotate(90 - angle, resample=Image.Resampling.BILINEAR)
    return Image.composite(
        Image.new("RGBA", (SIZE, SIZE), c2),
        Image.new("RGBA", (SIZE, SIZE), c1),
        ramp,
    )


def fit_mark(mark: Image.Image) -> Image.Image:
    inner = SIZE - 2 * MARGIN
    box = int(inner * (1 - 2 * MARK_INSET))
    ratio = min(box / mark.width, box / mark.height)
    w = max(1, int(mark.width * ratio))
    h = max(1, int(mark.height * ratio))
    return mark.resize((w, h), Image.Resampling.LANCZOS)


def compose(bg, mark: Image.Image) -> Image.Image:
    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile.paste(paint_bg(bg), mask=rounded_mask())
    stamp = fit_mark(mark)
    tile.alpha_composite(stamp, ((SIZE - stamp.width) // 2, (SIZE - stamp.height) // 2))
    return tile


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", compress_level=9, optimize=True)
    return buf.getvalue()


def write_png(path: str, img: Image.Image) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as handle:
        handle.write(png_bytes(img))


def grayscale(mark: Image.Image) -> Image.Image:
    return mark.convert("LA").convert("RGBA")


def main(argv: list[str]) -> int:
    check = "--check" in argv
    mark = ensure_mark()
    if not os.path.exists(UI_MARK):
        os.makedirs(os.path.dirname(UI_MARK), exist_ok=True)
        mark.save(UI_MARK, "PNG")

    jobs: list[tuple[str, Image.Image]] = []
    for variant in load_variants():
        jobs.append((os.path.join(ICON_DIR, f"{variant['name']}.png"), compose(variant["bg"], mark)))
    jobs.append((DEFAULT_ICON, compose("#0C1016", mark)))
    jobs.append((os.path.join(ICON_DIR, "mono.png"), compose("#1A1C20", grayscale(mark))))

    stale: list[str] = []
    for path, img in jobs:
        data = png_bytes(img)
        if check:
            try:
                with open(path, "rb") as handle:
                    current = handle.read()
            except FileNotFoundError:
                current = b""
            if current != data:
                stale.append(os.path.relpath(path, DESKTOP_ASSETS))
        else:
            write_png(path, img)

    if check:
        if stale:
            print("out of date: %s" % ", ".join(stale))
            print("run: python3 scripts/compose-sharker-app-icons.py")
            return 1
        print("all %d icons match the committed artwork" % len(jobs))
        return 0

    print("wrote %d icons under %s" % (len(jobs), DESKTOP_ASSETS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
