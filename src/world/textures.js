// Procedural canvas textures. No image assets: everything is drawn once at
// start-up and cached, which keeps the download tiny and the look consistent.

import * as THREE from 'three';

const cache = new Map();

function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  return c;
}

export function canvasTexture(key, w, h, draw, opts = {}) {
  let t = cache.get(key);
  if (t) return t;
  const c = makeCanvas(w, h, draw);
  t = new THREE.CanvasTexture(c);
  t.wrapS = opts.wrapS || THREE.RepeatWrapping;
  t.wrapT = opts.wrapT || THREE.RepeatWrapping;
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.anisotropy || 4;
  if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function noise(ctx, w, h, amount, size = 1, alpha = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (alpha < 1) d[i + 3] *= alpha;
  }
  ctx.putImageData(img, 0, 0);
}

export const TEX = {
  asphalt() {
    return canvasTexture('asphalt', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2b2d31';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const g = 40 + Math.random() * 60;
        ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.25 + Math.random() * 0.4})`;
        const s = 1 + Math.random() * 2.4;
        ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
      }
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = 'rgba(20,20,22,0.5)';
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 70;
          y += (Math.random() - 0.5) * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      noise(ctx, w, h, 16);
    }, { repeat: [1, 1] });
  },

  sidewalk() {
    return canvasTexture('sidewalk', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#9d9a94';
      ctx.fillRect(0, 0, w, h);
      const tile = 32;
      for (let y = 0; y < h; y += tile) {
        for (let x = 0; x < w; x += tile) {
          const g = 150 + Math.random() * 24;
          ctx.fillStyle = `rgb(${g},${g - 3},${g - 8})`;
          ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
        }
      }
      noise(ctx, w, h, 14);
    }, { repeat: [1, 1] });
  },

  grass() {
    return canvasTexture('grass', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#4e6b3a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const g = 70 + Math.random() * 70;
        ctx.fillStyle = `rgba(${40 + Math.random() * 40},${g},${40 + Math.random() * 30},0.5)`;
        const s = 1 + Math.random() * 3;
        ctx.fillRect(Math.random() * w, Math.random() * h, s, s * 2);
      }
      noise(ctx, w, h, 22);
    }, { repeat: [1, 1] });
  },

  sand() {
    return canvasTexture('sand', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#c9b489';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1200; i++) {
        const g = 190 + Math.random() * 50;
        ctx.fillStyle = `rgba(${g},${g - 16},${g - 52},0.5)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 1);
      }
      noise(ctx, w, h, 18);
    }, { repeat: [1, 1] });
  },

  farmland() {
    return canvasTexture('farmland', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#7e7b46';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = y % 32 === 0 ? '#8a874e' : '#6f6c3d';
        ctx.fillRect(0, y, w, 8);
      }
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = `rgba(${90 + Math.random() * 40},${100 + Math.random() * 40},${60 + Math.random() * 30},0.35)`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3);
      }
      noise(ctx, w, h, 16);
    }, { repeat: [1, 1] });
  },

  roofTiles() {
    return canvasTexture('roofTiles', 128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#7c3b2c';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 12) {
        for (let x = 0; x < w; x += 16) {
          const v = 0.75 + Math.random() * 0.35;
          ctx.fillStyle = `rgb(${120 * v},${58 * v},${44 * v})`;
          ctx.fillRect(x + (y % 24 === 0 ? 0 : 8), y, 15, 11);
        }
      }
    }, { repeat: [1, 1] });
  },

  glow() {
    return canvasTexture('glow', 128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,244,214,0.55)');
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  },

  blob() {
    return canvasTexture('blob', 128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  },

  headlights() {
    return canvasTexture('headlights', 128, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, 'rgba(255,246,214,0.55)');
      g.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h);
      ctx.lineTo(w * 0.64, h);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
    }, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }
};

/** Text on a coloured plate — used for shop signs and route markers. */
export function signTexture(text, opts = {}) {
  const key = 'sign:' + text + '|' + (opts.bg || '') + (opts.fg || '');
  let t = cache.get(key);
  if (t) return t;
  const w = 512;
  const h = 128;
  const c = makeCanvas(w, h, (ctx) => {
    ctx.fillStyle = opts.bg || '#14181d';
    ctx.fillRect(0, 0, w, h);
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
    }
    ctx.fillStyle = opts.fg || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = opts.size || 68;
    const font = opts.font || 'system-ui, -apple-system, sans-serif';
    ctx.font = `800 ${size}px ${font}`;
    while (ctx.measureText(text).width > w - 44 && size > 20) {
      size -= 3;
      ctx.font = `800 ${size}px ${font}`;
    }
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
