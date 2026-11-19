// ThreeBackground.jsx — realistic 3D background for the Money Expenses Dashboard.
// Plain three.js (no React Three Fiber). Ported from the approved preview Space
// (expenses-dashboard-3d-preview): deep-violet chrome-chain look.
//   - 21 fat chrome chain links + a 15-link background chain, scroll-driven
//   - 920 glowing violet cubes (InstancedMesh) wrapped in chrome + cyan rings
//   - 10 floating shapes across three depth layers, mouse parallax
//   - doubled particle layers (silver starfield + violet dust)
//   - lights shift white -> violet -> cyan as you scroll
// The canvas is fixed BEHIND the dashboard (z-index 0, content z-index 1),
// shapes are anchored to the edges/corners and never cover text or buttons.
// Renders at up to 2x pixel density, pauses when the tab is hidden, respects
// prefers-reduced-motion (slow time, no pointer parallax), full dispose on
// unmount. WebGL failure leaves the CSS gradient behind it as the fallback.
// Mount it once at the top of the app: <ThreeBackground dark={darkMode} />
// Burst hook: the component exposes window.__burst() (call it on Add Expense
// to fire a pulse through the scene); it is removed again on unmount.

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground({ dark = false }) {
  const mountRef = useRef(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    // Mutable loop state (refs so the single rAF loop sees live values).
    const state = {
      px: 0, py: 0, tx: 0, ty: 0,
      scrollP: 0, scrollTarget: 0,
      burst: 0,
      themeMix: darkRef.current ? 0 : 1, // 0 = dark, 1 = light (matches preview)
      t: 0,
    };

    const disposables = [];
    const track = (obj) => {
      if (obj) disposables.push(obj);
      return obj;
    };

    // ---- Renderer (4K-sharp: up to 2x pixel density + antialiasing) ----
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      // No WebGL: leave the CSS gradient (.three-bg-base) as the background.
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0); // transparent: the page gradient shows through
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ---- Scene + camera ----
    const scene = new THREE.Scene();
    const FOG_DARK = new THREE.Color(0x0f172a);
    const FOG_LIGHT = new THREE.Color(0xf4f6fb);
    scene.fog = new THREE.Fog(FOG_DARK.clone(), 30, 62);
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 120);
    const camZ = () => (camera.aspect < 0.8 ? 21 : camera.aspect < 1.2 ? 17.5 : 14.5);
    camera.position.set(0, 0, camZ());

    // Half-extents of the view at z = 0: used to anchor shapes to the edges.
    const halfExtents = () => {
      const halfH = Math.tan(THREE.MathUtils.degToRad(55 / 2)) * camera.position.z;
      return { halfW: halfH * camera.aspect, halfH };
    };

    // ---- Environment map: studio panels (PMREM), so chrome reads as chrome ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x0b0b0e);
    const panel = (color, intensity, w, h, x, y, z, rx = 0, ry = 0) => {
      const mat = track(
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) })
      );
      const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      envScene.add(mesh);
    };
    panel(0xffffff, 9, 14, 3.2, 0, 8, 0, Math.PI / 2.6, 0);
    panel(0xffffff, 6, 3, 10, -10, 1, 2, 0, Math.PI / 2.4);
    panel(0x7c3aed, 6, 3.4, 10, 10, 0, 2, 0, -Math.PI / 2.4);
    panel(0x8b5cf6, 4, 2.2, 9, -6, -6, 3, 0, Math.PI / 3);
    panel(0x50dcff, 4, 12, 2.4, 0, -8, 1, -Math.PI / 2.6, 0);
    panel(0xffffff, 3, 16, 5, 0, 1, -11, 0, 0);
    const envRT = pmrem.fromScene(envScene, 0.05);
    scene.environment = envRT.texture;

    // ---- Lights ----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x0c0c10, 0.55);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(6, 10, 9);
    scene.add(key);
    const scrollLight = new THREE.PointLight(0xffffff, 280, 74, 1.6);
    scrollLight.position.set(0, 3, 7);
    scene.add(scrollLight);
    const violetLight = new THREE.PointLight(0x7c3aed, 175, 50, 1.7);
    violetLight.position.set(9, -4, 3);
    scene.add(violetLight);
    const violetLight2 = new THREE.PointLight(0x8b5cf6, 120, 46, 1.7);
    violetLight2.position.set(-8, -6, 4);
    scene.add(violetLight2);
    const cyanLight = new THREE.PointLight(0x50dcff, 110, 46, 1.7);
    cyanLight.position.set(-10, 5, 2);
    scene.add(cyanLight);
    const mouseLight = new THREE.PointLight(0xffffff, 70, 32, 1.8);
    mouseLight.position.set(0, 0, 6);
    scene.add(mouseLight);

    // ---- Materials (exact preview values) ----
    const chromeMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xf4f6f9, metalness: 1.0, roughness: 0.07,
        envMapIntensity: 1.8, clearcoat: 0.5, clearcoatRoughness: 0.08,
      })
    );
    const violetGlossMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x6d28d9, metalness: 0.05, roughness: 0.13,
        clearcoat: 1.0, clearcoatRoughness: 0.1, envMapIntensity: 1.3,
        emissive: 0x2e1065, emissiveIntensity: 0.4,
      })
    );
    const violetCubeMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x7c3aed, metalness: 0.1, roughness: 0.3,
        clearcoat: 0.9, clearcoatRoughness: 0.3, envMapIntensity: 1.05,
        emissive: 0x4c1d95, emissiveIntensity: 0.5,
      })
    );
    const violetCoreMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x2e1065, metalness: 0.2, roughness: 0.45,
        emissive: 0x1e0a3d, emissiveIntensity: 0.6,
      })
    );
    const cyanGlossMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x22c3e6, metalness: 0.05, roughness: 0.15,
        clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.2,
        emissive: 0x0a3d4d, emissiveIntensity: 0.35,
      })
    );

    // ---- Main chrome chain: 21 fat links, scroll slides it across ----
    const chain = new THREE.Group();
    scene.add(chain);
    const linkGeo = track(new THREE.TorusGeometry(1.04, 0.37, 28, 56));
    const LINKS = 21;
    const chainLinks = [];
    for (let i = 0; i < LINKS; i++) {
      const link = new THREE.Mesh(linkGeo, chromeMat);
      const s = i - 10;
      link.position.set(s * 1.52, Math.sin(i * 0.52) * 0.6, Math.cos(i * 0.38) * 0.35);
      link.scale.set(1, 1.5, 1); // fat oval links
      if (i % 2 === 0) {
        link.rotation.y = Math.PI / 2.15;
        link.rotation.x = Math.sin(i * 0.52) * 0.22;
      } else {
        link.rotation.z = Math.cos(i * 0.4) * 0.14;
        link.rotation.x = Math.sin(i * 0.52) * 0.18;
      }
      link.userData.phase = i * 0.45;
      link.userData.even = i % 2 === 0;
      chain.add(link);
      chainLinks.push(link);
    }
    chain.rotation.z = -0.36;

    // ---- Second chain: 15 smaller links, drifting the opposite way ----
    const chain2 = new THREE.Group();
    scene.add(chain2);
    const linkGeo2 = track(new THREE.TorusGeometry(0.72, 0.26, 22, 44));
    const LINKS2 = 15;
    const chain2Links = [];
    for (let j = 0; j < LINKS2; j++) {
      const link = new THREE.Mesh(linkGeo2, chromeMat);
      const s2 = j - 7;
      link.position.set(s2 * 1.06, Math.sin(j * 0.6) * 0.45, Math.cos(j * 0.44) * 0.3);
      link.scale.set(1, 1.5, 1);
      if (j % 2 === 0) link.rotation.y = Math.PI / 2.15;
      link.userData.phase = j * 0.5;
      chain2.add(link);
      chain2Links.push(link);
    }
    chain2.rotation.z = 0.3;

    // ---- Violet cube ball: 920 cubes on a Fibonacci sphere + 2 rings + halo ----
    const ballGroup = new THREE.Group();
    scene.add(ballGroup);
    const core = new THREE.Mesh(track(new THREE.SphereGeometry(2.28, 40, 28)), violetCoreMat);
    ballGroup.add(core);
    const CUBES = 920;
    const cubeGeo = track(new THREE.BoxGeometry(0.26, 0.26, 0.26));
    const cubes = new THREE.InstancedMesh(cubeGeo, violetCubeMat, CUBES);
    track(cubes);
    {
      const dummy = new THREE.Object3D();
      const golden = Math.PI * (3 - Math.sqrt(5));
      const pos = new THREE.Vector3();
      for (let c = 0; c < CUBES; c++) {
        const yy = 1 - (c / (CUBES - 1)) * 2;
        const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
        const th = golden * c;
        pos.set(Math.cos(th) * rad * 2.5, yy * 2.5, Math.sin(th) * rad * 2.5);
        dummy.position.copy(pos);
        dummy.lookAt(pos.x * 2, pos.y * 2, pos.z * 2);
        dummy.rotateX((Math.random() - 0.5) * 0.5);
        dummy.rotateY((Math.random() - 0.5) * 0.5);
        dummy.scale.setScalar(0.85 + Math.random() * 0.5);
        dummy.updateMatrix();
        cubes.setMatrixAt(c, dummy.matrix);
      }
      cubes.instanceMatrix.needsUpdate = true;
    }
    ballGroup.add(cubes);
    const ringA = new THREE.Mesh(track(new THREE.TorusGeometry(3.35, 0.09, 18, 90)), chromeMat);
    ringA.rotation.x = Math.PI / 2.4;
    ballGroup.add(ringA);
    const ringB = new THREE.Mesh(track(new THREE.TorusGeometry(3.8, 0.06, 16, 90)), cyanGlossMat);
    ringB.rotation.x = Math.PI / 1.8;
    ringB.rotation.y = 0.5;
    ballGroup.add(ringB);

    // Glow halo behind the ball (radial-gradient sprite).
    const haloCanvas = document.createElement("canvas");
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    {
      const hctx = haloCanvas.getContext("2d");
      const grad = hctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(139,92,246,0.85)");
      grad.addColorStop(0.45, "rgba(124,58,237,0.38)");
      grad.addColorStop(1, "rgba(124,58,237,0)");
      hctx.fillStyle = grad;
      hctx.fillRect(0, 0, 256, 256);
    }
    const haloTexture = track(new THREE.CanvasTexture(haloCanvas));
    const halo = new THREE.Sprite(
      track(new THREE.SpriteMaterial({ map: haloTexture, transparent: true, opacity: 0.85, depthWrite: false }))
    );
    halo.scale.set(15, 15, 1);
    scene.add(halo);

    // ---- Floating shapes (10) — anchored to the edges, three depth layers ----
    // [geometry, material, xNorm, yNorm, z, scale, spin, depth]
    // xNorm/yNorm are fractions of the viewport (yNorm 0 = bottom, 1 = top).
    const shapeDefs = [
      [new THREE.TorusGeometry(1.12, 0.64, 30, 64), violetGlossMat, -0.4, 0.13, -1.6, 1.15, 0.3, 1.25],
      [new THREE.TorusKnotGeometry(0.82, 0.4, 130, 22), violetGlossMat, 0.42, 0.88, -2.4, 1.1, 0.26, 0.9],
      [new THREE.SphereGeometry(1.25, 48, 32), violetGlossMat, -0.46, 0.62, -3.2, 1.0, 0.16, 0.8],
      [new THREE.OctahedronGeometry(0.85, 0), violetGlossMat, -0.47, 0.18, -5.2, 0.9, 0.4, 0.45],
      [new THREE.IcosahedronGeometry(0.8, 0), chromeMat, 0.47, 0.55, -3.4, 1.0, 0.35, 0.8],
      [new THREE.TorusGeometry(0.85, 0.45, 26, 56), cyanGlossMat, 0.44, 0.1, -3.0, 1.0, 0.32, 0.85],
      [new THREE.CapsuleGeometry(0.42, 0.9, 8, 20), violetGlossMat, 0.48, 0.3, -5.6, 1.0, 0.22, 0.45],
      [new THREE.TorusKnotGeometry(0.55, 0.24, 110, 18), chromeMat, -0.48, 0.32, -5.8, 1.0, 0.3, 0.4],
      [new THREE.SphereGeometry(0.55, 36, 24), violetGlossMat, 0.3, 0.15, -5.4, 1.0, 0.12, 0.4],
      [new THREE.SphereGeometry(0.58, 48, 32), chromeMat, -0.26, 0.06, -1.4, 1.0, 0, 1.2],
    ];
    const shapes = shapeDefs.map(([geo, mat, xNorm, yNorm, z, scale, spin, depth], i) => {
      const mesh = new THREE.Mesh(track(geo), mat);
      mesh.position.z = z;
      // The third shape is a squashed glossy blob, not a round sphere.
      const squash = i === 2;
      mesh.userData = {
        xNorm, yNorm, z, baseScale: scale, spin, depth,
        phase: i === 9 ? 1.3 : i * 1.7, squash,
        baseX: 0, baseY: 0,
      };
      scene.add(mesh);
      return mesh;
    });

    // ---- Particles: far silver starfield + nearer violet dust ----
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    {
      const dctx = dotCanvas.getContext("2d");
      const grad = dctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      dctx.fillStyle = grad;
      dctx.fillRect(0, 0, 64, 64);
    }
    const dotTexture = track(new THREE.CanvasTexture(dotCanvas));
    const makePoints = (count, spreadX, spreadY, zMin, zSpan, size, color, opacity) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * spreadX;
        positions[i * 3 + 1] = (Math.random() - 0.5) * spreadY;
        positions[i * 3 + 2] = zMin + Math.random() * zSpan;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = track(
        new THREE.PointsMaterial({
          size, color, map: dotTexture, transparent: true, opacity,
          depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        })
      );
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return pts;
    };
    const points = makePoints(340, 44, 26, -16, 8, 0.13, 0xc9ccd4, 0.5);
    const points2 = makePoints(240, 36, 20, -8, 9, 0.24, 0xa78bfa, 0.55);

    // ---- Layout: anchor the ball + shapes to the viewport edges ----
    const layout = () => {
      const { halfW, halfH } = halfExtents();
      // Ball: lower-right empty area.
      ballGroup.position.set(0.37 * 2 * halfW * 0.92, (0.14 - 0.5) * 2 * halfH, -2.2);
      for (const mesh of shapes) {
        const { xNorm, yNorm } = mesh.userData;
        mesh.userData.baseX = xNorm * 2 * halfW;
        mesh.userData.baseY = (yNorm - 0.5) * 2 * halfH;
      }
    };
    layout();

    // ---- Mouse parallax + scroll ----
    const onPointerMove = (e) => {
      if (reducedMotion || !finePointer) return;
      state.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      state.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointerMove);

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      state.scrollTarget = max <= 40 ? 0 : Math.min(1, Math.max(0, window.scrollY / max));
    };
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.position.z = camZ();
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      layout();
      readScroll();
    };
    window.addEventListener("resize", onResize);

    // Burst hook (Add Expense): window.__burst() fires a pulse through the scene.
    window.__burst = () => {
      state.burst = 1;
    };

    // ---- Animation loop ----
    const clock = new THREE.Clock();
    const C_WHITE = new THREE.Color(0xffffff);
    const C_VIOLET = new THREE.Color(0x7c3aed);
    const C_CYAN = new THREE.Color(0x50dcff);
    const lightColor = new THREE.Color(0xffffff);
    const fogColor = new THREE.Color();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (document.hidden) return; // pause work while the tab is hidden
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = (state.t += reducedMotion ? dt * 0.3 : dt); // slow time, not frozen
      const { px, py, burst } = state;

      // Smooth the pointer + scroll, then ease the theme toward the prop.
      state.px += (state.tx - state.px) * 0.05;
      state.py += (state.ty - state.py) * 0.05;
      if (reducedMotion) {
        state.scrollP = state.scrollTarget;
      } else {
        state.scrollP += (state.scrollTarget - state.scrollP) * 0.065;
      }
      const scrollP = state.scrollP;
      const themeTarget = darkRef.current ? 0 : 1;
      state.themeMix += (themeTarget - state.themeMix) * 0.05;
      const themeMix = state.themeMix;

      // Theme: fog + hemisphere follow the light/dark mix.
      fogColor.lerpColors(FOG_DARK, FOG_LIGHT, themeMix);
      scene.fog.color.copy(fogColor);
      hemi.intensity = 0.55 + themeMix * 0.35;

      // Main chain slides diagonally as you scroll.
      chain.position.set(-8.5 + scrollP * 17 + state.px * 0.7, 2.6 - scrollP * 5.2 - state.py * 0.5, -1.5);
      chain.rotation.z = -0.36 + scrollP * 0.3;
      chain.rotation.x = Math.sin(t * 0.22) * 0.1 + state.py * 0.12;
      for (const link of chainLinks) {
        const { phase, even } = link.userData;
        link.rotation.z += Math.sin(t * 0.6 + phase) * 0.0009;
        link.position.y += Math.sin(t * 1.1 + phase) * 0.0018;
        // even links keep their sideways pose with a slow roll
        if (even) link.rotation.y = Math.PI / 2.15 + Math.sin(t * 0.35 + phase) * 0.1;
      }
      // Second chain drifts the opposite way, further back.
      chain2.position.set(9 - scrollP * 18 - state.px * 0.4, 4.6 - scrollP * 3.4 - state.py * 0.3, -7.5);
      chain2.rotation.z = 0.3 - scrollP * 0.22 + Math.sin(t * 0.18) * 0.04;
      for (const link of chain2Links) {
        link.rotation.z += Math.sin(t * 0.5 + link.userData.phase) * 0.0011;
      }

      // Cube ball: slow spin, scroll twist, breathing scale, spinning rings.
      ballGroup.rotation.y = t * 0.3 + scrollP * 1.6;
      ballGroup.rotation.x = Math.sin(t * 0.3) * 0.14 + scrollP * 0.5;
      ballGroup.position.y += Math.sin(t * 0.9) * 0.0016;
      ballGroup.scale.setScalar(1 + Math.sin(t * 1.15) * 0.02 + state.burst * 0.16);
      ringA.rotation.z = t * 0.55;
      ringB.rotation.z = -t * 0.4;
      ringB.rotation.x = Math.PI / 1.8 + Math.sin(t * 0.4) * 0.2;
      halo.position.set(ballGroup.position.x, ballGroup.position.y, ballGroup.position.z - 3.5);
      halo.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.12 + state.burst * 0.25;

      // Floating shapes: spin, bob, breathe, parallax at their own depth.
      for (const mesh of shapes) {
        const { spin, phase, depth, baseScale, baseX, baseY, squash } = mesh.userData;
        mesh.rotation.x = t * spin + phase;
        mesh.rotation.y = t * spin * 0.8 + phase;
        mesh.rotation.z = Math.sin(t * 0.4 + phase) * 0.25;
        mesh.position.x = baseX + state.px * 0.55 * depth;
        mesh.position.y = baseY + Math.sin(t * 0.7 + phase) * 0.3 * depth - state.py * 0.4 * depth;
        const b = 1 + Math.sin(t * 1.25 + phase) * 0.045 + state.burst * 0.1;
        if (squash) {
          mesh.scale.set(1.2 * b, 0.88 * (2 - b), b);
        } else {
          mesh.scale.setScalar(baseScale * b);
        }
      }

      // Particles drift slowly.
      points.rotation.y = t * 0.012 + state.px * 0.04;
      points2.rotation.y = -t * 0.03 + state.px * 0.09;
      points2.rotation.x = Math.sin(t * 0.2) * 0.05;

      // Lights: scroll light sweeps white -> violet -> cyan; the rest breathe.
      if (scrollP < 0.5) lightColor.copy(C_WHITE).lerp(C_VIOLET, scrollP * 2);
      else lightColor.copy(C_VIOLET).lerp(C_CYAN, (scrollP - 0.5) * 2);
      scrollLight.color.copy(lightColor);
      scrollLight.intensity = 260 + state.burst * 280;
      scrollLight.position.x = chain.position.x * 0.4 + state.px * 6;
      scrollLight.position.y = chain.position.y + 2.5 - state.py * 3;
      violetLight.position.x = 9 + Math.sin(t * 0.45) * 2.4;
      violetLight.intensity = 165 + Math.sin(t * 1.6) * 30 + state.burst * 90;
      violetLight2.position.y = -6 + Math.cos(t * 0.5) * 1.8;
      cyanLight.position.y = 5 + Math.cos(t * 0.38) * 2;
      mouseLight.position.x = state.px * 11;
      mouseLight.position.y = -state.py * 7;
      chromeMat.envMapIntensity = 1.7 + Math.sin(t * 0.8) * 0.15 + state.burst * 0.6;

      // Burst fades out; camera eases toward the pointer.
      state.burst = Math.max(0, state.burst - dt * 1.1);
      camera.position.x = state.px * 1.1;
      camera.position.y = -state.py * 0.7;
      camera.lookAt(state.px * 0.4, -state.py * 0.25, 0);

      renderer.render(scene, camera);
    };
    animate();

    // ---- Cleanup (StrictMode-safe: unmount removes everything) ----
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
      if (window.__burst) delete window.__burst;
      for (const obj of disposables) obj.dispose?.();
      envRT.dispose();
      pmrem.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div className="three-bg-base" data-dark={dark ? "true" : "false"} aria-hidden="true" />
      <div className="three-bg-vignette" aria-hidden="true" />
      <div className="three-bg" ref={mountRef} aria-hidden="true" />
    </>
  );
}
