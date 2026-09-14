import * as THREE from "three";

import { RoundedBoxGeometry } from
  "three/addons/geometries/RoundedBoxGeometry.js";

/*
  ============================================================
  LOADING STONES
  A small, self-contained 3D scene for the loading screen only.
  Stones "unlock" and drop in sequence as window.__setLoadingProgress()
  is called (app.js drives this from real fetch download progress).

  Deliberately kept simple and unlit-safe after the vortex lighting
  bugs earlier in this project:
    - MeshLambertMaterial (diffuse only, no specular highlight to blow out)
    - modest light intensities
    - NO tonemapping on the renderer (default NoToneMapping), so colours
      can't desaturate toward white the way ACES did on the vortex.
  ============================================================
*/

const canvas =
  document.getElementById("loading-canvas");

const percentLabel =
  document.getElementById("loading-percent");

if (canvas) {

  const STONE_COUNT = 9;

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

  const SPACING = 0.72;
  const GROUND_Y = -0.4;
  const DROP_HEIGHT = 2.4;
  const FALL_DURATION = 620; // ms


  /* ---- sizing: fixed internal resolution matched to the CSS box ---- */

  const rect =
    canvas.getBoundingClientRect();

  const dpr =
    Math.min(window.devicePixelRatio || 1, 2);

  const cssWidth =
    rect.width || 280;

  const cssHeight =
    rect.height || 116;

  canvas.width =
    Math.max(1, Math.round(cssWidth * dpr));

  canvas.height =
    Math.max(1, Math.round(cssHeight * dpr));


  /* ---- scene ---- */

  const scene =
    new THREE.Scene();

  scene.background =
    null;

  const camera =
    new THREE.PerspectiveCamera(
      46,
      cssWidth / cssHeight,
      0.1,
      50
    );

  camera.position.set(0, 1.6, 9);
  camera.lookAt(0, -0.2, 0);

  const renderer =
    new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power"
    });

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(cssWidth, cssHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const ambient =
    new THREE.AmbientLight("#ffffff", 0.6);

  scene.add(ambient);

  const keyLight =
    new THREE.DirectionalLight("#ffffff", 0.6);

  keyLight.position.set(2.5, 4, 3);
  scene.add(keyLight);


  /* ---- stones ---- */

  const geometry =
    new RoundedBoxGeometry(0.62, 0.62, 0.62, 2, 0.09);

  const stones =
    Array.from({ length: STONE_COUNT }, (_, i) => {

      const material =
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(PALETTE[i % PALETTE.length])
        });

      const mesh =
        new THREE.Mesh(geometry, material);

      const x =
        (i - (STONE_COUNT - 1) / 2) * SPACING;

      const restRotation =
        (Math.sin(i * 12.9898) * 0.5) * 0.5;

      mesh.position.set(x, GROUND_Y + DROP_HEIGHT, 0);
      mesh.rotation.set(0.3, 0.5, 0.15);
      mesh.visible = false;

      scene.add(mesh);

      return {
        mesh,
        restRotation,
        unlockAt: i / STONE_COUNT,
        falling: false,
        landed: false,
        startTime: 0
      };
    });


  /* classic bouncing-ball easing: ideal for a stone dropping and settling */
  function easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;

    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      t -= 1.5 / d1;
      return n1 * t * t + 0.75;
    } else if (t < 2.5 / d1) {
      t -= 2.25 / d1;
      return n1 * t * t + 0.9375;
    } else {
      t -= 2.625 / d1;
      return n1 * t * t + 0.984375;
    }
  }


  /*
    Called by app.js with a 0..1 fraction of real download progress.
    Unlocking is threshold-based so stones drop one after another across
    the whole download rather than all at once at the end.
  */
  window.__setLoadingProgress = (fraction) => {

    const progress =
      Math.max(0, Math.min(1, fraction));

    if (percentLabel) {
      percentLabel.textContent =
        Math.round(progress * 100) + "%";
    }

    const now =
      performance.now();

    for (const stone of stones) {

      if (
        !stone.falling &&
        !stone.landed &&
        progress >= stone.unlockAt
      ) {
        stone.falling = true;
        stone.startTime = now;
        stone.mesh.visible = true;
      }
    }
  };


  function animate() {

    const now =
      performance.now();

    for (const stone of stones) {

      if (!stone.falling || stone.landed) {
        continue;
      }

      const t =
        Math.min(1, (now - stone.startTime) / FALL_DURATION);

      const eased =
        easeOutBounce(t);

      stone.mesh.position.y =
        GROUND_Y + DROP_HEIGHT * (1 - eased);

      /* tumble while airborne, settle to a small resting tilt on landing */
      const spin =
        (1 - eased) * 3.2;

      stone.mesh.rotation.x = 0.3 + spin;
      stone.mesh.rotation.y = 0.5 + spin * 1.3;
      stone.mesh.rotation.z = stone.restRotation * eased;

      if (t >= 1) {
        stone.landed = true;
        stone.mesh.position.y = GROUND_Y;
        stone.mesh.rotation.set(0.12, 0.3, stone.restRotation);
      }
    }

    renderer.render(scene, camera);

    requestAnimationFrame(animate);
  }

  animate();
}