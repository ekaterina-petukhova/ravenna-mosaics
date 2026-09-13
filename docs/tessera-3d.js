import * as THREE from "three";

import { RoundedBoxGeometry } from
  "three/addons/geometries/RoundedBoxGeometry.js";

import { RoomEnvironment } from
  "three/addons/environments/RoomEnvironment.js";


const canvas =
  document.getElementById("tessera3d");

const hint =
  document.getElementById("drag-hint");


/* ============================================================
   SCENE / CAMERA / RENDERER
   ============================================================ */

const scene = new THREE.Scene();
scene.background = null;

const camera =
  new THREE.PerspectiveCamera(
    34,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

camera.position.set(0, 0.1, 7.2);

const renderer =
  new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });

renderer.setClearColor(0x000000, 0);

renderer.setPixelRatio(
  Math.min(
    window.devicePixelRatio || 1,
    2
  )
);

renderer.setSize(
  window.innerWidth,
  window.innerHeight,
  false
);

renderer.outputColorSpace =
  THREE.SRGBColorSpace;

renderer.toneMapping =
  THREE.ACESFilmicToneMapping;

renderer.toneMappingExposure = 1.15;


/* ============================================================
   ENVIRONMENT
   ============================================================ */

const environment =
  new RoomEnvironment();

const pmremGenerator =
  new THREE.PMREMGenerator(renderer);

const environmentMap =
  pmremGenerator
    .fromScene(environment)
    .texture;

scene.environment =
  environmentMap;

environment.dispose();
pmremGenerator.dispose();


/* ============================================================
   HERO TESSELLA
   ============================================================ */

const tesseraGroup =
  new THREE.Group();

scene.add(tesseraGroup);

const getHeroScale = () =>
  window.innerWidth < 700
    ? 0.44
    : 0.36;

tesseraGroup.scale.setScalar(
  getHeroScale()
);

const geometry =
  new RoundedBoxGeometry(
    2.6,
    2.6,
    0.72,
    10,
    0.2
  );

const position =
  geometry.attributes.position;

for (
  let index = 0;
  index < position.count;
  index++
) {
  const x = position.getX(index);
  const y = position.getY(index);
  const z = position.getZ(index);

  const distortion =
    Math.sin(x * 3.8 + y * 2.4) *
    Math.cos(z * 5.2 + x) *
    0.025;

  position.setXYZ(
    index,
    x + distortion,
    y + distortion * 0.7,
    z + distortion
  );
}

geometry.computeVertexNormals();

const glassMaterial =
  new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#004cff"),
    transmission: 0.76,
    thickness: 1.5,
    ior: 1.47,
    roughness: 0.13,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
    attenuationColor:
      new THREE.Color("#002fa7"),
    attenuationDistance: 1.6,
    envMapIntensity: 1.15,
    transparent: true,
    opacity: 1
  });

const tessera =
  new THREE.Mesh(
    geometry,
    glassMaterial
  );

tesseraGroup.add(tessera);


/* ============================================================
   REAL 3D FLYING TESSELLAE — SAME VORTEX MOTION
   ============================================================ */

const swarmGroup =
  new THREE.Group();

scene.add(swarmGroup);


/* маленькая настоящая 3D tessera */
const swarmGeometry =
  new RoundedBoxGeometry(
    0.115,
    0.115,
    0.045,
    2,
    0.012
  );


/*
  Нам НЕ нужен MeshPhysicalMaterial здесь.
  Он слишком тяжёлый для десятков движущихся объектов.

  MeshStandardMaterial всё ещё даёт настоящий свет,
  объём и тени, но работает значительно быстрее.
*/
const swarmMaterial =
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.06,
    transparent: true,
    opacity: 1
  });


/*
  Меньше объектов.
  Но каждый настоящий 3D.
*/
const SWARM_COUNT =
  window.innerWidth < 700
    ? 42
    : 64;


const swarm =
  new THREE.InstancedMesh(
    swarmGeometry,
    swarmMaterial,
    SWARM_COUNT
  );

swarm.instanceMatrix.setUsage(
  THREE.DynamicDrawUsage
);

swarm.frustumCulled = false;

swarmGroup.add(swarm);


/* ============================================================
   MOSAIC COLOURS
   ============================================================ */

const palette = [
  "#1b4fd8",
  "#3f7cff",
  "#22a2d8",

  "#1f8d6a",
  "#65b46e",

  "#d5a52d",
  "#f1d85c",

  "#d96f2f",

  "#efe4c6",
  "#a38c72",

  "#8c6fb0"
];


const seed = (n) => {

  const x =
    Math.sin(
      n * 12.9898 +
      78.233
    ) *
    43758.5453123;

  return (
    x -
    Math.floor(x)
  );
};


