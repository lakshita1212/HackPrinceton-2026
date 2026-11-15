// Opening scene: a 1950s tabletop radio in a dark room. "Tune in" lights the
// dial, sweeps the needle across the years and pushes the camera into the glow,
// then the app is revealed. Skip with the link, Escape, or ?intro=0.
import * as THREE from './vendor/three.module.min.js';
import { sfx } from './audio.js';

// Small canvas textures, drawn here so no image files are needed.
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const walnut = () => canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#5a3218';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * h;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,14,6' : '140,82,40'},${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 6 + Math.sin(x / 13) * 1.5);
    g.stroke();
  }
});

const grille = () => canvasTexture(512, 512, (g, w, h) => {
  g.fillStyle = '#c9a25c';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 6) {
    g.fillStyle = i % 12 ? 'rgba(90,60,20,.35)' : 'rgba(255,235,180,.25)';
    g.fillRect(i, 0, 3, h);
    g.fillRect(0, i, w, 3);
  }
  for (let x = 40; x < w; x += 72) {   // gold bars across the cloth
    g.fillStyle = '#7a5418';
    g.fillRect(x, 0, 10, h);
  }
});

function dialFace() {
  return canvasTexture(1024, 512, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.6);
    grad.addColorStop(0, '#fff3d0');
    grad.addColorStop(1, '#e2b766');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b1a10';
    g.fillStyle = '#2b1a10';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(70, 220);
    g.lineTo(w - 70, 220);
    g.stroke();
    const marks = [['1962', 0.1], ['1969', 0.42], ['1989', 0.68], ['2026', 0.9]];
    for (let i = 0; i <= 40; i++) {
      const x = 70 + (i / 40) * (w - 140);
      g.lineWidth = i % 5 ? 2 : 4;
      g.beginPath();
      g.moveTo(x, 220);
      g.lineTo(x, i % 5 ? 196 : 180);
      g.stroke();
    }
    g.textAlign = 'center';
    g.font = 'italic 800 64px "Playfair Display", Georgia, serif';
    for (const [label, at] of marks) g.fillText(label, 70 + at * (w - 140), 310);
    g.font = '600 34px "Oswald", sans-serif';
    g.fillStyle = '#a8321f';
    g.fillText('STAY TUNED · BROADCAST', w / 2, 420);
  });
}

