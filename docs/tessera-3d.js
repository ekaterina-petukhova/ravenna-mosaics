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

    envMapIntensity: 1.15
  });


const tessera =
  new THREE.Mesh(
    geometry,
    glassMaterial
  );

tesseraGroup.add(tessera);


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
        1.25
      )
    );


  const flight =
    smoothstep(
      0,
      1,
      flightProgress
    );


  if (
    flightProgress >
    0 &&
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
    flightProgress ===
    0
  ) {
    transitionStarted =
      false;
  }


  const target =
    window.__mosaicHeroTarget || {
      x:
        window.innerWidth /
        2,

      y:
        window.innerHeight /
        2,

      size:
        12
    };


  /*
    В конце тессера оказывается немного
    дальше камеры и становится размером
    с выбранный пиксель мозаики.
  */

  const targetZ =
    -0.8;


  const currentZ =
    mix(
      0,
      targetZ,
      flight
    );


  const cameraDistance =
    camera.position.z -
    currentZ;


  const visibleHeight =
    2 *
    Math.tan(
      THREE.MathUtils.degToRad(
        camera.fov /
        2
      )
    ) *
    cameraDistance;


  const visibleWidth =
    visibleHeight *
    camera.aspect;


  const targetWorldX =
    (
      target.x /
      window.innerWidth -
      0.5
    ) *
    visibleWidth;


  const targetWorldY =
    camera.position.y +
    (
      0.5 -
      target.y /
      window.innerHeight
    ) *
    visibleHeight;


  /*
    Лёгкая дуга делает движение похожим
    на полёт, а не на обычное уменьшение.
    В конечной точке дуга равна нулю.
  */

  const arc =
    Math.sin(
      Math.PI *
      flight
    );


  tesseraGroup.position.x =
    mix(
      0,
      targetWorldX,
      flight
    ) +
    arc *
    0.10;


  flightBaseY =
    mix(
      0,
      targetWorldY,
      flight
    ) +
    arc *
    0.16;


  tesseraGroup.position.z =
    currentZ;


  const targetScale =
    Math.max(
      0.002,
      target.size *
      visibleWidth /
      (
        window.innerWidth *
        2.6
      )
    );


  tesseraGroup.scale.setScalar(
    mix(
      getHeroScale(),
      targetScale,
      flight
    )
  );


  /*
    Камень постепенно поворачивается
    лицевой стороной к экрану.
  */

  tesseraGroup.rotation.x =
    mix(
      transitionRotation.x,
      0,
      flight
    );


  tesseraGroup.rotation.y =
    mix(
      transitionRotation.y,
      0,
      flight
    );


  tesseraGroup.rotation.z =
    mix(
      transitionRotation.z,
      0,
      flight
    );


  /*
    Fade начинается только после того,
    как камень почти достиг пикселя.
  */

  const opacity =
    1 -
    smoothstep(
      0.78,
      0.98,
      flightProgress
    );


  canvas.style.opacity =
    String(
      opacity
    );


  canvas.classList.toggle(
    "is-hidden",
    opacity <
    0.03
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
        0.0013;
    }
  }


  /*
    Subtle floating motion.
  */

  tesseraGroup.position.y =
    flightBaseY +
    Math.sin(
      time *
      0.8
    ) *
    0.08 *
    (
      1 -
      flightProgress
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