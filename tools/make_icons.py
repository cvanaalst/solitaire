import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')

TOP = (0x17, 0x62, 0x4A)
BOTTOM = (0x07, 0x20, 0x19)
CARD = (0xFF, 0xFD, 0xF7)
HEART = (0xC2, 0x11, 0x1F)
SS = 3


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect(x, y, left, top, right, bottom, radius):
    if left + radius <= x <= right - radius and top <= y <= bottom:
        return True
    if left <= x <= right and top + radius <= y <= bottom - radius:
        return True
    for cx, cy in ((left + radius, top + radius), (right - radius, top + radius),
                   (left + radius, bottom - radius), (right - radius, bottom - radius)):
        if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2:
            return True
    return False


def heart_inside(x, y, cx, cy, scale):
    nx = (x - cx) / scale
    ny = -(y - cy) / scale
    value = (nx * nx + ny * ny - 1) ** 3 - (nx * nx) * (ny ** 3)
    return value <= 0


def sample(u, v, size):
    background = lerp(TOP, BOTTOM, v / size)

    left = size * 0.235
    right = size * 0.765
    top = size * 0.155
    bottom = size * 0.845
    radius = size * 0.055

    if rounded_rect(u, v, left, top, right, bottom, radius):
        cx = (left + right) / 2
        cy = (top + bottom) / 2
        if heart_inside(u, v, cx, cy, size * 0.185):
            return HEART
        return CARD

    return background


def render(size):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            r = g = b = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + (sx + 0.5) / SS
                    py = y + (sy + 0.5) / SS
                    pr, pg, pb = sample(px, py, size)
                    r += pr
                    g += pg
                    b += pb
            count = SS * SS
            row += bytes((r // count, g // count, b // count))
        rows.append(bytes(row))
    return rows


def chunk(tag, data):
    return (
        struct.pack('>I', len(data))
        + tag
        + data
        + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, rows):
    raw = b''.join(b'\x00' + row for row in rows)
    header = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    with open(path, 'wb') as handle:
        handle.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (180, 192, 512):
        rows = render(size)
        path = os.path.join(OUT_DIR, 'icon-%d.png' % size)
        write_png(path, size, rows)
        print('wrote', path)


if __name__ == '__main__':
    main()
