// three.js effects over the painted rooms:
//   - floating dust that glows near the lamps, at different depths, so the
//     room feels deep when the mouse moves (parallax)
//   - soft light rays falling from each lamp, and the TV's flickering spill
//   - a time-travel tunnel when the dial crosses into another decade
// The painting itself stays a plain <img>; the room layer tilts slightly with the mouse.
// If WebGL isn't available everything here quietly does nothing.
import * as THREE from './vendor/three.module.min.js';

const MAX_LAMPS = 4;
const DUST = 420;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createFx(stage, roomLayer) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch {
    return { setRoom() {}, warp() { return Promise.resolve(); } };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.domElement.className = 'fx';
  stage.append(renderer.domElement);

  // World: the painting is the plane z = 0, 3 units wide by 2 tall (3:2).
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 20);
  camera.position.set(0, 0, 3.1);
  const toWorld = (px, py) => new THREE.Vector2((px / 100 - 0.5) * 3, (0.5 - py / 100) * 2);

  const lampUniform = Array.from({ length: MAX_LAMPS }, () => new THREE.Vector3(0, 0, 0)); // x, y, strength
  const time = { value: 0 };

  // ── Dust motes ──────────────────────────────────────────────────────────
  const dustGeo = new THREE.BufferGeometry();
  const seeds = new Float32Array(DUST * 4);
  const positions = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    positions.set([(Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 2.2, -0.2 + Math.random() * 1.6], i * 3);
    seeds.set([Math.random(), Math.random(), Math.random(), 0.4 + Math.random() * 0.8], i * 4);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: { time, lamps: { value: lampUniform }, pixel: { value: renderer.getPixelRatio() } },
    vertexShader: `
      uniform float time; uniform vec3 lamps[${MAX_LAMPS}]; uniform float pixel;
      attribute vec4 seed; varying float vGlow;
      void main() {
        vec3 p = position;
        // slow drift: rising, wandering, wrapping around
        p.x += sin(time * 0.13 * seed.w + seed.x * 6.28) * 0.12;
        p.y = mod(p.y + 1.1 + time * 0.025 * seed.w, 2.2) - 1.1;
        p.z += sin(time * 0.2 + seed.y * 6.28) * 0.05;
        float glow = 0.18;
        for (int i = 0; i < ${MAX_LAMPS}; i++) {
          float d = distance(p.xy, lamps[i].xy);
          glow += lamps[i].z * exp(-d * d * 3.5);
        }
        vGlow = glow * (0.6 + 0.4 * sin(time * 1.7 + seed.z * 20.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = pixel * (3.0 + seed.z * 5.0) * (3.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vGlow;
        a = min(1.0, a * 1.1);
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.62) * a, a);
      }`,
  }));
  scene.add(dust);

  // ── Lamp rays and TV spill: soft additive cones and pools ──────────────
  const lightMat = (color, kind) => new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: { time, color: { value: new THREE.Color(color) }, strength: { value: 0 }, seed: { value: Math.random() * 10 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: kind === 'ray' ? `
      uniform float time, strength, seed; uniform vec3 color; varying vec2 vUv;
      void main() {
        // a cone from the top centre, widening and fading downward, with slow moving streaks
        float y = 1.0 - vUv.y;
        float halfWidth = 0.08 + y * 0.42;
        float x = abs(vUv.x - 0.5);
        float cone = smoothstep(halfWidth, halfWidth * 0.35, x) * smoothstep(1.0, 0.1, y) * smoothstep(0.0, 0.06, y);
        float streaks = 0.75 + 0.25 * sin((vUv.x - 0.5) / (0.1 + y) * 30.0 + time * 0.4 + seed);
        float flicker = 0.93 + 0.07 * sin(time * 2.3 + seed) * sin(time * 5.1 + seed * 3.0);
        float a = cone * streaks * flicker * strength * 0.38;
        gl_FragColor = vec4(color * a, a);
      }` : `
      uniform float time, strength, seed; uniform vec3 color; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float pool = smoothstep(1.0, 0.0, d);
        float flicker = 0.75 + 0.25 * step(0.5, fract(sin(floor(time * 9.0) + seed) * 43758.5));
        float a = pool * pool * flicker * strength * 0.45;
        gl_FragColor = vec4(color * a, a);
      }`,
  });
  const rays = Array.from({ length: MAX_LAMPS }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lightMat('#ffd38a', 'ray'));
    scene.add(m);
    return m;
  });
  const tvGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lightMat('#9fcaff', 'pool'));
  tvGlow.position.z = 0.02;
  scene.add(tvGlow);

  // ── Time-travel tunnel (drawn over everything while it runs) ───────────
  const warpUniforms = { time: { value: 0 }, fade: { value: 0 }, aspect: { value: 1.5 } };
  const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    premultipliedAlpha: true,
    uniforms: warpUniforms,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform float time, fade, aspect; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float r = length(p);
        float a = atan(p.y, p.x) / 6.28318 + 0.5;
        float z = 0.35 / max(r, 0.001) + time * 5.0;            // distance down the tunnel
        float frame = smoothstep(0.04, 0.0, abs(fract(z * 0.9) - 0.5) - 0.42);    // dark gaps between film frames
        float sprocket = step(0.93, fract(a * 36.0)) * step(0.55, fract(z * 4.0));   // film sprocket holes
        float grain = hash(vec2(floor(a * 90.0), floor(z * 18.0)) + floor(time * 20.0));
        vec3 sepia = mix(vec3(0.32, 0.18, 0.08), vec3(1.0, 0.86, 0.6), 0.35 + 0.65 * grain);
        vec3 col = sepia * (0.55 + 0.45 * (1.0 - frame)) + sprocket * 0.5;
        col *= smoothstep(0.0, 0.35, r) * 0.8 + 0.2;            // darker far end...
        col += vec3(1.0, 0.92, 0.75) * 0.08 / (r + 0.05);        // ...with light at the end of it
        col *= 0.9 + 0.1 * sin(time * 60.0);                     // projector flicker
        gl_FragColor = vec4(col * fade, fade);
      }`,
  }));
  tunnel.frustumCulled = false;
  tunnel.renderOrder = 10;
  tunnel.visible = false;
  scene.add(tunnel);

  // ── Room setup from the marks in ROOM_IMAGES ───────────────────────────
  function setRoom(pic) {
    const lamps = (pic?.lamps || []).slice(0, MAX_LAMPS);
    lampUniform.forEach((v, i) => {
      const l = lamps[i];
      if (!l) { v.set(0, 0, 0); rays[i].visible = false; return; }
      const w = toWorld(l.x, l.y);
      v.set(w.x, w.y, 0.9);
      // A ray hangs below the lamp, sized by how big the lamp's glow is.
      const size = (l.r || 18) / 100 * 3;
      rays[i].visible = true;
      rays[i].scale.set(size * 1.6, size * 2.2, 1);
      rays[i].position.set(w.x, w.y - size * 1.1, 0.01);
      rays[i].material.uniforms.strength.value = 1;
    });
    if (pic?.tv) {
      const c = toWorld(pic.tv.x + pic.tv.w / 2, pic.tv.y + pic.tv.h / 2);
      const s = Math.max(pic.tv.w, pic.tv.h) / 100 * 3 * 2.4;
      tvGlow.position.set(c.x, c.y, 0.02);
      tvGlow.scale.set(s, s, 1);
      tvGlow.material.uniforms.strength.value = 1;
    } else {
      tvGlow.material.uniforms.strength.value = 0;
    }
  }

  // ── Mouse parallax: the camera drifts, the room layer tilts with it ─────
  const mouse = new THREE.Vector2();
  const eased = new THREE.Vector2();
  stage.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  });
  stage.addEventListener('pointerleave', () => mouse.set(0, 0));

  // ── Warp: play the tunnel, swapping rooms while it hides them ──────────
  let warpStart = -1;
  let warpDone = null;
  const WARP_MS = 1700;
  function warp() {
    if (reducedMotion) return Promise.resolve();
    warpStart = performance.now();
    tunnel.visible = true;
    renderer.domElement.classList.add('warping');
    return new Promise((resolve) => { warpDone = resolve; });
  }

  // ── Render loop ─────────────────────────────────────────────────────────
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    warpUniforms.aspect.value = width / height;
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    time.value = t;
    // ease toward the mouse, with a slow idle sway when it's still
    const idle = reducedMotion ? 0 : 0.18;
    eased.lerp(new THREE.Vector2(mouse.x + Math.sin(t * 0.3) * idle, mouse.y + Math.cos(t * 0.23) * idle), 0.05);
    if (!reducedMotion) {
      camera.position.x = eased.x * 0.22;
      camera.position.y = -eased.y * 0.14;
      camera.lookAt(0, 0, 0);
      roomLayer.style.transform =
        `perspective(1400px) rotateY(${eased.x * 1.6}deg) rotateX(${-eased.y * 1.2}deg) scale(1.05) translate(${-eased.x * 0.6}%, ${-eased.y * 0.5}%)`;
    }
    if (warpStart >= 0) {
      const k = (performance.now() - warpStart) / WARP_MS;
      warpUniforms.time.value = k * 1.6;
      // fade in fast, hold, fade out
      warpUniforms.fade.value = k < 0.18 ? k / 0.18 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      if (k >= 1) {
        warpStart = -1;
        tunnel.visible = false;
        renderer.domElement.classList.remove('warping');
        warpDone?.();
      }
    }
    renderer.render(scene, camera);
  });

  return { setRoom, warp, warpMs: WARP_MS };
}
