import cv2
import numpy as np
import os
import csv
import json
import time
import math
from scipy.spatial import cKDTree

# ============================================================
# V5 — MULTI-SCALE CENTERS + LOCAL PERIMETERS + ULTRA JSON
# ============================================================

INPUT_IMAGE = "mosaic-higher-res.jpg"
OUTPUT_DIR = "tesserae_v5_output"

# ---------- WORKING RESOLUTION ----------
PROCESS_MAX_WIDTH = 3000   # 0 = keep original resolution

# ---------- CENTER DETECTION ----------
CENTER_SCALES = [1.0, 0.78, 0.60, 0.45]

EDGE_PERCENTILES = [59, 63, 67]

SEED_MIN_DISTANCE = 2.1
SEED_KERNEL = 5

# чуть агрессивнее объединяем несколько центров одной tessera
RAW_CENTER_MERGE_RADIUS = 5.5


# -------------------------
# LOCAL PERIMETER
# -------------------------

PATCH_RADIUS = 25

# разрешаем region growing захватывать больше поверхности камня
LAB_COLOR_TOL = 30.0

# останавливаемся только на более сильной границе
LOCAL_EDGE_PERCENTILE = 82

MAX_REGION_RADIUS = 22


# -------------------------
# FILTERING
# -------------------------

MIN_AREA = 8
MAX_AREA = 1600
MAX_ASPECT_RATIO = 4.5


# -------------------------
# DUPLICATE MERGING
# -------------------------

DUPLICATE_CENTER_RADIUS = 9.0
DUPLICATE_COLOR_DISTANCE = 32.0
DUPLICATE_BBOX_IOU = 0.12

# ---------- OUTPUT ----------
SHOW_NUMBERS = False
EXPORT_NORMALIZED_COORDS = True

os.makedirs(OUTPUT_DIR, exist_ok=True)


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# ============================================================
# HELPERS
# ============================================================

def bbox_iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b

    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)

    iw = max(0, x2 - x1)
    ih = max(0, y2 - y1)
    inter = iw * ih

    union = aw * ah + bw * bh - inter
    if union <= 0:
        return 0.0
    return inter / union


def rgb_distance(c1, c2):
    return float(np.linalg.norm(
        np.array(c1, dtype=np.float32) -
        np.array(c2, dtype=np.float32)
    ))


def polygon_area(points):
    if len(points) < 3:
        return 0.0
    pts = np.array(points, dtype=np.float32)
    x = pts[:, 0]
    y = pts[:, 1]
    return abs(float(
        np.dot(x, np.roll(y, 1)) -
        np.dot(y, np.roll(x, 1))
    )) / 2.0


def polygon_centroid(points):
    if len(points) < 3:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return [float(np.mean(xs)), float(np.mean(ys))]

    pts = np.array(points, dtype=np.float32)
    M = cv2.moments(pts.reshape(-1, 1, 2))
    if abs(M["m00"]) < 1e-8:
        return [float(pts[:,0].mean()), float(pts[:,1].mean())]

    return [
        float(M["m10"] / M["m00"]),
        float(M["m01"] / M["m00"])
    ]


def contour_to_bbox(poly):
    pts = np.array(poly, dtype=np.float32).reshape(-1,1,2)
    x, y, w, h = cv2.boundingRect(pts.astype(np.int32))
    return [int(x), int(y), int(w), int(h)]


# ============================================================
# LOAD
# ============================================================

log(f"Loading {INPUT_IMAGE} ...")
original = cv2.imread(INPUT_IMAGE)

if original is None:
    raise FileNotFoundError(
        f"Не удалось открыть {INPUT_IMAGE}. "
        f"Положи изображение рядом со скриптом."
    )

orig_h, orig_w = original.shape[:2]
log(f"Original size: {orig_w} x {orig_h}")

# ============================================================
# WORKING COPY
# ============================================================

if PROCESS_MAX_WIDTH and orig_w > PROCESS_MAX_WIDTH:
    base_scale = PROCESS_MAX_WIDTH / orig_w
    work_w = int(orig_w * base_scale)
    work_h = int(orig_h * base_scale)

    img = cv2.resize(
        original,
        (work_w, work_h),
        interpolation=cv2.INTER_AREA
    )
else:
    base_scale = 1.0
    img = original.copy()

h, w = img.shape[:2]
to_original = 1.0 / base_scale

