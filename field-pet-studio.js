import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const canvas = document.querySelector("#petCanvas");
const studio = document.querySelector(".pet-studio");
if (canvas) {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.1, 4.6);

  scene.add(new THREE.HemisphereLight(0xfff8e8, 0x3b4a35, 1.1));
  const key = new THREE.DirectionalLight(0xfff2d4, 1.8);
  key.position.set(2.2, 3.5, 2.6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc1dcae, 0.9);
  rim.position.set(-2.6, 1.4, -1.8); scene.add(rim);

  const pivot = new THREE.Group();
  scene.add(pivot);

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(1, Math.round(rect.width));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  let model = null;
  let bounceStart = -Infinity;
  let autoYaw = 0;
  let pointerYaw = 0;
  let pointerPitch = 0;
  let dragging = false;
  let last = null;
  let visible = false;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    last = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging || !last) return;
    pointerYaw += (event.clientX - last.x) * 0.012;
    pointerPitch = Math.max(-0.5, Math.min(0.5, pointerPitch + (event.clientY - last.y) * 0.008));
    last = { x: event.clientX, y: event.clientY };
  });
  const releasePointer = (event) => {
    dragging = false;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
  };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("pointerleave", releasePointer);

  const bounce = () => {
    bounceStart = performance.now();
    studio?.setAttribute("data-active", "true");
    setTimeout(() => studio?.removeAttribute("data-active"), 2700);
  };
  document.querySelector("#petDog")?.addEventListener("click", bounce);
  document.querySelector("#feedDog")?.addEventListener("click", bounce);

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) visible = entry.isIntersecting;
  }, { threshold: 0.1 });
  observer.observe(canvas);

  const loader = new GLTFLoader();
  loader.setCrossOrigin("anonymous");
  loader.load("./assets/models/puppy.glb", (gltf) => {
    model = gltf.scene;
    model.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = false;
        node.receiveShadow = false;
        if (node.material) node.material.roughness = Math.min(1, (node.material.roughness ?? 0.6) + 0.15);
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 2.1 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    const center = new THREE.Vector3(); box.getCenter(center);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    pivot.add(model);
    bounce();
  }, undefined, (error) => {
    console.warn("Puppy GLB failed to load", error);
    studio?.classList.add("pet-studio--fallback");
  });

  const clock = new THREE.Clock();
  const render = () => {
    const dt = clock.getDelta();
    if (visible && !reduceMotion) autoYaw += dt * 0.35;
    const bounceAge = (performance.now() - bounceStart) / 1000;
    const bounce = bounceAge >= 0 && bounceAge < 0.75 ? Math.sin(bounceAge * Math.PI / 0.75) * 0.22 : 0;
    pivot.rotation.y = autoYaw + pointerYaw;
    pivot.rotation.x = pointerPitch * 0.4;
    pivot.position.y = bounce;
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  };
  requestAnimationFrame(render);
}
