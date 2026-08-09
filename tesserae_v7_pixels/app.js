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
        Math.min(
          b,
          v
        )
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

  /*
    Squares are much cheaper to draw than polygons,
    but keep DPR=1 for smooth scrolling with 30k+ tesserae.
  */

  const DPR = 1;


  /*
    More buckets =
    fewer individual squares being animated
    at exactly the same moment.
  */

  const BUCKET_COUNT = 36;


  /*
    Cached mosaic layers.
  */

  const CACHE_WIDTH = 1800;

  let CACHE_HEIGHT = 1200;


  // ============================================================
  // PIXEL / TESSELLA STYLE
  // ============================================================

  /*
    1.00 = size based directly on detected tessera bbox.

    >1 fills gaps more aggressively.
    <1 creates more grout/black space.

    1.08 is useful because our OpenCV contours
    sometimes slightly underestimate a tessera.
  */

  const SQUARE_SIZE_MULTIPLIER = 1.0;

  const MIN_SIZE_FACTOR = 0.50;

  const MAX_SIZE_FACTOR = 1.45;


  /*
    Rotation of final tessera squares.

    0 = strict pixel grid aesthetic.

    A small value makes them read more as
    hand-placed mosaic tesserae.
  */

  const FINAL_ROTATION =
    0.055;


  /*
    Set true for slightly more physical tiny tesserae.

    False = pure flat pixel-art.
  */

  const MINI_BEVEL =
    true;


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


  let lastProgress =
    -1;

  let scheduled =
    false;


  let medianStoneSize =
    0.008;


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
      !Array.isArray(
        DATA.tesserae
      )
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

    const prepared =
      [];


    const sizeSamples =
      [];


    for (
      const t
      of DATA.tesserae
    ) {

      if (
        !t.normalized ||
        !t.normalized.center
      ) {

        continue;
      }


      const cx =
        t.normalized.center.x;

      const cy =
        t.normalized.center.y;


      // ========================================================
      // DETERMINE SQUARE SIZE
      // ========================================================

      let size =
        null;


      /*
        BEST CASE:
        use normalized bbox.

        We deliberately turn width × height
        into ONE square side length.
      */

      if (
        t.normalized.bbox
      ) {

        const bw =
          t.normalized.bbox.width;

        const bh =
          t.normalized.bbox.height;


        /*
          Geometric mean.

          A long weird contour won't become
          a huge rectangle; it becomes a
          sensible square of similar area.
        */

        size =
          Math.sqrt(
            Math.max(
              0.00000001,
              bw * bh
            )
          );
      }


      /*
        Fallback:
        estimate from polygon bounding box.
      */

      if (
        !size &&
        Array.isArray(
          t.normalized.polygon
        ) &&
        t.normalized.polygon.length >= 3
      ) {

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
          of t.normalized.polygon
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


        const bw =
          maxX -
          minX;

        const bh =
          maxY -
          minY;


        size =
          Math.sqrt(
            Math.max(
              0.00000001,
              bw * bh
            )
          );
      }


      if (!size) {

        continue;
      }


      sizeSamples.push(
        size
      );


      prepared.push({
        source:
          t,

        cx,

        cy,

        rawSize:
          size
      });
    }


    // ==========================================================
    // MEDIAN SIZE
    // ==========================================================

    const sorted =
      [...sizeSamples]
        .sort(
          (a, b) =>
            a - b
        );


    medianStoneSize =

      sorted.length

        ?

        sorted[
          Math.floor(
            sorted.length /
            2
          )
        ]

        :

        0.008;


    console.log(
      "Median tessera size:",
      medianStoneSize
    );


    // ==========================================================
    // FINAL RUNTIME OBJECTS
    // ==========================================================

    stones =
      prepared.map(
        ({
          source: t,
          cx,
          cy,
          rawSize
        }) => {


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


          // deterministic pseudo random
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


          // ====================================================
          // REMOVE ABSURD SIZE OUTLIERS
          // ====================================================

          const minimum =
            medianStoneSize *
            MIN_SIZE_FACTOR;


          const maximum =
            medianStoneSize *
            MAX_SIZE_FACTOR;


          const size =
            clamp(
              rawSize,
              minimum,
              maximum
            )

            *

            SQUARE_SIZE_MULTIPLIER;


          // ====================================================
          // ARRIVAL TIMING
          // ====================================================

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

            size,

            radial,

            angle,


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


            flyRotation:

              (
                rand(3) -
                0.5
              )

              *

              1.2,


            /*
              Tiny final variation.

              Still square — only rotated.
            */

            finalRotation:

              (
                rand(7) -
                0.5
              )

              *

              FINAL_ROTATION,


            scaleJitter:

              0.94 +

              rand(4) *
              0.12,


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

        `${stones.length.toLocaleString("ru-RU")} square tesserae`;
    }


    console.log(
      "Prepared square tesserae:",
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
  // DRAW ONE SMALL SQUARE
  // ============================================================

  function drawSquare(
    targetCtx,
    stone,
    x,
    y,
    pixelSize,
    rotation = 0,
    alpha = 1,
    physical = false
  ) {

    targetCtx.save();


    targetCtx.globalAlpha =
      alpha;


    targetCtx.translate(
      x,
      y
    );


    targetCtx.rotate(
      rotation
    );


    const half =
      pixelSize /
      2;


    // ==========================================================
    // PHYSICAL MINI TESSELLA
    // ==========================================================

    if (
      physical &&
      pixelSize >= 3
    ) {

      /*
        Slight dark side.
      */

      const depth =
        Math.max(
          0.7,
          pixelSize *
          0.09
        );


      targetCtx.fillStyle =
        "rgba(0,0,0,.58)";


      targetCtx.fillRect(

        -half +
        depth,

        -half +
        depth,

        pixelSize,

        pixelSize

      );


      /*
        Main colour.
      */

      targetCtx.fillStyle =
        stone.color;


      targetCtx.fillRect(

        -half,

        -half,

        pixelSize,

        pixelSize

      );


      /*
        Top/left reflected edge.
      */

      targetCtx.fillStyle =
        "rgba(255,255,255,.14)";


      targetCtx.fillRect(

        -half,

        -half,

        pixelSize,

        Math.max(
          0.5,
          pixelSize *
          0.08
        )

      );


      targetCtx.fillRect(

        -half,

        -half,

        Math.max(
          0.5,
          pixelSize *
          0.07
        ),

        pixelSize

      );


      /*
        Bottom/right depth.
      */

      targetCtx.fillStyle =
        "rgba(0,0,0,.16)";


      targetCtx.fillRect(

        -half,

        half -
        pixelSize *
        0.10,

        pixelSize,

        pixelSize *
        0.10

      );


      targetCtx.fillRect(

        half -
        pixelSize *
        0.08,

        -half,

        pixelSize *
        0.08,

        pixelSize

      );

    }

    // ==========================================================
    // PURE PIXEL
    // ==========================================================

    else {

      targetCtx.fillStyle =
        stone.color;


      targetCtx.fillRect(

        -half,

        -half,

        pixelSize,

        pixelSize

      );
    }


    targetCtx.restore();
  }


  // ============================================================
  // CACHE BUCKETS
  // ============================================================

  function buildBucketCanvases() {

    bucketCanvases =
      [];


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

        /*
          Stone.size is normalized approximately
          against source width/height.

          Convert it to cache pixels.
        */

        const pixelSize =

          stone.size *

          Math.sqrt(
            CACHE_WIDTH *
            CACHE_HEIGHT
          );


        drawSquare(

          lctx,

          stone,

          stone.cx *
          CACHE_WIDTH,

          stone.cy *
          CACHE_HEIGHT,

          pixelSize,

          stone.finalRotation,

          1,

          MINI_BEVEL

        );
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
  // CAMERA
  // ============================================================

  // ============================================================
// CAMERA — FULL BLEED / OBJECT-FIT: COVER
// ============================================================

function getRect(progress) {

  const sourceAspect =
    DATA.meta.image_width /
    DATA.meta.image_height;

  const screenAspect =
    W / H;


  let drawW;
  let drawH;


  /*
    FULL BLEED:

    Landscape / relatively wide screen:
    mosaic always fills 100% of WIDTH.

    If necessary, part of top/bottom
    goes outside viewport.
  */

  if (
    screenAspect >=
    sourceAspect
  ) {

    drawW =
      W;

    drawH =
      W /
      sourceAspect;

  }

  /*
    Portrait / mobile:

    mosaic always fills 100% of HEIGHT.

    If necessary, part of left/right
    goes outside viewport.
  */

  else {

    drawH =
      H;

    drawW =
      H *
      sourceAspect;

  }


  /*
    Keep mosaic centred.

    Negative x/y is completely OK:
    it simply means part of mosaic
    is cropped outside the viewport.
  */

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
  // SCREEN COORDINATES
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
  // FINAL SQUARE
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


    /*
      Use geometric scaling so squares STAY squares
      even though source image itself isn't square.
    */

    const baseScale =
      Math.sqrt(
        rect.w *
        rect.h
      );


    const pixelSize =
      stone.size *
      baseScale;


    drawSquare(

      ctx,

      stone,

      target[0],

      target[1],

      pixelSize,

      stone.finalRotation,

      alpha,

      MINI_BEVEL

    );
  }


  // ============================================================
  // MOVING SQUARE
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


    const baseScale =
      Math.sqrt(
        rect.w *
        rect.h
      );


    const naturalSize =
      stone.size *
      baseScale;


    const pixelSize =

      naturalSize *

      stone.scaleJitter *

      (
        0.60 +

        0.40 *
        t
      );


    const rotation =

      stone.flyRotation *

      (
        1 -
        t
      )

      +

      stone.finalRotation *
      t;


    /*
      No physical mini bevel during flight.

      Cheaper and visually cleaner.
    */

    drawSquare(

      ctx,

      stone,

      x,

      y,

      pixelSize,

      rotation,

      t,

      false

    );
  }


  // ============================================================
  // PHYSICAL 3D HERO SQUARE
  // ============================================================

  function drawPhysicalHeroSquare(
    stone,
    x,
    y,
    size,
    rotation,
    alpha = 1
  ) {

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


    const half =
      size /
      2;


    /*
      The tessera remains LITERALLY SQUARE.

      All physicality is created inside
      that square and through side faces.
    */


    // ==========================================================
    // 1. CONTACT SHADOW
    // ==========================================================

    ctx.save();


    ctx.shadowColor =
      "rgba(0,0,0,.95)";


    ctx.shadowBlur =
      size *
      0.22;


    ctx.shadowOffsetX =
      size *
      0.07;


    ctx.shadowOffsetY =
      size *
      0.10;


    ctx.fillStyle =
      "rgba(0,0,0,.55)";


    ctx.fillRect(

      -half,

      -half,

      size,

      size

    );


    ctx.restore();


    // ==========================================================
    // 2. RIGHT SIDE FACE
    // ==========================================================

    const depth =
      size *
      0.10;


    const rightFace =
      ctx.createLinearGradient(

        half,
        0,

        half +
        depth,
        0

      );


    rightFace.addColorStop(
      0,
      "#85520b"
    );


    rightFace.addColorStop(
      1,
      "#332006"
    );


    ctx.fillStyle =
      rightFace;


    ctx.beginPath();


    ctx.moveTo(
      half,
      -half
    );


    ctx.lineTo(
      half +
      depth,
      -half +
      depth
    );


    ctx.lineTo(
      half +
      depth,
      half +
      depth
    );


    ctx.lineTo(
      half,
      half
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 3. BOTTOM SIDE FACE
    // ==========================================================

    const bottomFace =
      ctx.createLinearGradient(

        0,
        half,

        0,
        half +
        depth

      );


    bottomFace.addColorStop(
      0,
      "#734407"
    );


    bottomFace.addColorStop(
      1,
      "#291703"
    );


    ctx.fillStyle =
      bottomFace;


    ctx.beginPath();


    ctx.moveTo(
      -half,
      half
    );


    ctx.lineTo(
      half,
      half
    );


    ctx.lineTo(
      half +
      depth,
      half +
      depth
    );


    ctx.lineTo(
      -half +
      depth,
      half +
      depth
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 4. MAIN GLASS FACE
    // ==========================================================

    const glass =
      ctx.createLinearGradient(

        -half,
        -half,

        half,
        half

      );


    glass.addColorStop(
      0,
      "#fff1a6"
    );


    glass.addColorStop(
      0.17,
      "#e7bc40"
    );


    glass.addColorStop(
      0.43,
      "#c68b13"
    );


    glass.addColorStop(
      0.72,
      "#b0700a"
    );


    glass.addColorStop(
      1,
      "#714307"
    );


    ctx.fillStyle =
      glass;


    ctx.fillRect(

      -half,

      -half,

      size,

      size

    );


    // ==========================================================
    // 5. UNEVEN GLASS BODY
    // ==========================================================

    const glow =
      ctx.createRadialGradient(

        -size * 0.18,

        -size * 0.22,

        0,

        -size * 0.05,

        -size * 0.05,

        size * 0.74

      );


    glow.addColorStop(
      0,
      "rgba(255,245,183,.60)"
    );


    glow.addColorStop(
      0.28,
      "rgba(255,196,54,.20)"
    );


    glow.addColorStop(
      0.72,
      "rgba(125,68,3,.12)"
    );


    glow.addColorStop(
      1,
      "rgba(39,20,0,.30)"
    );


    ctx.fillStyle =
      glow;


    ctx.fillRect(

      -half,

      -half,

      size,

      size

    );


    // ==========================================================
    // 6. LARGE FACET 1
    // ==========================================================

    ctx.fillStyle =
      "rgba(255,255,215,.13)";


    ctx.beginPath();


    ctx.moveTo(
      -half,
      -half
    );


    ctx.lineTo(
      size * 0.12,
      -half
    );


    ctx.lineTo(
      size * 0.20,
      size * 0.06
    );


    ctx.lineTo(
      -size * 0.14,
      size * 0.13
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 7. FACET 2
    // ==========================================================

    ctx.fillStyle =
      "rgba(80,39,0,.16)";


    ctx.beginPath();


    ctx.moveTo(
      -half,
      size * 0.02
    );


    ctx.lineTo(
      -size * 0.14,
      size * 0.13
    );


    ctx.lineTo(
      size * 0.18,
      half
    );


    ctx.lineTo(
      -half,
      half
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 8. FACET 3
    // ==========================================================

    ctx.fillStyle =
      "rgba(255,231,133,.10)";


    ctx.beginPath();


    ctx.moveTo(
      size * 0.12,
      -half
    );


    ctx.lineTo(
      half,
      -half
    );


    ctx.lineTo(
      half,
      size * 0.11
    );


    ctx.lineTo(
      size * 0.20,
      size * 0.06
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 9. DARK MICRO EDGE
    // ==========================================================

    ctx.strokeStyle =
      "rgba(61,34,3,.82)";


    ctx.lineWidth =
      Math.max(
        1,
        size *
        0.025
      );


    ctx.strokeRect(

      -half,

      -half,

      size,

      size

    );


    // ==========================================================
    // 10. TOP BEVEL
    // ==========================================================

    const bevelSize =
      size *
      0.045;


    ctx.fillStyle =
      "rgba(255,250,205,.34)";


    ctx.beginPath();


    ctx.moveTo(
      -half,
      -half
    );


    ctx.lineTo(
      half,
      -half
    );


    ctx.lineTo(
      half -
      bevelSize,
      -half +
      bevelSize
    );


    ctx.lineTo(
      -half +
      bevelSize,
      -half +
      bevelSize
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 11. LEFT BEVEL
    // ==========================================================

    ctx.fillStyle =
      "rgba(255,238,160,.17)";


    ctx.beginPath();


    ctx.moveTo(
      -half,
      -half
    );


    ctx.lineTo(
      -half +
      bevelSize,
      -half +
      bevelSize
    );


    ctx.lineTo(
      -half +
      bevelSize,
      half -
      bevelSize
    );


    ctx.lineTo(
      -half,
      half
    );


    ctx.closePath();

    ctx.fill();


    // ==========================================================
    // 12. SPECULAR BAND
    // ==========================================================

    ctx.save();


    ctx.beginPath();

    ctx.rect(
      -half,
      -half,
      size,
      size
    );

    ctx.clip();


    ctx.rotate(
      -0.24
    );


    const shine =
      ctx.createLinearGradient(

        -size * 0.6,
        0,

        size * 0.50,
        0

      );


    shine.addColorStop(
      0,
      "rgba(255,255,255,0)"
    );


    shine.addColorStop(
      0.40,
      "rgba(255,255,255,.03)"
    );


    shine.addColorStop(
      0.49,
      "rgba(255,255,255,.56)"
    );


    shine.addColorStop(
      0.56,
      "rgba(255,255,255,.12)"
    );


    shine.addColorStop(
      1,
      "rgba(255,255,255,0)"
    );


    ctx.fillStyle =
      shine;


    ctx.fillRect(

      -size,

      -size * 0.54,

      size * 2,

      size * 0.42

    );


    ctx.restore();


    // ==========================================================
    // 13. SHARP GLINT
    // ==========================================================

    ctx.strokeStyle =
      "rgba(255,255,239,.85)";


    ctx.lineWidth =
      Math.max(
        1,
        size *
        0.018
      );


    ctx.lineCap =
      "round";


    ctx.beginPath();


    ctx.moveTo(

      -size * 0.31,

      -size * 0.29

    );


    ctx.lineTo(

      size * 0.08,

      -size * 0.37

    );


    ctx.stroke();


    // ==========================================================
    // 14. SMALL GLASS IMPERFECTIONS
    // ==========================================================

    ctx.fillStyle =
      "rgba(65,34,2,.22)";


    ctx.beginPath();


    ctx.arc(

      size * 0.17,

      size * 0.13,

      size * 0.025,

      0,

      Math.PI * 2

    );


    ctx.fill();


    ctx.fillStyle =
      "rgba(255,250,214,.24)";


    ctx.beginPath();


    ctx.arc(

      -size * 0.19,

      -size * 0.07,

      size * 0.018,

      0,

      Math.PI * 2

    );


    ctx.fill();


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


      // ========================================================
      // FULL BUCKET IS SETTLED
      // ========================================================

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


      // ========================================================
      // BUCKET NOT STARTED
      // ========================================================

      if (
        progress <
        bucket.minStart
      ) {

        continue;
      }


      // ========================================================
      // PARTIALLY ACTIVE
      // ========================================================

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


    const largeSize =

      Math.min(
        W,
        H
      )

      *

      0.14;


    const baseScale =
      Math.sqrt(
        rect.w *
        rect.h
      );


    const naturalSize =

      hero.size *

      baseScale;


    const size =

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

      0.16

      +

      hero.finalRotation *
      settle;


    /*
      Physical square at large scale.

      As it approaches mosaic scale,
      fade into normal pixel-art square.
    */

    if (
      settle <
      0.88
    ) {

      drawPhysicalHeroSquare(

        hero,

        x,

        y,

        size,

        rotation,

        1

      );

    } else {

      const physicalAlpha =

        1 -

        smooth(
          0.88,
          1,
          settle
        );


      if (
        physicalAlpha >
        0
      ) {

        drawPhysicalHeroSquare(

          hero,

          x,

          y,

          size,

          rotation,

          physicalAlpha

        );
      }


      const finalAlpha =

        smooth(
          0.88,
          1,
          settle
        );


      drawSquare(

        ctx,

        hero,

        x,

        y,

        size,

        rotation,

        finalAlpha,

        MINI_BEVEL

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
        "One square of glass.";


      desc.textContent =
        "A single tessera becomes the smallest unit of the image.";


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
        "Pixel by pixel";


      title.textContent =
        "The mosaic begins to assemble.";


      desc.textContent =
        "Every detected tessera is reduced to a square carrying its position, scale and colour.";


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
        "From tessera to image";


      title.textContent =
        "Thousands of squares become an ornament.";


      desc.textContent =
        "The geometry is simplified, while the original spatial and colour information remains.";


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
      "Pixel mosaic";


    title.textContent =
      "The image emerges.";


    desc.textContent =
      "A digital mosaic reconstructed from the centres and colours of individual tesserae.";


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
  // RENDER
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

            Запусти через VS Code → Live Server.

            <br><br>

            <small>
              ${error.message}
            </small>

          `;
        }
      }
    );

})();