log(f"Working size: {w} x {h}")

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "01_working.jpg"),
    img,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

# ============================================================
# CENTER DETECTION
# ============================================================

def detect_centers_one_scale(image, edge_percentile):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    channels = cv2.split(lab)

    gradients = []
    for ch in channels:
        gx = cv2.Scharr(ch, cv2.CV_32F, 1, 0)
        gy = cv2.Scharr(ch, cv2.CV_32F, 0, 1)
        gradients.append(cv2.magnitude(gx, gy))

    grad = np.maximum.reduce(gradients)

    p99 = np.percentile(grad, 99.5)
    grad = np.clip(grad / max(p99, 1e-6), 0, 1)
    grad8 = (grad * 255).astype(np.uint8)

    thr = np.percentile(grad8, edge_percentile)
    boundaries = np.uint8(grad8 >= thr) * 255

    boundaries = cv2.morphologyEx(
        boundaries,
        cv2.MORPH_OPEN,
        np.ones((2, 2), np.uint8),
        iterations=1
    )

    boundaries = cv2.dilate(
        boundaries,
        np.ones((3, 3), np.uint8),
        iterations=1
    )

    interior = cv2.bitwise_not(boundaries)

    dist = cv2.distanceTransform(
        interior,
        cv2.DIST_L2,
        5
    )

    k = SEED_KERNEL if SEED_KERNEL % 2 == 1 else SEED_KERNEL + 1
    dilated = cv2.dilate(
        dist,
        np.ones((k, k), np.uint8)
    )

    maxima = (
        (dist >= dilated - 1e-6) &
        (dist >= SEED_MIN_DISTANCE)
    )

    seed_mask = np.uint8(maxima) * 255

    seed_mask = cv2.dilate(
        seed_mask,
        np.ones((3, 3), np.uint8),
        iterations=1
    )

    n, labels, stats, cents = cv2.connectedComponentsWithStats(seed_mask, 8)

    centers = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] <= 0:
            continue
        centers.append((float(cents[i][0]), float(cents[i][1])))

    return centers


all_centers = []

for scale_factor in CENTER_SCALES:
    sw = max(1, int(w * scale_factor))
    sh = max(1, int(h * scale_factor))

    if scale_factor == 1.0:
        scaled = img
    else:
        scaled = cv2.resize(
            img,
            (sw, sh),
            interpolation=cv2.INTER_AREA
        )

    for edge_p in EDGE_PERCENTILES:
        log(f"Centers: scale={scale_factor}, edge percentile={edge_p}")

        centers = detect_centers_one_scale(
            scaled,
            edge_p
        )

        inv = 1.0 / scale_factor
        for cx, cy in centers:
            all_centers.append((cx * inv, cy * inv))

log(f"Raw center detections: {len(all_centers)}")

if not all_centers:
    raise RuntimeError("No centers detected.")

# ============================================================
# MERGE RAW CENTERS
# ============================================================

pts = np.array(all_centers, dtype=np.float32)
tree = cKDTree(pts)

visited = np.zeros(len(pts), dtype=bool)
merged_centers = []

for i in range(len(pts)):
    if visited[i]:
        continue

    idxs = tree.query_ball_point(
        pts[i],
        RAW_CENTER_MERGE_RADIUS
    )

    idxs = [j for j in idxs if not visited[j]]

    if not idxs:
        continue

    cluster = pts[idxs]
    center = cluster.mean(axis=0)

    for j in idxs:
        visited[j] = True

    merged_centers.append(
        (float(center[0]), float(center[1]))
    )

log(f"Merged candidate centers: {len(merged_centers)}")

center_preview = img.copy()

for cx, cy in merged_centers:
    cv2.circle(
        center_preview,
        (int(round(cx)), int(round(cy))),
        2,
        (0,255,0),
        -1
    )

cv2.imwrite(
    os.path.join(OUTPUT_DIR, "02_centers_preview.jpg"),
    center_preview,
    [cv2.IMWRITE_JPEG_QUALITY, 96]
)

# ============================================================
# LOCAL REGION GROWING
# ============================================================

