(() => {
  "use strict";

  // ============================================================
  // DOM
  // ============================================================

  const canvas =
    document.getElementById("mosaic");

  const ctx =
    canvas.getContext(
      "2d",
      {
        alpha: false,
        desynchronized: true
      }
    );

  const loading =
    document.getElementById("loading");

  const bar =
    document.getElementById("bar");

  const step =
    document.getElementById("step");

  const kicker =
    document.getElementById("kicker");

  const title =
    document.getElementById("title");

  const desc =
    document.getElementById("desc");

  const copy =
    document.getElementById("copy");

  const stats =
    document.getElementById("stats");


  // ============================================================
  // HELPERS
  // ============================================================

  const clamp =
    (v, a = 0, b = 1) =>
      Math.max(
        a,
        Math.min(b, v)
      );


  const smooth =
    (a, b, x) => {

      let t =
        clamp(
          (x - a) /
          (b - a)
        );

      return (
        t *
        t *
        (3 - 2 * t)
      );
    };


  const easeOut =
    (t) =>
      1 -
      Math.pow(
        1 - clamp(t),
        4
      );


  // ============================================================
  // PERFORMANCE
  // ============================================================

  const DPR = 1;

  const BUCKET_COUNT = 32;

  const CACHE_WIDTH = 1800;

  let CACHE_HEIGHT = 1200;


  // ============================================================
  // STATE
  // ============================================================

  let DATA = null;

  let stones = [];

  let hero = null;

  let buckets = [];

  let bucketCanvases = [];

  let W = 0;

  let H = 0;

  let lastProgress = -1;

  let scheduled = false;


  // ============================================================
  // LOAD JSON
  // ============================================================

  async function loadData() {

    const response =
      await fetch(
        "./04_mosaic_ultra.json"
      );

    if (!response.ok) {

      throw new Error(
        `JSON load failed: ${response.status}`
      );
    }

    DATA =
      await response.json();

    if (
      !DATA.meta ||
      !Array.isArray(DATA.tesserae)
    ) {

      throw new Error(
        "Неверная структура 04_mosaic_ultra.json"
      );
    }

    CACHE_HEIGHT =
      Math.round(
        CACHE_WIDTH *
        DATA.meta.image_height /
        DATA.meta.image_width
      );

    prepareStones();

    buildBuckets();

    buildBucketCanvases();

    if (loading) {

      loading.style.display =
        "none";
    }

    resize();
  }


  // ============================================================
  // PREPARE TESSELLAE
  // ============================================================

  function prepareStones() {

    stones =
      DATA.tesserae

        .filter(
          (t) => {

            return (

              t.normalized &&

              t.normalized.center &&

              Array.isArray(
                t.normalized.polygon
              ) &&

              t.normalized.polygon.length >= 3
            );
          }
        )

        .map(
          (t) => {

            const cx =
              t.normalized.center.x;

            const cy =
              t.normalized.center.y;

            const dx =
              cx - 0.5;

            const dy =
              cy - 0.5;

            const radial =
              Math.hypot(
                dx,
                dy
              );

            const angle =
              Math.atan2(
                dy,
                dx
              );


            // deterministic pseudo-random
            const rand =
              (n) => {

                const x =

                  Math.sin(
                    (t.id + 1) *
                    (
                      12.9898 +
                      n * 7.31
                    )
                  )

                  *

                  43758.5453;

                return (
                  x -
                  Math.floor(x)
                );
              };


            // --------------------------------------------
            // PATH2D
            // --------------------------------------------

            const polygon =
              t.normalized.polygon;

            const path =
              new Path2D();

            path.moveTo(

              polygon[0][0] -
              cx,

              polygon[0][1] -
              cy

            );

            for (
              let i = 1;
              i < polygon.length;
              i++
            ) {

              path.lineTo(

                polygon[i][0] -
                cx,

                polygon[i][1] -
                cy

              );
            }

            path.closePath();


            // --------------------------------------------
            // TIMING
            // --------------------------------------------

            const radialNorm =
              clamp(
                radial /
                0.71
              );

            const start =

              0.10 +

              radialNorm *
              0.65 +

              rand(5) *
              0.035;

            const end =
              start +
              0.16;


            return {

              id:
                t.id,

              cx,

              cy,

              radial,

              angle,

              path,

              polygon,

              color:

                t.median_hex ||

                t.mean_hex ||

                "#777777",

              start,

              end,

              orbit:

                0.70 +

                rand(1) *
                0.34,

              swirl:

                (
                  rand(2) -
                  0.5
                )

                *

                1.15,

              rotation:

                (
                  rand(3) -
                  0.5
                )

                *

                0.9,

              scaleJitter:

                0.95 +

                rand(4) *
                0.10,

              bucketIndex:
                0
            };
          }
        );


    // ==========================================================
    // HERO
    // ==========================================================

    hero =
      stones[0];

    let best =
      Infinity;

    for (
      const stone
      of stones
    ) {

      const d =
        Math.hypot(

          stone.cx -
          0.5,

          stone.cy -
          0.5

        );

      if (
        d <
        best
      ) {

        best =
          d;

        hero =
          stone;
      }
    }

    if (stats) {

      stats.textContent =

        `${stones.length.toLocaleString("ru-RU")} tesserae`;
    }

    console.log(
      "Prepared tesserae:",
      stones.length
    );
  }


  // ============================================================
  // BUCKETS
  // ============================================================

  function buildBuckets() {

    buckets =
      Array.from(
        {
          length:
            BUCKET_COUNT
        },
        () => ({
          stones: [],
          minStart: Infinity,
          maxEnd: -Infinity
        })
      );

    for (
      const stone
      of stones
    ) {

      if (
        hero &&
        stone.id === hero.id
      ) {

        continue;
      }

      const index =
        Math.min(

          BUCKET_COUNT - 1,

          Math.max(

            0,

            Math.floor(
              stone.start *
              BUCKET_COUNT
            )
          )
        );

      stone.bucketIndex =
        index;

      const bucket =
        buckets[index];

      bucket.stones.push(
        stone
      );

      bucket.minStart =
        Math.min(
          bucket.minStart,
          stone.start
        );

      bucket.maxEnd =
        Math.max(
          bucket.maxEnd,
          stone.end
        );
    }
  }


  // ============================================================
  // STATIC CACHE
  // ============================================================

  function buildBucketCanvases() {

    bucketCanvases = [];

    for (
      let i = 0;
      i < BUCKET_COUNT;
      i++
    ) {

      const layer =
        document.createElement(
          "canvas"
        );

      layer.width =
        CACHE_WIDTH;

      layer.height =
        CACHE_HEIGHT;

      const lctx =
        layer.getContext(
          "2d",
          {
            alpha: true
          }
        );

      const bucket =
        buckets[i];

      for (
        const stone
        of bucket.stones
      ) {

        lctx.save();

        lctx.translate(

          stone.cx *
          CACHE_WIDTH,

          stone.cy *
          CACHE_HEIGHT

        );

        lctx.scale(

          CACHE_WIDTH,

          CACHE_HEIGHT

        );

        lctx.fillStyle =
          stone.color;

        lctx.fill(
          stone.path
        );

        lctx.restore();
      }

      bucketCanvases.push(
        layer
      );
    }
  }


  // ============================================================
  // RESIZE
  // ============================================================

  function resize() {

    W =
      innerWidth;

    H =
      innerHeight;

    canvas.width =
      Math.round(
        W *
        DPR
      );

    canvas.height =
      Math.round(
        H *
        DPR
      );

    canvas.style.width =
      W +
      "px";

    canvas.style.height =
      H +
      "px";

    ctx.setTransform(

      DPR,
      0,
      0,
      DPR,
      0,
      0

    );

    requestDraw(
      true
    );
  }


  // ============================================================
  // CAMERA RECT
  // ============================================================

  function getRect(
    progress
  ) {

    const aspect =

      DATA.meta.image_width /

      DATA.meta.image_height;

    const zoom =

      1.50 -

      0.50 *

      smooth(
        0.48,
        0.96,
        progress
      );

    let drawW;

    let drawH;

    if (
      W / H >
      aspect
    ) {

      drawH =

        H *
        0.90 *
        zoom;

      drawW =

        drawH *
        aspect;

    } else {

      drawW =

        W *
        0.94 *
        zoom;

      drawH =

        drawW /
        aspect;
    }

    return {

      x:
        (
          W -
          drawW
        ) /
        2,

      y:
        (
          H -
          drawH
        ) /
        2,

      w:
        drawW,

      h:
        drawH
    };
  }


  // ============================================================
  // COORDINATE CONVERSION
  // ============================================================

  function toScreen(
    stone,
    rect
  ) {

    return [

      rect.x +

      stone.cx *
      rect.w,

      rect.y +

      stone.cy *
      rect.h

    ];
  }


  // ============================================================
  // FINAL TESSELLA
  // ============================================================

  function drawFinalStone(
    stone,
    rect,
    alpha = 1
  ) {

    const target =
      toScreen(
        stone,
        rect
      );

    ctx.save();

    ctx.globalAlpha =
      alpha;

    ctx.translate(

      target[0],

      target[1]

    );

    ctx.scale(

      rect.w,

      rect.h

    );

    ctx.fillStyle =
      stone.color;

    ctx.fill(
      stone.path
    );

    ctx.restore();
  }


  // ============================================================
  // MOVING TESSELLA
  // ============================================================

  function drawMovingStone(
    stone,
    progress,
    rect
  ) {

    const t =

      easeOut(

        smooth(

          stone.start,

          stone.end,

          progress

        )
      );

    const target =
      toScreen(
        stone,
        rect
      );

    const angle =

      stone.angle +

      stone.swirl *
      (
        1 -
        t
      );

    const radius =

      Math.max(
        W,
        H
      )

      *

      stone.orbit;

    const sx =

      W / 2 +

      Math.cos(
        angle
      ) *
      radius;

    const sy =

      H / 2 +

      Math.sin(
        angle
      ) *
      radius;

    const x =

      sx +

      (
        target[0] -
        sx
      )

      *

      t;

    const y =

      sy +

      (
        target[1] -
        sy
      )

      *

      t;

    const scale =

      stone.scaleJitter *

      (
        0.64 +

        0.36 *
        t
      );

    const rotation =

      stone.rotation *

      (
        1 -
        t
      );

    ctx.save();

    ctx.globalAlpha =
      t;

    ctx.translate(
      x,
      y
    );

    ctx.rotate(
      rotation
    );

    ctx.scale(

      rect.w *
      scale,

      rect.h *
      scale

    );

    ctx.fillStyle =
      stone.color;

    ctx.fill(
      stone.path
    );

    ctx.restore();
  }


  // ============================================================
  // PHYSICAL GLASS HERO TESSELLA
  // ============================================================

  function drawPhysicalHeroStone(
    stone,
    x,
    y,
    pixelSize,
    rotation,
    alpha = 1
  ) {

    /*
      We draw the hero in its own local coordinate system.

      stone.path itself is normalized relative to tessera center,
      so we scale it using a factor related to desired screen size.
    */

    const polygon =
      stone.polygon;

    if (
      !polygon ||
      polygon.length < 3
    ) {
      return;
    }


    // ----------------------------------------------------------
    // Find normalized dimensions of tessera
    // ----------------------------------------------------------

    let minX =
      Infinity;

    let maxX =
      -Infinity;

    let minY =
      Infinity;

    let maxY =
      -Infinity;

    for (
      const p
      of polygon
    ) {

      minX =
        Math.min(
          minX,
          p[0]
        );

      maxX =
        Math.max(
          maxX,
          p[0]
        );

      minY =
        Math.min(
          minY,
          p[1]
        );

      maxY =
        Math.max(
          maxY,
          p[1]
        );
    }

    const normW =
      Math.max(
        0.00001,
        maxX -
        minX
      );

    const normH =
      Math.max(
        0.00001,
        maxY -
        minY
      );

    const normMax =
      Math.max(
        normW,
        normH
      );

    const scale =
      pixelSize /
      normMax;


    ctx.save();

    ctx.globalAlpha =
      alpha;

    ctx.translate(
      x,
      y
    );

    ctx.rotate(
      rotation
    );


    // ==========================================================
    // 1. CONTACT SHADOW
    // ==========================================================

    ctx.save();

    ctx.translate(
      pixelSize * 0.055,
      pixelSize * 0.085
    );

    ctx.scale(
      scale,
      scale
    );

    ctx.shadowColor =
      "rgba(0,0,0,.85)";

    ctx.shadowBlur =
      pixelSize * 0.16;

    ctx.shadowOffsetX =
      pixelSize * 0.02;

    ctx.shadowOffsetY =
      pixelSize * 0.06;

    ctx.fillStyle =
      "rgba(0,0,0,.65)";

    ctx.fill(
      stone.path
    );

    ctx.restore();


    // ==========================================================
    // 2. THICK DARK GLASS SIDE / BEVEL
    // ==========================================================

    ctx.save();

    ctx.translate(
      pixelSize * 0.045,
      pixelSize * 0.055
    );

    ctx.scale(
      scale,
      scale
    );

    ctx.fillStyle =
      "#6f4607";

    ctx.fill(
      stone.path
    );

    ctx.restore();


    // ==========================================================
    // 3. MAIN GLASS BODY
    // ==========================================================

    ctx.save();

    ctx.scale(
      scale,
      scale
    );

    ctx.clip(
      stone.path
    );


    /*
      Several slightly offset radial gradients give
      the impression that glass thickness and surface
      are not perfectly uniform.
    */

    const base =
      ctx.createRadialGradient(

        -normW * 0.20,
        -normH * 0.28,
        0,

        0,
        0,
        normMax * 0.82

      );


    base.addColorStop(
      0,
      "#ffe89a"
    );

    base.addColorStop(
      0.18,
      "#e8bd3f"
    );

    base.addColorStop(
      0.48,
      "#c78b12"
    );

    base.addColorStop(
      0.77,
      "#9b6208"
    );

    base.addColorStop(
      1,
      "#633b05"
    );


    ctx.fillStyle =
      base;

    ctx.fillRect(

      -normW,

      -normH,

      normW * 2,

      normH * 2

    );


    // ----------------------------------------------------------
    // translucent amber interior
    // ----------------------------------------------------------

    const amber =
      ctx.createLinearGradient(

        -normW * 0.6,
        -normH * 0.5,

        normW * 0.5,
        normH * 0.7

      );


    amber.addColorStop(
      0,
      "rgba(255,226,120,.42)"
    );

    amber.addColorStop(
      0.35,
      "rgba(255,177,18,.10)"
    );

    amber.addColorStop(
      0.72,
      "rgba(104,55,0,.20)"
    );

    amber.addColorStop(
      1,
      "rgba(40,20,0,.45)"
    );


    ctx.fillStyle =
      amber;

    ctx.fillRect(

      -normW,

      -normH,

      normW * 2,

      normH * 2

    );


    // ==========================================================
    // 4. INTERNAL FACETS
    // ==========================================================

    /*
      These polygons are not meant to change the actual
      outline. They imitate a hand-cut, uneven glass surface.
    */


    ctx.globalCompositeOperation =
      "screen";


    ctx.fillStyle =
      "rgba(255,243,184,.13)";

    ctx.beginPath();

    ctx.moveTo(
      -normW * 0.50,
      -normH * 0.45
    );

    ctx.lineTo(
      normW * 0.05,
      -normH * 0.48
    );

    ctx.lineTo(
      normW * 0.24,
      normH * 0.03
    );

    ctx.lineTo(
      -normW * 0.14,
      normH * 0.16
    );

    ctx.closePath();

    ctx.fill();


    ctx.fillStyle =
      "rgba(255,255,220,.08)";

    ctx.beginPath();

    ctx.moveTo(
      normW * 0.05,
      -normH * 0.48
    );

    ctx.lineTo(
      normW * 0.48,
      -normH * 0.22
    );

    ctx.lineTo(
      normW * 0.31,
      normH * 0.22
    );

    ctx.lineTo(
      normW * 0.24,
      normH * 0.03
    );

    ctx.closePath();

    ctx.fill();


    ctx.globalCompositeOperation =
      "multiply";


    ctx.fillStyle =
      "rgba(82,41,0,.20)";

    ctx.beginPath();

    ctx.moveTo(
      -normW * 0.48,
      normH * 0.05
    );

    ctx.lineTo(
      -normW * 0.14,
      normH * 0.16
    );

    ctx.lineTo(
      normW * 0.22,
      normH * 0.46
    );

    ctx.lineTo(
      -normW * 0.34,
      normH * 0.42
    );

    ctx.closePath();

    ctx.fill();


    ctx.globalCompositeOperation =
      "source-over";


    // ==========================================================
    // 5. SMALL GLASS IMPERFECTIONS
    // ==========================================================

    ctx.fillStyle =
      "rgba(90,48,5,.18)";

    ctx.beginPath();

    ctx.arc(

      normW * 0.12,

      normH * 0.17,

      normMax * 0.035,

      0,

      Math.PI * 2

    );

    ctx.fill();


    ctx.fillStyle =
      "rgba(255,248,209,.20)";

    ctx.beginPath();

    ctx.arc(

      -normW * 0.21,

      -normH * 0.12,

      normMax * 0.022,

      0,

      Math.PI * 2

    );

    ctx.fill();


    ctx.restore();


    // ==========================================================
    // 6. IRREGULAR BEVEL EDGE
    // ==========================================================

    ctx.save();

    ctx.scale(
      scale,
      scale
    );


    ctx.strokeStyle =
      "rgba(63,34,3,.80)";

    ctx.lineWidth =
      normMax *
      0.055;

    ctx.lineJoin =
      "round";

    ctx.stroke(
      stone.path
    );


    ctx.strokeStyle =
      "rgba(255,225,122,.42)";

    ctx.lineWidth =
      normMax *
      0.018;

    ctx.stroke(
      stone.path
    );


    ctx.restore();


    // ==========================================================
    // 7. HARD SPECULAR REFLECTION
    // ==========================================================

    ctx.save();

    ctx.scale(
      scale,
      scale
    );

    ctx.clip(
      stone.path
    );


    const shine =
      ctx.createLinearGradient(

        -normW * 0.55,
        -normH * 0.55,

        normW * 0.25,
        normH * 0.22

      );


    shine.addColorStop(
      0,
      "rgba(255,255,255,.00)"
    );

    shine.addColorStop(
      0.34,
      "rgba(255,255,255,.08)"
    );

    shine.addColorStop(
      0.47,
      "rgba(255,255,255,.52)"
    );

    shine.addColorStop(
      0.56,
      "rgba(255,255,255,.13)"
    );

    shine.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );


    ctx.fillStyle =
      shine;


    ctx.rotate(
      -0.16
    );


    ctx.fillRect(

      -normW * 0.8,

      -normH * 0.85,

      normW * 1.6,

      normH * 0.42

    );


    ctx.restore();


    // ==========================================================
    // 8. SMALL SHARP GLINT
    // ==========================================================

    ctx.save();

    ctx.scale(
      scale,
      scale
    );

    ctx.clip(
      stone.path
    );


    ctx.strokeStyle =
      "rgba(255,255,238,.82)";

    ctx.lineWidth =
      normMax *
      0.026;

    ctx.lineCap =
      "round";


    ctx.beginPath();

    ctx.moveTo(

      -normW * 0.34,

      -normH * 0.28

    );

    ctx.lineTo(

      -normW * 0.03,

      -normH * 0.39

    );

    ctx.stroke();


    ctx.strokeStyle =
      "rgba(255,255,255,.24)";

    ctx.lineWidth =
      normMax *
      0.012;


    ctx.beginPath();

    ctx.moveTo(

      -normW * 0.29,

      -normH * 0.21

    );

    ctx.lineTo(

      normW * 0.20,

      -normH * 0.30

    );

    ctx.stroke();


    ctx.restore();


    ctx.restore();
  }


  // ============================================================
  // ASSEMBLY
  // ============================================================

  function drawAssembly(
    progress,
    rect
  ) {

    for (
      let i = 0;
      i < BUCKET_COUNT;
      i++
    ) {

      const bucket =
        buckets[i];

      if (
        bucket.stones.length === 0
      ) {

        continue;
      }


      // --------------------------------------------------------
      // whole bucket settled
      // --------------------------------------------------------

      if (
        progress >=
        bucket.maxEnd
      ) {

        ctx.drawImage(

          bucketCanvases[i],

          rect.x,
          rect.y,

          rect.w,
          rect.h

        );

        continue;
      }


      // --------------------------------------------------------
      // bucket hasn't started
      // --------------------------------------------------------

      if (
        progress <
        bucket.minStart
      ) {

        continue;
      }


      // --------------------------------------------------------
      // partially active bucket
      // --------------------------------------------------------

      for (
        const stone
        of bucket.stones
      ) {

        if (
          progress <
          stone.start
        ) {

          continue;
        }

        if (
          progress >=
          stone.end
        ) {

          drawFinalStone(
            stone,
            rect
          );

          continue;
        }

        drawMovingStone(

          stone,

          progress,

          rect

        );
      }
    }
  }


  // ============================================================
  // HERO
  // ============================================================

  function drawHero(
    progress,
    rect
  ) {

    if (!hero) {

      return;
    }


    const settle =

      smooth(
        0.03,
        0.18,
        progress
      );


    const target =
      toScreen(
        hero,
        rect
      );


    const x =

      W / 2 +

      (
        target[0] -
        W / 2
      )

      *

      settle;


    const y =

      H / 2 +

      (
        target[1] -
        H / 2
      )

      *

      settle;


    /*
      Large opening stone.
      Slowly shrinks until it becomes
      the actual tessera.
    */

    const largeSize =
      Math.min(
        W,
        H
      ) *
      0.135;


    // natural approximate screen size
    let minPX =
      Infinity;

    let maxPX =
      -Infinity;

    let minPY =
      Infinity;

    let maxPY =
      -Infinity;


    for (
      const p
      of hero.polygon
    ) {

      const px =
        p[0] *
        rect.w;

      const py =
        p[1] *
        rect.h;


      minPX =
        Math.min(
          minPX,
          px
        );

      maxPX =
        Math.max(
          maxPX,
          px
        );


      minPY =
        Math.min(
          minPY,
          py
        );

      maxPY =
        Math.max(
          maxPY,
          py
        );
    }


    const naturalSize =
      Math.max(

        3,

        maxPX -
        minPX,

        maxPY -
        minPY

      );


    const currentSize =

      largeSize +

      (
        naturalSize -
        largeSize
      )

      *

      settle;


    const rotation =

      (
        1 -
        settle
      )

      *

      0.18;


    /*
      Use the physical renderer while the tessera
      is large enough for those details to matter.
    */

    if (
      settle <
      0.92
    ) {

      drawPhysicalHeroStone(

        hero,

        x,
        y,

        currentSize,

        rotation,

        1

      );

    } else {

      /*
        Near the end cross naturally into
        normal mosaic rendering.
      */

      const physicalAlpha =
        1 -
        smooth(
          0.92,
          1,
          settle
        );


      if (
        physicalAlpha >
        0
      ) {

        drawPhysicalHeroStone(

          hero,

          x,
          y,

          currentSize,

          rotation,

          physicalAlpha

        );
      }


      const finalAlpha =

        smooth(
          0.92,
          1,
          settle
        );


      drawFinalStone(

        hero,

        rect,

        finalAlpha

      );
    }
  }


  // ============================================================
  // HERO FINAL
  // ============================================================

  function drawHeroFinal(
    rect
  ) {

    if (!hero) {

      return;
    }

    drawFinalStone(
      hero,
      rect
    );
  }


  // ============================================================
  // TEXT
  // ============================================================

  function updateText(
    progress
  ) {

    if (
      progress <
      0.12
    ) {

      step.textContent =
        "01 · TESSERA";

      kicker.textContent =
        "One tessera";

      title.textContent =
        "Everything begins with one stone.";

      desc.textContent =
        "One hand-cut glass tessera — irregular, reflective, and never perfectly flat.";

      copy.style.opacity =

        String(

          1 -

          smooth(
            0.08,
            0.12,
            progress
          )
        );

      return;
    }


    if (
      progress <
      0.50
    ) {

      step.textContent =
        "02 · ASSEMBLY";

      kicker.textContent =
        "Stone by stone";

      title.textContent =
        "The mosaic begins to assemble.";

      desc.textContent =
        "Each tessera gradually returns to its place in the pattern.";

      copy.style.opacity =

        String(

          smooth(
            0.16,
            0.22,
            progress
          )

          *

          (
            1 -

            smooth(
              0.40,
              0.47,
              progress
            )
          )
        );

      return;
    }


    if (
      progress <
      0.82
    ) {

      step.textContent =
        "03 · FIELD";

      kicker.textContent =
        "Pattern expands";

      title.textContent =
        "The field emerges.";

      desc.textContent =
        "Thousands of individual glass pieces reveal the larger ornament.";

      copy.style.opacity =

        String(

          smooth(
            0.55,
            0.62,
            progress
          )

          *

          (
            1 -

            smooth(
              0.72,
              0.79,
              progress
            )
          )
        );

      return;
    }


    step.textContent =
      "04 · MOSAIC";

    kicker.textContent =
      "Complete";

    title.textContent =
      "The mosaic is assembled.";

    desc.textContent =
      "Thousands of tesserae settle into their final positions.";

    copy.style.opacity =

      String(

        smooth(
          0.87,
          0.94,
          progress
        )
      );
  }


  // ============================================================
  // MAIN RENDER
  // ============================================================

  function render(
    force = false
  ) {

    scheduled =
      false;

    if (!DATA) {

      return;
    }

    const maxScroll =

      document.documentElement.scrollHeight -

      innerHeight;


    const progress =

      maxScroll > 0

        ?

        scrollY /
        maxScroll

        :

        0;


    if (

      !force &&

      Math.abs(

        progress -

        lastProgress

      )

      <

      0.0008

    ) {

      return;
    }


    lastProgress =
      progress;


    ctx.fillStyle =
      "#000";


    ctx.fillRect(

      0,
      0,

      W,
      H

    );


    const rect =
      getRect(
        progress
      );


    drawAssembly(

      progress,

      rect

    );


    if (
      progress <
      0.18
    ) {

      drawHero(

        progress,

        rect

      );

    } else {

      drawHeroFinal(
        rect
      );
    }


    updateText(
      progress
    );


    if (bar) {

      bar.style.width =

        (
          progress *
          100
        )

        +

        "%";
    }
  }


  // ============================================================
  // RAF
  // ============================================================

  function requestDraw(
    force = false
  ) {

    if (force) {

      requestAnimationFrame(
        () =>
          render(true)
      );

      return;
    }


    if (
      scheduled
    ) {

      return;
    }


    scheduled =
      true;


    requestAnimationFrame(

      () =>
        render(false)

    );
  }


  // ============================================================
  // EVENTS
  // ============================================================

  addEventListener(

    "scroll",

    () =>
      requestDraw(false),

    {
      passive: true
    }

  );


  addEventListener(

    "resize",

    resize,

    {
      passive: true
    }

  );


  // ============================================================
  // START
  // ============================================================

  loadData()

    .catch(
      (error) => {

        console.error(
          error
        );


        if (loading) {

          loading.innerHTML = `

            <strong>
              Не удалось загрузить 04_mosaic_ultra.json
            </strong>

            <br><br>

            Запусти проект через
            VS Code → Live Server.

            <br><br>

            <small>
              ${error.message}
            </small>

          `;
        }
      }
    );

})();