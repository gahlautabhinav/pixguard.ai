# tools/generate_masks.py
# Generates three mask JSON files: light, balanced, strong
# Usage: python tools/generate_masks.py --out ../src/assets/masks --size 64

import os, json, argparse, math, random
import numpy as np

def make_tile(w, h, amplitude, seed=None):
    if seed is not None:
        np.random.seed(seed)
    # create a textured pattern: sum of sinusoids + small random noise
    xs = np.linspace(0, 2*math.pi, w)
    ys = np.linspace(0, 2*math.pi, h)
    xv, yv = np.meshgrid(xs, ys)
    base = (np.sin(3 * xv) + np.cos(2 * yv) + np.sin(1.5 * (xv + yv))) / 3.0
    noise = (np.random.randn(h, w) * 0.08)
    tile = (base + noise) * amplitude
    # normalize a bit to keep values within -amplitude..amplitude
    mx = np.max(np.abs(tile))
    if mx > 0:
        tile = tile * (amplitude / mx) * 0.9
    # create 3-channel small variations for R,G,B
    r = tile
    g = tile * (0.9 + np.random.randn(h, w) * 0.03)
    b = tile * (0.85 + np.random.randn(h, w) * 0.03)
    stacked = np.stack([r, g, b], axis=-1)
    return stacked.astype(float)

def save_mask(tile, path):
    h, w, c = tile.shape
    data = tile.reshape(-1).tolist()  # row-major [r,g,b,...]
    obj = {"w": w, "h": h, "channels": c, "data": data}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f)
    print("Wrote", path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default='src/assets/masks', help='output folder')
    parser.add_argument('--size', type=int, default=64, help='tile width/height')
    args = parser.parse_args()
    outdir = args.out
    os.makedirs(outdir, exist_ok=True)

    # amplitude units are pixel-value offsets approx
    specs = [
      ('light', 0.5, 42),
      ('balanced', 1.0, 123),
      ('strong', 2.0, 777)
    ]
    for name, amp, seed in specs:
        tile = make_tile(args.size, args.size, amp, seed)
        save_mask(tile, os.path.join(outdir, f'{name}.json'))

if __name__ == '__main__':
    main()
