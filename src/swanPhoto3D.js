import * as THREE from "three";

const ASPECT_OUT = 1536 / 1152; // 4:3
const GRID_W = 224;
const GRID_H = 168;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createContactShadowTexture() {
  const w = 128;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 4, w * 0.5, h * 0.5, w * 0.48);
  grad.addColorStop(0.0, "rgba(8, 12, 20, 0.56)");
  grad.addColorStop(0.55, "rgba(8, 12, 20, 0.24)");
  grad.addColorStop(1.0, "rgba(8, 12, 20, 0.0)");
  ctx.fillStyle = grad;
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(1.0, h / w);
  ctx.translate(-w * 0.5, -h * 0.5);
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.5, w * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Extracts a photorealistic swan artifact via BFS background matte removal,
 * performs 2-pass inward + 10-pass outward RGB color dilation (zero halo seams),
 * and inflates the exact silhouette into a symmetrical watertight 3D volumetric
 * buffer geometry via 2D Euclidean distance transform.
 */
export function buildPhoto3DSwanAsset(img, { isBlackBg = false, flipX = false, trimBottomFrac = 0.012, maxAnisotropy = 8 } = {}) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const targetW = Math.min(1536, srcW);
  const scale = targetW / srcW;
  const targetH = Math.max(1, Math.round(srcH * scale));

  const work = document.createElement("canvas");
  work.width = targetW;
  work.height = targetH;
  const ctx = work.getContext("2d", { willReadFrequently: true });
  ctx.save();
  if (flipX) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);
  ctx.restore();

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
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 36;
    }
    const minC = Math.min(r, g, b);
    const maxC = Math.max(r, g, b);
    return minC > 208 && maxC - minC < 32;
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

  // 1-pixel interior distance map (0 = bg, 1 = 1px from bg, 2 = 2px from bg, 3 = deep interior)
  const edgeDist = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    edgeDist[i] = bgMask[i] ? 0 : 4;
  }
  for (let pass = 1; pass <= 3; pass++) {
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const p = y * targetW + x;
        if (edgeDist[p] <= pass) continue;
        if (
          edgeDist[p - 1] < pass ||
          edgeDist[p + 1] < pass ||
          edgeDist[p - targetW] < pass ||
          edgeDist[p + targetW] < pass ||
          edgeDist[p - targetW - 1] < pass ||
          edgeDist[p - targetW + 1] < pass ||
          edgeDist[p + targetW - 1] < pass ||
          edgeDist[p + targetW + 1] < pass
        ) {
          edgeDist[p] = pass;
        }
      }
    }
  }

  // Smooth feathered alpha eroding outer 0.6px JPEG compression fringe
  const alphaMap = new Float32Array(total);
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const p = y * targetW + x;
      if (edgeDist[p] === 0) {
        alphaMap[p] = 0;
        continue;
      }
      if (edgeDist[p] >= 3) {
        alphaMap[p] = 1;
        continue;
      }
      let bgCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (bgMask[(y + dy) * targetW + (x + dx)]) bgCount++;
        }
      }
      if (edgeDist[p] === 1) {
        const rawA = 1 - bgCount / 9;
        alphaMap[p] = Math.max(0, Math.min(1, (rawA - 0.16) / 0.72));
      } else {
        alphaMap[p] = 1;
      }
    }
  }

  // Color-decontaminate 1-2px JPEG fringe using clean interior neighbor RGB (preserves genuine dark bill/eyes)
  const srcCopy = new Uint8ClampedArray(data);
  for (let y = 3; y < targetH - 3; y++) {
    for (let x = 3; x < targetW - 3; x++) {
      const p = y * targetW + x;
      const ed = edgeDist[p];
      if (ed !== 1 && ed !== 2) continue;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const np = (y + dy) * targetW + (x + dx);
          if (edgeDist[np] >= 3) {
            const n4 = np * 4;
            sumR += srcCopy[n4];
            sumG += srcCopy[n4 + 1];
            sumB += srcCopy[n4 + 2];
            count++;
          }
        }
      }
      if (count === 0) continue;

      const avgR = sumR / count;
      const avgG = sumG / count;
      const avgB = sumB / count;
      const avgLuma = 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB;

      const i4 = p * 4;
      const pxLuma = 0.2126 * srcCopy[i4] + 0.7152 * srcCopy[i4 + 1] + 0.0722 * srcCopy[i4 + 2];

      const isBlackFringe = isBlackBg && avgLuma > 130 && pxLuma < avgLuma - 28;
      const isWhiteFringe = !isBlackBg && avgLuma < 110 && pxLuma > avgLuma + 28;
      if (isBlackFringe || isWhiteFringe || ed === 1) {
        const blend = ed === 1 ? 1.0 : 0.85;
        data[i4] = Math.round(srcCopy[i4] * (1 - blend) + avgR * blend);
        data[i4 + 1] = Math.round(srcCopy[i4 + 1] * (1 - blend) + avgG * blend);
        data[i4 + 2] = Math.round(srcCopy[i4 + 2] * (1 - blend) + avgB * blend);
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
      if (alphaMap[p] > 0.3) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Dilate RGB outward 10 passes on `work` while keeping alpha = 255 everywhere (prevents Canvas2D premultiply blackening!)
  const filledWork = new Uint8Array(total);
  let curWork = [];
  for (let i = 0; i < total; i++) {
    if (edgeDist[i] >= 2) {
      filledWork[i] = 1;
    }
  }
  for (let y = 1; y < targetH - 1; y++) {
    for (let x = 1; x < targetW - 1; x++) {
      const p = y * targetW + x;
      if (filledWork[p]) continue;
      if (filledWork[p - 1] || filledWork[p + 1] || filledWork[p - targetW] || filledWork[p + targetW]) {
        curWork.push(p);
      }
    }
  }
  for (let pass = 0; pass < 10 && curWork.length > 0; pass++) {
    const next = [];
    for (let k = 0; k < curWork.length; k++) {
      const p = curWork[k];
      if (filledWork[p]) continue;
      const x = p % targetW;
      const y = (p - x) / targetW;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = y + oy;
        if (ny < 0 || ny >= targetH) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          if (nx < 0 || nx >= targetW) continue;
          const np = ny * targetW + nx;
          if (filledWork[np]) {
            const n4 = np * 4;
            sr += data[n4];
            sg += data[n4 + 1];
            sb += data[n4 + 2];
            cnt++;
          }
        }
      }
      if (cnt > 0) {
        const i4 = p * 4;
        data[i4] = Math.round(sr / cnt);
        data[i4 + 1] = Math.round(sg / cnt);
        data[i4 + 2] = Math.round(sb / cnt);
        filledWork[p] = 2;
      }
    }
    for (let k = 0; k < curWork.length; k++) {
      const p = curWork[k];
      if (filledWork[p] === 2) {
        filledWork[p] = 1;
        const x = p % targetW;
        const y = (p - x) / targetW;
        if (x > 0 && !filledWork[p - 1]) next.push(p - 1);
        if (x < targetW - 1 && !filledWork[p + 1]) next.push(p + 1);
        if (y > 0 && !filledWork[p - targetW]) next.push(p - targetW);
        if (y < targetH - 1 && !filledWork[p + targetW]) next.push(p + targetW);
      }
    }
    curWork = next;
  }

  for (let i = 0; i < total; i++) {
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Separate opaque grayscale alpha source canvas (alpha = 255 everywhere so Canvas2D scaling is exact)
  const alphaWork = document.createElement("canvas");
  alphaWork.width = targetW;
  alphaWork.height = targetH;
  const aCtx = alphaWork.getContext("2d", { willReadFrequently: true });
  const aImg = aCtx.createImageData(targetW, targetH);
  const aPx = aImg.data;
  for (let i = 0; i < total; i++) {
    const v = Math.round(alphaMap[i] * 255);
    const i4 = i * 4;
    aPx[i4] = v;
    aPx[i4 + 1] = v;
    aPx[i4 + 2] = v;
    aPx[i4 + 3] = 255;
  }
  aCtx.putImageData(aImg, 0, 0);

  const rawH = Math.max(1, maxY - minY + 1);
  const trimmedMaxY = Math.max(minY + 10, maxY - Math.round(rawH * trimBottomFrac));
  const sw = Math.max(1, maxX - minX + 1);
  const sh = Math.max(1, trimmedMaxY - minY + 1);

  const outW = 1536;
  const outH = 1152;
  const fitScale = Math.min((outW * 0.8) / sw, (outH * 0.88) / sh);
  const drawW = sw * fitScale;
  const drawH = sh * fitScale;
  const dx = (outW - drawW) * 0.5;
  const dy = outH * 0.99 - drawH;

  // Scale dilated RGB onto outRgb (opaque)
  const outRgbC = document.createElement("canvas");
  outRgbC.width = outW;
  outRgbC.height = outH;
  const oRgbCtx = outRgbC.getContext("2d", { willReadFrequently: true });
  const bgFill = isBlackBg ? "#ededed" : "#181c24";
  oRgbCtx.fillStyle = bgFill;
  oRgbCtx.fillRect(0, 0, outW, outH);
  oRgbCtx.drawImage(work, minX, minY, sw, sh, dx, dy, drawW, drawH);
  const outRgbPx = oRgbCtx.getImageData(0, 0, outW, outH).data;

  // Scale clean alpha mask onto outAlpha (opaque black canvas)
  const outAlphaC = document.createElement("canvas");
  outAlphaC.width = outW;
  outAlphaC.height = outH;
  const oAlphaCtx = outAlphaC.getContext("2d", { willReadFrequently: true });
  oAlphaCtx.fillStyle = "#000000";
  oAlphaCtx.fillRect(0, 0, outW, outH);
  oAlphaCtx.drawImage(alphaWork, minX, minY, sw, sh, dx, dy, drawW, drawH);
  const outAlphaPx = oAlphaCtx.getImageData(0, 0, outW, outH).data;

  // Combine into premultiply-free Uint8Array RGBA buffer + extra 6-pass outward border dilation
  const outTotal = outW * outH;
  const finalRgba = new Uint8Array(outTotal * 4);
  for (let i = 0; i < outTotal; i++) {
    const i4 = i * 4;
    finalRgba[i4] = outRgbPx[i4];
    finalRgba[i4 + 1] = outRgbPx[i4 + 1];
    finalRgba[i4 + 2] = outRgbPx[i4 + 2];
    finalRgba[i4 + 3] = outAlphaPx[i4];
  }

  const gridPxW = GRID_W + 1;
  const gridPxH = GRID_H + 1;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = gridPxW;
  maskCanvas.height = gridPxH;
  const mCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  mCtx.drawImage(outAlphaC, 0, 0, gridPxW, gridPxH);
  const mBytes = mCtx.getImageData(0, 0, gridPxW, gridPxH).data;

  // Upload raw unpremultiplied DataTexture directly to GPU (never passes through premultiply-alpha canvas!)
  const texture = new THREE.DataTexture(finalRgba, outW, outH, THREE.RGBAFormat);
  texture.flipY = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  // Build Chamfer Euclidean Distance Transform on (gridPxW x gridPxH) in bottom-up Y order (iy=0 bottom -> iy=GRID_H top)
  const gTotal = gridPxW * gridPxH;
  const alphaGrid = new Float32Array(gTotal);
  const inside = new Uint8Array(gTotal);
  const dist = new Float32Array(gTotal);

  for (let iy = 0; iy < gridPxH; iy++) {
    const imgY = gridPxH - 1 - iy;
    for (let ix = 0; ix < gridPxW; ix++) {
      const gIdx = iy * gridPxW + ix;
      const mIdx = (imgY * gridPxW + ix) * 4;
      const aNorm = mBytes[mIdx] / 255;
      alphaGrid[gIdx] = aNorm;
      const isIn = aNorm >= 0.48 ? 1 : 0;
      inside[gIdx] = isIn;
      dist[gIdx] = isIn ? 9999 : 0;
    }
  }

  // Forward Chamfer pass (3-4 metric)
  for (let iy = 1; iy < gridPxH - 1; iy++) {
    for (let ix = 1; ix < gridPxW - 1; ix++) {
      const p = iy * gridPxW + ix;
      if (!inside[p]) continue;
      let d = dist[p];
      d = Math.min(d, dist[p - 1] + 1.0);
      d = Math.min(d, dist[p - gridPxW] + 1.0);
      d = Math.min(d, dist[p - gridPxW - 1] + 1.414);
      d = Math.min(d, dist[p - gridPxW + 1] + 1.414);
      dist[p] = d;
    }
  }
  // Backward Chamfer pass
  for (let iy = gridPxH - 2; iy >= 1; iy--) {
    for (let ix = gridPxW - 2; ix >= 1; ix--) {
      const p = iy * gridPxW + ix;
      if (!inside[p]) continue;
      let d = dist[p];
      d = Math.min(d, dist[p + 1] + 1.0);
      d = Math.min(d, dist[p + gridPxW] + 1.0);
      d = Math.min(d, dist[p + gridPxW - 1] + 1.414);
      d = Math.min(d, dist[p + gridPxW + 1] + 1.414);
      dist[p] = d;
    }
  }

  // 4 passes of smoothing inside silhouette for sleek organic 3D curvature without grid staircases
  let smoothDist = new Float32Array(dist);
  for (let pass = 0; pass < 4; pass++) {
    const tmp = new Float32Array(smoothDist);
    for (let iy = 1; iy < gridPxH - 1; iy++) {
      for (let ix = 1; ix < gridPxW - 1; ix++) {
        const p = iy * gridPxW + ix;
        if (!inside[p]) continue;
        tmp[p] =
          (smoothDist[p] * 4 +
            smoothDist[p - 1] +
            smoothDist[p + 1] +
            smoothDist[p - gridPxW] +
            smoothDist[p + gridPxW]) /
          8;
      }
    }
    smoothDist = tmp;
  }

  // Compute canonical 3D positions (+X right side, -X left side) facing +Z, bottom y = 0
  const worldScaleZ = ASPECT_OUT; // width 1.333 when height = 1.0
  const worldPerCell = worldScaleZ / GRID_W;
  const halfThick = new Float32Array(gTotal);

  for (let i = 0; i < gTotal; i++) {
    if (!inside[i]) {
      halfThick[i] = 0;
      continue;
    }
    const dW = smoothDist[i] * worldPerCell;
    const cyl = Math.pow(dW, 0.64) * 0.34;
    const hullSwell = 1.0 + 0.88 * smoothstep(0.055, 0.175, dW);
    halfThick[i] = cyl * hullSwell;
  }

  // Identify active grid cells (any corner inside silhouette)
  const activeCells = [];
  for (let iy = 0; iy < GRID_H; iy++) {
    for (let ix = 0; ix < GRID_W; ix++) {
      const a = iy * gridPxW + ix;
      const b = a + 1;
      const c = a + gridPxW;
      const d = c + 1;
      if (inside[a] || inside[b] || inside[c] || inside[d]) {
        activeCells.push([a, b, c, d]);
      }
    }
  }

  // Emit right (+X) and left (-X) symmetric watertight surfaces; snap outer boundary corners onto exact alpha=0.48 silhouette contour
  const vertPos = new Float32Array(gTotal * 2 * 3);
  const vertUv = new Float32Array(gTotal * 2 * 2);

  for (let iy = 0; iy < gridPxH; iy++) {
    const baseV = iy / GRID_H;
    for (let ix = 0; ix < gridPxW; ix++) {
      const baseU = ix / GRID_W;
      const gIdx = iy * gridPxW + ix;
      const hx = halfThick[gIdx];
      let u = baseU;
      let v = baseV;

      // Sub-pixel contour snap for outer perimeter vertices (keeps vertex indexed & shared with zero holes!)
      if (!inside[gIdx]) {
        const aOut = alphaGrid[gIdx];
        let sumU = 0;
        let sumV = 0;
        let hits = 0;
        const neighbors = [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ];
        for (let n = 0; n < neighbors.length; n++) {
          const nx = ix + neighbors[n][0];
          const ny = iy + neighbors[n][1];
          if (nx < 0 || nx >= gridPxW || ny < 0 || ny >= gridPxH) continue;
          const np = ny * gridPxW + nx;
          if (inside[np]) {
            const aIn = alphaGrid[np];
            const denom = aIn - aOut;
            const frac = denom > 0.01 ? Math.max(0.05, Math.min(0.95, (0.48 - aOut) / denom)) : 0.5;
            sumU += baseU + (neighbors[n][0] / GRID_W) * frac;
            sumV += baseV + (neighbors[n][1] / GRID_H) * frac;
            hits++;
          }
        }
        if (hits > 0) {
          u = sumU / hits;
          v = sumV / hits;
        }
      }

      const y = v;
      const z = (u - 0.5) * worldScaleZ;

      const rIdx = gIdx;
      vertPos[rIdx * 3] = hx;
      vertPos[rIdx * 3 + 1] = y;
      vertPos[rIdx * 3 + 2] = z;
      vertUv[rIdx * 2] = u;
      vertUv[rIdx * 2 + 1] = v;

      const lIdx = gTotal + gIdx;
      vertPos[lIdx * 3] = -hx;
      vertPos[lIdx * 3 + 1] = y;
      vertPos[lIdx * 3 + 2] = z;
      vertUv[lIdx * 2] = u;
      vertUv[lIdx * 2 + 1] = v;
    }
  }

  const indices = new Uint32Array(activeCells.length * 12);
  let ptr = 0;
  for (let k = 0; k < activeCells.length; k++) {
    const [a, b, c, d] = activeCells[k];
    // Right (+X) outward CCW
    indices[ptr++] = a;
    indices[ptr++] = c;
    indices[ptr++] = b;
    indices[ptr++] = b;
    indices[ptr++] = c;
    indices[ptr++] = d;

    // Left (-X) outward CCW
    const la = gTotal + a;
    const lb = gTotal + b;
    const lc = gTotal + c;
    const ld = gTotal + d;
    indices[ptr++] = la;
    indices[ptr++] = lb;
    indices[ptr++] = lc;
    indices[ptr++] = lb;
    indices[ptr++] = ld;
    indices[ptr++] = lc;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertPos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(vertUv, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Smoothly align perimeter seam normals (x === 0) using smoothed distance gradient so silhouettes never show dark staircase dots
  const normAttr = geometry.attributes.normal;
  for (let iy = 1; iy < gridPxH - 1; iy++) {
    for (let ix = 1; ix < gridPxW - 1; ix++) {
      const i = iy * gridPxW + ix;
      if (halfThick[i] === 0) {
        const gradZ = smoothDist[i + 1] - smoothDist[i - 1];
        const gradY = smoothDist[i + gridPxW] - smoothDist[i - gridPxW];
        let ny = -gradY;
        let nz = -gradZ;
        let len = Math.hypot(ny, nz);
        if (len < 0.001) {
          const lIdx = gTotal + i;
          ny = (normAttr.getY(i) + normAttr.getY(lIdx)) * 0.5;
          nz = (normAttr.getZ(i) + normAttr.getZ(lIdx)) * 0.5;
          len = Math.hypot(ny, nz) || 1;
        }
        const lIdx = gTotal + i;
        normAttr.setXYZ(i, 0, ny / len, nz / len);
        normAttr.setXYZ(lIdx, 0, ny / len, nz / len);
      }
    }
  }
  normAttr.needsUpdate = true;

  return { texture, geometry };
}

export const SWAN_3D_PHOTO_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uNeckAngle;
  uniform float uNeckTurn;
  uniform float uWingLift;
  uniform float uWingRouse;
  uniform float uTailWag;
  uniform float uChestLift;

  varying vec2 vUv;
  varying vec3 vWorldNorm;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  vec2 rotYZ(vec2 yz, vec2 pivot, float a) {
    float c = cos(a);
    float s = sin(a);
    vec2 d = yz - pivot;
    return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    vec3 nrm = normal;

    float frontU = uv.x;
    float upV = uv.y;
    float aboveWater = smoothstep(0.03, 0.20, upV);

    // 1. True 3D Neck & Head S-Curve Pitch (grazing, dabbling, proud stretch, preen tilt) + Side Turn
    float neckMask = smoothstep(0.50, 0.72, frontU) * smoothstep(0.15, 0.42, upV);
    float idleScan = sin(uTime * 1.12 + uPhase) * 0.052 + sin(uTime * 0.52 + uPhase * 1.4) * 0.032;
    float thetaPitch = (uNeckAngle + idleScan) * neckMask;

    vec2 neckPivotYZ = vec2(0.22, 0.16);
    vec2 rotYZPos = rotYZ(pos.yz, neckPivotYZ, thetaPitch);
    pos.yz = mix(pos.yz, rotYZPos, neckMask);

    // Wider smooth 3D sideways neck/head turn & shoulder preening reach
    float headTurnMask = smoothstep(0.54, 0.80, frontU) * smoothstep(0.28, 0.66, upV);
    float turnRad = uNeckTurn * headTurnMask;
    float tc = cos(turnRad);
    float ts = sin(turnRad);
    vec2 turnPivotXZ = vec2(0.0, 0.22);
    vec2 dxz = pos.xz - turnPivotXZ;
    pos.xz = turnPivotXZ + vec2(dxz.x * tc + dxz.y * ts, -dxz.x * ts + dxz.y * tc);

    // Rotate vertex normal to stay shading-consistent during neck bends
    vec2 nYZ = rotYZ(nrm.yz, vec2(0.0), thetaPitch);
    nrm.yz = mix(nrm.yz, nYZ, neckMask);
    nrm.xz = vec2(nrm.x * tc + nrm.z * ts, -nrm.x * ts + nrm.z * tc);

    // 2. Bilateral 3D Swimming Busking Wing Arch & Touch/Stretch Wing Flare
    float wingMask = smoothstep(0.10, 0.26, frontU) * smoothstep(0.66, 0.42, frontU) * smoothstep(0.16, 0.56, upV);
    float sideSign = sign(pos.x);
    float latWeight = smoothstep(0.015, 0.14, abs(pos.x));
    float breath = sin(uTime * 1.45 + uPhase) * 0.016;
    float rouseWave = sin(uTime * 25.0 + frontU * 12.0 + upV * 8.0) * 0.042 * uWingRouse;
    float archLift = uWingLift * 0.115 * (0.4 + 0.6 * smoothstep(0.32, 0.62, upV));
    float liftY = (uWingRouse * 0.16 + rouseWave + archLift + breath) * wingMask;
    float flareX = sideSign * latWeight * (uWingRouse * 0.16 + abs(rouseWave) * 0.60 + uWingLift * 0.085) * wingMask;

    pos.y += liftY;
    pos.x += flareX;
    pos.z -= (uWingRouse * 0.052 + uWingLift * 0.025) * wingMask;

    // 3. Brisk 3D Tail Fan Wag & Lift (balance & water shake)
    float tailMask = smoothstep(0.28, 0.04, frontU) * smoothstep(0.12, 0.44, upV);
    pos.y += (sin(uTime * 1.55 + uPhase + 1.2) * 0.014 + abs(uTailWag) * 0.052) * tailMask;
    pos.x += uTailWag * 0.095 * tailMask;

    // 4. Chest Surge Lift on Paddling, Proud Stretch & Touch Splash
    pos.y += (frontU * 0.092 * uChestLift + sin(uTime * 1.45 + uPhase + frontU * 2.0) * 0.007) * aboveWater;

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vWorldNorm = normalize((modelMatrix * vec4(nrm, 0.0)).xyz);
    vViewDir = cameraPosition - wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const SWAN_3D_PHOTO_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uThemeMix;
  uniform float uIsBlack;
  uniform float uDepthFade;
  uniform float uHoverGlow;
  uniform float uTime;
  uniform float uPhase;

  varying vec2 vUv;
  varying vec3 vWorldNorm;
  varying vec3 vWorldPos;
  varying vec3 vViewDir;

  vec4 sampleSharp(sampler2D tex, vec2 uv) {
    vec2 tx = vec2(1.0 / 1536.0, 1.0 / 1152.0);
    vec4 c = texture2D(tex, uv);
    vec3 blur = (
      texture2D(tex, uv + vec2(tx.x, 0.0)).rgb +
      texture2D(tex, uv - vec2(tx.x, 0.0)).rgb +
      texture2D(tex, uv + vec2(0.0, tx.y)).rgb +
      texture2D(tex, uv - vec2(0.0, tx.y)).rgb
    ) * 0.25;
    float edgeGuard = smoothstep(0.76, 0.98, c.a);
    c.rgb = clamp(c.rgb + (c.rgb - blur) * (0.24 * edgeGuard), 0.0, 1.0);
    return c;
  }

  void main() {
    vec4 tex = sampleSharp(uMap, vUv);

    float waterWave = 0.018 + 0.004 * sin(vWorldPos.x * 16.0 + uTime * 1.9 + uPhase)
                            + 0.003 * cos(vWorldPos.z * 19.0 - uTime * 1.4);
    if (vUv.y < waterWave * 0.45) discard;

    // 3D Volumetric Overcast Sky + Sun + Rim Fresnel Shading (silky gradient with zero dark edge banding)
    vec3 wn = normalize(vWorldNorm);
    vec3 vd = normalize(vViewDir);
    float skyShade = clamp(wn.y * 0.24 + 0.82, 0.68, 1.04);
    float sunShade = clamp(dot(wn, normalize(vec3(0.42, 0.72, 0.55))) * 0.24 + 0.85, 0.72, 1.08);
    float shade3D = mix(1.0, skyShade * sunShade, 0.34);
    float rim = pow(1.0 - clamp(abs(dot(wn, vd)), 0.0, 1.0), 2.5);

    vec3 col = tex.rgb * shade3D;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(luma), mix(0.92, 0.86, uThemeMix));

    vec3 dayWhite = clamp((col - 0.45) * 1.06 + 0.46, 0.0, 1.0) * vec3(0.96, 0.97, 0.99);
    vec3 dayBlack = pow(clamp(col, 0.0, 1.0), vec3(1.10)) * vec3(0.92, 0.94, 0.98);
    vec3 daySwan = mix(dayWhite, dayBlack, uIsBlack);

    vec3 nightWhite = col * vec3(0.68, 0.73, 0.82) + vec3(0.04, 0.055, 0.08) * smoothstep(0.25, 0.9, vUv.y);
    vec3 nightBlack = col * vec3(0.84, 0.87, 0.92) + vec3(0.012, 0.018, 0.028);
    vec3 nightSwan = mix(nightWhite, nightBlack, uIsBlack);

    vec3 finalCol = mix(nightSwan, daySwan, uThemeMix);

    // Subtle soft atmospheric down rim & hover sheen
    finalCol += mix(vec3(0.22, 0.28, 0.38), vec3(0.85, 0.90, 0.96), uThemeMix) * (rim * mix(0.11, 0.07, uIsBlack) + uHoverGlow * 0.10 * (0.4 + 0.6 * rim));

    float wetEdge = smoothstep(waterWave * 0.6, waterWave + 0.075, vUv.y);
    finalCol *= mix(0.78, 1.0, wetEdge);

    float meniscus = exp(-pow((vUv.y - (waterWave + 0.012)) / 0.012, 2.0));
    finalCol += mix(vec3(0.35, 0.42, 0.52), vec3(0.86, 0.89, 0.94), uThemeMix) * meniscus * 0.10;

    vec3 mistColor = mix(vec3(0.09, 0.125, 0.18), vec3(0.76, 0.79, 0.84), uThemeMix);
    finalCol = mix(finalCol, mistColor, uDepthFade);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

export const REFL_3D_PHOTO_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uNeckAngle;
  uniform float uNeckTurn;
  uniform float uWingLift;
  uniform float uWingRouse;
  uniform float uTailWag;
  uniform float uChestLift;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  vec2 rotYZ(vec2 yz, vec2 pivot, float a) {
    float c = cos(a);
    float s = sin(a);
    vec2 d = yz - pivot;
    return pivot + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;

    float frontU = uv.x;
    float upV = uv.y;
    float aboveWater = smoothstep(0.03, 0.20, upV);

    float neckMask = smoothstep(0.50, 0.72, frontU) * smoothstep(0.15, 0.42, upV);
    float idleScan = sin(uTime * 1.12 + uPhase) * 0.052 + sin(uTime * 0.52 + uPhase * 1.4) * 0.032;
    float thetaPitch = (uNeckAngle + idleScan) * neckMask;

    vec2 neckPivotYZ = vec2(0.22, 0.16);
    pos.yz = mix(pos.yz, rotYZ(pos.yz, neckPivotYZ, thetaPitch), neckMask);

    float headTurnMask = smoothstep(0.54, 0.80, frontU) * smoothstep(0.28, 0.66, upV);
    float turnRad = uNeckTurn * headTurnMask;
    float tc = cos(turnRad);
    float ts = sin(turnRad);
    vec2 turnPivotXZ = vec2(0.0, 0.22);
    vec2 dxz = pos.xz - turnPivotXZ;
    pos.xz = turnPivotXZ + vec2(dxz.x * tc + dxz.y * ts, -dxz.x * ts + dxz.y * tc);

    float wingMask = smoothstep(0.10, 0.26, frontU) * smoothstep(0.66, 0.42, frontU) * smoothstep(0.16, 0.56, upV);
    float sideSign = sign(pos.x);
    float latWeight = smoothstep(0.015, 0.14, abs(pos.x));
    float breath = sin(uTime * 1.45 + uPhase) * 0.016;
    float rouseWave = sin(uTime * 25.0 + frontU * 12.0 + upV * 8.0) * 0.042 * uWingRouse;
    float archLift = uWingLift * 0.115 * (0.4 + 0.6 * smoothstep(0.32, 0.62, upV));
    pos.y += (uWingRouse * 0.16 + rouseWave + archLift + breath) * wingMask;
    pos.x += sideSign * latWeight * (uWingRouse * 0.16 + abs(rouseWave) * 0.60 + uWingLift * 0.085) * wingMask;
    pos.z -= (uWingRouse * 0.052 + uWingLift * 0.025) * wingMask;

    float tailMask = smoothstep(0.28, 0.04, frontU) * smoothstep(0.12, 0.44, upV);
    pos.y += (sin(uTime * 1.55 + uPhase + 1.2) * 0.014 + abs(uTailWag) * 0.052) * tailMask;
    pos.x += uTailWag * 0.095 * tailMask;
    pos.y += (frontU * 0.092 * uChestLift + sin(uTime * 1.45 + uPhase + frontU * 2.0) * 0.007) * aboveWater;

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    float depthBelow = max(0.0, -wp.y);
    wp.x += sin(depthBelow * 34.0 - uTime * 2.2 + uPhase) * 0.034 * (0.14 + depthBelow)
          + cos(depthBelow * 74.0 + uTime * 1.7 - uPhase * 0.7) * 0.014 * depthBelow;

    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const REFL_3D_PHOTO_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uPhase;
  uniform float uThemeMix;
  uniform float uIsBlack;
  uniform float uDepthFade;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    float distFromLine = vUv.y;
    float waveX = sin(distFromLine * 46.0 - uTime * 2.1 + uPhase) * 0.025 * (0.12 + distFromLine);
    float waveX2 = cos(distFromLine * 96.0 + uTime * 1.8 - uPhase * 0.7) * 0.010 * distFromLine;
    float sx = clamp(vUv.x + waveX + waveX2, 0.0, 1.0);

    vec4 tex = texture2D(uMap, vec2(sx, distFromLine));
    if (tex.a < 0.14) discard;
    if (vWorldPos.y > 0.008) discard;

    float waterWave = 0.018 + 0.004 * sin(vWorldPos.x * 16.0 + uTime * 1.9 + uPhase);
    if (vUv.y < waterWave * 0.45) discard;

    float ribbon = smoothstep(-0.35, 0.45, sin(distFromLine * 54.0 - uTime * 2.0 + uPhase + sin(vUv.x * 14.0) * 1.2));

    float luma = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float hullShadow = exp(-distFromLine * 5.6);
    vec3 shadowCol = mix(vec3(0.024, 0.036, 0.058), vec3(0.18, 0.21, 0.26), uThemeMix);

    vec3 whiteRefl = mix(vec3(0.045, 0.062, 0.092), vec3(0.56, 0.59, 0.64), luma * mix(0.62, 0.96, uThemeMix));
    vec3 blackRefl = mix(vec3(0.015, 0.022, 0.036), vec3(0.10, 0.12, 0.15), luma * 0.55);
    vec3 bodyRefl = mix(whiteRefl, blackRefl, uIsBlack);

    vec3 reflCol = mix(bodyRefl, shadowCol, hullShadow * 0.72);
    vec3 lakeTint = mix(vec3(0.045, 0.062, 0.095), vec3(0.46, 0.50, 0.56), uThemeMix);
    reflCol = mix(reflCol, lakeTint, distFromLine * 0.46);

    float baseFade = pow(1.0 - distFromLine, 1.42) * mix(0.60, 0.64, uThemeMix) * (1.0 - uDepthFade * 0.72);
    float finalAlpha = smoothstep(0.22, 0.58, tex.a) * baseFade * mix(0.45, 1.0, ribbon);
    gl_FragColor = vec4(reflCol, finalAlpha);
  }
`;
