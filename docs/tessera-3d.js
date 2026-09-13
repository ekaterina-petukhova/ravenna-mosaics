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

/*
  Small surface distortion so the tessera feels handmade rather
  than perfectly manufactured.
*/
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

/*
  This replaces the old 2D canvas "flying squares".
  One InstancedMesh gives us real geometry, perspective,
  highlights, depth and rotation without creating hundreds
  of separate draw calls.
*/

const swarmGroup =
  new THREE.Group();

scene.add(swarmGroup);

const swarmGeometry =
  new RoundedBoxGeometry(
    0.27,
    0.27,
    0.09,
    4,
    0.028
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
    ? 110
    : 190;

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

const palette = [
  "#173dba", // cobalt
  "#225fd8",
  "#3f79e8",
  "#1f7d67", // green glass
  "#4d9a70",
  "#d3a629", // gold
  "#e6c94f",
  "#d26f25", // orange
  "#d6d0b7", // pale stone
  "#76838e"  // grey-blue
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
          2.8 +
          r2 * 5.0,

        depth:
          r3,

        scale:
          0.72 +
          r4 * 1.25,

        stretchX:
          0.84 +
          r5 * 0.38,

        stretchY:
          0.84 +
          r6 * 0.38,

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
        i % palette.length
      ]
    );

  /*
    A little brightness variation keeps repeated colours
    from looking mechanically duplicated.
  */
  color.offsetHSL(
    0,
    (seed(i + 301) - 0.5) * 0.08,
    (seed(i + 401) - 0.5) * 0.10
  );

  swarm.setColorAt(i, color);
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

canvas.addEventListener(
  "pointerdown",
  (event) => {
    /*
      Dragging is only meaningful while the single hero tessera
      is visible.
    */
    if (!tessera.visible) {
      return;
    }

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

    velocityY =
      deltaX * 0.006;

    velocityX =
      deltaY * 0.006;

    tesseraGroup.rotation.y +=
      velocityY;

    tesseraGroup.rotation.x +=
      velocityX;

    previousX =
      event.clientX;

    previousY =
      event.clientY;
  }
);

function stopDragging(event) {
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
   SCROLL HELPERS
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
   SINGLE-TESSERA TRANSITION
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

  if (flightProgress === 0) {
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

  /*
    IMPORTANT:
    Do not fade the whole WebGL canvas here.
    The same canvas now also contains the 3D flying tesserae.
  */
  canvas.style.opacity = "1";

  canvas.classList.toggle(
    "is-hidden",
    heroOpacity < 0.025
  );
}


/* ============================================================
   3D SWARM TRANSITION
   ============================================================ */

function updateSwarm(time) {
  const maxScroll =
    document.documentElement.scrollHeight -
    window.innerHeight;

  const pageProgress =
    maxScroll > 0
      ? window.scrollY / maxScroll
      : 0;

  /*
    These numbers mirror the existing cinematic interlude
    in app.js, so the 3D field appears under the same text.
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

  const visibleIn =
    smoothstep(
      0.00,
      0.055,
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

  if (!swarmGroup.visible) {
    return;
  }

  const launch =
    smoothstep(
      0.02,
      0.46,
      local
    );

  const handoff =
    smoothstep(
      0.60,
      0.98,
      local
    );

  const mouseStrength =
    1 -
    handoff *
    0.82;

  for (
    let i = 0;
    i < SWARM_COUNT;
    i++
  ) {
    const d =
      swarmData[i];

    /*
      Depth stagger: not all tesserae begin moving at once.
    */
    const stagger =
      d.depth *
      0.20;

    const t =
      smoothstep(
        stagger,
        0.58 + stagger * 0.45,
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

    /*
      Real 3D trajectory:
      begin deep behind the image plane, fly toward the viewer,
      spread radially, then ease back toward the mosaic plane.
    */
    const radius =
      mix(
        0.08,
        d.radius,
        t
      ) *
      (
        1 -
        handoff *
        0.66
      );

    const x =
      Math.cos(turn) *
      radius +
      pointerNormX *
      0.42 *
      mouseStrength;

    const y =
      Math.sin(turn) *
      radius *
      0.72 +
      pointerNormY *
      0.28 *
      mouseStrength;

    const flyZ =
      mix(
        -8.5 -
        d.depth * 3.0,
        3.0 +
        d.depth * 1.0,
        t
      );

    const z =
      mix(
        flyZ,
        -0.7 -
        d.depth * 1.3,
        handoff
      );

    /*
      At the handoff, tesserae become calmer and flatter so that
      the 2D mosaic assembly underneath can visually take over.
    */
    const size =
      d.scale *
      (
        0.18 +
        t *
        0.92
      ) *
      (
        1 -
        handoff *
        0.42
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
          0.78 +
          d.depth *
          0.38
        )
    );

    dummy.updateMatrix();

    swarm.setMatrixAt(
      i,
      dummy.matrix
    );
  }

  swarm.instanceMatrix.needsUpdate =
    true;

  swarmMaterial.opacity =
    visibility;
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

  if (!dragging) {
    tesseraGroup.rotation.x +=
      velocityX;

    tesseraGroup.rotation.y +=
      velocityY;

    velocityX *= 0.95;
    velocityY *= 0.95;

    if (
      Math.abs(velocityX) <
        0.0001 &&

      Math.abs(velocityY) <
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

  updateSwarm(time);

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
