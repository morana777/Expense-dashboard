// ThreeBackground.jsx — realistic 3D background for the Money Expenses Dashboard.
// Plain three.js (no React Three Fiber), so it adds one dependency only: three.
// Light mode: soft pastel glass shapes floating over a light gradient.
// Dark mode: the same shapes glow a little stronger over a deep navy gradient.
// The canvas is fixed behind the dashboard, never blocks clicks, and pauses
// when the tab is hidden. It renders at up to 2x pixel density, so it stays
// crisp on retina / 4K screens. Respects prefers-reduced-motion (one still frame).
// Mount it once at the top of the app: <ThreeBackground dark={darkMode} />

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export default function ThreeBackground({ dark = false }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- Renderer (4K-sharp: up to 2x pixel density + antialiasing) ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0); // transparent: the page gradient shows through
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = dark ? 1.15 : 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // ---- Scene + camera ----
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 100);
    const setCameraDistance = () => {
      // Pull back on narrow screens so the shapes stay in frame
      camera.position.z = camera.aspect < 0.8 ? 15 : camera.aspect < 1.2 ? 13 : 11;
    };
    setCameraDistance();

    // Soft studio reflections so the glass looks like real glass
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // ---- Lights ----
    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.55 : 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, dark ? 1.0 : 1.4);
    sun.position.set(5, 8, 6);
    scene.add(sun);
    const glowViolet = new THREE.PointLight(0x8b5cf6, dark ? 60 : 30, 25);
    glowViolet.position.set(-6, 3, 2);
    scene.add(glowViolet);
    const glowPink = new THREE.PointLight(0xec4899, dark ? 50 : 25, 25);
    glowPink.position.set(6, -3, 2);
    scene.add(glowPink);

    // ---- Glass shapes (kept near the edges so the middle stays calm) ----
    const glass = (color) =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: 0.12,
        transmission: 0.9,
        thickness: 1.5,
        ior: 1.45,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        transparent: true,
        opacity: 0.94,
        envMapIntensity: 1.1,
      });

    const palette = dark
      ? [0xa78bfa, 0xf472b6, 0xfbbf24, 0x34d399, 0x60a5fa, 0xc4b5fd, 0xf9a8d4]
      : [0x8b5cf6, 0xec4899, 0xf59e0b, 0x10b981, 0x3b82f6, 0xa78bfa, 0xf472b6];

    const shapes = [
      { geo: new THREE.TorusKnotGeometry(0.85, 0.28, 140, 20), pos: [-5.6, 2.3, -3], scale: 1.05, spin: [0.0016, 0.0022], bob: 0.35, phase: 0 },
      { geo: new THREE.IcosahedronGeometry(1.15, 0), pos: [5.9, 2.6, -4], scale: 1.35, spin: [0.002, 0.0014], bob: 0.3, phase: 1.4 },
      { geo: new THREE.SphereGeometry(0.95, 48, 48), pos: [-6.3, -2.7, -2], scale: 1.0, spin: [0.001, 0.0018], bob: 0.4, phase: 2.6 },
      { geo: new THREE.OctahedronGeometry(1.05, 0), pos: [6.1, -2.5, -3], scale: 1.25, spin: [0.0024, 0.0016], bob: 0.32, phase: 3.8 },
      { geo: new THREE.TorusGeometry(1.1, 0.32, 24, 80), pos: [0, 3.6, -6], scale: 1.5, spin: [0.0012, 0.002], bob: 0.22, phase: 5.1 },
      { geo: new THREE.IcosahedronGeometry(0.7, 0), pos: [2.6, -3.4, -2], scale: 0.7, spin: [0.0028, 0.002], bob: 0.45, phase: 0.9 },
      { geo: new THREE.SphereGeometry(0.6, 48, 48), pos: [-2.9, 3.1, -5], scale: 0.6, spin: [0.0015, 0.0026], bob: 0.38, phase: 4.4 },
    ].map((s, i) => {
      const mesh = new THREE.Mesh(s.geo, glass(palette[i % palette.length]));
      mesh.position.set(...s.pos);
      mesh.scale.setScalar(s.scale);
      mesh.userData = { spin: s.spin, bob: s.bob, phase: s.phase, baseY: s.pos[1] };
      scene.add(mesh);
      return mesh;
    });

    // ---- Floating dust particles (soft round dots, for depth) ----
    const dotCanvas = document.createElement("canvas");
    dotCanvas.width = 64;
    dotCanvas.height = 64;
    const dotCtx = dotCanvas.getContext("2d");
    const gradient = dotCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    dotCtx.fillStyle = gradient;
    dotCtx.fillRect(0, 0, 64, 64);
    const dotTexture = new THREE.CanvasTexture(dotCanvas);

    const particleCount = 350;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18; // x
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10; // y
      positions[i * 3 + 2] = -1 - Math.random() * 6; // z, behind the shapes
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: dark ? 0xa78bfa : 0x8b5cf6,
      size: 0.14,
      map: dotTexture,
      transparent: true,
      opacity: dark ? 0.65 : 0.45,
      sizeAttenuation: true,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ---- Mouse parallax (camera eases toward the pointer) ----
    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      setCameraDistance();
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ---- Animation loop ----
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (document.hidden) return; // pause work while the tab is hidden
      const t = clock.getElapsedTime();
      for (const mesh of shapes) {
        const { spin, bob, phase, baseY } = mesh.userData;
        mesh.rotation.x += spin[0];
        mesh.rotation.y += spin[1];
        mesh.position.y = baseY + Math.sin(t * 0.6 + phase) * bob;
      }
      particles.rotation.y = t * 0.02;
      particles.position.y = Math.sin(t * 0.25) * 0.15;
      camera.position.x += (mouse.x * 0.9 - camera.position.x) * 0.04;
      camera.position.y += (mouse.y * 0.5 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      renderer.render(scene, camera); // one still frame, no motion
    } else {
      animate();
    }

    // ---- Cleanup (StrictMode-safe: unmount removes everything) ----
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      for (const mesh of shapes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      particleGeo.dispose();
      particleMat.dispose();
      dotTexture.dispose();
      pmrem.dispose();
      scene.environment?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [dark]);

  return (
    <>
      <div className="three-bg-base" data-dark={dark ? "true" : "false"} aria-hidden="true" />
      <div className="three-bg" ref={mountRef} aria-hidden="true" />
    </>
  );
}