/*
  Это важная часть.

  Структура практически повторяет твои старые 2D tesserae:

  angle
  depth
  spin
  drift

  Поэтому движение снова будет выглядеть как старый водоворот.
*/
const swarmData =
  Array.from(
    {
      length:
        SWARM_COUNT
    },

    (_, i) => ({

      angle:
        (
          (
            i *
            2.399963229728653
          ) +
          (
            i % 7
          ) *
          0.13
        ) %
        (
          Math.PI *
          2
        ),

      depth:
        (
          i *
          0.61803398875
        ) %
        1,

      scale:
        0.72 +
        seed(
          i + 31
        ) *
        0.46,

      spin:
        (
          (
            i % 11
          ) -
          5
        ) *
        0.42,

      drift:
        (
          (
            (
              i * 13
            ) %
            17
          ) -
          8
        ) *
        0.018,

      tiltX:
        (
          seed(
            i + 71
          ) -
          0.5
        ) *
        1.1,

      tiltY:
        (
          seed(
            i + 97
          ) -
          0.5
        ) *
        1.1
    })
  );


/*
  Не random-выбор с шансом.
  Цвета идут по кругу — поэтому ВСЕ оттенки гарантированно появляются.
*/
for (
  let i = 0;
  i < SWARM_COUNT;
  i++
) {

  const color =
    new THREE.Color(
      palette[
        i %
        palette.length
      ]
    );

  swarm.setColorAt(
    i,
    color
  );
}


if (
  swarm.instanceColor
) {

  swarm.instanceColor
    .needsUpdate =
    true;
}


const dummy =
  new THREE.Object3D();


let pointerNormX = 0;
let pointerNormY = 0;


/* ============================================================
   LIGHTS
   ============================================================ */

const keyLight =
  new THREE.PointLight(
    "#66d9ff",
    34,
    15,
    1.8
  );

keyLight.position.set(
  3,
  3,
  4
);

scene.add(
  keyLight
);


const rimLight =
  new THREE.PointLight(
    "#005cff",
    24,
    12,
    2
  );

rimLight.position.set(
  -4,
  -2,
  2
);

scene.add(
  rimLight
);


const goldLight =
  new THREE.PointLight(
    "#d3aa45",
    12,
    15,
    2
  );

goldLight.position.set(
  2.5,
  -3,
  1.5
);

scene.add(
  goldLight
);


/*
  Усилила ambient.
  Поэтому жёлтые / зелёные / оранжевые tesserae
  не превращаются визуально в синие.
*/
const fillLight =
  new THREE.AmbientLight(
    "#ffffff",
    1.15
  );

scene.add(
  fillLight
);


/* ============================================================
   HERO INITIAL ROTATION
   ============================================================ */

tesseraGroup.rotation.set(
  -0.48,
  0.58,
  0.12
);


/* ============================================================
   POINTER / DRAG
   ============================================================ */

let dragging = false;

let previousX = 0;
let previousY = 0;

let velocityX = 0;
let velocityY = 0;

let activeDragMode =
  "hero";


let swarmOrbitX = 0;
let swarmOrbitY = 0;

let swarmVelocityX = 0;
let swarmVelocityY = 0;


canvas.addEventListener(
  "pointerdown",
  event => {

    const canDragHero =
      tessera.visible &&
      glassMaterial.opacity >
      0.18;

    const canDragSwarm =
      swarmGroup.visible;


    if (
      !canDragHero &&
      !canDragSwarm
    ) {
      return;
    }


    activeDragMode =
      canDragHero
        ? "hero"
        : "swarm";


    dragging = true;

    previousX =
      event.clientX;

    previousY =
      event.clientY;


    canvas.classList.add(
      "is-dragging"
    );


    hint?.classList.add(
      "is-hidden"
    );


    canvas.setPointerCapture(
      event.pointerId
    );
  }
);


canvas.addEventListener(
  "pointermove",
  event => {

    pointerNormX =
      (
        event.clientX /
        window.innerWidth
      ) *
      2 -
      1;


    pointerNormY =
      -(
        (
          event.clientY /
          window.innerHeight
        ) *
        2 -
        1
      );


    keyLight.position.x =
      pointerNormX *
      4;

    keyLight.position.y =
      pointerNormY *
      3;


    if (
      !dragging
    ) {
      return;
    }


    const deltaX =
      event.clientX -
      previousX;

    const deltaY =
      event.clientY -
      previousY;


    if (
      activeDragMode ===
      "hero"
    ) {

      velocityY =
        deltaX *
        0.006;

      velocityX =
        deltaY *
        0.006;


      tesseraGroup.rotation.y +=
        velocityY;

      tesseraGroup.rotation.x +=
        velocityX;

    } else {

      /*
        Когда летит водоворот,
        мышкой вращается вся 3D-система.
      */

      swarmVelocityY =
        deltaX *
        0.0038;

      swarmVelocityX =
        deltaY *
        0.0038;


      swarmOrbitY +=
        swarmVelocityY;

      swarmOrbitX +=
        swarmVelocityX;
    }


    previousX =
      event.clientX;

    previousY =
      event.clientY;
  }
);


