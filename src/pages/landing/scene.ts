import * as THREE from 'three';

/**
 * The landing page's backdrop: a ledger-like plane of points rolling in slow waves, a core of
 * orbiting particles (orders and parcels converging) and a soft coral glow. `progress` (0..1, the
 * page scroll) tilts the camera down into the field; the pointer adds a little parallax.
 */
export interface LandingScene {
  setProgress: (p: number) => void;
  dispose: () => void;
}

const NAVY = new THREE.Color('#0a192f');
const CORAL = new THREE.Color('#e44946');
const ICE = new THREE.Color('#8fb3ff');

const fieldVertex = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  attribute float aSeed;
  varying float vHeight;
  varying float vFade;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.35 + uTime * 0.6) * 0.45
            + cos(p.z * 0.28 + uTime * 0.45) * 0.4
            + sin((p.x + p.z) * 0.18 + uTime * 0.3) * 0.35;
    float d = distance(p.xz, uPointer * vec2(14.0, 10.0));
    w += exp(-d * d * 0.04) * 1.2 * sin(uTime * 1.6 - d * 0.6);
    p.y += w;
    vHeight = w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vFade = smoothstep(42.0, 8.0, -mv.z);
    gl_PointSize = (1.6 + aSeed * 1.8) * (26.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fieldFragment = /* glsl */ `
  uniform vec3 uLow;
  uniform vec3 uHigh;
  varying float vHeight;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    vec3 col = mix(uLow, uHigh, smoothstep(-0.4, 1.4, vHeight));
    gl_FragColor = vec4(col, a * vFade * 0.9);
  }
`;

const coreVertex = /* glsl */ `
  uniform float uTime;
  attribute vec3 aOrbit;   // radius, speed, phase
  attribute float aTilt;
  varying float vMix;
  void main() {
    float t = uTime * aOrbit.y + aOrbit.z;
    float r = aOrbit.x * (1.0 + 0.06 * sin(uTime * 0.8 + aOrbit.z * 3.0));
    vec3 p = vec3(cos(t) * r, sin(t * 0.7 + aTilt) * r * 0.35, sin(t) * r);
    float ct = cos(aTilt), st = sin(aTilt);
    p = vec3(p.x, p.y * ct - p.z * st, p.y * st + p.z * ct);
    vMix = smoothstep(1.2, 4.2, aOrbit.x);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.2 - vMix) * (30.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const coreFragment = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying float vMix;
  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(mix(uInner, uOuter, vMix), a * 0.95);
  }
`;

export const createLandingScene = (canvas: HTMLCanvasElement, reduceMotion: boolean): LandingScene => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(NAVY, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(NAVY, 18, 46);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  // The field: a grid of points.
  const COLS = 140;
  const ROWS = 90;
  const positions = new Float32Array(COLS * ROWS * 3);
  const seeds = new Float32Array(COLS * ROWS);
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const k = i * ROWS + j;
      positions[k * 3] = (i / (COLS - 1) - 0.5) * 56;
      positions[k * 3 + 1] = 0;
      positions[k * 3 + 2] = (j / (ROWS - 1) - 0.5) * 36;
      seeds[k] = Math.random();
    }
  }
  const fieldGeometry = new THREE.BufferGeometry();
  fieldGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  fieldGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const fieldMaterial = new THREE.ShaderMaterial({
    vertexShader: fieldVertex,
    fragmentShader: fieldFragment,
    uniforms: { uTime: { value: 0 }, uPointer: { value: new THREE.Vector2(0, 0) }, uLow: { value: new THREE.Color('#1b3358') }, uHigh: { value: ICE } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const field = new THREE.Points(fieldGeometry, fieldMaterial);
  field.position.y = -3.2;
  scene.add(field);

  // The core: particles on tilted orbits.
  const CORE = 2600;
  const orbit = new Float32Array(CORE * 3);
  const tilt = new Float32Array(CORE);
  for (let i = 0; i < CORE; i++) {
    const r = 1 + Math.pow(Math.random(), 1.6) * 3.6;
    orbit[i * 3] = r;
    orbit[i * 3 + 1] = (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1) / Math.sqrt(r);
    orbit[i * 3 + 2] = Math.random() * Math.PI * 2;
    tilt[i] = (Math.random() - 0.5) * 1.4;
  }
  const coreGeometry = new THREE.BufferGeometry();
  coreGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CORE * 3), 3));
  coreGeometry.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 3));
  coreGeometry.setAttribute('aTilt', new THREE.BufferAttribute(tilt, 1));
  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader: coreVertex,
    fragmentShader: coreFragment,
    uniforms: { uTime: { value: 0 }, uInner: { value: CORAL }, uOuter: { value: ICE } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const core = new THREE.Points(coreGeometry, coreMaterial);
  core.frustumCulled = false;
  const coreGroup = new THREE.Group();
  coreGroup.add(core);
  coreGroup.position.set(4.2, 1.2, 0);
  scene.add(coreGroup);

  // A soft glow behind the core.
  const glowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(228,73,70,0.55)');
    grad.addColorStop(0.4, 'rgba(228,73,70,0.12)');
    grad.addColorStop(1, 'rgba(228,73,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(11);
  coreGroup.add(glow);

  let progress = 0;
  const pointer = new THREE.Vector2(0, 0);
  const pointerEased = new THREE.Vector2(0, 0);
  const onPointer = (e: PointerEvent) => pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener('pointermove', onPointer, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: centre the core and pull back so it fits.
    const narrow = w < 768;
    coreGroup.position.x = narrow ? 0 : 4.2;
    coreGroup.position.y = narrow ? 2.2 : 1.2;
    camera.fov = narrow ? 62 : 50;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  const tick = () => {
    const t = reduceMotion ? 6 : clock.getElapsedTime();
    pointerEased.lerp(pointer, 0.05);
    fieldMaterial.uniforms.uTime!.value = t;
    coreMaterial.uniforms.uTime!.value = t;
    fieldMaterial.uniforms.uPointer!.value.set(pointerEased.x, pointerEased.y);

    camera.position.set(pointerEased.x * 0.8, 1.6 + progress * 5 - pointerEased.y * 0.4, 12 - progress * 3);
    camera.lookAt(0, 0.4 - progress * 3.2, 0);
    coreGroup.rotation.y = t * 0.08 + pointerEased.x * 0.25;
    coreGroup.scale.setScalar(1 - progress * 0.35);
    field.rotation.y = progress * 0.35;

    renderer.render(scene, camera);
    if (!reduceMotion) frame = requestAnimationFrame(tick);
  };
  tick();

  return {
    setProgress: (p) => {
      progress = p;
      if (reduceMotion) tick();
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      fieldGeometry.dispose();
      fieldMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      glowTexture.dispose();
      glow.material.dispose();
      renderer.dispose();
    },
  };
};
