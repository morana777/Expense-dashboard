import { useEffect, useRef } from "react";
import * as THREE from "three";

import lakeUrl from "./assets/images/silver_lake_water_1795473108796.jpg";
import whiteSwanCleanUrl from "./assets/images/white_swan_clean_1795243288021.jpg";
import blackSwanProfileUrl from "./assets/images/black_swan_profile_1795242894323.jpg";
import {
  buildPhoto3DSwanAsset,
  createContactShadowTexture,
  SWAN_3D_PHOTO_VERT,
  SWAN_3D_PHOTO_FRAG,
  REFL_3D_PHOTO_VERT,
  REFL_3D_PHOTO_FRAG,
} from "./swanPhoto3D.js";

const _proj = new THREE.Vector3();
const _projAhead = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();

const SWAN_COUNT = 10;
const RIPPLE_COUNT = 8;
const MAX_PARTICLES = 150;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function wrapAngle(a) {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

const LAKE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const LAKE_FRAG = /* glsl */ `
  uniform sampler2D uLakeTex;
  uniform vec2 uResolution;
  uniform vec2 uTexSize;
  uniform float uTime;
  uniform float uThemeMix;
  uniform float uGust;
  uniform vec2 uParallax;
  uniform vec4 uSwanUV[${SWAN_COUNT}];
  uniform vec2 uSwanDir[${SWAN_COUNT}];
  uniform vec4 uRipples[${RIPPLE_COUNT}];

  varying vec2 vUv;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbmMist(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise2(p);
      p = p * 2.07 + vec2(11.3, 4.7);
      a *= 0.5;
    }
    return v;
  }

  vec2 coverUv(vec2 uv, vec2 res, vec2 texRes) {
    float screenAsp = res.x / max(res.y, 1.0);
    float texAsp = texRes.x / max(texRes.y, 1.0);
    vec2 outUv = uv;
    if (screenAsp > texAsp) {
      float scale = texAsp / screenAsp;
      outUv.y = (uv.y - 0.5) * scale + 0.5;
    } else {
      float scale = screenAsp / texAsp;
      outUv.x = (uv.x - 0.5) * scale + 0.5;
    }
    return outUv;
  }

  void main() {
    vec2 baseUv = coverUv(vUv, uResolution, uTexSize);
    baseUv.x += uParallax.x * 0.008;
    baseUv = clamp(baseUv, 0.002, 0.998);

    float horizon = 0.82;
    float isWater = 1.0 - smoothstep(horizon - 0.025, horizon + 0.015, vUv.y);
    float depth = clamp((horizon - vUv.y) / horizon, 0.0, 1.0);

    float perspY = pow(max(0.02, 1.0 - depth), -0.65);
    float w1 = sin(vUv.y * 58.0 + perspY * 6.0 - uTime * 1.05 + vUv.x * 9.5);
    float w2 = cos(vUv.y * 116.0 - uTime * 1.38 - vUv.x * 16.0);
    float w3 = sin(vUv.x * 24.0 + vUv.y * 172.0 - uTime * 1.85);
    float organicWave = noise2(vec2(vUv.x * 16.0 - uTime * 0.25, vUv.y * 42.0 + uTime * 0.45)) - 0.5;

    float rippleAmp = (0.00055 + 0.00175 * depth) * (1.0 + uGust * 0.6);
    vec2 waveOffset = vec2(
      (w1 * 0.45 + w2 * 0.32 + w3 * 0.15 + organicWave * 0.35) * rippleAmp * 1.35,
      (w2 * 0.45 + w3 * 0.35 + organicWave * 0.25) * rippleAmp * 0.36
    );

    float wakeLight = 0.0;
    float wakeShadow = 0.0;
    float scrAsp = uResolution.x / max(uResolution.y, 1.0);

    // 360-degree directional 3D swan bow wakes
    for (int i = 0; i < ${SWAN_COUNT}; i++) {
      vec2 sUv = uSwanUV[i].xy;
      float sSize = uSwanUV[i].z;
      float sWake = uSwanUV[i].w;
      vec2 sDir = uSwanDir[i];
      if (sWake > 0.01 && sSize > 0.001) {
        vec2 d = (vUv - sUv) * vec2(scrAsp, 3.6);
        float dist = length(d) / max(sSize, 0.05);
        if (dist < 3.0) {
          vec2 fwd = normalize(sDir + vec2(0.0001));
          vec2 side = vec2(-fwd.y, fwd.x);
          float ring = sin(dist * 24.0 - uTime * 3.1 - float(i) * 1.7);
          float behind = clamp(dot(-d, fwd) / max(sSize * 1.65, 0.06), 0.0, 2.2);
          float latDist = abs(dot(d, side));
          float vCone = exp(-abs(latDist - behind * 0.22 * sSize) * 19.0) * smoothstep(0.0, 0.22, behind);
          float env = exp(-dist * 1.55) * smoothstep(0.03, 0.18, dist) * sWake;
          vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
          float wakeStrength = env * (0.75 + vCone * 1.65);
          waveOffset += dir * ring * wakeStrength * 0.0032 * sSize;
          wakeLight += (max(0.0, ring) * env * 0.042 + vCone * env * 0.036);
          wakeShadow += max(0.0, -ring) * env * 0.055;
        }
      }
    }

    // Interactive touch / click concentric water splash ripples
    for (int k = 0; k < ${RIPPLE_COUNT}; k++) {
      vec4 rip = uRipples[k];
      if (rip.w > 0.005) {
        float yFlatten = mix(2.3, 4.6, clamp(rip.y / horizon, 0.0, 1.0));
        vec2 d = (vUv - rip.xy) * vec2(scrAsp, yFlatten);
        float dist = length(d);
        float maxRad = mix(0.26, 0.11, clamp(rip.y / horizon, 0.0, 1.0));
        float r1 = rip.z * maxRad;
        float r2 = max(0.0, rip.z - 0.14) * maxRad * 0.85;
        float band = 0.016 + rip.z * 0.028;

        float env1 = exp(-pow((dist - r1) / band, 2.0));
        float env2 = exp(-pow((dist - r2) / (band * 0.85), 2.0)) * 0.65;
        float fade = (1.0 - rip.z) * rip.w;

        if (env1 + env2 > 0.01) {
          float osc1 = sin((dist - r1) * 145.0) * env1;
          float osc2 = sin((dist - r2) * 165.0) * env2;
          float osc = (osc1 + osc2) * fade;
          vec2 dir = dist > 0.0005 ? d / dist : vec2(0.0);
          waveOffset += dir * osc * 0.0052;
          wakeLight += max(0.0, osc) * 0.095;
          wakeShadow += max(0.0, -osc) * 0.09;
        }
      }
    }

    vec2 finalUv = clamp(baseUv + waveOffset * isWater, 0.002, 0.998);
    vec2 px = 1.0 / uTexSize;
    vec3 c0 = texture2D(uLakeTex, finalUv).rgb;
    vec3 blur = (
      texture2D(uLakeTex, finalUv + vec2(px.x, 0.0)).rgb +
      texture2D(uLakeTex, finalUv - vec2(px.x, 0.0)).rgb +
      texture2D(uLakeTex, finalUv + vec2(0.0, px.y)).rgb +
      texture2D(uLakeTex, finalUv - vec2(0.0, px.y)).rgb
    ) * 0.25;
    float sharpAmt = mix(0.28, 0.62, depth) * isWater + 0.15 * (1.0 - isWater);
    vec3 sharp = clamp(c0 + (c0 - blur) * sharpAmt, 0.0, 1.0);

    float luma = dot(sharp, vec3(0.299, 0.587, 0.114));
    vec3 silverPlate = mix(sharp, vec3(luma), 0.94);

    float dayContrast = clamp((luma - 0.5) * 1.15 + 0.51, 0.0, 1.0);
    vec3 dayLake = mix(silverPlate, vec3(dayContrast), 0.52) * vec3(0.955, 0.97, 0.995);

    float nightLuma = pow(clamp(luma, 0.0, 1.0), 1.55);
    vec3 nightLake = mix(vec3(0.030, 0.042, 0.068), vec3(0.29, 0.34, 0.43), nightLuma);
    nightLake = mix(nightLake, vec3(0.10, 0.135, 0.19), smoothstep(0.75, 0.98, vUv.y) * 0.45);

    vec3 col = mix(nightLake, dayLake, uThemeMix);

    float mistBand = exp(-pow((vUv.y - 0.80) / 0.11, 2.0));
    float mistTex = fbmMist(vec2(vUv.x * 3.8 + uTime * 0.016, vUv.y * 6.5 - uTime * 0.008));
    vec3 mistTint = mix(vec3(0.16, 0.20, 0.27), vec3(0.84, 0.87, 0.91), uThemeMix);
    col = mix(col, mistTint, mistBand * mistTex * mix(0.26, 0.34, uThemeMix));

    vec3 specTint = mix(vec3(0.60, 0.67, 0.78), vec3(0.96, 0.98, 1.0), uThemeMix);
    float crest = smoothstep(0.54, 0.96, w1 * 0.48 + w2 * 0.38 + organicWave * 0.45) * isWater * (0.18 + 0.82 * depth);
    col += specTint * (crest * mix(0.022, 0.032, uThemeMix) + wakeLight * mix(0.75, 1.0, uThemeMix));
    col *= (1.0 - wakeShadow * mix(0.5, 0.9, uThemeMix));

    float grain = (hash12(gl_FragCoord.xy + fract(uTime * 19.3) * 120.0) - 0.5) * 0.010;
    col = clamp(col + grain, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Soft 3D splash droplets, floating downy swan feathers & feeding crumbs
const PARTICLE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aType;
  attribute float aAngle;
  attribute float aShade;
  uniform float uDpr;
  varying float vAlpha;
  varying float vType;
  varying float vAngle;
  varying float vShade;

  void main() {
    vAlpha = aAlpha;
    vType = aType;
    vAngle = aAngle;
    vShade = aShade;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uDpr * (10.0 / max(1.0, -mvPos.z));
    gl_Position = projectionMatrix * mvPos;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform float uThemeMix;
  varying float vAlpha;
  varying float vType;
  varying float vAngle;
  varying float vShade;

  void main() {
    if (vAlpha <= 0.005) discard;
    vec2 p = gl_PointCoord - 0.5;

    if (vType < 0.5) {
      float r = length(p);
      float drop = smoothstep(0.5, 0.12, r);
      float spec = exp(-r * 8.0);
      if (drop < 0.01) discard;
      vec3 col = mix(vec3(0.66, 0.74, 0.85), vec3(0.95, 0.97, 1.0), uThemeMix);
      col += vec3(0.25) * spec;
      gl_FragColor = vec4(col, drop * vAlpha);
    } else if (vType < 1.5) {
      float c = cos(vAngle);
      float s = sin(vAngle);
      vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
      float curve = rp.x - 0.08 * sin(rp.y * 5.0);
      float body = exp(-abs(curve) * 9.5) * smoothstep(0.46, 0.12, abs(rp.y));
      float barbs = 0.82 + 0.18 * sin((rp.y - abs(curve) * 0.7) * 48.0);
      float alpha = smoothstep(0.18, 0.55, body * barbs) * vAlpha;
      if (alpha < 0.01) discard;

      vec3 whiteFeather = mix(vec3(0.72, 0.77, 0.85), vec3(0.97, 0.98, 1.0), uThemeMix);
      vec3 blackFeather = mix(vec3(0.12, 0.15, 0.21), vec3(0.18, 0.21, 0.27), uThemeMix);
      vec3 col = mix(blackFeather, whiteFeather, vShade);
      col += mix(vec3(0.12), vec3(0.08), vShade) * exp(-abs(curve) * 28.0);
      gl_FragColor = vec4(col, alpha);
    } else {
      float ang = atan(p.y, p.x);
      float r = length(p) * (1.0 + 0.20 * sin(ang * 3.0 + vAngle));
      float crumb = smoothstep(0.42, 0.18, r);
      if (crumb < 0.01) discard;
      vec3 dayCrumb = vec3(0.92, 0.88, 0.80);
      vec3 nightCrumb = vec3(0.56, 0.58, 0.62);
      vec3 col = mix(nightCrumb, dayCrumb, uThemeMix);
      float rim = smoothstep(0.22, 0.42, r);
      col *= mix(1.0, 0.65, rim);
      gl_FragColor = vec4(col, crumb * vAlpha);
    }
  }
`;

export default function ThreeBackground({ dark = true }) {
  const mountRef = useRef(null);
  const darkRef = useRef(dark);
  useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const isSoftwareGl = (() => {
      try {
        const probe = document.createElement("canvas").getContext("webgl2");
        if (!probe) return true;
        const ext = probe.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param) || "");
        probe.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    const state = {
      px: 0,
      py: 0,
      tx: 0,
      ty: 0,
      scrollP: 0,
      scrollTarget: 0,
      gust: 0,
      themeMix: darkRef.current ? 0 : 1,
      t: 0,
      isDraggingWater: false,
      lastTrailAt: 0,
      lastHoverCheck: 0,
      hoveredIdx: -1,
    };

    const disposables = [];
    const track = (o) => {
      if (o) disposables.push(o);
      return o;
    };

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: "high-performance",
        precision: "highp",
      });
    } catch {
      return undefined;
    }

    const getDpr = () => (isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2.0));
    const w0 = mount.clientWidth || window.innerWidth;
    const h0 = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(getDpr());
    renderer.setSize(w0, h0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = false;
    mount.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const bgScene = new THREE.Scene();
    const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const ripples = Array.from({ length: RIPPLE_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      age: 1,
      dur: 2.0,
      strength: 0,
      active: false,
    }));
    let rippleCursor = 0;

    const lakeUniforms = {
      uLakeTex: { value: null },
      uResolution: { value: new THREE.Vector2(w0, h0) },
      uTexSize: { value: new THREE.Vector2(1920, 1080) },
      uTime: { value: 0 },
      uThemeMix: { value: state.themeMix },
      uGust: { value: 0 },
      uParallax: { value: new THREE.Vector2(0, 0) },
      uSwanUV: { value: Array.from({ length: SWAN_COUNT }, () => new THREE.Vector4()) },
      uSwanDir: { value: Array.from({ length: SWAN_COUNT }, () => new THREE.Vector2(1, 0)) },
      uRipples: { value: Array.from({ length: RIPPLE_COUNT }, () => new THREE.Vector4()) },
    };
    const lakeMat = track(
      new THREE.ShaderMaterial({
        uniforms: lakeUniforms,
        vertexShader: LAKE_VERT,
        fragmentShader: LAKE_FRAG,
        depthTest: false,
        depthWrite: false,
      })
    );
    bgScene.add(new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), lakeMat));

    // Main 3D Scene for photo-inflated multi-angle 3D swans, reflections & particles
    const scene = new THREE.Scene();

    const aspect0 = w0 / h0;
    const fov0 = aspect0 < 0.75 ? 50 : aspect0 < 1.1 ? 45 : 42;
    const camera = new THREE.PerspectiveCamera(fov0, aspect0, 0.2, 120);
    const camY = 3.2;
    const getLookDy = (fovDeg) => -10 * 0.64 * Math.tan((fovDeg * 0.5 * Math.PI) / 180);
    camera.position.set(0, camY, 0);
    camera.lookAt(0, camY + getLookDy(fov0), -10);

    // Pre-allocated particle system (zero runtime GC) for splash droplets, feathers & crumbs
    const pPos = new Float32Array(MAX_PARTICLES * 3);
    const pVel = new Float32Array(MAX_PARTICLES * 3);
    const pSize = new Float32Array(MAX_PARTICLES);
    const pAlpha = new Float32Array(MAX_PARTICLES);
    const pType = new Float32Array(MAX_PARTICLES);
    const pAngle = new Float32Array(MAX_PARTICLES);
    const pShade = new Float32Array(MAX_PARTICLES);
    const pLife = new Float32Array(MAX_PARTICLES);
    const pMaxLife = new Float32Array(MAX_PARTICLES);
    const pSeed = new Float32Array(MAX_PARTICLES);
    const pOwner = new Int16Array(MAX_PARTICLES);
    pOwner.fill(-1);
    let particleCursor = 0;

    const pGeo = track(new THREE.BufferGeometry());
    const pPosAttr = new THREE.BufferAttribute(pPos, 3);
    const pSizeAttr = new THREE.BufferAttribute(pSize, 1);
    const pAlphaAttr = new THREE.BufferAttribute(pAlpha, 1);
    const pTypeAttr = new THREE.BufferAttribute(pType, 1);
    const pAngleAttr = new THREE.BufferAttribute(pAngle, 1);
    const pShadeAttr = new THREE.BufferAttribute(pShade, 1);
    pGeo.setAttribute("position", pPosAttr);
    pGeo.setAttribute("aSize", pSizeAttr);
    pGeo.setAttribute("aAlpha", pAlphaAttr);
    pGeo.setAttribute("aType", pTypeAttr);
    pGeo.setAttribute("aAngle", pAngleAttr);
    pGeo.setAttribute("aShade", pShadeAttr);

    const pUniforms = {
      uDpr: { value: getDpr() },
      uThemeMix: { value: state.themeMix },
    };
    const pMat = track(
      new THREE.ShaderMaterial({
        uniforms: pUniforms,
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        transparent: true,
        depthWrite: false,
      })
    );
    const particlePoints = new THREE.Points(pGeo, pMat);
    particlePoints.frustumCulled = false;
    particlePoints.renderOrder = 2000;
    scene.add(particlePoints);

    const spawnRippleAtUv = (uvX, uvY, strength = 0.95, dur = 2.1) => {
      if (uvY > 0.815 || uvY < 0.0 || uvX < 0.0 || uvX > 1.0) return;
      const r = ripples[rippleCursor];
      rippleCursor = (rippleCursor + 1) % RIPPLE_COUNT;
      r.x = uvX;
      r.y = uvY;
      r.age = 0;
      r.dur = dur;
      r.strength = strength;
      r.active = true;
    };

    const spawnParticle = (type, x, y, z, vx, vy, vz, size, maxLife, shade = 1, owner = -1) => {
      const idx = particleCursor;
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      const i3 = idx * 3;
      pPos[i3] = x;
      pPos[i3 + 1] = y;
      pPos[i3 + 2] = z;
      pVel[i3] = vx;
      pVel[i3 + 1] = vy;
      pVel[i3 + 2] = vz;
      pSize[idx] = size;
      pAlpha[idx] = 1;
      pType[idx] = type;
      pAngle[idx] = Math.random() * Math.PI * 2;
      pShade[idx] = shade;
      pLife[idx] = 0;
      pMaxLife[idx] = maxLife;
      pSeed[idx] = Math.random() * 12.0;
      pOwner[idx] = owner;
      pSizeAttr.needsUpdate = true;
      pTypeAttr.needsUpdate = true;
      pShadeAttr.needsUpdate = true;
    };

    const spawnSplashParticles = (wx, wz, count = 12, strength = 1.0) => {
      for (let k = 0; k < count; k++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = (0.35 + Math.random() * 0.75) * strength;
        spawnParticle(
          0,
          wx + (Math.random() - 0.5) * 0.25,
          0.04,
          wz + (Math.random() - 0.5) * 0.15,
          Math.cos(ang) * spd,
          (1.25 + Math.random() * 1.15) * strength,
          Math.sin(ang) * spd * 0.5,
          5.5 + Math.random() * 5.0,
          0.55 + Math.random() * 0.35,
          1.0
        );
      }
    };

    const spawnFeatherBurst = (swan) => {
      const shade = swan.isBlack ? 0.0 : 1.0;
      for (let k = 0; k < 10; k++) {
        const spreadAng = Math.random() * Math.PI * 2;
        const lat = 0.25 + Math.random() * 0.55;
        spawnParticle(
          1,
          swan.x + (Math.random() - 0.5) * 0.55,
          0.42 + Math.random() * 0.45,
          swan.z + (Math.random() - 0.5) * 0.25,
          Math.cos(spreadAng) * lat - Math.sin(swan.heading) * 0.25,
          0.48 + Math.random() * 0.65,
          Math.sin(spreadAng) * lat * 0.45 - Math.cos(swan.heading) * 0.25,
          14.0 + Math.random() * 9.0,
          2.6 + Math.random() * 1.5,
          shade
        );
      }
      spawnSplashParticles(swan.x, swan.z, 18, 1.15);
    };

    const spawnFeedCrumbs = (wx, wz, swanIdx) => {
      for (let k = 0; k < MAX_PARTICLES; k++) {
        if (pOwner[k] === swanIdx && pType[k] > 1.5) {
          pLife[k] = pMaxLife[k];
        }
      }
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2 + Math.random() * 0.6;
        const rad = 0.08 + Math.random() * 0.22;
        spawnParticle(
          2,
          wx + Math.cos(ang) * rad,
          0.03,
          wz + Math.sin(ang) * rad * 0.7,
          Math.cos(ang) * 0.14,
          0.65 + Math.random() * 0.45,
          Math.sin(ang) * 0.1,
          7.0 + Math.random() * 3.5,
          10.0,
          1.0,
          swanIdx
        );
      }
    };

    const contactShadowGeo = track(new THREE.PlaneGeometry(1, 1));
    contactShadowGeo.rotateX(-Math.PI / 2);
    const contactShadowTex = track(createContactShadowTexture());

    // 10 Multi-Angle 3D Photo-Inflated Swans gliding serenely across foreground, midground & horizon
    const swanSpecs = [
      { isBlack: false, height: 1.62, homeX: -1.2, homeZ: -6.2, rx: 5.2, rz: 0.78, orbitFreq: 0.058, phase: 0.75, speed: 0.40 },
      { isBlack: true, height: 1.56, homeX: 1.4, homeZ: -7.0, rx: 5.5, rz: 0.84, orbitFreq: -0.054, phase: 2.35, speed: 0.38 },
      { isBlack: false, height: 1.50, homeX: -2.2, homeZ: -8.7, rx: 6.2, rz: 0.90, orbitFreq: 0.050, phase: 1.85, speed: 0.36 },
      { isBlack: true, height: 1.48, homeX: 2.2, homeZ: -9.7, rx: 6.4, rz: 0.94, orbitFreq: -0.048, phase: 1.20, speed: 0.35 },
      { isBlack: false, height: 1.45, homeX: -1.5, homeZ: -11.5, rx: 7.0, rz: 1.00, orbitFreq: 0.046, phase: 4.95, speed: 0.34 },
      { isBlack: true, height: 1.44, homeX: 2.8, homeZ: -12.8, rx: 7.2, rz: 1.04, orbitFreq: -0.045, phase: 2.75, speed: 0.33 },
      { isBlack: false, height: 1.42, homeX: 0.4, homeZ: -14.6, rx: 7.8, rz: 1.10, orbitFreq: 0.042, phase: 5.55, speed: 0.32 },
      { isBlack: true, height: 1.40, homeX: -3.0, homeZ: -16.4, rx: 8.4, rz: 1.15, orbitFreq: -0.040, phase: 2.20, speed: 0.31 },
      { isBlack: false, height: 1.38, homeX: -3.8, homeZ: -19.6, rx: 9.2, rz: 1.22, orbitFreq: 0.038, phase: 0.85, speed: 0.28 },
      { isBlack: true, height: 1.36, homeX: 4.0, homeZ: -21.6, rx: 9.8, rz: 1.28, orbitFreq: -0.036, phase: 3.90, speed: 0.27 },
    ];

    const swans = [];
    const hitMeshes = [];

    const triggerSwanTouch = (s) => {
      s.reactTimer = 2.6;
      s.speedBoost = 0.72;
      s.feedState = "none";
      s.isGrazing = false;

      _proj.set(s.x, 0, s.z).project(camera);
      spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 1.05, 2.3);
      spawnFeatherBurst(s);

      for (let j = 0; j < swans.length; j++) {
        if (j === s.idx) continue;
        const other = swans[j];
        const dist = Math.hypot(other.x - s.x, other.z - s.z);
        if (dist < 5.5 && other.reactTimer <= 0 && other.feedState === "none") {
          other.alertTimer = 1.6;
          other.isGrazing = false;
        }
      }
    };

    const initiateFeeding = (s, wx, wz) => {
      s.feedState = "approach";
      s.feedTargetX = wx;
      s.feedTargetZ = wz;
      s.feedTimer = 9.0;
      s.dabbleTimer = 0;
      s.peckPulseLock = false;
      s.reactTimer = 0;
      s.alertTimer = 0.8;
      s.isGrazing = false;

      spawnFeedCrumbs(wx, wz, s.idx);
    };

    let disposed = false;

    Promise.all([loadImage(lakeUrl), loadImage(whiteSwanCleanUrl), loadImage(blackSwanProfileUrl)])
      .then(([lakeImg, whiteSwanImg, blackSwanImg]) => {
        if (disposed) return;

        const lakeTex = track(new THREE.Texture(lakeImg));
        lakeTex.colorSpace = THREE.SRGBColorSpace;
        lakeTex.anisotropy = maxAniso;
        lakeTex.needsUpdate = true;
        lakeUniforms.uLakeTex.value = lakeTex;
        lakeUniforms.uTexSize.value.set(lakeImg.naturalWidth || 1920, lakeImg.naturalHeight || 1080);

        const whiteAsset = buildPhoto3DSwanAsset(whiteSwanImg, {
          isBlackBg: true,
          flipX: false,
          trimBottomFrac: 0.024,
          maxAnisotropy: maxAniso,
        });
        const blackAsset = buildPhoto3DSwanAsset(blackSwanImg, {
          isBlackBg: false,
          flipX: true,
          trimBottomFrac: 0.020,
          maxAnisotropy: maxAniso,
        });
        track(whiteAsset.texture);
        track(whiteAsset.geometry);
        track(blackAsset.texture);
        track(blackAsset.geometry);

        swanSpecs.forEach((spec, idx) => {
          const asset = spec.isBlack ? blackAsset : whiteAsset;
          const phase = idx * 1.75;
          const baseUniforms = {
            uMap: { value: asset.texture },
            uTime: { value: 0 },
            uPhase: { value: phase },
            uThemeMix: { value: state.themeMix },
            uIsBlack: { value: spec.isBlack ? 1 : 0 },
            uDepthFade: { value: 0 },
            uHoverGlow: { value: 0 },
            uNeckAngle: { value: 0 },
            uNeckTurn: { value: 0 },
            uWingLift: { value: 0 },
            uWingRouse: { value: 0 },
            uTailWag: { value: 0 },
            uChestLift: { value: 0 },
          };

          const bodyMat = track(
            new THREE.ShaderMaterial({
              uniforms: baseUniforms,
              vertexShader: SWAN_3D_PHOTO_VERT,
              fragmentShader: SWAN_3D_PHOTO_FRAG,
              transparent: false,
              depthWrite: true,
              depthTest: true,
              side: THREE.FrontSide,
            })
          );

          const reflMat = track(
            new THREE.ShaderMaterial({
              uniforms: baseUniforms,
              vertexShader: REFL_3D_PHOTO_VERT,
              fragmentShader: REFL_3D_PHOTO_FRAG,
              transparent: true,
              depthWrite: false,
              depthTest: true,
              side: THREE.BackSide,
            })
          );

          const contactMat = track(
            new THREE.MeshBasicMaterial({
              map: contactShadowTex,
              transparent: true,
              opacity: 0.44,
              depthWrite: false,
              depthTest: true,
            })
          );

          const root = new THREE.Group();

          const contactMesh = new THREE.Mesh(contactShadowGeo, contactMat);
          contactMesh.position.set(0, 0.006, 0.02);
          contactMesh.scale.set(spec.height * 0.72, 1, spec.height * 1.18);
          contactMesh.renderOrder = 10;
          root.add(contactMesh);

          const reflMesh = new THREE.Mesh(asset.geometry, reflMat);
          reflMesh.scale.set(spec.height, -spec.height * 0.84, spec.height);
          reflMesh.position.set(0, -0.01, 0);
          reflMesh.rotation.order = "YXZ";
          reflMesh.renderOrder = 8;
          root.add(reflMesh);

          const bodyMesh = new THREE.Mesh(asset.geometry, bodyMat);
          bodyMesh.scale.set(spec.height, spec.height, spec.height);
          bodyMesh.rotation.order = "YXZ";
          bodyMesh.renderOrder = 20;
          bodyMesh.userData.swanIdx = idx;
          root.add(bodyMesh);

          const curAsp = camera.aspect || aspect0;
          const aspectFactor = Math.max(0.75, curAsp / 1.77);
          const x0 = spec.homeX * aspectFactor + Math.cos(spec.phase) * spec.rx * aspectFactor;
          const z0 = spec.homeZ + Math.sin(spec.phase) * spec.rz;
          const vx0 = -Math.sin(spec.phase) * spec.rx * aspectFactor * spec.orbitFreq;
          const vz0 = Math.cos(spec.phase) * spec.rz * spec.orbitFreq;
          const initHeading = Math.atan2(vx0, vz0);

          root.position.set(x0, 0, z0);
          root.rotation.y = initHeading;
          scene.add(root);

          hitMeshes.push(bodyMesh);

          swans.push({
            idx,
            isBlack: spec.isBlack,
            height: spec.height,
            root,
            bodyMesh,
            reflMesh,
            contactMat,
            uniforms: baseUniforms,
            x: x0,
            z: z0,
            homeX: spec.homeX,
            homeZ: spec.homeZ,
            rx: spec.rx,
            rz: spec.rz,
            orbitFreq: spec.orbitFreq,
            orbitPhase: spec.phase,
            heading: initHeading,
            targetHeading: initHeading,
            yawRate: 0,
            speed: spec.speed,
            speedBoost: 0,
            phase,
            neckDip: 0,
            neckTurn: 0,
            wingSpread: 0,
            wingRouse: 0,
            tailWag: 0,
            chestLift: 0,
            hoverGlow: 0,
            reactTimer: 0,
            alertTimer: 0,
            feedState: "none",
            feedTargetX: 0,
            feedTargetZ: z0,
            feedTimer: 0,
            dabbleTimer: 0,
            peckPulseLock: false,
            grazingTimer: 2.5 + idx * 1.3,
            isGrazing: false,
            swimMood: idx % 3 === 1 ? "preen" : "cruise",
            moodTimer: 3.2 + idx * 1.4,
            moodDuration: 4.5,
            preenSide: idx % 2 === 0 ? 1 : -1,
            swimRippleLock: false,
          });
        });

        if (!isSoftwareGl) {
          renderer.compile(scene, camera);
        }
      })
      .catch((err) => {
        console.error("Failed to load swan lake photo textures:", err);
      });

    const isUiControl = (target) =>
      Boolean(
        target &&
          target.closest &&
          target.closest("button, input, select, textarea, a, label, .card, header, .login-card, .toast")
      );

    const pickHitSwan = (clientX, clientY) => {
      if (hitMeshes.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, camera);
      const intersects = _raycaster.intersectObjects(hitMeshes, false);
      if (intersects.length > 0) {
        const sIdx = intersects[0].object.userData.swanIdx;
        if (typeof sIdx === "number" && swans[sIdx]) {
          return swans[sIdx];
        }
      }
      return null;
    };

    const onPointerDown = (e) => {
      if (isUiControl(e.target)) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const uvX = (e.clientX - rect.left) / rect.width;
      const uvY = 1.0 - (e.clientY - rect.top) / rect.height;

      const hitSwan = pickHitSwan(e.clientX, e.clientY);
      if (hitSwan) {
        triggerSwanTouch(hitSwan);
        return;
      }

      if (uvY < 0.815) {
        state.isDraggingWater = true;
        spawnRippleAtUv(uvX, uvY, 1.0, 2.2);

        _pointerNdc.set(uvX * 2 - 1, uvY * 2 - 1);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(_waterPlane, _planeHit) && _planeHit.z < -2.2 && _planeHit.z > -30) {
          spawnSplashParticles(_planeHit.x, _planeHit.z, 10, 0.75);

          let nearestSwan = null;
          let nearestDist = Infinity;
          for (let i = 0; i < swans.length; i++) {
            const s = swans[i];
            const dist = Math.hypot(s.x - _planeHit.x, s.z - _planeHit.z);
            const feedRadius = 5.4 + Math.abs(s.z) * 0.12;
            if (dist < feedRadius && dist < nearestDist) {
              nearestDist = dist;
              nearestSwan = s;
            }
          }

          if (nearestSwan) {
            initiateFeeding(nearestSwan, _planeHit.x, _planeHit.z);
          }
        }
      }
    };

    const onPointerMove = (e) => {
      if (!reducedMotion && finePointer) {
        state.tx = (e.clientX / window.innerWidth - 0.5) * 2;
        state.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      }

      if (state.isDraggingWater) {
        const now = performance.now();
        if (now - state.lastTrailAt > 75 && !isUiControl(e.target)) {
          state.lastTrailAt = now;
          const rect = renderer.domElement.getBoundingClientRect();
          const uvX = (e.clientX - rect.left) / rect.width;
          const uvY = 1.0 - (e.clientY - rect.top) / rect.height;
          if (uvY < 0.81) {
            spawnRippleAtUv(uvX, uvY, 0.55, 1.65);
          }
        }
      }

      const now = performance.now();
      if (finePointer && now - state.lastHoverCheck > 55) {
        state.lastHoverCheck = now;
        if (isUiControl(e.target)) {
          state.hoveredIdx = -1;
          document.body.style.cursor = "";
        } else {
          const hitSwan = pickHitSwan(e.clientX, e.clientY);
          state.hoveredIdx = hitSwan ? hitSwan.idx : -1;
          document.body.style.cursor = hitSwan ? "pointer" : "";
        }
      }
    };

    const onPointerUp = () => {
      state.isDraggingWater = false;
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      state.scrollTarget = max <= 40 ? 0 : Math.min(1, Math.max(0, window.scrollY / max));
    };
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = getDpr();
      camera.aspect = w / h;
      camera.fov = camera.aspect < 0.75 ? 50 : camera.aspect < 1.1 ? 45 : 42;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h);
      lakeUniforms.uResolution.value.set(w, h);
      pUniforms.uDpr.value = dpr;
      readScroll();
    };
    window.addEventListener("resize", onResize);
    window.__burst = () => {
      state.gust = 1.0;
    };

    const clock = new THREE.Clock();
    let frameId = 0;

    function afterDraw(cb) {
      const gl = renderer.getContext();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const animate = () => {
      if (disposed) return;

      const rawDt = Math.min(clock.getDelta(), 0.08);
      const dt = reducedMotion ? rawDt * 0.25 : rawDt;
      const t = (state.t += dt);

      const camLerp = 1 - Math.exp(-2.8 * rawDt);
      const themeLerp = 1 - Math.exp(-4.0 * rawDt);
      state.px += (state.tx - state.px) * camLerp;
      state.py += (state.ty - state.py) * camLerp;
      state.scrollP += (state.scrollTarget - state.scrollP) * camLerp;
      state.themeMix += ((darkRef.current ? 0 : 1) - state.themeMix) * themeLerp;
      state.gust = Math.max(0, state.gust - rawDt * 0.75);

      const mixVal = state.themeMix;

      const swayX = Math.sin(t * 0.13) * 0.24 + state.px * 0.42;
      const swayY = Math.sin(t * 0.18 + 0.7) * 0.04 - state.py * 0.07;
      const curCamY = camY + swayY - state.scrollP * 0.16;

      lakeUniforms.uTime.value = t;
      lakeUniforms.uThemeMix.value = mixVal;
      lakeUniforms.uGust.value = state.gust;
      lakeUniforms.uParallax.value.set(swayX, swayY);
      pUniforms.uThemeMix.value = mixVal;

      for (let k = 0; k < RIPPLE_COUNT; k++) {
        const r = ripples[k];
        if (r.active) {
          r.age += rawDt / r.dur;
          if (r.age >= 1.0) {
            r.active = false;
            lakeUniforms.uRipples.value[k].set(0, 0, 1, 0);
          } else {
            lakeUniforms.uRipples.value[k].set(r.x, r.y, r.age, r.strength);
          }
        }
      }

      camera.position.set(swayX, curCamY, 0);
      camera.lookAt(swayX * 0.72, curCamY + getLookDy(camera.fov), -10);
      camera.updateMatrixWorld();

      // Update particles (droplets, floating feathers, feeding crumbs)
      for (let k = 0; k < MAX_PARTICLES; k++) {
        if (pLife[k] >= pMaxLife[k] || pMaxLife[k] <= 0) {
          pAlpha[k] = 0;
          continue;
        }
        pLife[k] += rawDt;
        const progress = Math.min(1, pLife[k] / pMaxLife[k]);
        const i3 = k * 3;
        if (pType[k] < 0.5) {
          pVel[i3 + 1] -= 5.8 * rawDt;
          pPos[i3] += pVel[i3] * rawDt;
          pPos[i3 + 1] += pVel[i3 + 1] * rawDt;
          pPos[i3 + 2] += pVel[i3 + 2] * rawDt;
          if (pPos[i3 + 1] <= 0.0 && pVel[i3 + 1] < 0) {
            pLife[k] = pMaxLife[k];
            pAlpha[k] = 0;
          } else {
            pAlpha[k] = 1.0 - progress * progress;
          }
        } else if (pType[k] < 1.5) {
          const swayPhase = t * 3.4 + pSeed[k];
          pVel[i3] += Math.sin(swayPhase) * 0.42 * rawDt;
          pVel[i3 + 1] = Math.max(-0.26, pVel[i3 + 1] - 0.95 * rawDt);
          pPos[i3] += pVel[i3] * rawDt;
          pPos[i3 + 1] += pVel[i3 + 1] * rawDt;
          pPos[i3 + 2] += pVel[i3 + 2] * rawDt;
          pAngle[k] += Math.sin(swayPhase * 0.8) * 2.1 * rawDt;

          if (pPos[i3 + 1] <= 0.01 && pVel[i3 + 1] < 0) {
            _proj.set(pPos[i3], 0, pPos[i3 + 2]).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.28, 1.35);
            pLife[k] = pMaxLife[k];
            pAlpha[k] = 0;
          } else {
            pAlpha[k] = Math.sin(Math.min(1, progress) * Math.PI) * 0.92;
          }
        } else {
          if (pPos[i3 + 1] > 0.015 || pVel[i3 + 1] > 0) {
            pVel[i3 + 1] -= 4.2 * rawDt;
            pPos[i3] += pVel[i3] * rawDt;
            pPos[i3 + 1] += pVel[i3 + 1] * rawDt;
            pPos[i3 + 2] += pVel[i3 + 2] * rawDt;
            if (pPos[i3 + 1] <= 0.015) {
              pPos[i3 + 1] = 0.015;
              pVel[i3 + 1] = 0;
              pVel[i3] *= 0.2;
              pVel[i3 + 2] *= 0.2;
            }
          } else {
            pPos[i3] += Math.sin(t * 1.4 + pSeed[k]) * 0.015 * rawDt;
            pPos[i3 + 1] = 0.012 + Math.sin(t * 2.2 + pSeed[k]) * 0.008;
          }

          const owner = pOwner[k] >= 0 ? swans[pOwner[k]] : null;
          if (owner && owner.feedState === "dabble") {
            const reach = owner.height * 0.56;
            const bx = owner.x + Math.sin(owner.heading) * reach;
            const bz = owner.z + Math.cos(owner.heading) * reach;
            const dBeak = Math.hypot(pPos[i3] - bx, pPos[i3 + 2] - bz);
            if (dBeak < 0.72 && owner.dabbleTimer < 2.25) {
              pLife[k] += rawDt * 4.0;
            }
          }
          pAlpha[k] = Math.max(0, 1.0 - Math.pow(progress, 2.5));
        }
      }
      pPosAttr.needsUpdate = true;
      pAlphaAttr.needsUpdate = true;
      pAngleAttr.needsUpdate = true;

      const aspectFactor = Math.max(0.75, camera.aspect / 1.77);

      // Update each articulated 3D swan
      for (let i = 0; i < swans.length; i++) {
        const s = swans[i];

        if (s.reactTimer > 0) s.reactTimer = Math.max(0, s.reactTimer - dt);
        if (s.alertTimer > 0) s.alertTimer = Math.max(0, s.alertTimer - dt);
        s.speedBoost *= Math.exp(-1.5 * dt);

        let curSpeed = s.speed;
        let targetNeckDip = 0;
        let targetNeckTurn = Math.sin(t * 0.65 + s.phase) * 0.22;
        let targetWingSpread = Math.max(0, Math.sin(t * 0.52 + s.phase * 2.1) - 0.55) * 0.26;
        let targetRouse = 0;
        let targetTailWag = 0;
        let targetChest = 0;
        let feedWakeBoost = 0;

        if (s.feedState === "approach") {
          s.feedTimer -= dt;
          const dx = s.feedTargetX - s.x;
          const dz = s.feedTargetZ - s.z;
          const dist = Math.hypot(dx, dz);
          const desiredReach = s.height * 0.55;

          if (dist <= desiredReach + 0.14 || s.feedTimer <= 0) {
            s.feedState = "dabble";
            s.dabbleTimer = 2.85;
            s.peckPulseLock = false;
            _proj.set(s.feedTargetX, 0, s.feedTargetZ).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.72, 1.85);
          } else {
            s.targetHeading = Math.atan2(dx, dz);
            const headingErr = wrapAngle(s.targetHeading - s.heading);
            const turnStep = THREE.MathUtils.clamp(headingErr, -2.4 * dt, 2.4 * dt);
            s.yawRate = turnStep / Math.max(dt, 0.001);
            s.heading = wrapAngle(s.heading + turnStep);

            const alignFactor = 0.28 + 0.72 * Math.max(0, Math.cos(headingErr));
            curSpeed = (0.82 + Math.min(0.45, dist * 0.14)) * alignFactor;
            s.x += Math.sin(s.heading) * curSpeed * dt;
            s.z += Math.cos(s.heading) * curSpeed * dt;

            targetNeckDip = -0.08;
            targetNeckTurn = headingErr * 0.45;
            targetChest = 0.06;
            feedWakeBoost = 0.65;
          }
        } else if (s.feedState === "dabble") {
          s.dabbleTimer -= dt;
          const dx = s.feedTargetX - s.x;
          const dz = s.feedTargetZ - s.z;
          const crumbDist = Math.hypot(dx, dz);
          if (crumbDist > 0.55) {
            s.targetHeading = Math.atan2(dx, dz);
            const headingErr = wrapAngle(s.targetHeading - s.heading);
            if (Math.abs(headingErr) < 1.15) {
              s.heading = wrapAngle(s.heading + THREE.MathUtils.clamp(headingErr, -0.9 * dt, 0.9 * dt));
            }
          }
          s.yawRate *= Math.exp(-5.0 * dt);
          curSpeed = 0.04;
          s.x += Math.sin(s.heading) * curSpeed * dt;
          s.z += Math.cos(s.heading) * curSpeed * dt;

          // Deep 3-peck neck plunge reaching beak tip cleanly to water surface y = 0
          const elapsed = 2.85 - s.dabbleTimer;
          const peckWave = Math.sin(elapsed * 6.8);
          targetNeckDip = 0.72 + 0.18 * peckWave;
          targetNeckTurn = Math.sin(elapsed * 4.1) * 0.12;
          targetTailWag = Math.sin(elapsed * 9.5) * 0.18;
          feedWakeBoost = 0.45;

          if (peckWave > 0.78 && !s.peckPulseLock) {
            s.peckPulseLock = true;
            // Exact canonical beak tip rotated around neckPivotYZ (0.22, 0.16)
            const a = s.neckDip;
            const beakZ = (0.16 + 0.50 * Math.sin(a) + 0.32 * Math.cos(a)) * s.height;
            const bx = s.x + Math.sin(s.heading) * beakZ;
            const bz = s.z + Math.cos(s.heading) * beakZ;
            _proj.set(bx, 0, bz).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.58, 1.5);
            spawnSplashParticles(bx, bz, 5, 0.55);
          } else if (peckWave < 0.0) {
            s.peckPulseLock = false;
          }

          if (s.dabbleTimer <= 0) {
            s.feedState = "settle";
            s.dabbleTimer = 1.35;
          }
        } else if (s.feedState === "settle") {
          s.dabbleTimer -= dt;
          s.yawRate *= Math.exp(-5.0 * dt);
          curSpeed = s.speed * 0.75;
          s.x += Math.sin(s.heading) * curSpeed * dt;
          s.z += Math.cos(s.heading) * curSpeed * dt;
          const settleFrac = Math.max(0, s.dabbleTimer / 1.35);
          targetNeckDip = -0.10 * settleFrac;
          targetRouse = 0.42 * Math.sin(settleFrac * Math.PI);
          targetTailWag = Math.sin(t * 24.0 + s.phase) * 0.48 * settleFrac;
          if (s.dabbleTimer <= 0) {
            s.feedState = "none";
          }
        } else {
          // Autonomous 3D curved lake patrol + rich swimming behaviors (cruise, busk, preen, dabble, wing-stretch)
          s.moodTimer -= dt;
          if (s.moodTimer <= 0) {
            if (s.swimMood === "cruise") {
              const r = (i * 0.37 + t * 0.19) % 1;
              if (r < 0.36) {
                s.swimMood = "preen";
                s.moodDuration = 3.8 + (i % 3) * 0.6;
                s.preenSide = -s.preenSide;
              } else if (r < 0.72) {
                s.swimMood = "dabble";
                s.moodDuration = 3.4 + (i % 3) * 0.5;
              } else {
                s.swimMood = "stretch";
                s.moodDuration = 2.6;
              }
            } else {
              s.swimMood = "cruise";
              s.moodDuration = 6.5 + (i % 4) * 1.8;
            }
            s.moodTimer = s.moodDuration;
            s.swimRippleLock = false;
          }

          s.isGrazing = s.swimMood === "dabble";
          // Advance lane progression only while cruising so preen/dabble/stretch never spin in place
          const laneStepRate = s.swimMood === "cruise" ? 1.0 + s.speedBoost * 0.6 : 0.0;
          s.orbitPhase += s.orbitFreq * dt * laneStepRate;
          const leadPhase = s.orbitPhase + Math.sign(s.orbitFreq) * 0.16;
          const wpX = s.homeX * aspectFactor + Math.cos(leadPhase) * s.rx * aspectFactor;
          const wpZ = s.homeZ + Math.sin(leadPhase) * s.rz;

          const tanX = -Math.sin(s.orbitPhase) * s.rx * aspectFactor * s.orbitFreq;
          const tanZ = Math.cos(s.orbitPhase) * s.rz * s.orbitFreq;
          const tanLen = Math.hypot(tanX, tanZ) || 1;
          let steerX = tanX / tanLen + (wpX - s.x) * 0.24;
          let steerZ = tanZ / tanLen + (wpZ - s.z) * 0.24;
          let nearestMateAngle = 0;
          let hasNearbyMate = false;

          // Smooth lateral collision avoidance & pair-greeting glance (no 180-degree spin reversals)
          for (let j = 0; j < swans.length; j++) {
            if (i === j) continue;
            const o = swans[j];
            const adx = s.x - o.x;
            const adz = s.z - o.z;
            const distSq = adx * adx + adz * adz;
            if (distSq < 11.5 && distSq > 2.2 && !hasNearbyMate) {
              const relAng = wrapAngle(Math.atan2(o.x - s.x, o.z - s.z) - s.heading);
              if (Math.abs(relAng) < 1.35) {
                nearestMateAngle = relAng * 0.42;
                hasNearbyMate = true;
              }
            }
            if (distSq < 5.0 && distSq > 0.001) {
              const dist = Math.sqrt(distSq);
              const push = ((2.24 - dist) / 2.24) * 0.65;
              // Deflect laterally around nearby swans rather than spinning backward
              const fwdX = Math.sin(s.heading);
              const fwdZ = Math.cos(s.heading);
              const sideX = fwdZ;
              const sideZ = -fwdX;
              const sideSign = adx * sideX + adz * sideZ >= 0 ? 1 : -1;
              steerX += sideX * sideSign * push;
              steerZ += sideZ * sideSign * push;
            }
          }

          let headingErr = 0;
          if (s.swimMood === "cruise" && Math.hypot(steerX, steerZ) > 0.08) {
            s.targetHeading = Math.atan2(steerX, steerZ);
            headingErr = wrapAngle(s.targetHeading - s.heading);
            const maxTurn = (0.48 + s.speedBoost * 0.45) * dt;
            const turnStep = THREE.MathUtils.clamp(headingErr, -maxTurn, maxTurn);
            s.yawRate = THREE.MathUtils.lerp(s.yawRate, turnStep / Math.max(dt, 0.001), 1 - Math.exp(-4.5 * dt));
            s.heading = wrapAngle(s.heading + turnStep);
          } else {
            s.yawRate *= Math.exp(-6.0 * dt);
          }

          const paddleStroke = Math.sin(t * 2.1 + s.phase);
          const paddlePulse = 1.0 + 0.24 * paddleStroke;
          const speedScale =
            s.swimMood === "cruise"
              ? paddlePulse
              : s.swimMood === "dabble"
                ? 0.26
                : 0.14;
          curSpeed = (s.speed * speedScale + s.speedBoost) * (0.8 + 0.2 * Math.max(0, Math.cos(headingErr)));
          s.x += Math.sin(s.heading) * curSpeed * dt;
          s.z += Math.cos(s.heading) * curSpeed * dt;

          const reactNorm = s.reactTimer > 0 ? Math.sin(Math.min(1, s.reactTimer / 2.6) * Math.PI) : 0;
          const rouseBurst = s.reactTimer > 0.7 ? Math.sin(Math.min(1, (s.reactTimer - 0.7) / 1.9) * Math.PI) : 0;
          const tailBurst = s.reactTimer > 0 && s.reactTimer < 1.3 ? Math.sin(t * 28.0 + s.phase) * (s.reactTimer / 1.3) : 0;
          const alertLift = s.alertTimer > 0 ? Math.sin((s.alertTimer / 1.6) * Math.PI) * 0.14 : 0;

          if (s.reactTimer > 0) {
            targetNeckDip = -0.22 * reactNorm + Math.sin(s.reactTimer * 5.0) * 0.10;
            targetNeckTurn = headingErr * 0.38;
            targetWingSpread = Math.max(targetWingSpread, reactNorm * 0.85);
            targetRouse = rouseBurst;
            targetTailWag = tailBurst * 0.45;
            targetChest = reactNorm * 0.18;
            feedWakeBoost = reactNorm * 0.85;
          } else if (s.swimMood === "preen") {
            const pFrac = 1.0 - Math.max(0, s.moodTimer / Math.max(0.1, s.moodDuration));
            const ease = Math.sin(pFrac * Math.PI);
            targetNeckDip = 0.26 * ease + Math.sin(t * 10.5 + s.phase) * 0.09 * ease;
            targetNeckTurn = s.preenSide * 0.88 * ease + Math.sin(t * 7.8 + s.phase) * 0.16 * ease;
            targetWingSpread = 0.66 * ease;
            targetRouse = Math.max(0, Math.sin(t * 9.0 + s.phase)) * 0.24 * ease;
            targetTailWag = Math.sin(t * 15.0 + s.phase) * 0.30 * ease;
            targetChest = 0.04 * ease;
            feedWakeBoost = 0.22 * ease;
          } else if (s.swimMood === "dabble") {
            const pFrac = 1.0 - Math.max(0, s.moodTimer / Math.max(0.1, s.moodDuration));
            const ease = Math.sin(pFrac * Math.PI);
            const dabWave = Math.sin(t * 6.2 + s.phase);
            targetNeckDip = (0.64 + 0.15 * dabWave) * ease;
            targetNeckTurn = Math.sin(t * 3.4 + s.phase) * 0.16 * ease;
            targetTailWag = Math.sin(t * 8.5 + s.phase) * 0.18 * ease;
            feedWakeBoost = 0.32 * ease;
            if (dabWave > 0.85 && ease > 0.55 && !s.swimRippleLock) {
              s.swimRippleLock = true;
              const a = s.neckDip;
              const beakZ = (0.16 + 0.50 * Math.sin(a) + 0.32 * Math.cos(a)) * s.height;
              const bx = s.x + Math.sin(s.heading) * beakZ;
              const bz = s.z + Math.cos(s.heading) * beakZ;
              _proj.set(bx, 0, bz).project(camera);
              spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.38, 1.45);
              spawnSplashParticles(bx, bz, 3, 0.40);
            } else if (dabWave < 0.0) {
              s.swimRippleLock = false;
            }
          } else if (s.swimMood === "stretch") {
            const pFrac = 1.0 - Math.max(0, s.moodTimer / Math.max(0.1, s.moodDuration));
            const archEnv = Math.sin(pFrac * Math.PI);
            const flapBeat = Math.max(0, Math.sin(pFrac * Math.PI * 3.0));
            targetNeckDip = -0.20 * archEnv;
            targetNeckTurn = Math.sin(pFrac * Math.PI * 2.0) * 0.15;
            targetWingSpread = 0.96 * archEnv;
            targetRouse = 0.72 * archEnv * flapBeat;
            targetChest = 0.22 * archEnv;
            targetTailWag = pFrac > 0.72 ? Math.sin(t * 24.0 + s.phase) * 0.45 : 0;
            feedWakeBoost = 0.75 * archEnv;
            if (pFrac > 0.25 && pFrac < 0.72 && !s.swimRippleLock) {
              s.swimRippleLock = true;
              _proj.set(s.x, 0, s.z).project(camera);
              spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.62, 1.75);
              spawnSplashParticles(s.x, s.z, 7, 0.65);
            }
          } else {
            // Cruise: rhythmic paddling chest pitch, busking wing shields & social/mate glances
            targetNeckDip = -alertLift + paddleStroke * 0.032;
            targetNeckTurn = hasNearbyMate
              ? nearestMateAngle + Math.sin(t * 0.7 + s.phase) * 0.12
              : headingErr * 0.42 + Math.sin(t * 0.72 + s.phase) * 0.28;
            targetWingSpread = (hasNearbyMate ? 0.46 : 0.14) + Math.max(0, Math.sin(t * 0.55 + s.phase * 2.1) - 0.35) * 0.42;
            targetTailWag = Math.sin(t * 2.1 + s.phase) * 0.09;
            targetChest = Math.max(0, paddleStroke) * 0.045 + (hasNearbyMate ? 0.05 : 0);
            feedWakeBoost = Math.max(0, paddleStroke) * 0.18;
          }
        }

        // Smooth exponential joint kinematics
        s.neckDip += (targetNeckDip - s.neckDip) * (1 - Math.exp(-5.5 * dt));
        s.neckTurn += (targetNeckTurn - s.neckTurn) * (1 - Math.exp(-4.0 * dt));
        s.wingSpread += (targetWingSpread - s.wingSpread) * (1 - Math.exp(-2.8 * dt));
        s.wingRouse += (targetRouse - s.wingRouse) * (1 - Math.exp(-10.0 * dt));
        s.tailWag += (targetTailWag - s.tailWag) * (1 - Math.exp(-14.0 * dt));
        s.chestLift += (targetChest - s.chestLift) * (1 - Math.exp(-7.0 * dt));
        s.hoverGlow += ((state.hoveredIdx === s.idx || s.reactTimer > 0 || s.feedState !== "none" ? 1 : 0) - s.hoverGlow) * (1 - Math.exp(-6.0 * dt));

        // Drive 3D Photo-Inflated Swan Uniforms & Waterline Transforms
        const bob = Math.sin(t * 1.75 + s.phase) * 0.015 + Math.sin(t * 11.0 + s.phase) * 0.022 * s.wingRouse;
        const roll = THREE.MathUtils.clamp(-s.yawRate * 0.06, -0.09, 0.09) + Math.sin(t * 1.65 + s.phase) * 0.022;
        const pitch = -s.chestLift * 0.24 + Math.cos(t * 2.1 + s.phase) * 0.014;

        s.root.position.set(s.x, 0, s.z);
        s.root.rotation.y = s.heading;

        s.bodyMesh.position.y = bob + s.chestLift * 0.06;
        s.bodyMesh.rotation.x = pitch;
        s.bodyMesh.rotation.z = roll;

        s.reflMesh.position.y = -(bob + s.chestLift * 0.06) - 0.01;
        s.reflMesh.rotation.x = -pitch;
        s.reflMesh.rotation.z = -roll;

        const u = s.uniforms;
        u.uTime.value = t;
        u.uThemeMix.value = mixVal;
        u.uNeckAngle.value = s.neckDip;
        u.uNeckTurn.value = s.neckTurn;
        u.uWingLift.value = s.wingSpread;
        u.uWingRouse.value = s.wingRouse;
        u.uTailWag.value = s.tailWag;
        u.uChestLift.value = s.chestLift;
        u.uHoverGlow.value = s.hoverGlow;

        const distRatio = Math.max(0, Math.min(1, (-s.z - 6.0) / 18.0));
        const depthFade = distRatio * 0.44;
        u.uDepthFade.value = depthFade;
        s.contactMat.opacity = (0.44 - depthFade * 0.30) * (0.65 + 0.35 * mixVal);

        // Project swan chest & true 3D swim vector onto screen UV for directional bow wake
        const wakeIntensity = 0.65 + curSpeed * 0.88 + (s.isGrazing ? 0.3 : 0) + feedWakeBoost;
        const dirX = Math.sin(s.heading);
        const dirZ = Math.cos(s.heading);
        _proj.set(s.x + dirX * 0.25, 0, s.z + dirZ * 0.25).project(camera);
        _projAhead.set(s.x + dirX * 1.25, 0, s.z + dirZ * 1.25).project(camera);

        const uvX = _proj.x * 0.5 + 0.5;
        const uvY = _proj.y * 0.5 + 0.5;
        const distCam = Math.max(4, camera.position.distanceTo(s.root.position));
        lakeUniforms.uSwanUV.value[i].set(uvX, uvY, Math.min(1.0, 6.2 / distCam), wakeIntensity);

        const sx = (_projAhead.x - _proj.x) * camera.aspect;
        const sy = _projAhead.y - _proj.y;
        const sl = Math.hypot(sx, sy) || 1;
        lakeUniforms.uSwanDir.value[i].set(sx / sl, sy / sl);
      }

      if (!document.hidden) {
        renderer.clear();
        renderer.render(bgScene, bgCamera);
        renderer.clearDepth();
        renderer.render(scene, camera);
      }

      if (isSoftwareGl) {
        afterDraw(animate);
      } else {
        frameId = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      document.body.style.cursor = "";
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
      if (window.__burst) delete window.__burst;

      for (const o of disposables) o.dispose?.();
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