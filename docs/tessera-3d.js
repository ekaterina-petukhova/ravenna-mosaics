import * as THREE from "three";

import { RoundedBoxGeometry } from
  "three/addons/geometries/RoundedBoxGeometry.js";

import { RoomEnvironment } from
  "three/addons/environments/RoomEnvironment.js";


const canvas =
  document.getElementById("tessera3d");

const hint =
  document.getElementById("drag-hint");


/* SCENE */

const scene =
  new THREE.Scene();

scene.background =
  null;


/* CAMERA */

const camera =
  new THREE.PerspectiveCamera(
    34,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

camera.position.set(0, 0.1, 7.2);


/* RENDERER */

const renderer =
  new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance"
  });


renderer.setClearColor(
  0x000000,
  0
);

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


/* ENVIRONMENT */

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


/* TESSELLA GROUP */

const tesseraGroup =
  new THREE.Group();

scene.add(tesseraGroup);


/*
  Desktop: 0.36
  Mobile: 0.44

  The 3D tessera is now only slightly larger
  than the old initial 2D tile.
*/

const getHeroScale = () =>
  window.innerWidth < 700
    ? 0.44
    : 0.36;

tesseraGroup.scale.setScalar(
  getHeroScale()
);


/* OUTER GLASS */

const geometry =
  new RoundedBoxGeometry(
    2.6,
    2.6,
    0.72,
    10,
    0.2
  );


/*
  Introduce a very subtle irregularity so that
  the tessera does not look factory-perfect.
*/

const position =
  geometry.attributes.position;

for (
  let index = 0;
  index < position.count;
  index++
) {
  const x =
    position.getX(index);

  const y =
    position.getY(index);

  const z =
    position.getZ(index);

  const distortion =
    Math.sin(
      x * 3.8 +
      y * 2.4
    ) *
    Math.cos(
      z * 5.2 +
      x
    ) *
    0.025;

  position.setXYZ(
    index,
    x + distortion,
    y + distortion * 0.7,
    z + distortion
  );
}

geometry.computeVertexNormals();


/* GLASS MATERIAL */

const glassMaterial =
  new THREE.MeshPhysicalMaterial({
    color:
  new THREE.Color("#004cff"),

    transmission: 0.76,

    thickness: 1.5,

    ior: 1.47,

    roughness: 0.13,

    metalness: 0,

    /*
      Reduced clearcoat prevents the highlights
      from looking like detached white objects.
    */

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
   3D VORTEX LAYER
   Uses the exact screen-space transforms calculated by app.js.
   ============================================================ */

const vortexScene = new THREE.Scene();
vortexScene.background = null;
vortexScene.environment = environmentMap;

let vortexCamera =
  new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    0.1,
    2000
  );

vortexCamera.position.set(0, 0, 500);
vortexCamera.lookAt(0, 0, 0);

const VORTEX_COUNT = 150;

const vortexGeometry =
  new RoundedBoxGeometry(
    1,
    1,
    0.34,
    3,
    0.10
  );

const vortexMaterial =
  new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 1
  });

/*
  Per-instance alpha so the original 2D fade behaviour is preserved.
*/
const instanceAlpha =
  new THREE.InstancedBufferAttribute(
    new Float32Array(VORTEX_COUNT),
    1
  );

vortexGeometry.setAttribute(
  "instanceAlpha",
  instanceAlpha
);

vortexMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute float instanceAlpha;
varying float vInstanceAlpha;`
    )
    .replace(
      "#include <color_vertex>",
      `#include <color_vertex>
vInstanceAlpha = instanceAlpha;`
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
varying float vInstanceAlpha;`
    )
    .replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