export function playIntro(root) {
  const params = new URLSearchParams(location.search);
  if (params.get('intro') === '0') { root.remove(); return Promise.resolve(); }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    root.remove();
    return Promise.resolve();
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.domElement.className = 'intro-canvas';
  root.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x120804, 6, 14);
  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 50);
  const home = new THREE.Vector3(0, 0.9, 9);
  camera.position.copy(home);

  // ── The radio ───────────────────────────────────────────────────────────
  const radio = new THREE.Group();
  scene.add(radio);
  const W = 3.4;
  const H = 2.1;
  const D = 1.4;
  const shape = new THREE.Shape();
  const r = 0.45;
  shape.moveTo(-W / 2 + r, -H / 2);
  shape.lineTo(W / 2 - r, -H / 2);
  shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r);
  shape.lineTo(W / 2, H / 2 - r);
  shape.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2);
  shape.lineTo(-W / 2 + r, H / 2);
  shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r);
  shape.lineTo(-W / 2, -H / 2 + r);
  shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 5, curveSegments: 24 });
  bodyGeo.translate(0, 0, -D / 2);
  const wood = walnut();
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(0.35, 0.35);
  radio.add(new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ map: wood, roughness: 0.38, metalness: 0.05 })));
  const front = D / 2 + 0.081;

  // brass frames around the grille and the dial window
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8a948, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide });
  function frame(cx, cy, w, h, t) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - t, -h / 2 - t); s.lineTo(w / 2 + t, -h / 2 - t); s.lineTo(w / 2 + t, h / 2 + t); s.lineTo(-w / 2 - t, h / 2 + t); s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2, -h / 2); hole.lineTo(-w / 2, h / 2); hole.lineTo(w / 2, h / 2); hole.lineTo(w / 2, -h / 2); hole.closePath();
    s.holes.push(hole);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), brass);
    m.position.set(cx, cy, front);
    radio.add(m);
  }
  frame(-0.85, 0.05, 1.35, 1.45, 0.05);
  frame(0.78, 0.38, 1.5, 0.75, 0.05);

  // speaker grille on the left
  const grilleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.45),
    new THREE.MeshStandardMaterial({ map: grille(), roughness: 0.9 }),
  );
  grilleMesh.position.set(-0.85, 0.05, front + 0.001);
  radio.add(grilleMesh);

  // glowing dial window on the right
  const dialMat = new THREE.MeshStandardMaterial({ map: dialFace(), emissive: 0xffc070, emissiveIntensity: 0.12, emissiveMap: null, roughness: 0.3 });
  const dialMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), dialMat);
  dialMesh.position.set(0.78, 0.38, front + 0.002);
  radio.add(dialMesh);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.56, 0.81),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.4 }),
  );
  glass.position.set(0.78, 0.38, front + 0.03);
  radio.add(glass);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.6, 0.01), new THREE.MeshBasicMaterial({ color: 0xc0301b }));
  needle.position.set(0.12, 0.38, front + 0.012);
  radio.add(needle);

  // two knobs below the dial
  const knobMat = new THREE.MeshStandardMaterial({ color: 0x3a1a0b, roughness: 0.35, metalness: 0.1 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe7c06a, metalness: 0.95, roughness: 0.25 });
  const knobs = [0.35, 1.2].map((x) => {
    const k = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.16, 40), knobMat);
    body.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 32), capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.09;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), capMat);
    mark.position.set(0, 0.14, 0.085);
    k.add(body, cap, mark);
    k.position.set(x, -0.45, front + 0.08);
    radio.add(k);
    return k;
  });

  // little feet and a table to stand on
  for (const x of [-1.3, 1.3]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 16), knobMat);
    foot.position.set(x, -H / 2 - 0.12, 0);
    radio.add(foot);
  }
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(6, 64),
    new THREE.MeshStandardMaterial({ map: wood, color: 0x6b4022, roughness: 0.5 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -H / 2 - 0.18;
  scene.add(table);

  // ── Light ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffe2b0, 0.25));
  const key = new THREE.SpotLight(0xffd59a, 40, 20, 0.5, 0.6, 1.4);
  key.position.set(-2.5, 4.5, 4);
  key.target = radio;
  scene.add(key);
  const rim = new THREE.PointLight(0xff9a50, 6, 10);
  rim.position.set(3, 1.5, -2.5);
  scene.add(rim);
  const dialLight = new THREE.PointLight(0xffb860, 0.4, 6, 1.6);
  dialLight.position.set(0.78, 0.38, front + 0.6);
  radio.add(dialLight);

  // floating dust in the light
  const dustGeo = new THREE.BufferGeometry();
  const pts = new Float32Array(500 * 3);
  for (let i = 0; i < pts.length; i += 3) pts.set([(Math.random() - 0.5) * 9, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 6], i);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffd9a0, size: 0.025, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // ── Run ─────────────────────────────────────────────────────────────────
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  const mouse = new THREE.Vector2();
  root.addEventListener('pointermove', (e) => mouse.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5));

  const clock = new THREE.Clock();
  let tuneStart = -1;
  const TUNE_MS = 2600;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const dialTarget = new THREE.Vector3();

  return new Promise((resolve) => {
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      root.classList.add('done');
      setTimeout(() => {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        removeEventListener('resize', resize);
        root.remove();
        resolve();
      }, 700);
    }

    renderer.setAnimationLoop(() => {
      const t = clock.getElapsedTime();
      dust.rotation.y = t * 0.02;
      dust.position.y = Math.sin(t * 0.2) * 0.1;
      if (tuneStart < 0) {
        // idle: the radio turns slowly and follows the mouse a little
        radio.rotation.y += ((Math.sin(t * 0.35) * 0.32 + mouse.x * 0.5) - radio.rotation.y) * 0.04;
        radio.rotation.x += ((mouse.y * 0.12) - radio.rotation.x) * 0.04;
        radio.position.y = Math.sin(t * 0.8) * 0.04;
        camera.position.lerp(home, 0.05);
        camera.lookAt(0, 0.35, 0);
        dialMat.emissiveIntensity = 0.12 + Math.sin(t * 2) * 0.03;
      } else {
        const k = Math.min(1, (performance.now() - tuneStart) / TUNE_MS);
        // the radio squares up, the dial warms, the needle sweeps, the camera dives in
        radio.rotation.y *= 0.9;
        radio.rotation.x *= 0.9;
        dialMat.emissiveIntensity = 0.12 + Math.min(1, k * 2.5) * 1.1;
        dialLight.intensity = 0.4 + Math.min(1, k * 2.5) * 5;
        needle.position.x = 0.12 + Math.sin(Math.min(1, k * 1.6) * Math.PI * 1.5) * 0.5 + 0.0;
        knobs[1].rotation.z = -k * 6;
        const push = ease(Math.max(0, (k - 0.25) / 0.75));
        dialMesh.getWorldPosition(dialTarget);
        camera.position.lerpVectors(home, dialTarget.clone().add(new THREE.Vector3(0, 0, 0.35)), push);
        camera.lookAt(dialTarget);
        if (k >= 0.86) root.classList.add('flash');
        if (k >= 1) finish();
      }
      renderer.render(scene, camera);
    });

    root.querySelector('.intro-tune').addEventListener('click', () => {
      sfx.unlock();
      if (tuneStart >= 0) return;
      tuneStart = performance.now();
      root.classList.add('tuning');
      sfx.staticBurst();
      setTimeout(() => sfx.warp(2.2), 250);
    });
    root.querySelector('.intro-skip').addEventListener('click', () => { sfx.unlock(); finish(); });
    addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { removeEventListener('keydown', onKey); finish(); }
    });
  });
}
