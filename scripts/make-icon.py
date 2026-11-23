#!/usr/bin/env python3
"""Draws the KS Forge app icon (our own design) as a 1024 x 1024 PNG, with the standard
library only: a deep indigo rounded square, a glowing amber prompt chevron and a light
cursor bar. `npm run tauri icon <png>` then makes every size Tauri needs.

    python3 scripts/make-icon.py shared/src-tauri/icons/source.png
"""
import math
import struct
import sys
import zlib

N = 1024


def clamp(x, lo=0.0, hi=1.0):
    return lo if x < lo else hi if x > hi else x


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def round_rect_dist(px, py, x0, y0, x1, y1, r):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hx, hy = (x1 - x0) / 2 - r, (y1 - y0) / 2 - r
    qx, qy = abs(px - cx) - hx, abs(py - cy) - hy
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def over(dst, src, alpha):
    # dst, src: (r, g, b, a) in 0..1, premultiplied-free "source over".
    a = alpha * src[3]
    out_a = a + dst[3] * (1 - a)
    if out_a == 0:
        return (0, 0, 0, 0)
    return tuple((src[i] * a + dst[i] * dst[3] * (1 - a)) / out_a for i in range(3)) + (out_a,)


def pixel(x, y):
    px, py = x + 0.5, y + 0.5
    col = (0.0, 0.0, 0.0, 0.0)
    # Background: rounded square with a vertical gradient (macOS icon grid: 824 inside 1024).
    d = round_rect_dist(px, py, 100, 100, 924, 924, 185)
    if d < 1:
        t = clamp((py - 100) / 824)
        bg = mix((0.16, 0.13, 0.36), (0.05, 0.05, 0.12), t) + (1.0,)
        col = over(col, bg, clamp(0.5 - d))
    else:
        return col
    # Glow behind the chevron.
    g = math.hypot(px - 430, py - 512)
    col = over(col, (1.0, 0.45, 0.15, 1.0), 0.28 * clamp(1 - g / 330) ** 2)
    # Chevron ">".
    w = 46
    dc = min(seg_dist(px, py, 300, 330, 520, 512), seg_dist(px, py, 520, 512, 300, 694)) - w
    if dc < 1:
        t = clamp((py - 330) / 364)
        amber = mix((1.0, 0.76, 0.30), (1.0, 0.42, 0.20), t) + (1.0,)
        col = over(col, amber, clamp(0.5 - dc))
    # Cursor bar.
    db = round_rect_dist(px, py, 585, 640, 760, 728, 20)
    if db < 1:
        col = over(col, (0.92, 0.93, 1.0, 1.0), clamp(0.5 - db))
    return col


def main(out):
    rows = []
    for y in range(N):
        row = bytearray([0])
        for x in range(N):
            r, g, b, a = pixel(x, y)
            row += bytes((round(r * 255), round(g * 255), round(b * 255), round(a * 255)))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(kind, data):
        c = struct.pack(">I", len(data)) + kind + data
        return c + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(out, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "icon.png")
