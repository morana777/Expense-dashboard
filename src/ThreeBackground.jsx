import { useEffect, useRef } from "react";
import * as THREE from "three";

import lakeUrl from "./assets/images/silver_lake_water_1795473108796.jpg";
import whiteSwanRightUrl from "./assets/images/white_swan_clean_1795243288021.jpg";
import whiteSwanLeftUrl from "./assets/images/white_swan_threeq_1795243287453.jpg";
import blackSwanLeftUrl from "./assets/images/black_swan_profile_1795242894323.jpg";
import blackSwanRightUrl from "./assets/images/black_swan_angle_1795242894887.jpg";

const _proj = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _planeHit = new THREE.Vector3();

const SWAN_COUNT = 8;
const RIPPLE_COUNT = 8;
const MAX_PARTICLES = 140;
const HIT_W = 64;
const HIT_H = 48;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Extracts a swan photograph via border-connected BFS flood-fill, performs
 * inward RGB matte de-fringing so ZERO white/black halo rims survive, builds
 * a tiny 64x48 alpha hit-mask for accurate silhouette touch raycasting, and
 * anchors the belly cleanly on the waterline.
 */
function extractSwanSprite(img, isBlackBg, maxAnisotropy = 8, trimBottomFrac = 0.015) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const targetW = Math.min(1536, srcW);
  const scale = targetW / srcW;
  const targetH = Math.max(1, Math.round(srcH * scale));

  const work = document.createElement("canvas");
  work.width = targetW;
  work.height = targetH;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const total = targetW * targetH;
  const bgMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isBgPixel = (idx4) => {
    const r = data[idx4];
    const g = data[idx4 + 1];
    const b = data[idx4 + 2];
    if (isBlackBg) {
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 26;
    }
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC > 220 && maxC - minC < 26;
  };

  const enqueue = (p) => {
    if (bgMask[p]) return;
    if (isBgPixel(p * 4)) {
      bgMask[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < targetW; x++) {
    enqueue(x);
    enqueue((targetH - 1) * targetW + x);
  }
  for (let y = 0; y < targetH; y++) {
    enqueue(y * targetW);
    enqueue(y * targetW + (targetW - 1));
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % targetW;
    const y = (p - x) / targetW;
    if (x > 0) enqueue(p - 1);
    if (x < targetW - 1) enqueue(p + 1);
    if (y > 0) enqueue(p - targetW);
    if (y < targetH - 1) enqueue(p + targetW);
  }

  const alphaMap = new Float32Array(total);
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const p = y * targetW + x;
      if (bgMask[p]) {
        alphaMap[p] = 0;
        continue;
      }
      let bgCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (bgMask[(y + dy) * targetW + (x + dx)]) bgCount++;
        }
      }
      if (bgCount === 0) {
        alphaMap[p] = 1;
      } else {
        const rawA = 1 - bgCount / 9;
        alphaMap[p] = Math.max(0, Math.min(1, (rawA - 0.14) / 0.86));
      }
    }
  }

  const copyRgb = new Uint8ClampedArray(data);
  for (let y = 2; y < targetH - 2; y++) {
    for (let x = 2; x < targetW - 2; x++) {
      const p = y * targetW + x;
      const a = alphaMap[p];
      if (a > 0 && a < 0.98) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const np = (y + dy) * targetW + (x + dx);
            if (alphaMap[np] >= 0.98) {
              const n4 = np * 4;
              sumR += copyRgb[n4];
              sumG += copyRgb[n4 + 1];
              sumB += copyRgb[n4 + 2];
              count++;
            }
          }
        }
        if (count > 0) {
          const i4 = p * 4;
          data[i4] = Math.round(sumR / count);
          data[i4 + 1] = Math.round(sumG / count);
          data[i4 + 2] = Math.round(sumB / count);
        }
      }
    }
  }

  let minX = targetW;
  let minY = targetH;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const p = y * targetW + x;
      const a = alphaMap[p];
      data[p * 4 + 3] = Math.round(a * 255);
      if (a > 0.3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const rawH = Math.max(1, maxY - minY + 1);
  const trimmedMaxY = Math.max(minY + 10, maxY - Math.round(rawH * trimBottomFrac));
  const sw = Math.max(1, maxX - minX + 1);
  const sh = Math.max(1, trimmedMaxY - minY + 1);

  const outW = 1536;
  const outH = 1152;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const oCtx = out.getContext("2d");

  const fitScale = Math.min((outW * 0.8) / sw, (outH * 0.88) / sh);
  const drawW = sw * fitScale;
  const drawH = sh * fitScale;
  const dx = (outW - drawW) * 0.5;
  const dy = outH * 0.99 - drawH;

  oCtx.drawImage(work, minX, minY, sw, sh, dx, dy, drawW, drawH);

  // Build 64x48 silhouette hit-mask so clicks on transparent empty corners fall through to the lake
  const hitCanvas = document.createElement("canvas");
  hitCanvas.width = HIT_W;
  hitCanvas.height = HIT_H;
  const hCtx = hitCanvas.getContext("2d", { willReadFrequently: true });
  hCtx.drawImage(out, 0, 0, HIT_W, HIT_H);
  const hitBytes = hCtx.getImageData(0, 0, HIT_W, HIT_H).data;
  const hitMask = new Uint8Array(HIT_W * HIT_H);
  for (let k = 0; k < HIT_W * HIT_H; k++) {
    hitMask[k] = hitBytes[k * 4 + 3];
  }

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  return { texture: tex, aspect: outW / outH, hitMask };
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
  uniform float uSwanDir[${SWAN_COUNT}];
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

    // Swan bow wakes
    for (int i = 0; i < ${SWAN_COUNT}; i++) {
      vec2 sUv = uSwanUV[i].xy;
      float sSize = uSwanUV[i].z;
      float sWake = uSwanUV[i].w;
      float sDir = uSwanDir[i];
      if (sWake > 0.01 && sSize > 0.001) {
        vec2 d = (vUv - sUv) * vec2(scrAsp, 3.6);
        float dist = length(d) / max(sSize, 0.05);
        if (dist < 3.0) {
          float ring = sin(dist * 24.0 - uTime * 3.1 - float(i) * 1.7);
          float behind = clamp((-d.x * sDir) / max(sSize * 1.65, 0.06), 0.0, 2.2);
          float vCone = exp(-abs(abs(d.y) - behind * 0.19 * sSize) * 20.0) * smoothstep(0.0, 0.22, behind);
          float env = exp(-dist * 1.6) * smoothstep(0.03, 0.18, dist) * sWake;
          vec2 dir = dist > 0.001 ? d / dist : vec2(0.0);
          float wakeStrength = env * (0.75 + vCone * 1.65);
          waveOffset += dir * ring * wakeStrength * 0.0032 * sSize;
          wakeLight += (max(0.0, ring) * env * 0.042 + vCone * env * 0.035);
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

const SWAN_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uDir;
  uniform float uNeckAngle;
  uniform float uWingLift;
  uniform float uWingRouse;
  uniform float uTailWag;
  uniform float uChestLift;
  uniform float uTurnSquash;
  uniform vec2 uSize;
  varying vec2 vUv;

  vec2 rotAround(vec2 p, vec2 pivot, float a) {
    float c = cos(a);
    float s = sin(a);
    vec2 d = p - pivot;
    return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float frontX = uDir > 0.0 ? uv.x : (1.0 - uv.x);
    float aboveWater = smoothstep(0.04, 0.22, uv.y);

    // Graceful neck & head motion (grazing dip + startled proud S-arch recoil on touch)
    float neckMask = smoothstep(0.49, 0.72, frontX) * smoothstep(0.16, 0.44, uv.y);
    float idleScan = sin(uTime * 1.05 + uPhase) * 0.055 + sin(uTime * 0.48 + uPhase * 1.4) * 0.035;
    float theta = (uNeckAngle + idleScan) * uDir;

    vec2 neckPivot = vec2(uDir * uSize.x * 0.14, uSize.y * 0.22);
    vec2 rotatedNeck = rotAround(pos.xy, neckPivot, theta * neckMask);
    pos.xy = mix(pos.xy, rotatedNeck, neckMask);

    // Wing-covert wind lift + dramatic startled feather rouse & flutter wave when touched
    float wingMask = smoothstep(0.08, 0.26, frontX) * smoothstep(0.66, 0.42, frontX) * smoothstep(0.20, 0.58, uv.y);
    float breath = sin(uTime * 1.35 + uPhase) * 0.016;
    float rouseWave = sin(uTime * 26.0 + frontX * 12.0 + uv.y * 8.0) * 0.038 * uWingRouse;
    float rouseArc = (uWingRouse * 0.14 + rouseWave + uWingLift * 0.065 + breath) * wingMask;
    pos.y += rouseArc * uSize.y;
    pos.x -= uDir * (uWingRouse * 0.055) * wingMask * uSize.x;

    // Brisk organic tail feather shake & settle
    float tailMask = smoothstep(0.28, 0.04, frontX) * smoothstep(0.14, 0.46, uv.y);
    pos.y += (sin(uTime * 1.45 + uPhase + 1.2) * 0.014 + uTailWag * 0.055) * uSize.y * tailMask;

    // Chest surge lift on touch splash + gentle surface buoyancy
    pos.y += (frontX * 0.10 * uChestLift + sin(uTime * 1.35 + uPhase + frontX * 2.0) * 0.005) * uSize.y * aboveWater;
    pos.x *= uTurnSquash;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const SWAN_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uThemeMix;
  uniform float uIsBlack;
  uniform float uDepthFade;
  uniform float uEdgeFade;
  uniform float uHoverGlow;
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;

  vec4 sampleSharp(sampler2D tex, vec2 uv) {
    vec2 tx = vec2(1.0 / 1536.0, 1.0 / 1152.0);
    vec4 c = texture2D(tex, uv);
    vec3 blur = (
      texture2D(tex, uv + vec2(tx.x, 0.0)).rgb +
      texture2D(tex, uv - vec2(tx.x, 0.0)).rgb +
      texture2D(tex, uv + vec2(0.0, tx.y)).rgb +
      texture2D(tex, uv - vec2(0.0, tx.y)).rgb
    ) * 0.25;
    c.rgb = clamp(c.rgb + (c.rgb - blur) * 0.48, 0.0, 1.0);
    return c;
  }

  void main() {
    vec4 tex = sampleSharp(uMap, vUv);
    float crispAlpha = smoothstep(0.08, 0.34, tex.a);
    if (crispAlpha < 0.01) discard;

    float waterWave = 0.028 + 0.007 * sin(vUv.x * 22.0 + uTime * 1.9 + uPhase)
                            + 0.004 * cos(vUv.x * 38.0 - uTime * 1.4);
    float waterMask = smoothstep(waterWave - 0.012, waterWave + 0.020, vUv.y);
    if (waterMask < 0.01) discard;

    vec3 col = tex.rgb;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(luma), mix(0.94, 0.90, uThemeMix));

    vec3 dayWhite = clamp((col - 0.45) * 1.06 + 0.46, 0.0, 1.0) * vec3(0.96, 0.97, 0.99);
    vec3 dayBlack = pow(clamp(col, 0.0, 1.0), vec3(1.12)) * vec3(0.91, 0.93, 0.97);
    vec3 daySwan = mix(dayWhite, dayBlack, uIsBlack);

    vec3 nightWhite = col * vec3(0.68, 0.73, 0.82) + vec3(0.04, 0.055, 0.08) * smoothstep(0.25, 0.9, vUv.y);
    vec3 nightBlack = col * vec3(0.84, 0.87, 0.92) + vec3(0.012, 0.018, 0.028);
    vec3 nightSwan = mix(nightWhite, nightBlack, uIsBlack);

    vec3 finalCol = mix(nightSwan, daySwan, uThemeMix);

    // Subtle sunlit feather sheen on hover or wing rouse
    finalCol += vec3(0.85, 0.90, 0.96) * uHoverGlow * 0.08 * smoothstep(0.25, 0.95, vUv.y);

    float wetEdge = smoothstep(waterWave, waterWave + 0.085, vUv.y);
    finalCol *= mix(0.36, 1.0, wetEdge);

    float meniscus = exp(-pow((vUv.y - (waterWave + 0.016)) / 0.010, 2.0));
    finalCol += mix(vec3(0.35, 0.42, 0.52), vec3(0.86, 0.89, 0.94), uThemeMix) * meniscus * 0.14;

    vec3 mistColor = mix(vec3(0.09, 0.125, 0.18), vec3(0.76, 0.79, 0.84), uThemeMix);
    finalCol = mix(finalCol, mistColor, uDepthFade);

    gl_FragColor = vec4(finalCol, crispAlpha * waterMask * uEdgeFade);
  }
`;

const REFL_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uDir;
  uniform float uNeckAngle;
  uniform float uWingLift;
  uniform float uWingRouse;
  uniform float uTailWag;
  uniform float uChestLift;
  uniform float uTurnSquash;
  uniform vec2 uSize;
  varying vec2 vUv;

  vec2 rotAround(vec2 p, vec2 pivot, float a) {
    float c = cos(a);
    float s = sin(a);
    vec2 d = p - pivot;
    return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float frontX = uDir > 0.0 ? uv.x : (1.0 - uv.x);
    float aboveWater = smoothstep(0.04, 0.22, uv.y);

    float neckMask = smoothstep(0.49, 0.72, frontX) * smoothstep(0.16, 0.44, uv.y);
    float idleScan = sin(uTime * 1.05 + uPhase) * 0.055 + sin(uTime * 0.48 + uPhase * 1.4) * 0.035;
    float theta = -(uNeckAngle + idleScan) * uDir;

    vec2 neckPivot = vec2(uDir * uSize.x * 0.14, -uSize.y * 0.22);
    vec2 rotatedNeck = rotAround(pos.xy, neckPivot, theta * neckMask);
    pos.xy = mix(pos.xy, rotatedNeck, neckMask);

    float wingMask = smoothstep(0.08, 0.26, frontX) * smoothstep(0.66, 0.42, frontX) * smoothstep(0.20, 0.58, uv.y);
    float breath = sin(uTime * 1.35 + uPhase) * 0.016;
    float rouseWave = sin(uTime * 26.0 + frontX * 12.0 + uv.y * 8.0) * 0.038 * uWingRouse;
    pos.y -= (uWingRouse * 0.14 + rouseWave + uWingLift * 0.065 + breath) * wingMask * uSize.y;
    pos.x -= uDir * (uWingRouse * 0.055) * wingMask * uSize.x;

    float tailMask = smoothstep(0.28, 0.04, frontX) * smoothstep(0.14, 0.46, uv.y);
    pos.y -= (sin(uTime * 1.45 + uPhase + 1.2) * 0.014 + uTailWag * 0.055) * uSize.y * tailMask;

    pos.y -= (frontX * 0.10 * uChestLift + sin(uTime * 1.35 + uPhase + frontX * 2.0) * 0.005) * uSize.y * aboveWater;
    pos.x *= uTurnSquash;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const REFL_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uPhase;
  uniform float uThemeMix;
  uniform float uIsBlack;
  uniform float uDepthFade;
  uniform float uEdgeFade;
  varying vec2 vUv;

  void main() {
    float distFromLine = vUv.y;

    float waveX = sin(distFromLine * 46.0 - uTime * 2.1 + uPhase) * 0.028 * (0.12 + distFromLine);
    float waveX2 = cos(distFromLine * 96.0 + uTime * 1.8 - uPhase * 0.7) * 0.012 * distFromLine;
    float sx = clamp(vUv.x + waveX + waveX2, 0.0, 1.0);

    float blurOff = 0.004 * distFromLine;
    vec4 tex = (
      texture2D(uMap, vec2(sx, distFromLine)) * 0.5 +
      texture2D(uMap, vec2(clamp(sx + blurOff, 0.0, 1.0), distFromLine)) * 0.25 +
      texture2D(uMap, vec2(clamp(sx - blurOff, 0.0, 1.0), distFromLine)) * 0.25
    );

    if (tex.a < 0.06) discard;

    float waterWave = 0.028 + 0.007 * sin(vUv.x * 22.0 + uTime * 1.9 + uPhase)
                            + 0.004 * cos(vUv.x * 38.0 - uTime * 1.4);
    if (vUv.y < waterWave * 0.65) discard;

    float ribbon = smoothstep(-0.35, 0.45, sin(distFromLine * 54.0 - uTime * 2.0 + uPhase + sin(vUv.x * 14.0) * 1.2));
    float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));

    float hullShadow = exp(-distFromLine * 6.2);
    vec3 shadowCol = mix(vec3(0.014, 0.020, 0.034), vec3(0.06, 0.075, 0.10), uThemeMix);

    vec3 whiteRefl = mix(vec3(0.045, 0.062, 0.092), vec3(0.54, 0.57, 0.62), luma * mix(0.62, 0.96, uThemeMix));
    vec3 blackRefl = mix(vec3(0.015, 0.022, 0.036), vec3(0.08, 0.10, 0.13), luma * 0.55);
    vec3 bodyRefl = mix(whiteRefl, blackRefl, uIsBlack);

    vec3 reflCol = mix(bodyRefl, shadowCol, hullShadow * 0.85);
    vec3 lakeTint = mix(vec3(0.045, 0.062, 0.095), vec3(0.46, 0.50, 0.56), uThemeMix);
    reflCol = mix(reflCol, lakeTint, distFromLine * 0.42);

    float baseFade = pow(1.0 - distFromLine, 1.38) * mix(0.66, 0.72, uThemeMix) * (1.0 - uDepthFade * 0.72);
    float finalAlpha = smoothstep(0.08, 0.48, tex.a) * baseFade * mix(0.32, 1.0, ribbon) * uEdgeFade;
    gl_FragColor = vec4(reflCol, finalAlpha);
  }
`;

// Soft 3D splash droplets & floating downy swan feathers spawned on touch
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
      // Water splash droplet glint
      float r = length(p);
      float drop = smoothstep(0.5, 0.12, r);
      float spec = exp(-r * 8.0);
      if (drop < 0.01) discard;
      vec3 col = mix(vec3(0.66, 0.74, 0.85), vec3(0.95, 0.97, 1.0), uThemeMix);
      col += vec3(0.25) * spec;
      gl_FragColor = vec4(col, drop * vAlpha);
    } else if (vType < 1.5) {
      // Delicate floating downy feather silhouette
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
      // Soft quill highlight down the spine
      col += mix(vec3(0.12), vec3(0.08), vShade) * exp(-abs(curve) * 28.0);
      gl_FragColor = vec4(col, alpha);
    } else {
      // Floating bread / grain feeding morsel resting on the water surface
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
  darkRef.current = dark;

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

    const getDpr = () => (isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2.5));
    const w0 = mount.clientWidth || window.innerWidth;
    const h0 = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(getDpr());
    renderer.setSize(w0, h0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
      uSwanDir: { value: Array.from({ length: SWAN_COUNT }, () => 1) },
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

    const scene = new THREE.Scene();
    const aspect0 = w0 / h0;
    const fov0 = aspect0 < 0.75 ? 50 : aspect0 < 1.1 ? 45 : 42;
    const camera = new THREE.PerspectiveCamera(fov0, aspect0, 0.2, 120);
    const camY = 3.2;
    const getLookDy = (fovDeg) => -10 * 0.64 * Math.tan((fovDeg * 0.5 * Math.PI) / 180);
    camera.position.set(0, camY, 0);
    camera.lookAt(0, camY + getLookDy(fov0), -10);

    // Pre-allocated particle system (zero runtime GC) for floating swan feathers & water droplets
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
      // Floating downy feathers drifting off wings
      for (let k = 0; k < 10; k++) {
        const spreadAng = Math.random() * Math.PI * 2;
        const lat = 0.25 + Math.random() * 0.55;
        spawnParticle(
          1,
          swan.x + (Math.random() - 0.5) * 0.55,
          0.42 + Math.random() * 0.45,
          swan.z + (Math.random() - 0.5) * 0.25,
          Math.cos(spreadAng) * lat - swan.dir * 0.25,
          0.48 + Math.random() * 0.65,
          Math.sin(spreadAng) * lat * 0.45,
          14.0 + Math.random() * 9.0,
          2.6 + Math.random() * 1.5,
          shade
        );
      }
      // Sparkling splash droplets around chest & wingtip
      spawnSplashParticles(swan.x, swan.z, 18, 1.15);
    };

    const spawnFeedCrumbs = (wx, wz, swanIdx) => {
      // Clear any previous crumbs from this swan before scattering fresh morsels
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
          9.5,
          1.0,
          swanIdx
        );
      }
    };

    const swanSpecs = [
      { isBlack: false, height: 1.55, x: -3.2, z: -6.2, halfSpan: 5.8, dir: 1, speed: 0.34 },
      { isBlack: true, height: 1.48, x: 3.1, z: -6.9, halfSpan: 6.2, dir: -1, speed: 0.31 },
      { isBlack: false, height: 1.42, x: -5.4, z: -9.8, halfSpan: 8.5, dir: -1, speed: 0.28 },
      { isBlack: true, height: 1.40, x: 5.1, z: -10.4, halfSpan: 8.8, dir: 1, speed: 0.27 },
      { isBlack: false, height: 1.38, x: 1.8, z: -14.0, halfSpan: 11.2, dir: 1, speed: 0.25 },
      { isBlack: true, height: 1.36, x: -3.8, z: -15.4, halfSpan: 11.8, dir: -1, speed: 0.24 },
      { isBlack: false, height: 1.35, x: -6.8, z: -22.5, halfSpan: 16.0, dir: 1, speed: 0.20 },
      { isBlack: true, height: 1.32, x: 6.2, z: -24.5, halfSpan: 17.0, dir: -1, speed: 0.19 },
    ];

    const swans = [];
    const hitMeshes = [];
    let spriteBank = null;
    let disposed = false;

    const getSpriteForSwan = (isBlack, dir) => {
      if (!spriteBank) return null;
      if (!isBlack) return dir > 0 ? spriteBank.whiteRight : spriteBank.whiteLeft;
      return dir < 0 ? spriteBank.blackLeft : spriteBank.blackRight;
    };

    const triggerSwanTouch = (s) => {
      s.reactTimer = 2.6;
      s.speedBoost = 0.85;
      s.feedState = "none";
      s.isGrazing = false;

      // Spawn multi-ring water ripple right at the swan's chest waterline
      _proj.set(s.x, 0, s.z).project(camera);
      spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 1.05, 2.3);
      spawnFeatherBurst(s);

      // Nearby swans respond with a gentle alert head lift
      for (let j = 0; j < swans.length; j++) {
        if (j === s.idx) continue;
        const other = swans[j];
        const dist = Math.hypot(other.x - s.x, other.z - s.z);
        if (dist < 5.0 && other.reactTimer <= 0 && other.feedState === "none") {
          other.alertTimer = 1.6;
          other.isGrazing = false;
        }
      }
    };

    const initiateFeeding = (s, wx, wz) => {
      s.feedState = "approach";
      s.feedTargetX = wx;
      s.feedTargetZ = wz;
      s.feedTimer = 8.0;
      s.dabbleTimer = 0;
      s.peckPulseLock = false;
      s.reactTimer = 0;
      s.alertTimer = 0.8;
      s.isGrazing = false;

      // Smooth foreshortened pivot turn if clicked coordinate is behind the swan
      const desiredDir = wx - s.x >= 0 ? 1 : -1;
      const activeDir = s.turningTo !== 0 ? s.turningTo : s.dir;
      if (desiredDir !== activeDir && Math.abs(wx - s.x) > 0.18) {
        s.turningTo = desiredDir;
        s.turnPhase = 0;
      }

      spawnFeedCrumbs(wx, wz, s.idx);
    };

    Promise.all([
      loadImage(lakeUrl),
      loadImage(whiteSwanRightUrl),
      loadImage(whiteSwanLeftUrl),
      loadImage(blackSwanLeftUrl),
      loadImage(blackSwanRightUrl),
    ])
      .then(([lakeImg, wrImg, wlImg, blImg, brImg]) => {
        if (disposed) return;

        const lakeTex = track(new THREE.Texture(lakeImg));
        lakeTex.colorSpace = THREE.SRGBColorSpace;
        lakeTex.anisotropy = maxAniso;
        lakeTex.needsUpdate = true;

        lakeUniforms.uLakeTex.value = lakeTex;
        lakeUniforms.uTexSize.value.set(lakeImg.naturalWidth || 1920, lakeImg.naturalHeight || 1080);

        spriteBank = {
          whiteRight: extractSwanSprite(wrImg, true, maxAniso, 0.012),
          whiteLeft: extractSwanSprite(wlImg, true, maxAniso, 0.012),
          blackLeft: extractSwanSprite(blImg, false, maxAniso, 0.015),
          blackRight: extractSwanSprite(brImg, false, maxAniso, 0.015),
        };
        Object.values(spriteBank).forEach((s) => track(s.texture));

        swanSpecs.forEach((spec, idx) => {
          const w = spec.height * (1536 / 1152);
          const h = spec.height;
          const sprite = getSpriteForSwan(spec.isBlack, spec.dir);

          const bodyGeo = track(new THREE.PlaneGeometry(w, h, 36, 28));
          bodyGeo.translate(0, h * 0.5, 0);

          const bodyUniforms = {
            uMap: { value: sprite.texture },
            uThemeMix: { value: state.themeMix },
            uIsBlack: { value: spec.isBlack ? 1 : 0 },
            uDepthFade: { value: 0 },
            uEdgeFade: { value: 1 },
            uHoverGlow: { value: 0 },
            uTime: { value: 0 },
            uPhase: { value: idx * 1.75 },
            uDir: { value: spec.dir },
            uNeckAngle: { value: 0 },
            uWingLift: { value: 0 },
            uWingRouse: { value: 0 },
            uTailWag: { value: 0 },
            uChestLift: { value: 0 },
            uTurnSquash: { value: 1 },
            uSize: { value: new THREE.Vector2(w, h) },
          };
          const bodyMat = track(
            new THREE.ShaderMaterial({
              uniforms: bodyUniforms,
              vertexShader: SWAN_VERT,
              fragmentShader: SWAN_FRAG,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
          bodyMesh.userData.swanIdx = idx;
          hitMeshes.push(bodyMesh);

          const reflH = h * 0.88;
          const reflGeo = track(new THREE.PlaneGeometry(w, reflH, 28, 20));
          const uvAttr = reflGeo.attributes.uv;
          for (let k = 0; k < uvAttr.count; k++) {
            uvAttr.setY(k, 1.0 - uvAttr.getY(k));
          }
          reflGeo.translate(0, -reflH * 0.5, 0);

          const reflUniforms = {
            uMap: { value: sprite.texture },
            uTime: { value: 0 },
            uPhase: { value: idx * 1.75 },
            uDir: { value: spec.dir },
            uNeckAngle: { value: 0 },
            uWingLift: { value: 0 },
            uWingRouse: { value: 0 },
            uTailWag: { value: 0 },
            uChestLift: { value: 0 },
            uTurnSquash: { value: 1 },
            uSize: { value: new THREE.Vector2(w, reflH) },
            uThemeMix: { value: state.themeMix },
            uIsBlack: { value: spec.isBlack ? 1 : 0 },
            uDepthFade: { value: 0 },
            uEdgeFade: { value: 1 },
          };
          const reflMat = track(
            new THREE.ShaderMaterial({
              uniforms: reflUniforms,
              vertexShader: REFL_VERT,
              fragmentShader: REFL_FRAG,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide,
            })
          );
          const reflMesh = new THREE.Mesh(reflGeo, reflMat);

          const group = new THREE.Group();
          group.add(reflMesh);
          group.add(bodyMesh);
          group.position.set(spec.x, 0, spec.z);
          scene.add(group);

          swans.push({
            idx,
            isBlack: spec.isBlack,
            hitMask: sprite.hitMask,
            group,
            bodyMesh,
            reflMesh,
            bodyUniforms,
            reflUniforms,
            x: spec.x,
            z: spec.z,
            baseZ: spec.z,
            halfSpan: spec.halfSpan,
            dir: spec.dir,
            turningTo: 0,
            turnPhase: 0,
            turnSquash: 1,
            speed: spec.speed,
            speedBoost: 0,
            phase: idx * 1.75,
            neckAngle: 0,
            wingLift: 0,
            wingRouse: 0,
            tailWag: 0,
            chestLift: 0,
            hoverGlow: 0,
            reactTimer: 0,
            alertTimer: 0,
            feedState: "none",
            feedTargetX: 0,
            feedTargetZ: spec.z,
            feedTimer: 0,
            dabbleTimer: 0,
            peckPulseLock: false,
            grazingTimer: 2.5 + idx * 1.3,
            isGrazing: false,
          });
        });
      })
      .catch((err) => {
        console.error("Failed to load swan lake assets:", err);
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

      // Check intersections front-to-back against actual non-transparent feather pixels
      for (let i = 0; i < intersects.length; i++) {
        const hit = intersects[i];
        const s = swans[hit.object.userData.swanIdx];
        if (!s || !hit.uv) continue;
        const hx = Math.min(HIT_W - 1, Math.max(0, Math.floor(hit.uv.x * HIT_W)));
        const hy = Math.min(HIT_H - 1, Math.max(0, Math.floor((1 - hit.uv.y) * HIT_H)));
        if (s.hitMask[hy * HIT_W + hx] > 42) {
          return s;
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

      // Clicked/touched open lake water -> spawn splash ripple + check proximity to trigger feeding
      if (uvY < 0.815) {
        state.isDraggingWater = true;
        spawnRippleAtUv(uvX, uvY, 1.0, 2.2);

        _pointerNdc.set(uvX * 2 - 1, uvY * 2 - 1);
        _raycaster.setFromCamera(_pointerNdc, camera);
        if (_raycaster.ray.intersectPlane(_waterPlane, _planeHit) && _planeHit.z < -2.2 && _planeHit.z > -32) {
          spawnSplashParticles(_planeHit.x, _planeHit.z, 10, 0.75);

          // Find nearest visible swan within feeding proximity radius on the water plane
          let nearestSwan = null;
          let nearestDist = Infinity;
          for (let i = 0; i < swans.length; i++) {
            const s = swans[i];
            const dist = Math.hypot(s.x - _planeHit.x, s.z - _planeHit.z);
            const feedRadius = 4.6 + Math.abs(s.z) * 0.11;
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

      // Throttled swan hover glow & pointer cursor feedback on open water
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

      const swayX = Math.sin(t * 0.13) * 0.22 + state.px * 0.35;
      const swayY = Math.sin(t * 0.18 + 0.7) * 0.035 - state.py * 0.06;
      const curCamY = camY + swayY - state.scrollP * 0.16;

      lakeUniforms.uTime.value = t;
      lakeUniforms.uThemeMix.value = mixVal;
      lakeUniforms.uGust.value = state.gust;
      lakeUniforms.uParallax.value.set(swayX, swayY);
      pUniforms.uThemeMix.value = mixVal;

      // Update concentric water ripple slots
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

      // Update 3D water splash droplets, floating downy feathers & feeding crumbs
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
          // Feeding crumbs drop onto water surface and gently bob with wavelets
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

          // Fade out naturally as owning swan dabbles or time expires
          const owner = pOwner[k] >= 0 ? swans[pOwner[k]] : null;
          if (owner && owner.feedState === "dabble") {
            const dBeak = Math.hypot(pPos[i3] - (owner.x + owner.dir * 0.42), pPos[i3 + 2] - owner.z);
            if (dBeak < 0.65 && owner.dabbleTimer < 2.2) {
              pLife[k] += rawDt * 3.8;
            }
          }
          pAlpha[k] = Math.max(0, 1.0 - Math.pow(progress, 2.5));
        }
      }
      pPosAttr.needsUpdate = true;
      pAlphaAttr.needsUpdate = true;
      pAngleAttr.needsUpdate = true;

      for (let i = 0; i < swans.length; i++) {
        const s = swans[i];

        if (s.reactTimer > 0) s.reactTimer = Math.max(0, s.reactTimer - dt);
        if (s.alertTimer > 0) s.alertTimer = Math.max(0, s.alertTimer - dt);
        s.speedBoost *= Math.exp(-1.5 * dt);

        // Smooth 3D foreshortened pivot turn when switching swim direction for feeding
        if (s.turningTo !== 0) {
          s.turnPhase = Math.min(1, s.turnPhase + dt / 0.62);
          const cosSquash = Math.abs(Math.cos(s.turnPhase * Math.PI));
          s.turnSquash = Math.max(0.18, cosSquash);

          if (s.turnPhase >= 0.5 && s.dir !== s.turningTo) {
            s.dir = s.turningTo;
            const newSprite = getSpriteForSwan(s.isBlack, s.dir);
            if (newSprite) {
              s.hitMask = newSprite.hitMask;
              s.bodyUniforms.uMap.value = newSprite.texture;
              s.reflUniforms.uMap.value = newSprite.texture;
              s.bodyUniforms.uDir.value = s.dir;
              s.reflUniforms.uDir.value = s.dir;
            }
            _proj.set(s.x, 0, s.z).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.45, 1.6);
          }

          if (s.turnPhase >= 1) {
            s.turningTo = 0;
            s.turnPhase = 0;
            s.turnSquash = 1;
          }
        } else {
          s.turnSquash += (1 - s.turnSquash) * (1 - Math.exp(-8.0 * dt));
        }

        const aspectFactor = Math.max(0.75, camera.aspect / 1.77);
        const span = s.halfSpan * aspectFactor;
        let curSpeed = s.speed;
        let slopeVz = Math.cos(t * 0.22 + s.phase) * 0.1;

        let targetNeck = 0;
        let targetWing = Math.max(0, Math.sin(t * 0.55 + s.phase * 2.1) - 0.65) * 1.4;
        let targetRouse = 0;
        let targetTail = 0;
        let targetChest = 0;
        let feedWakeBoost = 0;

        if (s.feedState === "approach") {
          s.feedTimer -= dt;
          const stopX = s.feedTargetX - s.dir * 0.42;
          const stopZ = s.feedTargetZ;
          const dx = stopX - s.x;
          const dz = stopZ - s.z;
          const dist = Math.hypot(dx, dz);

          if (dist < 0.26 || s.feedTimer <= 0) {
            s.feedState = "dabble";
            s.dabbleTimer = 2.8;
            s.peckPulseLock = false;
            _proj.set(s.feedTargetX, 0, s.feedTargetZ).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.72, 1.85);
          } else {
            const swimSpeed = (0.76 + Math.min(0.48, dist * 0.16)) * (s.turningTo !== 0 ? 0.35 : 1.0);
            curSpeed = swimSpeed;
            const vx = (dx / dist) * swimSpeed;
            const vz = (dz / dist) * swimSpeed;
            s.x += vx * dt;
            s.z += vz * dt;
            slopeVz = vz * 0.75;
            targetNeck = 0.14;
            targetChest = 0.26;
            feedWakeBoost = 0.65;
          }
        } else if (s.feedState === "dabble") {
          s.dabbleTimer -= dt;
          curSpeed = 0.05;
          s.x += s.dir * curSpeed * dt;
          slopeVz = 0;

          // 3 rhythmic dabble pecks dipping beak into water at clicked coordinate
          const elapsed = 2.8 - s.dabbleTimer;
          const peckWave = Math.sin(elapsed * 6.8);
          targetNeck = -0.60 + 0.18 * peckWave;
          targetTail = 0.42 + 0.15 * -peckWave;
          targetChest = 0.12;
          feedWakeBoost = 0.45;

          if (peckWave < -0.82 && !s.peckPulseLock) {
            s.peckPulseLock = true;
            const beakX = s.x + s.dir * 0.46;
            _proj.set(beakX, 0, s.z).project(camera);
            spawnRippleAtUv(_proj.x * 0.5 + 0.5, _proj.y * 0.5 + 0.5, 0.52, 1.45);
            spawnSplashParticles(beakX, s.z, 4, 0.55);
          } else if (peckWave > 0.1) {
            s.peckPulseLock = false;
          }

          if (s.dabbleTimer <= 0) {
            s.feedState = "settle";
            s.dabbleTimer = 1.35;
          }
        } else if (s.feedState === "settle") {
          s.dabbleTimer -= dt;
          curSpeed = s.speed * 0.75;
          s.x += s.dir * curSpeed * dt;
          const settleFrac = Math.max(0, s.dabbleTimer / 1.35);
          targetNeck = 0.16 * settleFrac;
          targetRouse = 0.36 * Math.sin(settleFrac * Math.PI);
          targetTail = Math.sin(t * 24.0 + s.phase) * 0.75 * settleFrac;
          if (s.dabbleTimer <= 0) {
            s.feedState = "none";
          }
        } else {
          // Normal autonomous serene lake glide
          s.grazingTimer -= dt;
          if (s.grazingTimer <= 0) {
            s.isGrazing = !s.isGrazing;
            s.grazingTimer = s.isGrazing ? 2.4 + (i % 3) * 0.7 : 5.5 + (i % 4) * 1.4;
          }

          const paddlePulse = 1.0 + 0.18 * Math.sin(t * 1.45 + s.phase);
          curSpeed = s.speed * (s.isGrazing ? 0.42 : paddlePulse) + s.speedBoost;
          s.x += s.dir * curSpeed * dt;

          const zCurve = Math.sin(t * 0.22 + s.phase) * 0.45;
          let laneAvoid = 0;
          for (let j = 0; j < swans.length; j++) {
            if (i === j) continue;
            const o = swans[j];
            const dx = o.x - s.x;
            const dz = o.z - s.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < 4.5 && distSq > 0.01) {
              laneAvoid -= Math.sign(dz || (i % 2 ? 1 : -1)) * (2.1 - Math.sqrt(distSq)) * 0.45;
            }
          }
          const targetZ = s.baseZ + zCurve + laneAvoid;
          s.z += (targetZ - s.z) * (1 - Math.exp(-0.55 * dt));

          if (s.dir > 0 && s.x > span) {
            s.x = -span;
          } else if (s.dir < 0 && s.x < -span) {
            s.x = span;
          }

          const reactNorm = s.reactTimer > 0 ? Math.sin(Math.min(1, s.reactTimer / 2.6) * Math.PI) : 0;
          const rouseBurst = s.reactTimer > 0.8 ? Math.sin(Math.min(1, (s.reactTimer - 0.8) / 1.8) * Math.PI) : 0;
          const tailBurst = s.reactTimer > 0 && s.reactTimer < 1.3 ? Math.sin(t * 28.0 + s.phase) * (s.reactTimer / 1.3) : 0;
          const alertLift = s.alertTimer > 0 ? Math.sin((s.alertTimer / 1.6) * Math.PI) * 0.16 : 0;

          targetNeck =
            s.reactTimer > 0
              ? Math.sin(s.reactTimer * 4.5) * 0.22 + 0.18 * reactNorm
              : s.isGrazing
                ? -0.46 + 0.08 * Math.sin(t * 3.1 + s.phase)
                : alertLift;
          targetRouse = rouseBurst;
          targetTail = tailBurst;
          targetChest = reactNorm;
          feedWakeBoost = reactNorm * 0.85;
        }

        s.neckAngle += (targetNeck - s.neckAngle) * (1 - Math.exp(-5.5 * dt));
        s.wingLift += (targetWing - s.wingLift) * (1 - Math.exp(-2.2 * dt));
        s.wingRouse += (targetRouse - s.wingRouse) * (1 - Math.exp(-10.0 * dt));
        s.tailWag += (targetTail - s.tailWag) * (1 - Math.exp(-14.0 * dt));
        s.chestLift += (targetChest - s.chestLift) * (1 - Math.exp(-7.0 * dt));
        s.hoverGlow += ((state.hoveredIdx === s.idx || s.reactTimer > 0 || s.feedState !== "none" ? 1 : 0) - s.hoverGlow) * (1 - Math.exp(-6.0 * dt));

        const bob = Math.sin(t * 1.65 + s.phase) * 0.012 + Math.sin(t * 11.0 + s.phase) * 0.022 * s.wingRouse;
        const rollPitch = slopeVz * 0.03 * s.dir + Math.sin(t * 1.5 + s.phase) * 0.012 + s.wingRouse * 0.04 * s.dir;

        s.group.position.set(s.x, bob, s.z);
        const camYaw = Math.atan2(camera.position.x - s.x, camera.position.z - s.z);
        const subtleTurn = -slopeVz * 0.18 * s.dir;
        s.group.rotation.y = camYaw + subtleTurn;
        s.group.rotation.z = rollPitch;

        const baseOrder = Math.round((s.z + 50) * 10);
        s.reflMesh.renderOrder = baseOrder;
        s.bodyMesh.renderOrder = baseOrder + 1;

        const distRatio = Math.max(0, Math.min(1, (-s.z - 6.0) / 22.0));
        const depthFade = distRatio * 0.42;
        const edgeX = s.feedState !== "none" ? 1.0 : Math.max(0, Math.min(1, (span - Math.abs(s.x)) / Math.max(1.2, span * 0.16)));

        s.bodyUniforms.uTime.value = t;
        s.bodyUniforms.uThemeMix.value = mixVal;
        s.bodyUniforms.uDepthFade.value = depthFade;
        s.bodyUniforms.uEdgeFade.value = edgeX;
        s.bodyUniforms.uHoverGlow.value = s.hoverGlow;
        s.bodyUniforms.uNeckAngle.value = s.neckAngle;
        s.bodyUniforms.uWingLift.value = s.wingLift;
        s.bodyUniforms.uWingRouse.value = s.wingRouse;
        s.bodyUniforms.uTailWag.value = s.tailWag;
        s.bodyUniforms.uChestLift.value = s.chestLift;
        s.bodyUniforms.uTurnSquash.value = s.turnSquash;

        s.reflUniforms.uTime.value = t;
        s.reflUniforms.uThemeMix.value = mixVal;
        s.reflUniforms.uDepthFade.value = depthFade;
        s.reflUniforms.uEdgeFade.value = edgeX;
        s.reflUniforms.uNeckAngle.value = s.neckAngle;
        s.reflUniforms.uWingLift.value = s.wingLift;
        s.reflUniforms.uWingRouse.value = s.wingRouse;
        s.reflUniforms.uTailWag.value = s.tailWag;
        s.reflUniforms.uChestLift.value = s.chestLift;
        s.reflUniforms.uTurnSquash.value = s.turnSquash;

        const wakeIntensity = edgeX * (0.65 + curSpeed * 0.9 + (s.isGrazing ? 0.35 : 0) + feedWakeBoost);
        const beakOffset = (s.isGrazing || s.feedState === "dabble" ? 0.42 : 0.0) * s.dir;
        _proj.set(s.x + beakOffset, 0, s.z).project(camera);
        const uvX = _proj.x * 0.5 + 0.5;
        const uvY = _proj.y * 0.5 + 0.5;
        const distCam = Math.max(4, camera.position.distanceTo(s.group.position));
        lakeUniforms.uSwanUV.value[i].set(uvX, uvY, Math.min(1.0, 6.2 / distCam), wakeIntensity);
        lakeUniforms.uSwanDir.value[i] = s.dir;
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