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

  /*
    Retina 2x / 3x dramatically increases
    number of pixels browser must render.

    For moving tiny tesserae DPR=1 is enough.
  */

  const DPR = 1;


  /*
    More buckets =
    fewer animated stones per bucket,
    but more cached canvases.

    32 is a good balance.
  */

  const BUCKET_COUNT = 32;


  /*
    Cached full mosaic resolution.

    This DOES NOT have to be 4604px.
    Browser later scales cached layers.
  */

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


            // --------------------------------------------
            // deterministic pseudo-random
            // --------------------------------------------

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
            // PRECOMPUTE PATH2D
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
            // ARRIVAL TIMING
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


            /*
              Slightly longer transition makes
              the assembly flow softer.
            */

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


    /*
      Important:

      bucket chosen by START time.
      But each bucket also remembers
      actual maximum END time.

      So we know exactly when it is safe
      to switch whole bucket to bitmap.
    */

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


    console.log(
      "Buckets:",
      buckets.map(
        b => b.stones.length
      )
    );
  }


  // ============================================================
  // BUILD STATIC CACHE
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


        /*
          Path is normalized relative
          to stone center.
        */

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


    console.log(
      "Cached layers:",
      bucketCanvases.length
    );
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
  // MOSAIC CAMERA RECT
  // ============================================================

  function getRect(
    progress
  ) {

    const aspect =

      DATA.meta.image_width /

      DATA.meta.image_height;


    /*
      Slow pull-back.
    */

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
  // DRAW FINAL TESSELLA
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
  // DRAW MOVING TESSELLA
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


    // --------------------------------------------
    // Start outside composition
    // --------------------------------------------

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


    /*
      NO stroke during movement.

      Saves lots of rasterization.
    */

    ctx.fill(
      stone.path
    );


    ctx.restore();
  }


  // ============================================================
  // DRAW BUCKETS
  //
  // THIS IS THE IMPORTANT FIX
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
      // STATE A:
      // entire bucket is settled
      // ========================================================

      if (
        progress >=
        bucket.maxEnd
      ) {

        /*
          Safe now:

          EVERY tessera of this bucket
          has completed its animation.

          So bitmap exactly replaces
          all those individual stones.
        */

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
      // STATE B:
      // bucket hasn't started yet
      // ========================================================

      if (
        progress <
        bucket.minStart
      ) {

        continue;
      }


      // ========================================================
      // STATE C:
      // partially active bucket
      // ========================================================

      /*
        Critical difference from old version:

        settled stones inside this bucket
        REMAIN visible individually.

        They do not disappear while waiting
        for the whole bucket to finish.

        Therefore no black ring.
      */

      for (
        const stone
        of bucket.stones
      ) {

        // Future
        if (
          progress <
          stone.start
        ) {

          continue;
        }


        // Already reached final position
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


        // Currently moving
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
      Hero shrinks from large stone
      to real tessera size.
    */

    const heroScale =

      13 -

      12 *
      settle;


    ctx.save();


    ctx.translate(
      x,
      y
    );


    ctx.rotate(

      (
        1 -
        settle
      )

      *

      0.24

    );


    ctx.scale(

      rect.w *
      heroScale,

      rect.h *
      heroScale

    );


    ctx.fillStyle =
      "#e3b422";


    ctx.fill(
      hero.path
    );


    ctx.restore();
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
        "Прокручивай — камушек занимает своё место.";


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
        "Каждая tessera постепенно занимает своё настоящее место.";


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
        "Орнамент постепенно раскрывается за пределами центральной зоны.";


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
      "Все tesserae заняли свои финальные позиции.";


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


    // ==========================================================
    // CLEAR
    // ==========================================================

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


    // ==========================================================
    // ASSEMBLY
    // ==========================================================

    drawAssembly(

      progress,

      rect

    );


    // ==========================================================
    // HERO
    // ==========================================================

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


    // ==========================================================
    // UI
    // ==========================================================

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