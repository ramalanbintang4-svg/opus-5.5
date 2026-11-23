// three.js rendering: chunk meshes, sky dome, sun/moon, clouds, first-person hand, block highlight.
import * as THREE from 'three';
import { meshChunk, meshItem } from './mesher.js';
import { CHUNK } from './terrain.js';
import { Simplex } from './noise.js';
import { isItem, ITEMS, extrudeSprite } from './items.js';

THREE.ColorManagement.enabled = false;

export function nearestTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export function geometryFrom(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  g.setIndex(new THREE.BufferAttribute(data.indices, 1));
  g.computeBoundingSphere();
  return g;
}

const DAY_SKY = new THREE.Color(0x79a6ff);
const DAY_FOG = new THREE.Color(0xc4dcff);
const NIGHT_SKY = new THREE.Color(0x05060f);
const NIGHT_FOG = new THREE.Color(0x0c1022);
const SUNSET = new THREE.Color(0xf08a4b);
const WATER_FOG = new THREE.Color(0x173a9c);

export class Renderer {
  constructor(container, atlasCanvas) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1400);
    this.camera.rotation.order = 'YXZ';
    this.fog = new THREE.Fog(DAY_FOG.clone(), 40, 100);
    this.scene.fog = this.fog;

    this.atlas = nearestTexture(atlasCanvas);
    this.solidMat = new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
    this.waterMat = new THREE.MeshBasicMaterial({
      map: this.atlas, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
    });
    this.itemMat = new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: false });
    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);

    this.buildSky();
    this.buildClouds();
    this.buildHighlight();
    this.buildHand();

    this.skyColor = DAY_SKY.clone();
    this.fogColor = DAY_FOG.clone();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.handCamera.aspect = innerWidth / innerHeight;
    this.handCamera.updateProjectionMatrix();
  }

  /* ---------- chunks ---------- */
  buildChunk(world, chunk) {
    const data = meshChunk(world, chunk);
    this.disposeChunk(chunk);
    const meshes = [];
    if (data.solid.vertexCount) {
      const m = new THREE.Mesh(geometryFrom(data.solid), this.solidMat);
      meshes.push(m);
    }
    if (data.water.vertexCount) {
      const m = new THREE.Mesh(geometryFrom(data.water), this.waterMat);
      m.renderOrder = 1;
      meshes.push(m);
    }
    for (const m of meshes) {
      m.position.set(chunk.cx * CHUNK, 0, chunk.cz * CHUNK);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.chunkGroup.add(m);
    }
    chunk.meshes = meshes;
    chunk.dirty = false;
  }

  disposeChunk(chunk) {
    if (!chunk.meshes) return;
    for (const m of chunk.meshes) { this.chunkGroup.remove(m); m.geometry.dispose(); }
    chunk.meshes = null;
  }

  /* ---------- sky ---------- */
  buildSky() {
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const colors = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.skyDome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    const sq = (draw) => {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      draw(c.getContext('2d'));
      return nearestTexture(c);
    };
    const sunTex = sq((g) => {
      g.fillStyle = 'rgba(255,255,200,0.25)'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#fffbe0'; g.fillRect(6, 6, 20, 20);
      g.fillStyle = '#fff38a'; g.fillRect(9, 9, 14, 14);
    });
    const moonTex = sq((g) => {
      g.fillStyle = '#d8dce8'; g.fillRect(8, 8, 16, 16);
      g.fillStyle = '#a9afc0'; g.fillRect(11, 11, 4, 4); g.fillRect(18, 16, 3, 3); g.fillRect(12, 19, 3, 2);
    });
    const mk = (tex, size, blend) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, fog: false, depthWrite: false, blending: blend,
      }));
      m.renderOrder = -9;
      this.scene.add(m);
      return m;
    };
    this.sun = mk(sunTex, 120, THREE.AdditiveBlending);
    this.moon = mk(moonTex, 80, THREE.NormalBlending);

    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 700; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pts.push(r * Math.cos(a) * 800, Math.abs(u) * 800, r * Math.sin(a) * 800);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  updateSkyDome(top, horizon) {
    const pos = this.skyDome.geometry.attributes.position;
    const col = this.skyDome.geometry.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900;
      const t = Math.min(1, Math.max(0, y * 2.2));
      c.copy(horizon).lerp(top, t);
      if (y < 0) c.copy(horizon).multiplyScalar(0.85);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** time in [0,1): 0 sunrise, .25 noon, .5 sunset, .75 midnight */
  updateSky(time, underwater, renderDist) {
    const a = time * Math.PI * 2;
    const sunY = Math.sin(a);
    const day = Math.min(1, Math.max(0, sunY * 2.5 + 0.35));
    const top = NIGHT_SKY.clone().lerp(DAY_SKY, day);
    const hor = NIGHT_FOG.clone().lerp(DAY_FOG, day);
    const dusk = Math.max(0, 1 - Math.abs(sunY) * 4) * (Math.cos(a) > -2 ? 1 : 0);
    hor.lerp(SUNSET, dusk * 0.55);
    if (!this._lastSky || Math.abs(this._lastSky - time) > 0.0007) { this.updateSkyDome(top, hor); this._lastSky = time; }
    this.skyColor.copy(top);
    this.fogColor.copy(hor);

    const cam = this.camera.position;
    const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.25).normalize();
    this.sun.position.copy(cam).addScaledVector(dir, 700);
    this.sun.lookAt(cam);
    this.moon.position.copy(cam).addScaledVector(dir, -700);
    this.moon.lookAt(cam);
    this.skyDome.position.copy(cam);
    this.stars.position.copy(cam);
    this.stars.material.opacity = Math.max(0, 1 - day * 1.6);

    const far = renderDist * CHUNK;
    if (underwater) {
      this.fog.color.copy(WATER_FOG).multiplyScalar(0.3 + 0.7 * day);
      this.fog.near = 0.5; this.fog.far = 14;
      this.renderer.setClearColor(this.fog.color);
    } else {
      this.fog.color.copy(hor);
      this.fog.near = far * 0.55; this.fog.far = far * 0.95;
      this.renderer.setClearColor(hor);
    }
    const light = 0.2 + 0.8 * day;
    this.solidMat.color.setScalar(light);
    this.waterMat.color.setScalar(light);
    this.clouds.material.color.setScalar(0.25 + 0.75 * day);
    return light;
  }

  /* ---------- clouds ---------- */
  buildClouds() {
    const N = 128;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const s = new Simplex(77);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      // tileable noise via torus mapping
      const ax = (x / N) * Math.PI * 2, ay = (y / N) * Math.PI * 2;
      const v = s.noise3(Math.cos(ax) * 3, Math.sin(ax) * 3, Math.cos(ay) * 3 + Math.sin(ay) * 1.7) + 0.5 * s.noise3(Math.cos(ax) * 7, Math.sin(ax) * 7, Math.sin(ay) * 7);
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = v > 0.18 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
    const tex = nearestTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    const fade = document.createElement('canvas'); fade.width = fade.height = 64;
    const fg = fade.getContext('2d');
    const grad = fg.createRadialGradient(32, 32, 6, 32, 32, 32);
    grad.addColorStop(0, '#fff'); grad.addColorStop(1, '#000');
    fg.fillStyle = grad; fg.fillRect(0, 0, 64, 64);
    const fadeTex = new THREE.CanvasTexture(fade);
    this.cloudSize = 4096;
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(this.cloudSize, this.cloudSize), new THREE.MeshBasicMaterial({
      map: tex, alphaMap: fadeTex, transparent: true, opacity: 0.82, side: THREE.DoubleSide, fog: false, depthWrite: false,
    }));
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    this.scene.add(this.clouds);
  }

  updateClouds(t) {
    const cam = this.camera.position;
    this.clouds.position.set(cam.x, 124, cam.z);
    const tex = this.clouds.material.map;
    const span = this.cloudSize / tex.repeat.x;
    tex.offset.set(((cam.x + t * 1.2) / span) % 1, (-cam.z / span) % 1);
  }

  /* ---------- selection & cracks ---------- */
  buildHighlight() {
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, fog: false }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.crackMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.002, 1.002, 1.002), this.crackMat);
    this.crack.visible = false;
    this.scene.add(this.crack);
  }

  setCracks(canvases) { this.crackTextures = canvases.map(nearestTexture); }

  showHighlight(hit, render) {
    if (!hit) { this.highlight.visible = false; return; }
    this.highlight.visible = true;
    if (render === 'cross') { this.highlight.scale.set(0.7, 0.8, 0.7); this.highlight.position.set(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5); }
    else if (render === 'door') { this.highlight.scale.set(1, 1, 0.19); this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.094); }
    else { this.highlight.scale.set(1, 1, 1); this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5); }
  }

  showCrack(hit, stage) {
    if (!hit || stage < 0) { this.crack.visible = false; return; }
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const t = this.crackTextures[Math.min(9, stage)];
    if (this.crackMat.map !== t) { this.crackMat.map = t; this.crackMat.needsUpdate = true; }
  }

  /* ---------- first-person hand ---------- */
  buildHand() {
    this.handScene = new THREE.Scene();
    this.handCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 10);
    this.handRoot = new THREE.Group();
    this.handScene.add(this.handRoot);
    this.armMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), this.armMat);
    this.handRoot.add(this.arm);
    this.heldMesh = null;
    this.heldId = -1;
    this.heldIsTool = false;
    this.toolMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    this.toolGeoms = new Map();
  }

  toolGeometry(id) {
    if (!this.toolGeoms.has(id)) {
      const d = extrudeSprite(ITEMS[id].sprite);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
      g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
      g.setIndex(new THREE.BufferAttribute(d.indices, 1));
      g.computeBoundingSphere();
      this.toolGeoms.set(id, g);
    }
    return this.toolGeoms.get(id);
  }

  setArmTexture(canvas) { this.armMat.map = nearestTexture(canvas); this.armMat.needsUpdate = true; }

  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.heldMesh) {
      this.handRoot.remove(this.heldMesh);
      if (!this.heldIsTool) this.heldMesh.geometry.dispose();
      this.heldMesh = null;
    }
    this.heldIsTool = isItem(id);
    if (this.heldIsTool) {
      this.heldMesh = new THREE.Mesh(this.toolGeometry(id), this.toolMat);
      this.heldMesh.rotation.order = 'YXZ';
      this.handRoot.add(this.heldMesh);
    } else if (id) {
      this.heldMesh = new THREE.Mesh(geometryFrom(meshItem(id)), this.itemMat);
      this.handRoot.add(this.heldMesh);
    }
    this.arm.visible = !id;
  }

  /** swing in [0,1], bob/walk from player */
  updateHand(swing, walk, bob, light, place) {
    const s = swing;
    const sq = Math.sin(Math.sqrt(s) * Math.PI);
    const sw = Math.sin(s * Math.PI);
    const bx = Math.sin(walk * Math.PI) * 0.035 * bob;
    const by = -Math.abs(Math.cos(walk * Math.PI)) * 0.04 * bob;
    this.handRoot.position.set(0.5 + bx - sq * 0.22, -0.44 + by + Math.sin(Math.sqrt(s) * Math.PI * 2) * 0.1 - place * 0.08, -0.82 - sw * 0.12);
    this.handRoot.rotation.set(0, 0, 0);
    if (this.heldMesh && this.heldIsTool) {
      // tools: held diagonally, blade up and away, chopping down on swing
      this.heldMesh.scale.setScalar(0.5);
      this.heldMesh.rotation.set(-0.2 - sw * 1.1, Math.PI / 2 + 0.75 - sq * 0.3, 0.55);
      this.heldMesh.position.set(0.0, 0.2 - sw * 0.05, -0.1);
    } else if (this.heldMesh) {
      this.heldMesh.scale.setScalar(this.heldMesh.geometry.attributes.position.count === 8 ? 0.36 : 0.26);
      this.heldMesh.rotation.set(0.12 - sw * 0.7, Math.PI / 4 + 0.35 - sq * 0.4, 0);
      this.heldMesh.position.set(0, 0.05, 0);
    }
    this.arm.position.set(0.05, -0.05, 0.05);
    this.arm.rotation.set(-1.05 - sw * 0.9, 0.35 - sq * 0.5, 0.42 + sq * 0.3);
    this.armMat.color.setScalar(light);
    this.itemMat.color.setScalar(Math.max(0.35, light));
    this.toolMat.color.setScalar(Math.max(0.35, light));
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    r.clearDepth();
    r.render(this.handScene, this.handCamera);
  }
}
