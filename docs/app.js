(() => {
  "use strict";

  // ============================================================
  // DOM
  // ============================================================

  const canvas = document.getElementById("mosaic");

  const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });

  const enterAtlas =
    document.getElementById("enter-atlas");

  const loading = document.getElementById("loading");
  const bar = document.getElementById("bar");
  const title = document.getElementById("title");
  const desc = document.getElementById("desc");
  const copy = document.getElementById("copy");

  const tesseraField = document.getElementById("tessera-field");
  const interlude = document.getElementById("interlude");
  const interludeCopy = document.getElementById("interlude-copy");
  const interludeTitle = document.getElementById("interlude-title");
  const interludeKicker = document.getElementById("interlude-kicker");
  const interludeProgressBar = document.querySelector("#interlude-progress > i");
  const scrollCue = document.getElementById("scroll-cue");


  // ============================================================
  // AMBIENT AUDIO
  // ============================================================

  const ambientAudio = new Audio("./ambient-soundbed.mp3");

  ambientAudio.loop = true;
  ambientAudio.preload = "auto";
  ambientAudio.volume = 0;

  /*
    Final background volume.
    0.08–0.15 works nicely for exhibition ambience.
  */
  const AMBIENT_TARGET_VOLUME = 0.12;

  let ambientStarted = false;
  let ambientFadeFrame = null;


  // ============================================================
  // HELPERS
  // ============================================================

  const clamp = (v, a = 0, b = 1) =>
    Math.max(a, Math.min(b, v));

  const smooth = (a, b, x) => {
    let t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const easeOut = (t) =>
    1 - Math.pow(1 - clamp(t), 4);

  const lerp = (a, b, t) =>
    a + (b - a) * t;

  const hexToRgb = (hex) => {
    const s = String(hex || "").replace("#", "");

    if (s.length !== 6) {
      return {
        r: 127,
        g: 127,
        b: 127
      };
    }

    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16)
    };
  };

  const rgbToHex = (r, g, b) => {
    const to2 = (n) =>
      Math.max(
        0,
        Math.min(
          255,
          Math.round(n)
        )
      )
        .toString(16)
        .padStart(2, "0");

    return `#${to2(r)}${to2(g)}${to2(b)}`;
  };

  const enhanceMosaicColor = (
    r,
    g,
    b
  ) => {
    /*
      Перцептивная яркость исходного цвета.
    */

    const luminance =
      r * 0.2126 +
      g * 0.7152 +
      b * 0.0722;


    /*
      Отдаляем каждый канал от серого:
      насыщенность увеличивается на 25%.
    */

    const saturationBoost =
      1.25;


    r =
      luminance +
      (
        r -
        luminance
      ) *
      saturationBoost;

    g =
      luminance +
      (
        g -
        luminance
      ) *
      saturationBoost;

    b =
      luminance +
      (
        b -
        luminance
      ) *
      saturationBoost;


    /*
      Немного увеличиваем общую яркость
      и мягко поднимаем тёмные оттенки.
    */

    const brightnessBoost =
      1.18;

    const shadowLift =
      4;


    r =
      r *
      brightnessBoost +
      shadowLift;

    g =
      g *
      brightnessBoost +
      shadowLift;

    b =
      b *
      brightnessBoost +
      shadowLift;


    return rgbToHex(
      r,
      g,
      b
    );
  };



  // ============================================================
  // CINEMATIC TESSELLA FIELD
  // ============================================================

  const fieldCtx = tesseraField?.getContext("2d");
  let fieldW = 0;
  let fieldH = 0;
  let fieldDpr = 1;
  let cinematicProgress = 0;
  let pointerX = 0;
  let pointerY = 0;

  const fieldPalette = [
    "#31d7ff",
    "#2367ff",
    "#714dff",
    "#00a8ff",
    "#d0a43c",
    "#89e7ff"
  ];

  const fieldTesserae = Array.from({ length: 150 }, (_, i) => ({
    angle: ((i * 2.399963229728653) + (i % 7) * .13) % (Math.PI * 2),
    depth: ((i * 0.61803398875) % 1),
    size: 5 + ((i * 17) % 9),
    spin: ((i % 11) - 5) * .08,
    drift: (((i * 13) % 17) - 8) * .003,
    color: fieldPalette[i % fieldPalette.length]
  }));

  function resizeField() {
    if (!tesseraField || !fieldCtx) return;
    fieldDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    fieldW = innerWidth;
    fieldH = innerHeight;
    tesseraField.width = Math.round(fieldW * fieldDpr);
    tesseraField.height = Math.round(fieldH * fieldDpr);
    tesseraField.style.width = fieldW + "px";
    tesseraField.style.height = fieldH + "px";
    fieldCtx.setTransform(fieldDpr, 0, 0, fieldDpr, 0, 0);
  }

  window.addEventListener("pointermove", event => {
    pointerX = (event.clientX / innerWidth - .5) * 2;
    pointerY = (event.clientY / innerHeight - .5) * 2;
  }, { passive: true });

  function drawTesseraField(time) {
    if (!fieldCtx || !tesseraField) return;

    fieldCtx.clearRect(0, 0, fieldW, fieldH);

    /*
      Keep the flying tesserae alive well into the mosaic handoff.
      During the last third they decelerate, drift inward and lose
      their neon bloom while the real mosaic cells begin to settle.
      This creates one continuous material transition instead of a cut.
    */
    const active = cinematicProgress > .12 && cinematicProgress < .79;
    if (active) {
      const local = clamp((cinematicProgress - .12) / .67);
      const handoff = smooth(.60, .98, local);
      const cx = fieldW * .5 + pointerX * (34 * (1 - handoff * .7));
      const cy = fieldH * .5 + pointerY * (24 * (1 - handoff * .7));
      const maxRadius = Math.hypot(fieldW, fieldH) * .72;

      for (let i = 0; i < fieldTesserae.length; i++) {
        const t = fieldTesserae[i];
        let z = (t.depth - local * 1.30 - time * .009 + 2) % 1;
        const travel = 1 - z;
        const eased = travel * travel;

        /* pull the star-field gently back toward the image plane */
        const radialCollapse = 1 - handoff * .62;
        const radius = (24 + eased * maxRadius) * radialCollapse;
        const a = t.angle + t.drift * time * (1 - handoff * .72) + pointerX * .04;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius * .72;

        const baseSize = t.size * (.35 + travel * 1.75);
        const size = baseSize * (1 - handoff * .48);
        const travelAlpha = Math.min(1, travel * 1.8) * (1 - smooth(.9, 1, travel));
        const alpha = travelAlpha * (1 - smooth(.70, 1, local));

        fieldCtx.save();
        fieldCtx.translate(x, y);
        fieldCtx.rotate((a + time * t.spin * .05) * (1 - handoff * .72));
        fieldCtx.globalAlpha = alpha * .95;
        fieldCtx.shadowColor = t.color;
        fieldCtx.shadowBlur = (10 + travel * 16) * (1 - handoff * .82);
        fieldCtx.fillStyle = t.color;
        const r = Math.max(1.25, size * (.16 - handoff * .05));
        fieldCtx.beginPath();
        fieldCtx.roundRect(-size/2, -size/2, size, size, r);
        fieldCtx.fill();
        fieldCtx.globalAlpha = alpha * .32;
        fieldCtx.strokeStyle = "rgba(255,255,255,.82)";
        fieldCtx.lineWidth = .7;
        fieldCtx.stroke();
        fieldCtx.restore();
      }
    }

    requestAnimationFrame(ts => drawTesseraField(ts * .001));
  }

  resizeField();
  window.addEventListener("resize", resizeField, { passive: true });
  requestAnimationFrame(ts => drawTesseraField(ts * .001));

  function updateCinematicInterlude(progress) {
    cinematicProgress = progress;

    const start = .10;
    const end = .73;
    const local = clamp((progress - start) / (end - start));
    const visibility = smooth(0, .055, local) * (1 - smooth(.94, 1, local));

    if (interlude) {
      interlude.classList.toggle("is-visible", visibility > .001);
      interlude.style.opacity = String(visibility);
    }
    if (tesseraField) {
      tesseraField.style.opacity = String(visibility);
    }
    if (scrollCue) {
      scrollCue.style.opacity = String(1 - smooth(.015, .055, progress));
    }
    if (interludeProgressBar) {
      interludeProgressBar.style.transform = `scaleX(${local})`;
    }

    const states = [
      [0.00, 0.20, "One piece", "A mosaic begins with a single tessera"],
      [0.20, 0.40, "Becomes a pattern", "Repetition gives matter a rhythm"],
      [0.40, 0.60, "Pattern becomes memory", "Images preserve places, beliefs and power"],
      [0.60, 0.80, "Memory travels", "Techniques move across cities and cultures"],
      [0.80, 1.01, "Across time. Across worlds.", "Follow the itinerary of mosaic"],
    ];

    let state = states[0];
    for (const candidate of states) {
      if (local >= candidate[0] && local < candidate[1]) {
        state = candidate;
        break;
      }
    }

    if (interludeTitle) interludeTitle.textContent = state[2];
    if (interludeKicker) interludeKicker.textContent = state[3];

    if (interludeCopy) {
      const span = state[1] - state[0];
      const stateLocal = clamp((local - state[0]) / span);
      const fade = smooth(.01, .14, stateLocal) * (1 - smooth(.86, .99, stateLocal));
      interludeCopy.style.opacity = String(fade);
      interludeCopy.style.transform = `translateY(${(1 - fade) * 16}px) scale(${.985 + fade * .015})`;
      interludeCopy.style.filter = `blur(${(1 - fade) * 7}px)`;
    }
  }

  // ============================================================
  // SETTINGS
  // ============================================================

  const DPR = 1;

  const BUCKET_COUNT = 36;

  const CACHE_WIDTH = 1800;
  let CACHE_HEIGHT = 1200;

  /*
    1.0 = cells touch.
    <1.0 = visible grout.
  */
  const CELL_FILL = 0.94;

  const SHOW_GRID_GROUT = true;

  const JITTER_BRIGHTNESS = 0.06;

  const GRID_DENSITY_MULTIPLIER = 1.00;


  // ============================================================
  // STATE
  // ============================================================

  let DATA = null;

  let W = 0;
  let H = 0;

  let scheduled = false;
  let lastProgress = -1;

  let cells = [];
  let heroCell = null;

  let gridCols = 0;
  let gridRows = 0;

  let buckets = [];
  let bucketCanvases = [];


  // ============================================================
  // LOAD
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
        "Invalid 04_mosaic_ultra.json structure"
      );
    }


    CACHE_HEIGHT =
      Math.round(
        CACHE_WIDTH *
        DATA.meta.image_height /
        DATA.meta.image_width
      );


    buildPixelGridFromJson();

    buildBuckets();

    buildBucketCanvases();


    if (loading) {

      loading.style.display =
        "none";
    }


    resize();
  }


  // ============================================================
  // GRID SIZE
  // ============================================================

  function computeGridResolution() {

    const count =
      DATA.tesserae.length;


    const aspect =
      DATA.meta.image_width /
      DATA.meta.image_height;


    const approxCells =
      Math.max(
        1000,
        Math.round(
          count *
          GRID_DENSITY_MULTIPLIER
        )
      );


    const cols =
      Math.max(
        24,
        Math.round(
          Math.sqrt(
            approxCells *
            aspect
          )
        )
      );


    const rows =
      Math.max(
        24,
        Math.round(
          approxCells /
          cols
        )
      );


    return {
      cols,
      rows
    };
  }


  // ============================================================
  // BUILD GRID FROM TESSELLA CENTERS
  // ============================================================

  function buildPixelGridFromJson() {

    const {
      cols,
      rows
    } =
      computeGridResolution();


    gridCols =
      cols;

    gridRows =
      rows;


    const rawGrid =
      Array.from(
        {
          length:
            rows *
            cols
        },
        () => ({
          count: 0,
          r: 0,
          g: 0,
          b: 0
        })
      );


    let bestHeroDist =
      Infinity;

    let heroIndex =
      0;


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


      const x =
        t.normalized.center.x;

      const y =
        t.normalized.center.y;


      const col =
        Math.max(
          0,
          Math.min(
            cols - 1,
            Math.floor(
              x *
              cols
            )
          )
        );


      const row =
        Math.max(
          0,
          Math.min(
            rows - 1,
            Math.floor(
              y *
              rows
            )
          )
        );


      const idx =
        row *
        cols +
        col;


      const rgb =
        hexToRgb(
          t.median_hex ||
          t.mean_hex ||
          "#777777"
        );


      rawGrid[idx].count +=
        1;

      rawGrid[idx].r +=
        rgb.r;

      rawGrid[idx].g +=
        rgb.g;

      rawGrid[idx].b +=
        rgb.b;


      const dx =
        (
          col +
          0.5
        ) /
        cols -
        0.5;


      const dy =
        (
          row +
          0.5
        ) /
        rows -
        0.5;


      const d =
        Math.hypot(
          dx,
          dy
        );


      if (
        d <
        bestHeroDist
      ) {

        bestHeroDist =
          d;

        heroIndex =
          idx;
      }
    }


    // ----------------------------------------------------------
    // convert accumulated cells to averaged colour
    // ----------------------------------------------------------

    const tempGrid =
      Array.from(
        {
          length:
            rows *
            cols
        },

        (_, idx) => {

          const cell =
            rawGrid[idx];


          if (
            cell.count >
            0
          ) {

            return {
              filled: true,

              r:
                cell.r /
                cell.count,

              g:
                cell.g /
                cell.count,

              b:
                cell.b /
                cell.count
            };
          }


          return {
            filled: false,
            r: 0,
            g: 0,
            b: 0
          };
        }
      );


    fillEmptyCells(
      tempGrid,
      cols,
      rows
    );


    cells =
      [];


    for (
      let row = 0;
      row < rows;
      row++
    ) {

      for (
        let col = 0;
        col < cols;
        col++
      ) {

        const idx =
          row *
          cols +
          col;


        const c =
          tempGrid[idx];


        const nx =
          (
            col +
            0.5
          ) /
          cols;


        const ny =
          (
            row +
            0.5
          ) /
          rows;


        const dx =
          nx -
          0.5;

        const dy =
          ny -
          0.5;


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


        const rand =
          (n) => {

            const x =
              Math.sin(
                (
                  idx +
                  1
                ) *
                (
                  12.9898 +
                  n *
                  17.371
                )
              ) *
              43758.5453;

            return (
              x -
              Math.floor(x)
            );
          };


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
          0.03;


        const end =
          start +
          0.16;


        let r =
          c.r;

        let g =
          c.g;

        let b =
          c.b;


        const bright =
          1 +
          (
            rand(8) -
            0.5
          ) *
          JITTER_BRIGHTNESS;


        r *= bright;
        g *= bright;
        b *= bright;


        /*
          Цвет из JSON сохраняет исходный оттенок,
          но становится насыщеннее и немного светлее.
        */

        const color =
          enhanceMosaicColor(
            r,
            g,
            b
          );


        cells.push({

          index:
            idx,

          row,
          col,

          nx,
          ny,

          color,

          radial,
          angle,

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
            ) *
            1.15,

          flyRotation:
            (
              rand(3) -
              0.5
            ) *
            1.2,

          bucketIndex:
            0
        });
      }
    }


    const blueHeroCandidates =
  cells.filter(
    cell => {
      const rgb =
        hexToRgb(
          cell.color
        );

      return (
        rgb.b > rgb.r * 1.18 &&
        rgb.b > rgb.g * 1.03 &&
        cell.radial < 0.28
      );
    }
  );


  heroCell =
    blueHeroCandidates.reduce(
      (best, cell) => {
        if (
          !best ||
          cell.radial < best.radial
        ) {
          return cell;
        }

        return best;
      },
      null
    ) ||

    cells.find(
      cell =>
        cell.index ===
        heroIndex
    ) ||

    cells[0];


    


    console.log(
      "Grid:",
      gridCols,
      "x",
      gridRows,
      "cells:",
      cells.length
    );
  }


  // ============================================================
  // HOLE FILL
  // ============================================================

  function fillEmptyCells(
    grid,
    cols,
    rows
  ) {

    const dirs = [

      [-1, -1],
      [0, -1],
      [1, -1],

      [-1, 0],
      [1, 0],

      [-1, 1],
      [0, 1],
      [1, 1]
    ];


    for (
      let pass = 0;
      pass < 6;
      pass++
    ) {

      const next =
        grid.map(
          cell => ({
            ...cell
          })
        );


      let changed =
        0;


      for (
        let row = 0;
        row < rows;
        row++
      ) {

        for (
          let col = 0;
          col < cols;
          col++
        ) {

          const idx =
            row *
            cols +
            col;


          if (
            grid[idx].filled
          ) {

            continue;
          }


          let count =
            0;

          let r =
            0;

          let g =
            0;

          let b =
            0;


          for (
            const [
              dx,
              dy
            ]
            of dirs
          ) {

            const cx =
              col +
              dx;

            const cy =
              row +
              dy;


            if (
              cx < 0 ||
              cx >= cols ||
              cy < 0 ||
              cy >= rows
            ) {

              continue;
            }


            const n =
              grid[
                cy *
                cols +
                cx
              ];


            if (
              !n.filled
            ) {

              continue;
            }


            r +=
              n.r;

            g +=
              n.g;

            b +=
              n.b;

            count++;
          }


          if (
            count >
            0
          ) {

            next[idx] = {

              filled:
                true,

              r:
                r /
                count,

              g:
                g /
                count,

              b:
                b /
                count
            };

            changed++;
          }
        }
      }


      grid.splice(
        0,
        grid.length,
        ...next
      );


      if (
        changed ===
        0
      ) {

        break;
      }
    }


    for (
      const cell
      of grid
    ) {

      if (
        !cell.filled
      ) {

        cell.filled =
          true;

        cell.r =
          22;

        cell.g =
          22;

        cell.b =
          22;
      }
    }
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
          cells: [],
          minStart: Infinity,
          maxEnd: -Infinity
        })
      );


    for (
      const cell
      of cells
    ) {

      if (
        heroCell &&
        cell.index === heroCell.index
      ) {
        continue;
      }

      const bucketIndex =
        Math.min(
          BUCKET_COUNT - 1,
          Math.max(
            0,
            Math.floor(
              cell.start *
              BUCKET_COUNT
            )
          )
        );


      


      cell.bucketIndex =
        bucketIndex;


      const bucket =
        buckets[
          bucketIndex
        ];


      bucket.cells.push(
        cell
      );


      bucket.minStart =
        Math.min(
          bucket.minStart,
          cell.start
        );


      bucket.maxEnd =
        Math.max(
          bucket.maxEnd,
          cell.end
        );
    }
  }


  // ============================================================
  // BUILD CACHE LAYERS
  // ============================================================

  function buildBucketCanvases() {

    bucketCanvases =
      [];


    const cellW =
      CACHE_WIDTH /
      gridCols;


    const cellH =
      CACHE_HEIGHT /
      gridRows;


    const drawW =
      cellW *
      CELL_FILL;


    const drawH =
      cellH *
      CELL_FILL;


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


      for (
        const cell
        of buckets[i].cells
      ) {

        const cx =
          (
            cell.col +
            0.5
          ) *
          cellW;


        const cy =
          (
            cell.row +
            0.5
          ) *
          cellH;


        drawPixelCell(

          lctx,

          cell.color,

          cx,
          cy,

          drawW,
          drawH,

          0,

          1,

          SHOW_GRID_GROUT
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
  // FULL BLEED COVER
  // ============================================================

  function getRect() {

    const sourceAspect =
      DATA.meta.image_width /
      DATA.meta.image_height;


    const screenAspect =
      W /
      H;


    let drawW;
    let drawH;


    if (
      screenAspect >=
      sourceAspect
    ) {

      drawW =
        W;

      drawH =
        W /
        sourceAspect;

    } else {

      drawH =
        H;

      drawW =
        H *
        sourceAspect;
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


  function updateHeroTarget(
    rect
  ) {
    if (
      !heroCell ||
      !gridCols ||
      !gridRows
    ) {
      return;
    }


    const cellW =
      rect.w /
      gridCols;


    const cellH =
      rect.h /
      gridRows;


    const target = {
      x:
        rect.x +
        (
          heroCell.col +
          0.5
        ) *
        cellW,

      y:
        rect.y +
        (
          heroCell.row +
          0.5
        ) *
        cellH,

      size:
        Math.min(
          cellW,
          cellH
        ) *
        CELL_FILL,

      color:
        heroCell.color
    };


    window.__mosaicHeroTarget =
      target;


    window.dispatchEvent(
      new CustomEvent(
        "mosaic-hero-target",
        {
          detail:
            target
        }
      )
    );
  }

  // ============================================================
  // DRAW ONE GRID CELL
  // ============================================================

  function drawPixelCell(
    targetCtx,
    color,
    cx,
    cy,
    w,
    h,
    rotation = 0,
    alpha = 1,
    grout = false
  ) {

    targetCtx.save();


    targetCtx.globalAlpha =
      alpha;


    targetCtx.translate(
      cx,
      cy
    );


    if (
      rotation !==
      0
    ) {

      targetCtx.rotate(
        rotation
      );
    }


    targetCtx.fillStyle =
      color;


    targetCtx.fillRect(

      -w /
      2,

      -h /
      2,

      w,

      h
    );


    if (
      grout
    ) {

      targetCtx.strokeStyle =
        "rgba(0,0,0,.18)";


      targetCtx.lineWidth =
        1;


      targetCtx.strokeRect(

        -w /
        2,

        -h /
        2,

        w,

        h
      );
    }


    targetCtx.restore();
  }


  // ============================================================
  // PHYSICAL HERO SQUARE
  // ============================================================

  function drawPhysicalHeroSquare(
    color,
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


    const depth =
      size *
      0.10;


    // SHADOW

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


    // RIGHT FACE

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


    // BOTTOM FACE

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


    // MAIN FACE

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
      color
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


    // INNER GLOW

    const glow =
      ctx.createRadialGradient(

        -size *
        0.18,

        -size *
        0.22,

        0,

        -size *
        0.05,

        -size *
        0.05,

        size *
        0.74
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


    // BEVEL

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


    // BORDER

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


    // SHINE

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

        -size *
        0.6,

        0,

        size *
        0.50,

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

      -size *
      0.54,

      size *
      2,

      size *
      0.42
    );


    ctx.restore();

    ctx.restore();
  }


  // ============================================================
  // FINAL CELL
  // ============================================================

  function drawFinalCell(
    cell,
    rect,
    alpha = 1
  ) {

    const cellW =
      rect.w /
      gridCols;


    const cellH =
      rect.h /
      gridRows;


    const drawW =
      cellW *
      CELL_FILL;


    const drawH =
      cellH *
      CELL_FILL;


    const cx =
      rect.x +
      (
        cell.col +
        0.5
      ) *
      cellW;


    const cy =
      rect.y +
      (
        cell.row +
        0.5
      ) *
      cellH;


    drawPixelCell(

      ctx,

      cell.color,

      cx,
      cy,

      drawW,
      drawH,

      0,

      alpha,

      SHOW_GRID_GROUT
    );
  }


  // ============================================================
  // MOVING CELL
  // ============================================================

  function drawMovingCell(
    cell,
    progress,
    rect
  ) {

    const t =
      easeOut(
        smooth(
          cell.start,
          cell.end,
          progress
        )
      );


    const targetX =
      rect.x +
      (
        cell.col +
        0.5
      ) *
      (
        rect.w /
        gridCols
      );


    const targetY =
      rect.y +
      (
        cell.row +
        0.5
      ) *
      (
        rect.h /
        gridRows
      );


    const angle =
      cell.angle +
      cell.swirl *
      (
        1 -
        t
      );


    const radius =
      Math.max(
        W,
        H
      ) *
      cell.orbit;


    const startX =
      W /
      2 +
      Math.cos(
        angle
      ) *
      radius;


    const startY =
      H /
      2 +
      Math.sin(
        angle
      ) *
      radius;


    const x =
      lerp(
        startX,
        targetX,
        t
      );


    const y =
      lerp(
        startY,
        targetY,
        t
      );


    const cellW =
      rect.w /
      gridCols;


    const cellH =
      rect.h /
      gridRows;


    const drawW =
      cellW *
      CELL_FILL *
      (
        0.62 +
        0.38 *
        t
      );


    const drawH =
      cellH *
      CELL_FILL *
      (
        0.62 +
        0.38 *
        t
      );


    const rotation =
      cell.flyRotation *
      (
        1 -
        t
      );


    drawPixelCell(

      ctx,

      cell.color,

      x,
      y,

      drawW,
      drawH,

      rotation,

      t,

      false
    );
  }


  // ============================================================
  // DRAW ASSEMBLY
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
        bucket.cells.length ===
        0
      ) {

        continue;
      }


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


      if (
        progress <
        bucket.minStart
      ) {

        continue;
      }


      for (
        const cell
        of bucket.cells
      ) {

        if (
          progress <
          cell.start
        ) {

          continue;
        }


        if (
          progress >=
          cell.end
        ) {

          drawFinalCell(
            cell,
            rect
          );

          continue;
        }


        drawMovingCell(
          cell,
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

    if (
      !heroCell
    ) {

      return;
    }


    const settle =
      smooth(
        0.03,
        0.18,
        progress
      );


    const targetX =
      rect.x +
      (
        heroCell.col +
        0.5
      ) *
      (
        rect.w /
        gridCols
      );


    const targetY =
      rect.y +
      (
        heroCell.row +
        0.5
      ) *
      (
        rect.h /
        gridRows
      );


    const x =
      lerp(
        W /
        2,
        targetX,
        settle
      );


    const y =
      lerp(
        H /
        2,
        targetY,
        settle
      );


    const largeSize =
      Math.min(
        W,
        H
      ) *
      0.14;


    const naturalSize =
      Math.min(

        rect.w /
        gridCols,

        rect.h /
        gridRows
      ) *
      CELL_FILL;


    const size =
      lerp(
        largeSize,
        naturalSize,
        settle
      );


    const rotation =
      (
        1 -
        settle
      ) *
      0.16;


    if (
      settle <
      0.88
    ) {

      drawPhysicalHeroSquare(

        heroCell.color,

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

          heroCell.color,

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


      drawPixelCell(

        ctx,

        heroCell.color,

        x,
        y,

        naturalSize,
        naturalSize,

        0,

        finalAlpha,

        SHOW_GRID_GROUT
      );
    }
  }


  // ============================================================
  // HERO FINAL
  // ============================================================

  function drawHeroFinal(
    rect
  ) {

    if (
      !heroCell
    ) {

      return;
    }


    drawFinalCell(
      heroCell,
      rect
    );
  }


  // ============================================================
  // TEXT
  // ============================================================

  function updateText(progress) {
    updateCinematicInterlude(progress);

    if (enterAtlas) {
      enterAtlas.classList.toggle(
        "visible",
        progress > 0.91
      );
    }

    if (progress < 0.10) {
      title.textContent =
        "Every story begins with a single piece";
      desc.textContent =
        "Scroll down to transform it";
      copy.style.opacity = String(
        1 - smooth(0.055, 0.095, progress)
      );
      return;
    }

    if (progress < 0.72) {
      copy.style.opacity = "0";
      return;
    }

    title.textContent =
      "to become a world of colour";
    desc.textContent = "";
    copy.style.opacity = String(
      smooth(0.76, 0.86, progress)
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


    if (
      !DATA
    ) {

      return;
    }


    const maxScroll =
      document.documentElement.scrollHeight -
      innerHeight;


    const progress =
      maxScroll >
      0

        ? scrollY /
          maxScroll

        : 0;


    /*
      After the initial audio fade has finished,
      slightly increase the sound level as the mosaic assembles.

      At the beginning:
      ~70% of AMBIENT_TARGET_VOLUME

      Later:
      100% of AMBIENT_TARGET_VOLUME
    */

    if (
      ambientStarted &&
      !ambientAudio.paused &&
      !ambientFadeFrame
    ) {

      ambientAudio.volume =
        AMBIENT_TARGET_VOLUME *
        (
          0.70 +
          0.30 *
          smooth(
            0.02,
            0.30,
            progress
          )
        );
    }


    if (
      !force &&
      Math.abs(
        progress -
        lastProgress
      ) <
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
      getRect();


    updateHeroTarget(
      rect
    );


    /*
      Long, overlapping handoff from the flying tessera field to the
      actual mosaic. The first cells begin to settle while the neon
      squares are still visible; the image then reveals over a much
      larger scroll distance.
    */
    const assemblyRaw =
      clamp(
        (progress - 0.55) / 0.43
      );

    const assemblyProgress =
      smooth(
        0,
        1,
        assemblyRaw
      );

    const mosaicOpacity =
      smooth(
        0.015,
        0.18,
        assemblyRaw
      );

    ctx.save();
    ctx.globalAlpha = mosaicOpacity;

    drawAssembly(
      assemblyProgress,
      rect
    );

    ctx.restore();


    /*
      Полный переход занимает приблизительно
      1.25 высоты экрана.
    */

    const flightProgress =
      clamp(
        window.scrollY /
        (
          window.innerHeight *
          2.3
        )
      );


    /*
      2D-плитка появляется только тогда,
      когда 3D-тессера уже почти достигла цели.
    */

    const pixelHandoff =
      progress > 0.54
        ? smooth(0.00, 0.08, assemblyProgress)
        : 0;


    if (
      heroCell &&
      pixelHandoff >
      0
    ) {
      drawFinalCell(
        heroCell,
        rect,
        pixelHandoff
      );
    }


    updateText(
      progress
    );


    if (
      bar
    ) {

      bar.style.width =
        (
          progress *
          100
        ) +
        "%";
    }
  }


  // ============================================================
  // RAF
  // ============================================================

  function requestDraw(
    force = false
  ) {

    if (
      force
    ) {

      requestAnimationFrame(
        () =>
          render(
            true
          )
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
        render(
          false
        )
    );
  }


  // ============================================================
  // AMBIENT AUDIO CONTROL
  // ============================================================

  function fadeAmbientTo(
    targetVolume,
    duration = 2200
  ) {

    if (
      ambientFadeFrame
    ) {

      cancelAnimationFrame(
        ambientFadeFrame
      );
    }


    const startVolume =
      ambientAudio.volume;


    const difference =
      targetVolume -
      startVolume;


    const startTime =
      performance.now();


    function tick(
      now
    ) {

      const t =
        Math.min(
          1,

          (
            now -
            startTime
          ) /
          duration
        );


      const eased =
        t *
        t *
        (
          3 -
          2 *
          t
        );


      ambientAudio.volume =
        clamp(

          startVolume +
          difference *
          eased,

          0,
          1
        );


      if (
        t <
        1
      ) {

        ambientFadeFrame =
          requestAnimationFrame(
            tick
          );

      } else {

        ambientFadeFrame =
          null;
      }
    }


    ambientFadeFrame =
      requestAnimationFrame(
        tick
      );
  }


  function startAmbientAudio() {

    if (
      ambientStarted
    ) {

      return;
    }


    ambientAudio
      .play()

      .then(
        () => {

          ambientStarted =
            true;


          fadeAmbientTo(
            AMBIENT_TARGET_VOLUME,
            2400
          );
        }
      )

      .catch(
        error => {

          console.warn(
            "Ambient audio could not start yet:",
            error
          );


          ambientStarted =
            false;
        }
      );
  }


  // ============================================================
  // EVENTS
  // ============================================================

  addEventListener(
    "scroll",
    () =>
      requestDraw(
        false
      ),
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


  /*
    Browsers block sound autoplay.

    Therefore music starts after the first real
    user interaction.
  */

  const startAudioOnce =
    () => {

      startAmbientAudio();
    };


  addEventListener(
    "pointerdown",
    startAudioOnce,
    {
      once: true,
      passive: true
    }
  );


  addEventListener(
    "keydown",
    startAudioOnce,
    {
      once: true
    }
  );


  addEventListener(
    "touchstart",
    startAudioOnce,
    {
      once: true,
      passive: true
    }
  );


  /*
    Some browsers allow audio from wheel,
    some don't — pointerdown/touch is more reliable.
  */

  addEventListener(
    "wheel",
    startAudioOnce,
    {
      once: true,
      passive: true
    }
  );


  // ============================================================
  // START
  // ============================================================

  loadData()
    .catch(
      error => {

        console.error(
          error
        );


        if (
          loading
        ) {

          loading.innerHTML = `

            <strong>
              Не удалось загрузить
              04_mosaic_ultra.json
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