def local_color_gradient(patch_bgr):
    patch_lab = cv2.cvtColor(
        patch_bgr,
        cv2.COLOR_BGR2LAB
    )

    chans = cv2.split(patch_lab)

    mags = []

    for ch in chans:
        gx = cv2.Scharr(ch, cv2.CV_32F, 1, 0)
        gy = cv2.Scharr(ch, cv2.CV_32F, 0, 1)

        mags.append(
            cv2.magnitude(gx, gy)
        )

    g = np.maximum.reduce(mags)

    p99 = np.percentile(g, 99.0)

    if p99 <= 1e-6:
        return np.zeros_like(g, dtype=np.uint8)

    g = np.clip(g / p99, 0, 1)

    return (g * 255).astype(np.uint8)


def region_grow_one(patch_bgr, seed_x, seed_y):
    ph, pw = patch_bgr.shape[:2]

    if not (0 <= seed_x < pw and 0 <= seed_y < ph):
        return None

    lab = cv2.cvtColor(
        patch_bgr,
        cv2.COLOR_BGR2LAB
    ).astype(np.float32)

    grad8 = local_color_gradient(
        patch_bgr
    )

    edge_thr = np.percentile(
        grad8,
        LOCAL_EDGE_PERCENTILE
    )

    # Sample a tiny neighborhood around center instead of one pixel.
    # This is more robust against specular highlights.
    y0 = max(0, seed_y - 1)
    y1 = min(ph, seed_y + 2)
    x0 = max(0, seed_x - 1)
    x1 = min(pw, seed_x + 2)

    seed_color = np.median(
        lab[y0:y1, x0:x1].reshape(-1,3),
        axis=0
    )

    visited = np.zeros(
        (ph, pw),
        dtype=np.uint8
    )

    region = np.zeros(
        (ph, pw),
        dtype=np.uint8
    )

    q = [(seed_x, seed_y)]
    visited[seed_y, seed_x] = 1

    neigh = [
        (-1,-1),(0,-1),(1,-1),
        (-1, 0),       (1, 0),
        (-1, 1),(0, 1),(1, 1)
    ]

    while q:
        x, y = q.pop()

        if (
            (x-seed_x)**2 +
            (y-seed_y)**2
        ) > MAX_REGION_RADIUS**2:
            continue

        color_dist = np.linalg.norm(
            lab[y, x] - seed_color
        )

        if color_dist > LAB_COLOR_TOL:
            continue

        if (
            grad8[y, x] >= edge_thr and
            not (x == seed_x and y == seed_y)
        ):
            continue

        region[y, x] = 255

        for dx, dy in neigh:
            nx = x + dx
            ny = y + dy

            if (
                0 <= nx < pw and
                0 <= ny < ph and
                not visited[ny, nx]
            ):
                visited[ny, nx] = 1
                q.append((nx, ny))

    region = cv2.morphologyEx(
        region,
        cv2.MORPH_CLOSE,
        np.ones((2,2), np.uint8),
        iterations=1
    )

    return region


log("Estimating perimeters ...")

candidates = []
uncertain = []

