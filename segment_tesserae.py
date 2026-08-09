import cv2
import numpy as np
import json
import os

# =========================
# SETTINGS
# =========================
INPUT_IMAGE = "mosaic.png"
OUTPUT_DIR = "mosaic_output"

# Размер выпрямленного изображения
RECTIFIED_SIZE = 900

# Параметры сегментации
MIN_AREA = 15
MAX_AREA = 2000

# =========================
# HELPERS
# =========================
clicked_points = []

def mouse_callback(event, x, y, flags, param):
    global clicked_points
    if event == cv2.EVENT_LBUTTONDOWN:
        clicked_points.append((x, y))
        print(f"Clicked: {(x, y)}")

def order_points(pts):
    pts = np.array(pts, dtype="float32")

    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)

    top_left = pts[np.argmin(s)]
    bottom_right = pts[np.argmax(s)]
    top_right = pts[np.argmin(diff)]
    bottom_left = pts[np.argmax(diff)]

    return np.array([top_left, top_right, bottom_right, bottom_left], dtype="float32")

def ensure_output_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def save_json(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# =========================
# STEP 1: LOAD IMAGE
# =========================
ensure_output_dir(OUTPUT_DIR)

image = cv2.imread(INPUT_IMAGE)
if image is None:
    raise FileNotFoundError(f"Could not open {INPUT_IMAGE}")

orig = image.copy()
display = image.copy()

# =========================
# STEP 2: MANUAL PERSPECTIVE POINTS
# =========================
print("Click 4 points around the medallion area:")
print("Recommended order: top-left, top-right, bottom-right, bottom-left")
print("If order is messy, script will reorder automatically.")
print("Press ESC when done.")

cv2.namedWindow("Select 4 points")
cv2.setMouseCallback("Select 4 points", mouse_callback)

while True:
    temp = display.copy()
    for i, pt in enumerate(clicked_points):
        cv2.circle(temp, pt, 5, (0, 0, 255), -1)
        cv2.putText(temp, str(i+1), (pt[0]+8, pt[1]-8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,255), 2)

    cv2.imshow("Select 4 points", temp)
    key = cv2.waitKey(20) & 0xFF

    if key == 27:  # ESC
        break

cv2.destroyAllWindows()

if len(clicked_points) != 4:
    raise ValueError("You must click exactly 4 points.")

src_pts = order_points(clicked_points)
dst_pts = np.array([
    [0, 0],
    [RECTIFIED_SIZE - 1, 0],
    [RECTIFIED_SIZE - 1, RECTIFIED_SIZE - 1],
    [0, RECTIFIED_SIZE - 1]
], dtype="float32")

M = cv2.getPerspectiveTransform(src_pts, dst_pts)
rectified = cv2.warpPerspective(orig, M, (RECTIFIED_SIZE, RECTIFIED_SIZE))

cv2.imwrite(os.path.join(OUTPUT_DIR, "01_rectified.png"), rectified)

# =========================
# STEP 3: PREPROCESS
# =========================
rect_rgb = cv2.cvtColor(rectified, cv2.COLOR_BGR2RGB)
gray = cv2.cvtColor(rectified, cv2.COLOR_BGR2GRAY)

# Улучшаем локальный контраст
clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
gray_eq = clahe.apply(gray)

# Слегка сглаживаем
blur = cv2.GaussianBlur(gray_eq, (5, 5), 0)

cv2.imwrite(os.path.join(OUTPUT_DIR, "02_gray_eq.png"), gray_eq)

# =========================
# STEP 4: DETECT DARK GROUT
# =========================
# grout = тёмные швы
# adaptive threshold помогает лучше, чем простой
grout = cv2.adaptiveThreshold(
    blur,
    255,
    cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
    cv2.THRESH_BINARY_INV,
    21,
    5
)

# Морфология для чистки
kernel = np.ones((3, 3), np.uint8)
grout = cv2.morphologyEx(grout, cv2.MORPH_OPEN, kernel, iterations=1)
grout = cv2.morphologyEx(grout, cv2.MORPH_CLOSE, kernel, iterations=1)

cv2.imwrite(os.path.join(OUTPUT_DIR, "03_grout_mask.png"), grout)

# =========================
# STEP 5: GET STONE REGIONS
# =========================
# Камни = всё, что НЕ grout
stones_mask = cv2.bitwise_not(grout)

# Чистим маску камней
stones_mask = cv2.morphologyEx(stones_mask, cv2.MORPH_OPEN, kernel, iterations=1)
stones_mask = cv2.morphologyEx(stones_mask, cv2.MORPH_CLOSE, kernel, iterations=1)

cv2.imwrite(os.path.join(OUTPUT_DIR, "04_stones_mask.png"), stones_mask)

# =========================
# STEP 6: WATERSHED
# =========================
# Distance transform для отделения соседних камней
dist = cv2.distanceTransform(stones_mask, cv2.DIST_L2, 5)
dist_norm = cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
cv2.imwrite(os.path.join(OUTPUT_DIR, "05_distance_transform.png"), dist_norm)

# Маркеры для watershed
_, sure_fg = cv2.threshold(dist, 0.25 * dist.max(), 255, 0)
sure_fg = np.uint8(sure_fg)

sure_bg = cv2.dilate(stones_mask, kernel, iterations=2)
unknown = cv2.subtract(sure_bg, sure_fg)

num_labels, markers = cv2.connectedComponents(sure_fg)
markers = markers + 1
markers[unknown == 255] = 0

watershed_img = rectified.copy()
markers = cv2.watershed(watershed_img, markers)

# =========================
# STEP 7: EXTRACT TESSELAE
# =========================
preview = rect_rgb.copy()
label_preview = rect_rgb.copy()
tesserae = []

unique_labels = np.unique(markers)

for label in unique_labels:
    if label <= 1:
        continue

    region = np.uint8(markers == label) * 255
    contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        continue

    cnt = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(cnt)

    if area < MIN_AREA or area > MAX_AREA:
        continue

    epsilon = max(0.8, 0.02 * cv2.arcLength(cnt, True))
    poly = cv2.approxPolyDP(cnt, epsilon, True)

    M_cnt = cv2.moments(cnt)
    if M_cnt["m00"] == 0:
        continue

    cx = M_cnt["m10"] / M_cnt["m00"]
    cy = M_cnt["m01"] / M_cnt["m00"]

    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.drawContours(mask, [cnt], -1, 255, -1)

    mean_color_bgr = cv2.mean(rectified, mask=mask)[:3]
    mean_color_rgb = [int(mean_color_bgr[2]), int(mean_color_bgr[1]), int(mean_color_bgr[0])]

    x, y, w, h = cv2.boundingRect(cnt)
    rect_min = cv2.minAreaRect(cnt)
    angle = rect_min[-1]

    tesserae.append({
        "id": int(label),
        "center": [round(float(cx), 2), round(float(cy), 2)],
        "area": round(float(area), 2),
        "bbox": [int(x), int(y), int(w), int(h)],
        "rotation_deg": round(float(angle), 2),
        "color_rgb": mean_color_rgb,
        "polygon": [[int(p[0][0]), int(p[0][1])] for p in poly]
    })

    cv2.drawContours(preview, [poly], -1, (255, 0, 0), 1)
    cv2.circle(preview, (int(cx), int(cy)), 1, (0, 255, 0), -1)

# =========================
# STEP 8: SAVE RESULTS
# =========================
preview_bgr = cv2.cvtColor(preview, cv2.COLOR_RGB2BGR)
cv2.imwrite(os.path.join(OUTPUT_DIR, "06_tesserae_preview.png"), preview_bgr)

data = {
    "image_width": RECTIFIED_SIZE,
    "image_height": RECTIFIED_SIZE,
    "count": len(tesserae),
    "tesserae": tesserae
}

save_json(data, os.path.join(OUTPUT_DIR, "07_tesserae.json"))

print(f"Done. Detected tesserae: {len(tesserae)}")
print(f"Saved all files to: {OUTPUT_DIR}")