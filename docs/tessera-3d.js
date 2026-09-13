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
   REAL 3D FLYING TESSELLAE
   ============================================================ */

const swarmGroup =
  new THREE.Group();

scene.add(swarmGroup);

const swarmGeometry =
  new RoundedBoxGeometry(
    0.16,
    0.16,
    0.06,
    4,
    0.018
  );

const swarmMaterial =
  new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.30,
    metalness: 0.08,
    clearcoat: 0.32,
    clearcoatRoughness: 0.36,
    envMapIntensity: 1.05,
    transparent: true,
    opacity: 1,
    depthWrite: true
  });

const SWARM_COUNT =
  window.innerWidth < 700
    ? 54
    : 88;

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
   COLORS
   ============================================================ */

const palette = [
  "#163aaf",
  "#2f63de",
  "#4ea3d9",
  "#238269",
  "#7fbf9a",
  "#cf9c2f",
  "#efd86f",
  "#cf6b2f",
  "#f0e7cf",
  "#8b86a8"
];


const seed = (n) => {
  const x =
    Math.sin(n * 12.9898 + 78.233) *
    43758.5453123;

  return x - Math.floor(x);
};


const swarmData =
  Array.from(
    { length: SWARM_COUNT },
    (_, i) => {

      const r1 = seed(i + 1);
      const r2 = seed(i + 17);
      const r3 = seed(i + 43);
      const r4 = seed(i + 91);
      const r5 = seed(i + 137);
      const r6 = seed(i + 211);

      const angle =
        i * 2.399963229728653 +
        (r1 - 0.5) * 0.42;

      return {
        angle,

        radius:
          1.8 +
          r2 * 3.2,

        depth:
          r3,

        scale:
          0.40 +
          r4 * 0.44,

        stretchX:
          0.92 +
          r5 * 0.18,

        stretchY:
          0.92 +
          r6 * 0.18,

        rotX:
          r1 * Math.PI,

        rotY:
          r2 * Math.PI,

        rotZ:
          r3 * Math.PI,

        spinX:
          (r4 - 0.5) * 1.35,

        spinY:
          (r5 - 0.5) * 1.55,

        spinZ:
          (r6 - 0.5) * 1.10,

        drift:
          (r2 - 0.5) * 0.34
      };
    }
  );


for (
  let i = 0;
  i < SWARM_COUNT;
  i++
) {
  const color =
    new THREE.Color(
      palette[
        Math.floor(
          seed(i + 509) *
          palette.length
        )
      ]
    );

  color.offsetHSL(
    0,
    (seed(i + 301) - 0.5) * 0.08,
    (seed(i + 401) - 0.5) * 0.10
  );

  swarm.setColorAt(
    i,
    color
  );
}

if (swarm.instanceColor) {
  swarm.instanceColor.needsUpdate = true;
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

scene.add(keyLight);


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

scene.add(rimLight);


const goldLight =
  new THREE.PointLight(
    "#d3aa45",
    12,
    15,
    2
  );

goldLight.position.set(
  2.5,
  -3.0,
  1.5
);

scene.add(goldLight);


const fillLight =
  new THREE.AmbientLight(
    "#b7ddff",
    0.5
  );

scene.add(fillLight);


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

let activeDragMode = "hero";

let swarmOrbitX = 0;
let swarmOrbitY = 0;

let swarmVelocityX = 0;
let swarmVelocityY = 0;


canvas.addEventListener(
  "pointerdown",
  (event) => {

    const canDragHero =
      tessera.visible;

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
  (event) => {

    pointerNormX =
      event.clientX /
      window.innerWidth *
      2 -
      1;

    pointerNormY =
      -(
        event.clientY /
        window.innerHeight
      ) *
      2 +
      1;

    keyLight.position.x =
      pointerNormX * 4;

    keyLight.position.y =
      pointerNormY * 3;

    if (!dragging) {
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
        deltaX * 0.006;

      velocityX =
        deltaY * 0.006;

      tesseraGroup.rotation.y +=
        velocityY;

      tesseraGroup.rotation.x +=
        velocityX;

    } else {

      swarmVelocityY =
        deltaX * 0.0038;

      swarmVelocityX =
        deltaY * 0.0038;

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

let transitionStarted = false;


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

    transitionStarted = true;

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
    transitionStarted = false;
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
      0.0,
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


  canvas.classList.remove(
    "is-hidden"
  );
}


/* ============================================================
   3D FLYING SWARM
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
      ? window.scrollY /
        maxScroll
      : 0;


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


  const visibleIn =
    smoothstep(
      0.00,
      0.03,
      local
    );


  const visibleOut =
    1 -
    smoothstep(
      0.93,
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


  const launch =
    smoothstep(
      0.00,
      0.22,
      local
    );


  const handoff =
    smoothstep(
      0.76,
      1.00,
      local
    );


  const mouseStrength =
    1 -
    handoff *
    0.76;


  swarmGroup.rotation.x =
    swarmOrbitX *
    0.9;


  swarmGroup.rotation.y =
    swarmOrbitY *
    0.9 +
    time *
    0.05 *
    (
      1 -
      handoff *
      0.9
    );


  swarmGroup.rotation.z =
    Math.sin(
      time *
      0.45
    ) *
    0.03 *
    (
      1 -
      handoff *
      0.85
    );


  for (
    let i = 0;
    i < SWARM_COUNT;
    i++
  ) {

    const d =
      swarmData[i];


    const stagger =
      d.depth *
      0.20;


    const t =
      smoothstep(
        stagger,
        0.58 +
        stagger *
        0.45,
        launch
      );


    const turn =
      d.angle +
      time *
      d.drift *
      (
        1 -
        handoff *
        0.80
      );


    const radius =
      mix(
        0.04,
        d.radius,
        t
      ) *
      (
        1 -
        handoff *
        0.38
      );


    const x =
      Math.cos(
        turn
      ) *
      radius +
      pointerNormX *
      0.42 *
      mouseStrength;


    const y =
      Math.sin(
        turn
      ) *
      radius *
      0.72 +
      pointerNormY *
      0.28 *
      mouseStrength;


    const flyZ =
      mix(
        -4.6 -
        d.depth *
        1.8,

        2.1 +
        d.depth *
        0.7,

        t
      );


    const z =
      mix(
        flyZ,

        -0.7 -
        d.depth *
        1.3,

        handoff
      );


    const size =
      d.scale *
      (
        0.16 +
        t *
        0.62
      ) *
      (
        1 -
        handoff *
        0.18
      ) *
      visibility;


    dummy.position.set(
      x,
      y,
      z
    );


    dummy.rotation.set(

      d.rotX +
      time *
      d.spinX *
      (
        1 -
        handoff *
        0.88
      ),

      d.rotY +
      time *
      d.spinY *
      (
        1 -
        handoff *
        0.88
      ),

      d.rotZ +
      time *
      d.spinZ *
      (
        1 -
        handoff *
        0.88
      )
    );


    dummy.scale.set(

      size *
      d.stretchX,

      size *
      d.stretchY,

      size *
      (
        0.72 +
        d.depth *
        0.22
      )
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
      1.18
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