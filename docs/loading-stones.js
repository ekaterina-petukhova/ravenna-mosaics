(() => {
  "use strict";

  /*
    ============================================================
    LOADING TESSERAE
    The word "LOADING" is sampled into a grid of points the same way
    app.js samples the real mosaic photo into a pixel grid — except the
    "image" here is the word itself, rendered to an offscreen canvas.
    Each sampled point becomes one small tessera that flies in from a
    random nearby offset and settles into place, composing the word.

    Plain 2D canvas on purpose: after the WebGL lighting bugs on the
    scroll vortex, this stays simple and impossible to wash out — a
    tessera's colour is just its fillStyle, nothing lights it.

    window.__setLoadingProgress(fraction) is called by app.js with real
    fetch download progress (0..1); tesserae unlock in sequence as that
    number climbs.
    ============================================================
  */

  const canvas =
    document.getElementById("loading-canvas");

  if (!canvas) {
    return;
  }

  const ctx =
    canvas.getContext("2d");

  const WORD = "LOADING";

  const PALETTE = [
    "#ffb23c",
    "#2ecbff",
    "#7a5cff",
    "#3fe08a",
    "#ff5a6e",
    "#4d7bff",
    "#e8c766",
    "#28e0c2",
    "#c76bff"
  ];

  const SAMPLE_STEP = 4;
  const MAX_TESSERAE = 220;
  const FLY_DURATION = 480; // ms


  /* ---- sizing: fixed internal resolution matched to the CSS box ---- */

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    Math.min(window.devicePixelRatio || 1, 2);

  const cssWidth =
    Math.round(rect.width) || 360;

  const cssHeight =
    Math.round(rect.height) || 120;

  canvas.width =
    Math.round(cssWidth * dpr);

  canvas.height =
    Math.round(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);


  /* ---- sample the word's letterforms into tessera points ---- */

  function buildWordPoints() {

    const off =
      document.createElement("canvas");

    off.width = cssWidth;
    off.height = cssHeight;

    const octx =
      off.getContext("2d");

    // Shrink the font until the word fits comfortably in the box.
    let fontSize =
      Math.floor(cssHeight * 0.6);

    let width = 0;

    do {
      octx.font = `900 ${fontSize}px Arial, sans-serif`;
      width = octx.measureText(WORD).width;

      if (width > off.width * 0.9) {
        fontSize -= 2;
      }
    } while (width > off.width * 0.9 && fontSize > 8);

    octx.clearRect(0, 0, off.width, off.height);
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    octx.fillStyle = "#fff";
    octx.font = `900 ${fontSize}px Arial, sans-serif`;
    octx.fillText(WORD, off.width / 2, off.height / 2 + fontSize * 0.03);

    const pixels =
      octx.getImageData(0, 0, off.width, off.height).data;

    const points = [];

    for (let y = 0; y < off.height; y += SAMPLE_STEP) {
      for (let x = 0; x < off.width; x += SAMPLE_STEP) {

        const alphaIndex =
          (y * off.width + x) * 4 + 3;

        if (pixels[alphaIndex] > 120) {
          points.push({
            x: x + (Math.random() - 0.5) * SAMPLE_STEP * 0.5,
            y: y + (Math.random() - 0.5) * SAMPLE_STEP * 0.5
          });
        }
      }
    }

    return points;
  }

  let points =
    buildWordPoints();

  // Cap and evenly subsample so dense letters (e.g. "O") don't crowd out
  // thin ones, and so the count stays cheap to animate.
  if (points.length > MAX_TESSERAE) {
    const stride = points.length / MAX_TESSERAE;
    const sampled = [];

    for (let i = 0; i < MAX_TESSERAE; i++) {
      sampled.push(points[Math.floor(i * stride)]);
    }

    points = sampled;
  }

  // Reveal roughly left-to-right, like reading the word being written,
  // with a little jitter so it doesn't look mechanically perfect.
  points.sort((a, b) =>
    (a.x + Math.sin(a.y * 12.9898) * 14) -
    (b.x + Math.sin(b.y * 12.9898) * 14)
  );

  const tesserae =
    points.map((p, i) => {

      const angle =
        Math.random() * Math.PI * 2;

      const distance =
        24 + Math.random() * 28;

      return {
        x: p.x,
        y: p.y,
        fromX: p.x + Math.cos(angle) * distance,
        fromY: p.y + Math.sin(angle) * distance - 10,
        size: 3.2 + Math.random() * 2.4,
        color: PALETTE[i % PALETTE.length],
        unlockAt: points.length ? i / points.length : 0,
        falling: false,
        landed: false,
        startTime: 0
      };
    });


  /* slight overshoot on arrival — a satisfying little "snap into place" */
  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = t - 1;
    return 1 + c3 * x * x * x + c1 * x * x;
  }


  window.__setLoadingProgress = (fraction) => {

    const progress =
      Math.max(0, Math.min(1, fraction));

    const now =
      performance.now();

    for (const tessera of tesserae) {

      if (
        !tessera.falling &&
        !tessera.landed &&
        progress >= tessera.unlockAt
      ) {
        tessera.falling = true;
        tessera.startTime = now;
      }
    }
  };


  function draw() {

    const now =
      performance.now();

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    for (const tessera of tesserae) {

      if (!tessera.falling) {
        continue;
      }

      const rawT =
        Math.min(1, (now - tessera.startTime) / FLY_DURATION);

      const eased =
        easeOutBack(rawT);

      const x =
        tessera.fromX + (tessera.x - tessera.fromX) * eased;

      const y =
        tessera.fromY + (tessera.y - tessera.fromY) * eased;

      const alpha =
        Math.min(1, rawT * 1.6);

      const scale =
        Math.min(1, rawT * 1.4);

      if (rawT >= 1) {
        tessera.landed = true;
      }

      const size =
        tessera.size * scale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.shadowColor = tessera.color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = tessera.color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }

    requestAnimationFrame(draw);
  }

  draw();

})();