function stopDragging(
  event
) {

  dragging = false;


  canvas.classList.remove(
    "is-dragging"
  );


  if (
    canvas.hasPointerCapture(
      event.pointerId
    )
  ) {

    canvas.releasePointerCapture(
      event.pointerId
    );
  }
}


canvas.addEventListener(
  "pointerup",
  stopDragging
);

canvas.addEventListener(
  "pointercancel",
  stopDragging
);


/* ============================================================
   HELPERS
   ============================================================ */

let flightProgress = 0;

let flightBaseY = 0;

let transitionStarted =
  false;


const transitionRotation = {
  x: 0,
  y: 0,
  z: 0
};


const clamp01 =
  value =>
    Math.max(
      0,
      Math.min(
        1,
        value
      )
    );


const smoothstep =
  (
    start,
    end,
    value
  ) => {

    const t =
      clamp01(
        (
          value -
          start
        ) /
        (
          end -
          start
        )
      );


    return (
      t *
      t *
      (
        3 -
        2 *
        t
      )
    );
  };


const mix =
  (
    start,
    end,
    amount
  ) =>
    start +
    (
      end -
      start
    ) *
    amount;


/* ============================================================
   SINGLE HERO TESSELLA
   ============================================================ */

function updateScrollEffect() {

  flightProgress =
    clamp01(
      window.scrollY /
      (
        window.innerHeight *
        3.45
      )
    );


  const expand =
    smoothstep(
      0.06,
      0.80,
      flightProgress
    );


  const dissolve =
    smoothstep(
      0.82,
      0.985,
      flightProgress
    );


  if (
    flightProgress > 0 &&
    !transitionStarted
  ) {

    transitionStarted =
      true;

    transitionRotation.x =
      tesseraGroup.rotation.x;

    transitionRotation.y =
      tesseraGroup.rotation.y;

    transitionRotation.z =
      tesseraGroup.rotation.z;
  }


  if (
    flightProgress === 0
  ) {

    transitionStarted =
      false;
  }


  const cinematicScale =
    mix(
      getHeroScale(),

      window.innerWidth < 700
        ? 2.8
        : 2.35,

      expand
    );


  tesseraGroup.scale.setScalar(
    cinematicScale
  );


  tesseraGroup.position.z =
    mix(
      0,
      1.15,
      expand
    );


  tesseraGroup.position.x =
    mix(
      0,
      -0.10,
      expand
    );


  flightBaseY =
    mix(
      0,
      0.03,
      expand
    );


  tesseraGroup.rotation.x =
    mix(
      transitionRotation.x,
      0.02,
      expand
    );


  tesseraGroup.rotation.y =
    mix(
      transitionRotation.y,
      0,
      expand
    );


  tesseraGroup.rotation.z =
    mix(
      transitionRotation.z,
      -0.035,
      expand
    );


  const heroOpacity =
    1 -
    dissolve;


  glassMaterial.opacity =
    heroOpacity;


  tessera.visible =
    heroOpacity >
    0.01;


  canvas.style.opacity =
    "1";


  /*
    canvas НЕ отключаем,
    потому что на нём теперь живёт и водоворот.
  */
  canvas.classList.remove(
    "is-hidden"
  );
}


/* ============================================================
   3D VORTEX
   ============================================================ */