gl_FragColor.a *= vInstanceAlpha;`
    );
};

vortexMaterial.customProgramCacheKey = () =>
  "vortex-instance-alpha-v1";

const vortex =
  new THREE.InstancedMesh(
    vortexGeometry,
    vortexMaterial,
    VORTEX_COUNT
  );

vortex.instanceMatrix.setUsage(
  THREE.DynamicDrawUsage
);

vortex.frustumCulled = false;
vortex.visible = false;

vortexScene.add(vortex);

const vortexDummy =
  new THREE.Object3D();

// The vortex material is unlit (MeshBasicMaterial), so it needs no
// lights of its own — the old directional/ambient lights here used to
// dominate and wash out the per-instance colour; removed rather than
// left as dead, confusing code.

let vortexFrameVisible = false;

// app.js uses these flags so the old 2D vortex stays as a safety fallback
// until this 3D renderer is actually ready and drawing.
window.__3DTesseraVortexReady = true;
window.__3DTesseraVortexVisible = false;

window.__update3DTesseraField = ({
  items,
  width,
  height,
  visibility
}) => {
  vortexFrameVisible =
    visibility > 0 &&
    items.length > 0;

  vortex.visible =
    vortexFrameVisible;

  window.__3DTesseraVortexVisible =
    vortexFrameVisible;

  if (!vortexFrameVisible) {
    return;
  }

  const count =
    Math.min(
      items.length,
      VORTEX_COUNT
    );

  for (
    let i = 0;
    i < count;
    i++
  ) {
    const item = items[i];

    /*
      Exact old 2D coordinates:
      x/y are simply recentered for an orthographic camera.
      No spiral maths is recalculated here.
    */
    const x =
      item.x -
      width / 2;

    const y =
      height / 2 -
      item.y;

    vortexDummy.position.set(
      x,
      y,
      item.travel * 30
    );

    /*
      x/y rotation only reveals the thickness.
      Z rotation is the exact old 2D rotation.
    */
    vortexDummy.rotation.set(
      Math.sin(i * 1.713) * 0.34,
      Math.cos(i * 1.297) * 0.34,
      item.rotation
    );

    vortexDummy.scale.set(
      item.size,
      item.size,
      item.size
    );

    vortexDummy.updateMatrix();

    vortex.setMatrixAt(
      i,
      vortexDummy.matrix
    );

    const instanceColor =
      new THREE.Color(item.color || "#5f88d8");

    // app.js now sends already-vivid hsl() colours, so only a tiny polish
    // lift is needed here — the old +0.10 lightness boost was compensating
    // for muted raw photo hex values that no longer reach this function.
    instanceColor.offsetHSL(0, 0.02, 0.02);

    vortex.setColorAt(
      i,
      instanceColor
    );

    instanceAlpha.setX(
      i,
      item.alpha
    );
  }

  for (
    let i = count;
    i < VORTEX_COUNT;
    i++
  ) {
    vortexDummy.position.set(
      100000,
      100000,
      0
    );

    vortexDummy.scale.setScalar(
      0.00001
    );

    vortexDummy.updateMatrix();

    vortex.setMatrixAt(
      i,
      vortexDummy.matrix
    );

    instanceAlpha.setX(
      i,
      0
    );
  }

  vortex.instanceMatrix.needsUpdate = true;

  if (vortex.instanceColor) {
    vortex.instanceColor.needsUpdate = true;
  }

  instanceAlpha.needsUpdate = true;
};



/*
  The previous INTERNAL CRYSTALS block has been
  removed completely. Those triangle meshes were
  intersecting the glass surface and appearing
  outside the tessera during rotation.
*/


/* LIGHTS */

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


const fillLight =
  new THREE.AmbientLight(
    "#b7ddff",
    0.5
  );

scene.add(fillLight);


/* INITIAL ROTATION */

tesseraGroup.rotation.set(
  -0.48,
  0.58,
  0.12
);


/* DRAG STATE */

let dragging = false;

let previousX = 0;
let previousY = 0;

let velocityX = 0;
let velocityY = 0;


/* POINTER DOWN */

canvas.addEventListener(
  "pointerdown",
  (event) => {
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


/* POINTER MOVE */

canvas.addEventListener(
  "pointermove",
  (event) => {
    const normalizedX =
      event.clientX /
      window.innerWidth *
      2 -
      1;

    const normalizedY =
      -(
        event.clientY /
        window.innerHeight
      ) *
      2 +
      1;


    /*
      Move the soft key light with the cursor.
    */

    keyLight.position.x =
      normalizedX * 4;

    keyLight.position.y =
      normalizedY * 3;


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


/* STOP DRAGGING */

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


/* SCROLL TRANSITION */
let flightProgress =
  0;

let flightBaseY =
  0;

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


function updateScrollEffect() {
  flightProgress =
    clamp01(
      window.scrollY /
      (
        window.innerHeight *
        3.45
      )
    );

  /*
    Phase 1: hold the tessera in front of the viewer.
    Phase 2: let it swell until blue glass fills the viewport.
    Phase 3: dissolve it into black before the typographic interlude.
  */
  const expand = smoothstep(
    0.06,
    0.80,
    flightProgress
  );

  const dissolve = smoothstep(
    0.82,
    0.985,
    flightProgress
  );

  if (
    flightProgress > 0 &&
    !transitionStarted
  ) {
    transitionStarted = true;
    transitionRotation.x = tesseraGroup.rotation.x;
    transitionRotation.y = tesseraGroup.rotation.y;
    transitionRotation.z = tesseraGroup.rotation.z;
  }

  if (flightProgress === 0) {
    transitionStarted = false;
  }

  const cinematicScale =
    mix(
      getHeroScale(),
      window.innerWidth < 700 ? 2.8 : 2.35,
      expand
    );

  tesseraGroup.scale.setScalar(cinematicScale);

  /* a restrained push toward the camera makes the expansion feel physical */
  tesseraGroup.position.z = mix(0, 1.15, expand);
  tesseraGroup.position.x = mix(0, -0.10, expand);
  flightBaseY = mix(0, 0.03, expand);

  /* turn the tessera toward the viewer while it fills the frame */
  tesseraGroup.rotation.x = mix(transitionRotation.x, 0.02, expand);
  tesseraGroup.rotation.y = mix(transitionRotation.y, 0.0, expand);
  tesseraGroup.rotation.z = mix(transitionRotation.z, -0.035, expand);

  const opacity = 1 - dissolve;

  /*
    Fade ONLY the large hero tessera.
    The canvas itself must stay visible because the 3D vortex
    is rendered on the same WebGL canvas.
  */
  glassMaterial.opacity = opacity;
  tessera.visible = opacity > 0.01;

  canvas.style.opacity = "1";
  canvas.classList.toggle(
    "is-hidden",
    opacity < 0.025 && !vortexFrameVisible
  );
}

window.addEventListener(
  "scroll",
  updateScrollEffect,
  {
    passive: true
  }
);


/* RESIZE */

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

    vortexCamera.left =
      -window.innerWidth / 2;

    vortexCamera.right =
      window.innerWidth / 2;

    vortexCamera.top =
      window.innerHeight / 2;

    vortexCamera.bottom =
      -window.innerHeight / 2;

    vortexCamera.updateProjectionMatrix();


    updateScrollEffect();
  },
  {
    passive: true
  }
);


/* ANIMATION */

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


    /*
      Begin slow automatic rotation after
      the dragging inertia has stopped.
    */

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


  /*
    Subtle floating motion.
  */

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


  renderer.autoClear = false;
  renderer.clear();

  renderer.render(
    scene,
    camera
  );

  /*
    Old 2D field sat visually above the hero layer.
    Keep the same stacking order for the 3D replacement.
  */
  renderer.clearDepth();

  if (vortexFrameVisible) {
    renderer.render(
      vortexScene,
      vortexCamera
    );
  }


  requestAnimationFrame(
    animate
  );
}


updateScrollEffect();
animate();