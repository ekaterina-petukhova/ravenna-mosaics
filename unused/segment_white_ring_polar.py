import cv2
import numpy as np
import json
import os
from scipy.signal import find_peaks

INPUT = "/Users/ekaterinapetuhova/Desktop/MOSAIC MOSAIC/mosaic_output/01_rectified.png"
OUTPUT = "polar_ring_output"

os.makedirs(OUTPUT, exist_ok=True)

img = cv2.imread(INPUT)
if img is None:
    raise FileNotFoundError(
        f"Could not open {INPUT}. Put this script next to 01_rectified.png."
    )

h, w = img.shape[:2]

# ---------- interactive ring selection ----------
win = "1) Fit the WHITE ring | ENTER = continue | ESC = quit"
cv2.namedWindow(win, cv2.WINDOW_NORMAL)
cv2.resizeWindow(win, 950, 950)

def nothing(v):
    pass

cv2.createTrackbar("center X", win, w//2, w-1, nothing)
cv2.createTrackbar("center Y", win, h//2, h-1, nothing)
cv2.createTrackbar("inner radius", win, 190, min(w,h)//2, nothing)
cv2.createTrackbar("outer radius", win, 245, min(w,h)//2, nothing)

while True:
    cx = cv2.getTrackbarPos("center X", win)
    cy = cv2.getTrackbarPos("center Y", win)
    rin = cv2.getTrackbarPos("inner radius", win)
    rout = cv2.getTrackbarPos("outer radius", win)

    if rout <= rin:
        rout = rin + 1

    view = img.copy()
    cv2.circle(view, (cx,cy), rin, (0,255,255), 2)
    cv2.circle(view, (cx,cy), rout, (0,0,255), 2)
    cv2.circle(view, (cx,cy), 4, (255,0,255), -1)

    cv2.putText(
        view,
        "Yellow = inner edge | Red = outer edge",
        (20,35),
        cv2.FONT_HERSHEY_SIMPLEX,
        .8,
        (255,255,255),
        2
    )

    cv2.imshow(win, view)
    key = cv2.waitKey(30) & 0xFF

    if key in (13, 10):  # ENTER
        break
    if key == 27:
        cv2.destroyAllWindows()
        raise SystemExit

cv2.destroyWindow(win)

# ---------- polar unwrap ----------
angles = 1440       # horizontal resolution: 0.25 degree
radial = max(20, rout-rin)

theta = np.linspace(0, 2*np.pi, angles, endpoint=False)
radii = np.linspace(rin, rout, radial)

strip = np.zeros((radial, angles, 3), dtype=np.uint8)

for a, t in enumerate(theta):
    xs = cx + radii*np.cos(t)
    ys = cy + radii*np.sin(t)

    mapx = xs.astype(np.float32).reshape(-1,1)
    mapy = ys.astype(np.float32).reshape(-1,1)

    col = cv2.remap(
        img,
        mapx,
        mapy,
        cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REFLECT
    ).reshape(radial,3)

    strip[:,a,:] = col

cv2.imwrite(os.path.join(OUTPUT,"01_unwrapped_ring.png"), strip)

# ---------- find vertical grout seams ----------
gray = cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY)

# Dark grout should create dark vertical valleys.
profile = gray.mean(axis=0).astype(np.float32)

# Smooth only along angle, preserving radial information.
kernel_size = 9
kernel = np.ones(kernel_size, dtype=np.float32)/kernel_size
profile_smooth = np.convolve(
    np.r_[profile[-kernel_size:], profile, profile[:kernel_size]],
    kernel,
    mode="same"
)[kernel_size:-kernel_size]

# Interactive prominence/distance tuning
win2 = "2) Tune seams | ENTER = save | ESC = quit"
cv2.namedWindow(win2, cv2.WINDOW_NORMAL)
cv2.resizeWindow(win2, 1200, 500)
cv2.createTrackbar("prominence", win2, 5, 40, nothing)
cv2.createTrackbar("min distance", win2, 10, 50, nothing)

final_peaks = []

while True:
    prominence = max(1, cv2.getTrackbarPos("prominence", win2))
    distance = max(3, cv2.getTrackbarPos("min distance", win2))

    peaks, props = find_peaks(
        -profile_smooth,
        prominence=prominence,
        distance=distance
    )

    preview = cv2.resize(
        strip,
        (angles, max(220, radial*4)),
        interpolation=cv2.INTER_NEAREST
    )

    for x in peaks:
        cv2.line(preview, (int(x),0), (int(x),preview.shape[0]-1), (0,0,255), 1)

    cv2.putText(
        preview,
        f"Detected seams: {len(peaks)}",
        (15,30),
        cv2.FONT_HERSHEY_SIMPLEX,
        .8,
        (255,255,255),
        2
    )

    cv2.imshow(win2, preview)
    key = cv2.waitKey(30) & 0xFF

    if key in (13,10):
        final_peaks = peaks
        cv2.imwrite(os.path.join(OUTPUT,"02_seams_unwrapped.png"), preview)
        break
    if key == 27:
        cv2.destroyAllWindows()
        raise SystemExit

cv2.destroyWindow(win2)

# ---------- convert seams to tessera wedge polygons ----------
# Each consecutive pair of detected grout seams defines one candidate tessera.
# We draw them on the original rectified image for inspection.
result = img.copy()
stones = []

if len(final_peaks) >= 2:
    final_peaks = np.sort(final_peaks)

    # close the circular sequence
    extended = list(final_peaks) + [int(final_peaks[0] + angles)]

    for i in range(len(final_peaks)):
        a1 = extended[i]
        a2 = extended[i+1]

        # ignore huge gaps: they usually mean missed seams
        gap = a2-a1
        if gap > 70:
            continue

        t1 = (a1 % angles) / angles * 2*np.pi
        t2 = (a2 % angles) / angles * 2*np.pi

        # candidate tessera wedge
        pts = np.array([
            [cx + rin*np.cos(t1),  cy + rin*np.sin(t1)],
            [cx + rout*np.cos(t1), cy + rout*np.sin(t1)],
            [cx + rout*np.cos(t2), cy + rout*np.sin(t2)],
            [cx + rin*np.cos(t2),  cy + rin*np.sin(t2)]
        ], dtype=np.int32)

        cv2.polylines(result,[pts],True,(0,0,255),1,cv2.LINE_AA)

        amid = ((a1+a2)/2) % angles
        tm = amid/angles*2*np.pi
        rm = (rin+rout)/2
        px = int(cx+rm*np.cos(tm))
        py = int(cy+rm*np.sin(tm))
        cv2.circle(result,(px,py),2,(0,255,0),-1)

        stones.append({
            "id": len(stones)+1,
            "angle_start_deg": round((a1%angles)/angles*360,3),
            "angle_end_deg": round((a2%angles)/angles*360,3),
            "center": [px,py],
            "polygon": pts.tolist()
        })

cv2.imwrite(os.path.join(OUTPUT,"03_ring_stones_preview.png"), result)

with open(os.path.join(OUTPUT,"04_ring_stones.json"),"w") as f:
    json.dump({
        "center":[cx,cy],
        "inner_radius":rin,
        "outer_radius":rout,
        "count":len(stones),
        "stones":stones
    },f,indent=2)

print()
print("DONE")
print("Center:", (cx,cy))
print("Radii:", rin, rout)
print("Detected seams:", len(final_peaks))
print("Candidate ring tesserae:", len(stones))
print()
print("Open these:")
print(os.path.join(OUTPUT,"01_unwrapped_ring.png"))
print(os.path.join(OUTPUT,"02_seams_unwrapped.png"))
print(os.path.join(OUTPUT,"03_ring_stones_preview.png"))