function updateSwarm(
  time
) {

  const maxScroll =
    document.documentElement
      .scrollHeight -
    window.innerHeight;


  const pageProgress =
    maxScroll > 0
      ?
        window.scrollY /
        maxScroll
      :
        0;


  /*
    Та же зона страницы,
    где раньше был старый 2D interlude.
  */
  const local =
    clamp01(
      (
        pageProgress -
        0.10
      ) /
      (
        0.73 -
        0.10
      )
    );


  /*
    ПОЯВЛЯЮТСЯ ПОЧТИ СРАЗУ.
  */
  const visibleIn =
    smoothstep(
      0.00,
      0.018,
      local
    );


  /*
    Исчезают только ближе
    к самому переходу в мозаику.
  */
  const visibleOut =
    1 -
    smoothstep(
      0.90,
      1.00,
      local
    );


  const visibility =
    visibleIn *
    visibleOut;


  swarmGroup.visible =
    visibility >
    0.001;


  if (
    !swarmGroup.visible
  ) {
    return;
  }


  const handoff =
    smoothstep(
      0.72,
      0.99,
      local
    );


  /*
    Это ровно та идея radialCollapse,
    которая была в старом 2D.
  */
  const radialCollapse =
    1 -
    handoff *
    0.62;


  /*
    Пользовательское вращение
    всей системы.
  */
  swarmGroup.rotation.x =
    swarmOrbitX *
    0.9;

  swarmGroup.rotation.y =
    swarmOrbitY *
    0.9;


  /*
    Размер водоворота.
  */
  const maxRadius =
    window.innerWidth < 700
      ? 3.8
      : 5.7;


  const pointerOffsetX =
    pointerNormX *
    0.24 *
    (
      1 -
      handoff *
      0.7
    );


  const pointerOffsetY =
    pointerNormY *
    0.18 *
    (
      1 -
      handoff *
      0.7
    );


  for (
    let i = 0;
    i < SWARM_COUNT;
    i++
  ) {

    const t =
      swarmData[i];


    /*
      ВАЖНО.

      Вот это старая логика твоего водоворота:

      depth
      - local movement
      - time movement

      Поэтому камни непрерывно летят
      из глубины к зрителю.
    */

    let zCycle =
      (
        t.depth -
        local *
        1.30 -
        time *
        0.009 +
        2
      ) %
      1;


    if (
      zCycle < 0
    ) {

      zCycle += 1;
    }


    const travel =
      1 -
      zCycle;


    const eased =
      travel *
      travel;


    /*
      Старый радиус:
      маленький в центре →
      всё больше к краям.
    */
    const radius =
      (
        0.20 +
        eased *
        maxRadius
      ) *
      radialCollapse;


    /*
      Старое вращение по спирали.
    */
    const a =
      t.angle +

      t.drift *
      time *
      (
        1 -
        handoff *
        0.72
      ) +

      pointerNormX *
      0.04;


    const x =
      Math.cos(a) *
      radius +
      pointerOffsetX;


    const y =
      Math.sin(a) *
      radius *
      0.72 +
      pointerOffsetY;


    /*
      Но теперь это настоящий Z,
      а не иллюзия размера.

      Камень реально движется
      из глубины пространства.
    */
    const z =
      mix(
        -6.2,
        1.25,
        travel
      );


    /*
      Они меньше старой версии.
    */
    const size =
      t.scale *
      (
        0.30 +
        travel *
        0.72
      ) *
      (
        1 -
        handoff *
        0.34
      ) *
      visibility;


    dummy.position.set(
      x,
      y,
      z
    );


    /*
      КАЖДАЯ tessera вращается
      по X/Y/Z независимо.
    */
    dummy.rotation.set(

      t.tiltX +
      time *
      t.spin *
      0.28,

      t.tiltY +
      time *
      t.spin *
      0.36,

      a +
      time *
      t.spin *
      0.16
    );


    dummy.scale.setScalar(
      size
    );


    dummy.updateMatrix();


    swarm.setMatrixAt(
      i,
      dummy.matrix
    );
  }


  swarm.instanceMatrix
    .needsUpdate =
    true;


  swarmMaterial.opacity =
    Math.min(
      1,
      visibility *
      1.25
    );
}


/* ============================================================
   EVENTS
   ============================================================ */

window.addEventListener(
  "scroll",
  updateScrollEffect,
  {
    passive: true
  }
);


window.addEventListener(
  "resize",
  () => {

    camera.aspect =
      window.innerWidth /
      window.innerHeight;


    camera.updateProjectionMatrix();


    renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        2
      )
    );


    renderer.setSize(
      window.innerWidth,
      window.innerHeight,
      false
    );


    updateScrollEffect();
  },

  {
    passive: true
  }
);


/* ============================================================
   ANIMATION
   ============================================================ */

const clock =
  new THREE.Clock();


function animate() {

  const time =
    clock.getElapsedTime();


  if (
    !dragging
  ) {

    tesseraGroup.rotation.x +=
      velocityX;

    tesseraGroup.rotation.y +=
      velocityY;


    velocityX *=
      0.95;

    velocityY *=
      0.95;


    /*
      Инерция вращения водоворота.
    */
    swarmOrbitX +=
      swarmVelocityX;

    swarmOrbitY +=
      swarmVelocityY;


    swarmVelocityX *=
      0.94;

    swarmVelocityY *=
      0.94;


    if (
      Math.abs(
        velocityX
      ) <
      0.0001 &&

      Math.abs(
        velocityY
      ) <
      0.0001
    ) {

      tesseraGroup.rotation.y +=
        0.00042;
    }
  }


  tesseraGroup.position.y =
    flightBaseY +

    Math.sin(
      time *
      0.46
    ) *

    0.045 *

    (
      1 -
      flightProgress
    );


  updateSwarm(
    time
  );


  renderer.render(
    scene,
    camera
  );


  requestAnimationFrame(
    animate
  );
}


updateScrollEffect();
animate();