for idx, (cx, cy) in enumerate(merged_centers):
    cxi = int(round(cx))
    cyi = int(round(cy))

    x0 = max(0, cxi - PATCH_RADIUS)
    y0 = max(0, cyi - PATCH_RADIUS)
    x1 = min(w, cxi + PATCH_RADIUS + 1)
    y1 = min(h, cyi + PATCH_RADIUS + 1)

    patch = img[y0:y1, x0:x1]

    seed_x = cxi - x0
    seed_y = cyi - y0

    region = region_grow_one(
        patch,
        seed_x,
        seed_y
    )

    if region is None:
        uncertain.append((cx, cy, "no_region"))
        continue

    contours, _ = cv2.findContours(
        region,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        uncertain.append((cx, cy, "no_contour"))
        continue

    cnt = max(
        contours,
        key=cv2.contourArea
    )

    area = cv2.contourArea(cnt)

    if area < MIN_AREA or area > MAX_AREA:
        uncertain.append((cx, cy, "area"))
        continue

    bx, by, bw, bh = cv2.boundingRect(cnt)

    if bw < 2 or bh < 2:
        uncertain.append((cx, cy, "tiny"))
        continue

    aspect = max(
        bw / max(bh, 1),
        bh / max(bw, 1)
    )

    if aspect > MAX_ASPECT_RATIO:
        uncertain.append((cx, cy, "aspect"))
        continue

    # Shift contour to full working image coords
    cnt_full = cnt.copy()
    cnt_full[:, 0, 0] += x0
    cnt_full[:, 0, 1] += y0

    epsilon = max(
        0.6,
        0.025 * cv2.arcLength(
            cnt_full,
            True
        )
    )

    poly = cv2.approxPolyDP(
        cnt_full,
        epsilon,
        True
    )

    # Local mask for average and median color
    local_mask = np.zeros(
        (patch.shape[0], patch.shape[1]),
        dtype=np.uint8
    )

    cv2.drawContours(
        local_mask,
        [cnt],
        -1,
        255,
        -1
    )

    pixels = patch[
        local_mask > 0
    ]

    if len(pixels) == 0:
        uncertain.append((cx, cy, "no_pixels"))
        continue

    # BGR -> RGB
    mean_bgr = pixels.mean(axis=0)
    median_bgr = np.median(pixels, axis=0)

    mean_rgb = [
        int(round(mean_bgr[2])),
        int(round(mean_bgr[1])),
        int(round(mean_bgr[0]))
    ]

    median_rgb = [
        int(round(median_bgr[2])),
        int(round(median_bgr[1])),
        int(round(median_bgr[0]))
    ]

    # Full working-image bbox
    full_bbox = [
        int(bx + x0),
        int(by + y0),
        int(bw),
        int(bh)
    ]

    poly_working = [
        [
            float(p[0][0]),
            float(p[0][1])
        ]
        for p in poly
    ]

    candidates.append({
        "source_center": [cx, cy],
        "center_working": [cx, cy],
        "bbox_working": full_bbox,
        "area_working": float(area),
        "mean_rgb": mean_rgb,
        "median_rgb": median_rgb,
        "polygon_working": poly_working
    })

    if idx % 1000 == 0 and idx > 0:
        log(f"Processed {idx}/{len(merged_centers)} centers ...")

log(f"Local candidates before deduplication: {len(candidates)}")

# ============================================================
# DUPLICATE TESSELLA MERGING
# ============================================================

# Sort large, well-defined regions first.
candidates.sort(
    key=lambda s: s["area_working"],
    reverse=True
)

kept = []

for cand in candidates:
    duplicate_of = None

    cx, cy = cand["center_working"]

    for k_idx, existing in enumerate(kept):
        ex, ey = existing["center_working"]

        center_dist = math.hypot(
            cx - ex,
            cy - ey
        )

        if center_dist > DUPLICATE_CENTER_RADIUS:
            continue

        iou = bbox_iou(
            cand["bbox_working"],
            existing["bbox_working"]
        )

        color_dist = rgb_distance(
            cand["median_rgb"],
            existing["median_rgb"]
        )

        if (
            iou >= DUPLICATE_BBOX_IOU and
            color_dist <= DUPLICATE_COLOR_DISTANCE
        ):
            duplicate_of = k_idx
            break

    if duplicate_of is None:
        cand["merged_detection_count"] = 1
        cand["all_source_centers"] = [
            cand["source_center"]
        ]
        kept.append(cand)
    else:
        existing = kept[duplicate_of]

        existing["merged_detection_count"] += 1
        existing["all_source_centers"].append(
            cand["source_center"]
        )

        # Average the centers of all detections describing same tessera
        centers = np.array(
            existing["all_source_centers"],
            dtype=np.float32
        )

        existing["center_working"] = [
            float(centers[:,0].mean()),
            float(centers[:,1].mean())
        ]

log(f"Unique tesserae after duplicate merge: {len(kept)}")

# ============================================================
# BUILD FINAL ULTRA JSON RECORDS
# ============================================================

final_tesserae = []

for stone_id, s in enumerate(kept, start=1):
    cx_w, cy_w = s["center_working"]

    cx_o = cx_w * to_original
    cy_o = cy_w * to_original

    bbox = s["bbox_working"]
    bbox_original = [
        round(bbox[0] * to_original, 2),
        round(bbox[1] * to_original, 2),
        round(bbox[2] * to_original, 2),
        round(bbox[3] * to_original, 2)
    ]

    polygon_original = [
        [
            round(px * to_original, 2),
            round(py * to_original, 2)
        ]
        for px, py in s["polygon_working"]
    ]

    record = {
        "id": stone_id,

        # Original-image pixel coordinates
        "center": {
            "x": round(cx_o, 2),
            "y": round(cy_o, 2)
        },

        "bbox": {
            "x": bbox_original[0],
            "y": bbox_original[1],
            "width": bbox_original[2],
            "height": bbox_original[3]
        },

        "area_px2": round(
            s["area_working"] *
            (to_original ** 2),
            2
        ),

        # Useful for rendering
        "mean_rgb": {
            "r": s["mean_rgb"][0],
            "g": s["mean_rgb"][1],
            "b": s["mean_rgb"][2]
        },

        "median_rgb": {
            "r": s["median_rgb"][0],
            "g": s["median_rgb"][1],
            "b": s["median_rgb"][2]
        },

        "mean_hex": "#{:02x}{:02x}{:02x}".format(
            *s["mean_rgb"]
        ),

        "median_hex": "#{:02x}{:02x}{:02x}".format(
            *s["median_rgb"]
        ),

        # Real tessera contour
        "polygon": polygon_original,

        # Debug / confidence info
        "merged_detection_count": int(
            s["merged_detection_count"]
        )
    }

    if EXPORT_NORMALIZED_COORDS:
        record["normalized"] = {
            "center": {
                "x": round(cx_o / orig_w, 7),
                "y": round(cy_o / orig_h, 7)
            },
            "bbox": {
                "x": round(bbox_original[0] / orig_w, 7),
                "y": round(bbox_original[1] / orig_h, 7),
                "width": round(bbox_original[2] / orig_w, 7),
                "height": round(bbox_original[3] / orig_h, 7)
            },
            "polygon": [
                [
                    round(px / orig_w, 7),
                    round(py / orig_h, 7)
                ]
                for px, py in polygon_original
            ]
        }

    final_tesserae.append(record)

# ============================================================
# PREVIEWS
# ============================================================

preview = img.copy()

for s in final_tesserae:
    poly = np.array([
        [
            int(round(px * base_scale)),
            int(round(py * base_scale))
        ]
        for px, py in s["polygon"]
    ], dtype=np.int32).reshape(-1,1,2)

    cx = int(round(
        s["center"]["x"] *
        base_scale
    ))

    cy = int(round(
        s["center"]["y"] *
        base_scale
    ))

    cv2.drawContours(
        preview,
        [poly],
        -1,
        (0,0,255),
        1,
        cv2.LINE_AA
    )

    cv2.circle(
        preview,
        (cx,cy),
        2,
        (0,255,0),
        -1
    )

    if SHOW_NUMBERS:
        cv2.putText(
            preview,
            str(s["id"]),
            (cx+2,cy-2),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.28,
            (255,255,255),
            1,
            cv2.LINE_AA
        )

preview_path = os.path.join(
    OUTPUT_DIR,
    "03_tesserae_preview_v5.jpg"
)

cv2.imwrite(
    preview_path,
    preview,
    [cv2.IMWRITE_JPEG_QUALITY,96]
)

# ============================================================
# ULTRA JSON
# ============================================================

ultra_json_path = os.path.join(
    OUTPUT_DIR,
    "04_mosaic_ultra.json"
)

with open(
    ultra_json_path,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        {
            "meta": {
                "source_image": INPUT_IMAGE,
                "image_width": orig_w,
                "image_height": orig_h,
                "coordinate_system": "origin top-left; x right; y down",
                "normalized_coordinates": EXPORT_NORMALIZED_COORDS,
                "tessera_count": len(final_tesserae)
            },

            "tesserae": final_tesserae
        },
        f,
        ensure_ascii=False,
        indent=2
    )

# ============================================================
# CSV
# ============================================================

csv_path = os.path.join(
    OUTPUT_DIR,
    "05_mosaic_tesserae.csv"
)

with open(
    csv_path,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "id",
        "center_x",
        "center_y",
        "bbox_x",
        "bbox_y",
        "bbox_width",
        "bbox_height",
        "area_px2",
        "mean_hex",
        "median_hex",
        "merged_detection_count",
        "polygon_json"
    ])

    for s in final_tesserae:
        writer.writerow([
            s["id"],
            s["center"]["x"],
            s["center"]["y"],
            s["bbox"]["x"],
            s["bbox"]["y"],
            s["bbox"]["width"],
            s["bbox"]["height"],
            s["area_px2"],
            s["mean_hex"],
            s["median_hex"],
            s["merged_detection_count"],
            json.dumps(
                s["polygon"],
                separators=(",",":")
            )
        ])

log("DONE")

print()
print("Unique tesserae:", len(final_tesserae))
print()
print("Main outputs:")
print(preview_path)
print(ultra_json_path)
print(csv_path)
print()
print("For JavaScript, use:")
print("04_mosaic_ultra.json")
