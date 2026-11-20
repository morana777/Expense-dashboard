// ThreeBackground.jsx — "Deep Aurora" 4K cosmic backdrop (full redesign).
// Scene: aurora curtains (custom shader planes), a rising crystal monolith,
// flowing light ribbons, a warp starfield tunnel, and orbital light orbs.
// Same public API: <ThreeBackground dark={darkMode} /> + window.__burst().
// Same DOM contract (.three-bg-base / .three-bg-vignette / .three-bg).

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground({ dark = true }) {
  const mountRef = useRef(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const state = {
      px: 0, py: 0, tx: 0, ty: 0,
      scrollP: 0, scrollTarget: 0,
      burst: 0,
      themeMix: darkRef.current ? 0 : 1,
      t: 0,
    };

    const disposables = [];
    const track = (o) => { if (o) disposables.push(o); return o; };

    // ---------- Renderer ----------
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true, alpha: true, powerPreference: "high-performance", precision: "highp",
      });
    } catch { return undefined; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ---------- Scene / camera ----------
    const scene = new THREE.Scene();
    const FOG_DARK = new THREE.Color(0x03040a);
    const FOG_LIGHT = new THREE.Color(0xeef2ff);
    scene.fog = new THREE.Fog(FOG_DARK.clone(), 22, 70);

    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.1, 300);
    const camZ = () => (camera.aspect < 0.8 ? 20 : camera.aspect < 1.2 ? 17 : 14.5);
    camera.position.set(0, 0, camZ());

    const halfExtents = () => {
      const h = Math.tan(THREE.MathUtils.degToRad(58 / 2)) * camera.position.z;
      return { halfW: h * camera.aspect, halfH: h };
    };

    // ---------- Environment (for glossy reflections) ----------
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x03040a);
    const envPanel = (col, i, w, h, x, y, z, rx = 0, ry = 0) => {
      const m = track(new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i) }));
      const g = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), m);
      g.position.set(x, y, z); g.rotation.set(rx, ry, 0); envScene.add(g);
    };
    envPanel(0x9ffcff, 12, 18, 3, 0, 10, 0, Math.PI / 2.6);
    envPanel(0xff4fd8, 8, 3, 12, -12, 0, 2, 0, Math.PI / 2.3);
    envPanel(0x7c5cff, 8, 3, 12, 12, 1, 2, 0, -Math.PI / 2.3);
    envPanel(0x9ffcff, 6, 14, 3, 0, -10, 1, -Math.PI / 2.6);
    envPanel(0xffffff, 4, 20, 6, 0, 0, -13);
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;

    // ---------- Lights ----------
    scene.add(new THREE.HemisphereLight(0x9ffcff, 0x0a0420, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(7, 11, 9); scene.add(key);

    const cyanL = new THREE.PointLight(0x9ffcff, 260, 70, 1.6);
    cyanL.position.set(-9, 4, 4); scene.add(cyanL);
    const pinkL = new THREE.PointLight(0xff4fd8, 230, 60, 1.7);
    pinkL.position.set(9, -3, 4); scene.add(pinkL);
    const violetL = new THREE.PointLight(0x7c5cff, 200, 60, 1.7);
    violetL.position.set(0, -6, 2); scene.add(violetL);
    const mouseL = new THREE.PointLight(0xffffff, 90, 40, 1.8);
    mouseL.position.set(0, 0, 6); scene.add(mouseL);

    // ---------- Materials ----------
    const crystalMat = track(new THREE.MeshPhysicalMaterial({
      color: 0x9ffcff, metalness: 0.2, roughness: 0.08,
      transmission: 0.6, thickness: 1.6, ior: 1.4,
      clearcoat: 1.0, clearcoatRoughness: 0.06,
      emissive: 0x1a5bff, emissiveIntensity: 0.35,
      envMapIntensity: 2.0,
    }));
    const chromeMat = track(new THREE.MeshPhysicalMaterial({
      color: 0xf4f6f9, metalness: 1.0, roughness: 0.08,
      envMapIntensity: 1.8, clearcoat: 0.6, clearcoatRoughness: 0.08,
    }));
    const neonPinkMat = track(new THREE.MeshPhysicalMaterial({
      color: 0xff4fd8, metalness: 0.1, roughness: 0.2,
      clearcoat: 1.0, clearcoatRoughness: 0.15, envMapIntensity: 1.4,
      emissive: 0xff4fd8, emissiveIntensity: 0.6,
    }));
    const neonCyanMat = track(new THREE.MeshPhysicalMaterial({
      color: 0x9ffcff, metalness: 0.1, roughness: 0.2,
      clearcoat: 1.0, clearcoatRoughness: 0.15, envMapIntensity: 1.4,
      emissive: 0x9ffcff, emissiveIntensity: 0.6,
    }));

    // ---------- AURORA CURTAINS (custom shader planes) ----------
    const auroraUniforms = {
      uTime: { value: 0 },
      uMix: { value: state.themeMix },
      uA: { value: new THREE.Color(0x9ffcff) },
      uB: { value: new THREE.Color(0x7c5cff) },
      uC: { value: new THREE.Color(0xff4fd8) },
    };
    const auroraMat = track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: auroraUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform float uMix;
        uniform vec3 uA; uniform vec3 uB; uniform vec3 uC;

        void main() {
          vec2 uv = vUv;
          // vertical curtain bands with flowing noise
          float wave = sin(uv.x * 9.0 + uTime * 0.5) * 0.5 + 0.5;
          float wave2 = sin(uv.x * 4.0 - uTime * 0.35 + uv.y * 2.0) * 0.5 + 0.5;
          float streak = smoothstep(0.2, 1.0, pow(wave * wave2, 1.4));

          // vertical falloff — brighter at top, dissolves at bottom
          float vFade = smoothstep(0.0, 0.4, uv.y) * smoothstep(1.05, 0.45, uv.y);

          vec3 col = mix(uA, uB, wave);
          col = mix(col, uC, wave2 * 0.55);

          float alpha = streak * vFade * 0.6;
          alpha *= mix(1.0, 0.55, uMix);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }));

    const auroraGroup = new THREE.Group();
    scene.add(auroraGroup);
    const curtainDefs = [
      { w: 46, h: 20, x: -6, y: 6, z: -18, ry: 0.15 },
      { w: 52, h: 22, x: 6, y: 8, z: -26, ry: -0.12 },
      { w: 40, h: 18, x: 0, y: 10, z: -34, ry: 0 },
    ];
    curtainDefs.forEach((d) => {
      const g = track(new THREE.PlaneGeometry(d.w, d.h, 40, 20));
      const m = new THREE.Mesh(g, auroraMat);
      m.position.set(d.x, d.y, d.z);
      m.rotation.y = d.ry;
      auroraGroup.add(m);
    });

    // ---------- CRYSTAL MONOLITH (rising from below) ----------
    const monolithGroup = new THREE.Group();
    scene.add(monolithGroup);
    const monolithGeo = track(new THREE.ConeGeometry(2.0, 9.5, 5, 1));
    const monolith = new THREE.Mesh(monolithGeo, crystalMat);
    monolith.rotation.y = Math.PI / 5;
    monolithGroup.add(monolith);

    // inner glowing core
    const coreGeo = track(new THREE.OctahedronGeometry(0.9, 0));
    const coreMat = track(new THREE.MeshBasicMaterial({
      color: 0x9ffcff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 0.5;
    monolithGroup.add(core);

    // monolith halo glow sprite
    const makeGlow = (inner, mid, outer) => {
      const c = document.createElement("canvas");
      c.width = 256; c.height = 256;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, inner); g.addColorStop(0.5, mid); g.addColorStop(1, outer);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      return track(new THREE.CanvasTexture(c));
    };
    const cyanGlow = makeGlow("rgba(159,252,255,0.95)", "rgba(124,92,255,0.45)", "rgba(124,92,255,0)");
    const pinkGlow = makeGlow("rgba(255,79,216,0.9)", "rgba(255,79,216,0.35)", "rgba(255,79,216,0)");
    const monolithHalo = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: cyanGlow, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    monolithHalo.scale.set(16, 16, 1);
    scene.add(monolithHalo);

    // ---------- LIGHT RIBBONS (flowing curved tubes around monolith) ----------
    const ribbonGroup = new THREE.Group();
    monolithGroup.add(ribbonGroup);
    const ribbonMat = track(new THREE.MeshBasicMaterial({
      color: 0xff4fd8, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const ribbonMat2 = track(new THREE.MeshBasicMaterial({
      color: 0x9ffcff, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const ribbons = [];
    for (let i = 0; i < 3; i++) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(i * 2.1) * 4.5, -3, Math.sin(i * 2.1) * 4.5),
        new THREE.Vector3(Math.cos(i * 2.1 + 1.5) * 6, 0.5, Math.sin(i * 2.1 + 1.5) * 6),
        new THREE.Vector3(Math.cos(i * 2.1 + 3.0) * 4.5, 4, Math.sin(i * 2.1 + 3.0) * 4.5),
        new THREE.Vector3(Math.cos(i * 2.1 + 4.5) * 6, 7, Math.sin(i * 2.1 + 4.5) * 6),
      ]);
      const g = track(new THREE.TubeGeometry(curve, 120, 0.06, 8, false));
      const m = new THREE.Mesh(g, i % 2 === 0 ? ribbonMat : ribbonMat2);
      ribbonGroup.add(m);
      ribbons.push(m);
    }

    // ---------- ORBITAL LIGHT ORBS ----------
    const orbs = [];
    for (let i = 0; i < 8; i++) {
      const orb = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.25 + Math.random() * 0.25, 20, 16)),
        i % 3 === 0 ? neonPinkMat : i % 3 === 1 ? neonCyanMat : chromeMat
      );
      orb.userData = {
        radius: 6 + Math.random() * 5,
        speed: 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        yAmp: 1.5 + Math.random() * 3,
        yBase: -2 + Math.random() * 6,
      };
      scene.add(orb);
      orbs.push(orb);
    }

    // ---------- WARP STARFIELD TUNNEL ----------
    const TUNNEL_COUNT = 2200;
    const tunnelGeo = track(new THREE.BufferGeometry());
    const tPos = new Float32Array(TUNNEL_COUNT * 3);
    const tVel = new Float32Array(TUNNEL_COUNT);
    for (let i = 0; i < TUNNEL_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 14;
      tPos[i * 3] = Math.cos(a) * r;
      tPos[i * 3 + 1] = Math.sin(a) * r;
      tPos[i * 3 + 2] = -60 + Math.random() * 120;
      tVel[i] = 2 + Math.random() * 5;
    }
    tunnelGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));

    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 64; dotCanvas.height = 64;
    {
      const c = dotCanvas.getContext("2d");
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.5, "rgba(159,252,255,0.7)");
      g.addColorStop(1, "rgba(159,252,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    }
    const dotTexture = track(new THREE.CanvasTexture(dotCanvas));
    const tunnelMat = track(new THREE.PointsMaterial({
      size: 0.22, map: dotTexture, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0x9ffcff,
    }));
    const tunnel = new THREE.Points(tunnelGeo, tunnelMat);
    scene.add(tunnel);

    // ---------- FLOATING SHAPES (corner anchors, 3 depth layers) ----------
    const shapeDefs = [
      [new THREE.TorusKnotGeometry(0.9, 0.32, 160, 24), neonPinkMat, -0.4, 0.2, -3, 1.0, 0.3, 1.0],
      [new THREE.IcosahedronGeometry(0.9, 0), chromeMat, 0.45, 0.78, -4, 1.0, 0.4, 0.7],
      [new THREE.OctahedronGeometry(0.75, 0), neonCyanMat, -0.45, 0.72, -5, 1.0, 0.5, 0.5],
      [new THREE.TorusGeometry(0.9, 0.45, 26, 56), chromeMat, 0.44, 0.15, -3.5, 1.0, 0.35, 0.8],
      [new THREE.CapsuleGeometry(0.35, 0.85, 8, 20), neonPinkMat, -0.46, 0.4, -4.5, 1.0, 0.3, 0.6],
    ];
    const shapes = shapeDefs.map(([geo, mat, xN, yN, z, s, spin, depth], i) => {
      const mesh = new THREE.Mesh(track(geo), mat);
      mesh.position.z = z;
      mesh.userData = { xNorm: xN, yNorm: yN, z, baseScale: s, spin, depth, phase: i * 1.9, baseX: 0, baseY: 0 };
      scene.add(mesh);
      return mesh;
    });

    // ---------- Layout ----------
    const layout = () => {
      const { halfW, halfH } = halfExtents();
      monolithGroup.position.set(0.15 * 2 * halfW * 0.6, -halfH * 0.55, -6);
      monolithHalo.position.set(monolithGroup.position.x, monolithGroup.position.y + 2, monolithGroup.position.z - 2);
      for (const m of shapes) {
        m.userData.baseX = m.userData.xNorm * 2 * halfW;
        m.userData.baseY = (m.userData.yNorm - 0.5) * 2 * halfH;
      }
    };
    layout();

    // ---------- Pointer + scroll ----------
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
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.position.z = camZ();
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
      renderer.setSize(w, h);
      layout(); readScroll();
    };
    window.addEventListener("resize", onResize);

    window.__burst = () => { state.burst = 1; };

    // ---------- Animate ----------
    const clock = new THREE.Clock();
    const fogColor = new THREE.Color();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (document.hidden) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = (state.t += reducedMotion ? dt * 0.3 : dt);
      const { burst } = state;

      state.px += (state.tx - state.px) * 0.05;
      state.py += (state.ty - state.py) * 0.05;
      state.scrollP += reducedMotion ? (state.scrollTarget - state.scrollP) : (state.scrollTarget - state.scrollP) * 0.07;
      state.themeMix += ((darkRef.current ? 0 : 1) - state.themeMix) * 0.05;
      const scrollP = state.scrollP;
      const themeMix = state.themeMix;

      fogColor.lerpColors(FOG_DARK, FOG_LIGHT, themeMix);
      scene.fog.color.copy(fogColor);

      // Aurora
      auroraUniforms.uTime.value = t;
      auroraUniforms.uMix.value = themeMix;
      auroraGroup.rotation.y = Math.sin(t * 0.08) * 0.15 + state.px * 0.08;
      auroraGroup.position.y = -scrollP * 6;

      // Monolith
      monolithGroup.rotation.y = t * 0.18 + state.px * 0.3;
      monolithGroup.position.y = -halfExtents().halfH * 0.55 + scrollP * 3 + Math.sin(t * 0.8) * 0.2;
      core.rotation.x = t * 0.6; core.rotation.y = t * 0.9;
      core.scale.setScalar(1 + Math.sin(t * 2) * 0.08 + burst * 0.3);
      monolithHalo.material.opacity = 0.55 + Math.sin(t * 1.3) * 0.12 + burst * 0.3;

      // Ribbons
      ribbonGroup.rotation.y = -t * 0.25;
      ribbonGroup.rotation.x = Math.sin(t * 0.4) * 0.1;
      ribbonMat.opacity = 0.45 + Math.sin(t * 1.2) * 0.1;
      ribbonMat2.opacity = 0.35 + Math.cos(t * 1.1) * 0.1;

      // Orbs orbit
      for (const orb of orbs) {
        const u = orb.userData;
        const a = t * u.speed + u.phase;
        orb.position.set(
          Math.cos(a) * u.radius + state.px * 0.4,
          u.yBase + Math.sin(a * 1.7) * u.yAmp,
          Math.sin(a) * u.radius
        );
        const s = 1 + Math.sin(t * 2 + u.phase) * 0.1 + burst * 0.2;
        orb.scale.setScalar(s);
      }

      // Warp tunnel: stars stream toward camera
      {
        const pos = tunnelGeo.attributes.position.array;
        for (let i = 0; i < TUNNEL_COUNT; i++) {
          pos[i * 3 + 2] += tVel[i] * dt * (1 + scrollP * 3 + burst * 6);
          if (pos[i * 3 + 2] > 60) pos[i * 3 + 2] = -60;
        }
        tunnelGeo.attributes.position.needsUpdate = true;
        tunnel.rotation.z = t * 0.03 + state.px * 0.05;
        tunnelMat.size = 0.22 + scrollP * 0.35 + burst * 0.4;
      }

      // Shapes
      for (const m of shapes) {
        const d = m.userData;
        m.rotation.x = t * d.spin + d.phase;
        m.rotation.y = t * d.spin * 0.8 + d.phase;
        m.rotation.z = Math.sin(t * 0.4 + d.phase) * 0.25;
        m.position.x = d.baseX + state.px * 0.55 * d.depth;
        m.position.y = d.baseY + Math.sin(t * 0.7 + d.phase) * 0.3 * d.depth - state.py * 0.4 * d.depth;
        const b = 1 + Math.sin(t * 1.25 + d.phase) * 0.05 + burst * 0.1;
        m.scale.setScalar(d.baseScale * b);
      }

      // Lights
      cyanL.position.x = -9 + Math.sin(t * 0.4) * 2.5;
      cyanL.intensity = 240 + Math.sin(t * 1.5) * 40 + burst * 150;
      pinkL.position.x = 9 + Math.cos(t * 0.5) * 2.5;
      pinkL.intensity = 210 + Math.sin(t * 1.7 + 1) * 35 + burst * 130;
      violetL.position.y = -6 + Math.sin(t * 0.6) * 2;
      mouseL.position.x = state.px * 12;
      mouseL.position.y = -state.py * 7;
      chromeMat.envMapIntensity = 1.8 + Math.sin(t * 0.8) * 0.16 + burst * 0.7;

      state.burst = Math.max(0, state.burst - dt * 1.1);
      camera.position.x = state.px * 1.2;
      camera.position.y = -state.py * 0.8;
      camera.lookAt(state.px * 0.4, -state.py * 0.25, 0);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
      if (window.__burst) delete window.__burst;
      for (const o of disposables) o.dispose?.();
      envRT.dispose(); pmrem.dispose();
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