import * as THREE from "./vendor/three.module.min.js";

const canvas = document.querySelector("#worldCanvas");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lowPower = innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

const launch = () => init().catch(error => {
  console.error(error);
  document.documentElement.classList.add("world-fallback");
  document.dispatchEvent(new CustomEvent("field:ready"));
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", launch, { once:true });
else launch();

async function init() {
  if (!canvas) return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    console.error(error);
    document.documentElement.classList.add("world-fallback");
    document.dispatchEvent(new CustomEvent("field:ready"));
    return;
  }

  const atlasItems = await waitForAtlas();
  document.dispatchEvent(new CustomEvent("field:progress", { detail:34 }));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 160);
  const rendererColor = new THREE.Color(0x4b5247);
  scene.background = rendererColor;
  scene.fog = new THREE.FogExp2(rendererColor, .042);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.2 : 1.65));

  const root = new THREE.Group();
  const hero = new THREE.Group(), work = new THREE.Group(), atlas = new THREE.Group();
  root.add(hero, work, atlas); scene.add(root);
  work.visible = false; atlas.visible = false;
  const animationTasks = [];
  const pointer = new THREE.Vector2(), pointerSmooth = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const desiredCamera = new THREE.Vector3(), desiredTarget = new THREE.Vector3(), smoothTarget = new THREE.Vector3();
  let activeScene = "hero", workStep = 0, workMix = 0, atlasTargetQuaternion = new THREE.Quaternion();
  let activeMarker = null, hoveredWork = -1, visible = true, frame = 0, elapsed = 0, lastTime = performance.now();

  scene.add(new THREE.HemisphereLight(0xe1e7d5, 0x1b241b, 2.4));
  const key = new THREE.DirectionalLight(0xfff4dc, 3.2);
  key.position.set(-7, 10, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb79a, 2.1);
  rim.position.set(9, 4, -6); scene.add(rim);
  const accent = new THREE.PointLight(0xf5efcf, 38, 24, 1.4);
  accent.position.set(4, 3, 5); scene.add(accent);

  const post = createPostProcessing();
  document.dispatchEvent(new CustomEvent("field:progress", { detail:76 }));

  const glowMap = glowTexture();

  function waitForAtlas() {
    if (window.Yibo?.travelManifest) return Promise.resolve(window.Yibo.travelManifest);
    return new Promise(resolve => {
      document.addEventListener("field:atlas-ready", event => resolve(event.detail || []), { once:true });
    });
  }
  function standard(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness:options.roughness ?? .55,
      metalness:options.metalness ?? .15,
      transparent:options.transparent ?? false,
      opacity:options.opacity ?? 1,
      emissive:options.emissive ?? 0x000000,
      emissiveIntensity:options.emissiveIntensity ?? 0,
      side:options.side ?? THREE.FrontSide,
    });
  }
  function physical(color, options = {}) {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness:options.roughness ?? .22,
      metalness:options.metalness ?? .25,
      transmission:options.transmission ?? 0,
      thickness:options.thickness ?? .6,
      transparent:true,
      opacity:options.opacity ?? 1,
      clearcoat:options.clearcoat ?? .6,
      clearcoatRoughness:.2,
      emissive:options.emissive ?? 0x000000,
      emissiveIntensity:options.emissiveIntensity ?? 0,
      side:THREE.DoubleSide,
    });
  }
  function canvasLabel(text, color = "#eff1e8", background = "rgba(8,8,7,.82)") {
    const source = document.createElement("canvas");
    source.width = 1024; source.height = 256;
    const context = source.getContext("2d");
    context.fillStyle = background; context.fillRect(0, 0, source.width, source.height);
    context.strokeStyle = "rgba(255,255,255,.28)"; context.strokeRect(6, 6, source.width - 12, source.height - 12);
    context.fillStyle = color; context.font = "600 116px 'Arial Narrow',sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
    context.fillText(text, source.width / 2, source.height / 2 + 5);
    const texture = new THREE.CanvasTexture(source); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function nodeLabel(text) {
    const source = document.createElement("canvas");
    source.width = 256; source.height = 128;
    const context = source.getContext("2d");
    context.fillStyle = "#eef0e7";
    context.font = "600 62px Menlo,monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text,128,67);
    const texture = new THREE.CanvasTexture(source);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  function glowTexture() {
    const source = document.createElement("canvas"); source.width = source.height = 128;
    const context = source.getContext("2d");
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(.17, "rgba(255,255,255,.7)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(source);
  }
  function makeGlow(color, size, opacity = .35) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map:glowMap, color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending
    }));
    sprite.scale.setScalar(size); return sprite;
  }
  function buildEnvironment() {
    const count = lowPower ? 900 : 2100;
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0xf5efcf),new THREE.Color(0xb9c8a6),new THREE.Color(0xd8decb),new THREE.Color(0xffffff)];
    let seed = 73021;
    const random = () => { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < count; i++) {
      positions.set([(random() - .5) * 36,(random() - .5) * 22,(random() - .5) * 80], i * 3);
      const color = palette[Math.floor(random() * palette.length)];
      colors.set([color.r,color.g,color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions,3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors,3));
    const dust = new THREE.Points(geometry,new THREE.PointsMaterial({
      size:lowPower ? .018 : .027, vertexColors:true, transparent:true, opacity:.44, depthWrite:false, blending:THREE.AdditiveBlending
    }));
    scene.add(dust);
    animationTasks.push(time => { dust.rotation.y = time * .0025; dust.position.z = Math.sin(time * .05) * .4; });
  }

  function buildHero() {
    const branchMaterial = standard(0x2c271f,{ roughness:.96,metalness:0 });
    const mossMaterials = [
      standard(0x425239,{ roughness:1 }),
      standard(0x5b6b49,{ roughness:1 }),
      standard(0x71815b,{ roughness:1 }),
    ];
    const branchSpecs = [
      [
        new THREE.Vector3(-10,-4.7,-2),
        new THREE.Vector3(-5,-3.3,.3),
        new THREE.Vector3(2,-1.2,-.3),
        new THREE.Vector3(10,1.9,-3),
      ],
      [
        new THREE.Vector3(-7,-5,-4),
        new THREE.Vector3(-4,-.5,-2),
        new THREE.Vector3(1,3.2,-1),
        new THREE.Vector3(7,5.2,-4),
      ],
      [
        new THREE.Vector3(-10,-3.6,-7),
        new THREE.Vector3(-3,-1.6,-5),
        new THREE.Vector3(3,-3.4,-4),
        new THREE.Vector3(11,-2.1,-6),
      ],
    ];
    const branchCurves = branchSpecs.map((points,index) => {
      const curve = new THREE.CatmullRomCurve3(points);
      const branch = new THREE.Mesh(
        new THREE.TubeGeometry(curve,90,.32 - index * .055,10,false),
        branchMaterial
      );
      hero.add(branch);
      const mossCount = lowPower ? 34 : 72;
      for (let i = 0; i < mossCount; i++) {
        const t = Math.min(.98,Math.max(.02,i / mossCount + (Math.random() - .5) * .025));
        const point = curve.getPoint(t);
        const moss = new THREE.Mesh(
          new THREE.IcosahedronGeometry(.12 + Math.random() * .16,1),
          mossMaterials[(i + index) % mossMaterials.length]
        );
        moss.position.copy(point).add(new THREE.Vector3(
          (Math.random() - .5) * .52,
          .12 + Math.random() * .26,
          (Math.random() - .5) * .42
        ));
        moss.scale.set(1.3 + Math.random(),.55 + Math.random() * .65,1 + Math.random() * .7);
        moss.rotation.set(Math.random(),Math.random(),Math.random());
        hero.add(moss);
      }
      return curve;
    });

    const flowerMaterial = new THREE.MeshStandardMaterial({
      color:0xf5f2df, roughness:.75, side:THREE.DoubleSide,
      emissive:0xf5efcf, emissiveIntensity:.06,
    });
    const flowerCount = lowPower ? 14 : 28;
    for (let i = 0; i < flowerCount; i++) {
      const curve = branchCurves[i % 2];
      const t = .16 + (i / flowerCount) * .78;
      const flower = new THREE.Group();
      for (let petal = 0; petal < 5; petal++) {
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(.075 + i % 3 * .012,8),flowerMaterial);
        const angle = petal / 5 * Math.PI * 2;
        mesh.position.set(Math.cos(angle) * .085,Math.sin(angle) * .085,0);
        mesh.scale.set(1,.62,1);
        flower.add(mesh);
      }
      const center = new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),standard(0xd9c878,{ roughness:.7 }));
      center.position.z = .018; flower.add(center);
      flower.position.copy(curve.getPoint(t)).add(new THREE.Vector3(
        (Math.random() - .5) * .42,.32 + Math.random() * .2,(Math.random() - .5) * .32
      ));
      flower.rotation.set(-.25 + Math.random() * .4,Math.random() * .5,Math.random() * Math.PI);
      flower.scale.setScalar(.75 + Math.random() * .75);
      hero.add(flower);
    }

    const fernMaterial = standard(0x526b49,{ roughness:.94,side:THREE.DoubleSide });
    for (let f = 0; f < 9; f++) {
      const fern = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.012,.018,1.3,6),fernMaterial);
      stem.rotation.z = -.18; fern.add(stem);
      for (let leaf = 0; leaf < 8; leaf++) {
        const y = -.48 + leaf * .14, side = leaf % 2 ? 1 : -1;
        const blade = new THREE.Mesh(new THREE.SphereGeometry(.12,8,5),fernMaterial);
        blade.scale.set(1.7,.28,.12);
        blade.position.set(side * (.12 + leaf * .018),y,.02);
        blade.rotation.z = side * (.55 - leaf * .025);
        fern.add(blade);
      }
      fern.position.copy(branchCurves[f % branchCurves.length].getPoint(.15 + f * .075));
      fern.position.y += .45;
      fern.rotation.z = -.8 + f * .19;
      fern.scale.setScalar(.55 + (f % 3) * .18);
      hero.add(fern);
    }

    const butterfly = new THREE.Group();
    const wingMaterial = new THREE.MeshPhysicalMaterial({
      color:0xe4e8a1, roughness:.32, metalness:.05, side:THREE.DoubleSide,
      transparent:true,opacity:.9,
    });
    const leftWing = new THREE.Mesh(new THREE.CircleGeometry(.18,16),wingMaterial);
    leftWing.scale.set(1.25,.72,1); leftWing.position.x = -.11;
    const rightWing = leftWing.clone(); rightWing.position.x = .11;
    butterfly.add(leftWing,rightWing);
    hero.add(butterfly);

    animationTasks.push(time => {
      const point = branchCurves[0].getPoint(.12 + ((time * .025) % .65));
      butterfly.position.copy(point).add(new THREE.Vector3(0,.75 + Math.sin(time * 1.2) * .12,.65));
      butterfly.rotation.y = Math.sin(time * .45) * .35;
      leftWing.rotation.y = .35 + Math.sin(time * 7.5) * .62;
      rightWing.rotation.y = -.35 - Math.sin(time * 7.5) * .62;
    });
  }

  const workLayers = [], workNodes = [];
  function buildWork() {
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.35,-2.75,.1),
      new THREE.Vector3(.2,-1.55,0),
      new THREE.Vector3(-.12,-.35,.12),
      new THREE.Vector3(.28,.9,-.05),
      new THREE.Vector3(-.08,2.45,.04),
    ]);
    const stem = new THREE.Mesh(
      new THREE.TubeGeometry(stemCurve,90,.065,9,false),
      standard(0x758465,{ roughness:.86,metalness:.02 })
    );
    work.add(stem);

    const rootMaterial = standard(0x4a5545,{ roughness:.94 });
    [-1,0,1].forEach((offset,index) => {
      const rootCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.35,-2.72,.08),
        new THREE.Vector3(offset * .65,-2.92,-.08 * index),
        new THREE.Vector3(offset * 1.7,-3.02,-.3 - index * .08),
      ]);
      work.add(new THREE.Mesh(new THREE.TubeGeometry(rootCurve,35,.035,7,false),rootMaterial));
    });

    const colors = [0xb7caa8,0xe2dfae,0xc99d78,0xc2d1c6];
    const names = ["01","02","03","04"];
    const branchMaterial = standard(0x66785c,{ roughness:.9 });
    const leafMaterial = standard(0x8da17b,{ roughness:.92 });
    for (let i = 0; i < 4; i++) {
      const t = .18 + i * .22;
      const point = stemCurve.getPoint(t);
      const direction = i % 2 ? 1 : -1;
      const node = new THREE.Group();
      node.position.copy(point);

      const coreMaterial = standard(colors[i],{
        roughness:.36,
        metalness:.08,
        emissive:colors[i],
        emissiveIntensity:.12,
      });
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.16,2),coreMaterial);
      node.add(core);

      const ringMaterial = new THREE.MeshBasicMaterial({
        color:colors[i], transparent:true, opacity:.28, depthWrite:false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.34,.012,8,64),ringMaterial);
      node.add(ring);

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(.46,12,8),
        new THREE.MeshBasicMaterial({ transparent:true,opacity:.001,depthWrite:false })
      );
      hit.userData.index = i;
      node.add(hit);
      workLayers.push(hit);

      const branchCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0,0,0),
        new THREE.Vector3(direction * .52,.18,.04),
        new THREE.Vector3(direction * 1.08,.34,-.08),
        new THREE.Vector3(direction * 1.55,.52,-.2),
      ]);
      const branch = new THREE.Mesh(new THREE.TubeGeometry(branchCurve,42,.032,7,false),branchMaterial.clone());
      node.add(branch);

      const leaves = [];
      [.6,.82,1].forEach((value,leafIndex) => {
        const branchPoint = branchCurve.getPoint(value);
        [-1,1].forEach(side => {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(.16,10,6),leafMaterial.clone());
          leaf.scale.set(1.8,.38,.18);
          leaf.position.copy(branchPoint).add(new THREE.Vector3(
            direction * side * .06,
            side * (.13 + leafIndex * .025),
            .02
          ));
          leaf.rotation.z = direction * side * (.52 - leafIndex * .07);
          node.add(leaf);
          leaves.push(leaf);
        });
      });

      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(.34,.17),
        new THREE.MeshBasicMaterial({
          map:nodeLabel(names[i]),
          transparent:true,
          opacity:.45,
          depthWrite:false,
        })
      );
      label.position.set(direction * -.38,.02,.06);
      node.add(label);

      work.add(node);
      workNodes.push({ group:node,core,ring,branch,leaves,label,direction });
    }

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.5,64),
      new THREE.MeshBasicMaterial({ color:0x1b2a20,transparent:true,opacity:.42,depthWrite:false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(-.2,-3.04,-.25);
    ground.scale.set(1,.28,1);
    work.add(ground);

    const halo = makeGlow(0xdfe5bd,4.8,.08);
    halo.position.set(0,-.25,-1.2);
    work.add(halo);
    animationTasks.push((time,delta) => updateWorkObject(time,delta));
  }
  function updateWorkObject(time,delta) {
    workMix = THREE.MathUtils.damp(workMix,workStep,5,delta);
    workNodes.forEach((node,index) => {
      const active = workStep === index;
      const hovered = hoveredWork === index;
      const reached = workMix >= index - .18;
      const growth = reached ? 1 : .56;
      const scale = hovered ? 1.18 : active ? 1.1 : 1;
      node.group.scale.lerp(new THREE.Vector3(scale,scale,scale),.12);
      node.group.rotation.z = Math.sin(time * .42 + index) * .014;
      node.core.rotation.y += delta * (active ? .9 : .3);
      node.core.material.emissiveIntensity = THREE.MathUtils.damp(
        node.core.material.emissiveIntensity,
        hovered ? .9 : active ? .58 : reached ? .18 : .05,
        7,
        delta
      );
      node.ring.scale.setScalar(1 + Math.sin(time * 1.4 + index) * (active ? .12 : .035));
      node.ring.material.opacity = THREE.MathUtils.damp(
        node.ring.material.opacity,
        hovered ? .95 : active ? .72 : .16,
        7,
        delta
      );
      node.branch.scale.lerp(new THREE.Vector3(growth,growth,growth),.08);
      node.branch.material.opacity = reached ? 1 : .35;
      node.branch.material.transparent = true;
      node.leaves.forEach((leaf,leafIndex) => {
        const leafScale = (reached ? 1 : .38) * (active ? 1.12 : 1);
        leaf.scale.lerp(new THREE.Vector3(1.8 * leafScale,.38 * leafScale,.18 * leafScale),.1);
        leaf.rotation.y = Math.sin(time * .55 + leafIndex + index) * .08;
        leaf.material.emissive.setHex(active ? 0x34452f : 0x000000);
        leaf.material.emissiveIntensity = active ? .18 : 0;
      });
      node.label.material.opacity = active ? .95 : .38;
    });
    work.rotation.y = Math.sin(time * .18) * .055;
  }

  const markerGroup = new THREE.Group();
  const atlasGlobe = new THREE.Group();
  function latLonVector(lat,lon,radius=2.6) {
    const phi = (90 - lat) * Math.PI / 180, theta = (lon + 180) * Math.PI / 180;
    return new THREE.Vector3(-radius * Math.sin(phi) * Math.cos(theta),radius * Math.cos(phi),radius * Math.sin(phi) * Math.sin(theta));
  }
  function buildAtlas() {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.56,lowPower ? 36 : 64,lowPower ? 24 : 42),
      physical(0x294638,{ roughness:.55,metalness:.12,transmission:.05,opacity:.96,emissive:0x152b22,emissiveIntensity:.32 })
    );
    atlasGlobe.add(sphere);
    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(2.59,28,20),
      new THREE.MeshBasicMaterial({ color:0xd9dfc5,wireframe:true,transparent:true,opacity:.12 })
    );
    atlasGlobe.add(wire);
    const markerGeometry = new THREE.SphereGeometry(.055,12,8);
    atlasItems.forEach((item,index) => {
      const [lat,lon] = item.meta || [0,0];
      const color = index < 17 ? 0xe8e3c6 : index < 22 ? 0xb8c98f : 0xd0b27d;
      const marker = new THREE.Mesh(markerGeometry,standard(color,{ emissive:color,emissiveIntensity:2.4 }));
      marker.position.copy(latLonVector(lat,lon,2.64)); marker.userData.key = item.key; marker.userData.index = index;
      markerGroup.add(marker);
    });
    atlasGlobe.add(markerGroup);
    if (atlasItems.length > 1) {
      for (let i = 0; i < atlasItems.length - 1; i++) {
        const a = latLonVector(atlasItems[i].meta[0],atlasItems[i].meta[1],2.65);
        const b = latLonVector(atlasItems[i + 1].meta[0],atlasItems[i + 1].meta[1],2.65);
        const mid = a.clone().add(b).multiplyScalar(.5).normalize().multiplyScalar(3.25);
        const curve = new THREE.QuadraticBezierCurve3(a,mid,b);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
        const line = new THREE.Line(geometry,new THREE.LineBasicMaterial({ color:i < 16 ? 0xb8df6e : 0x8fc6dc,transparent:true,opacity:.24 }));
        atlasGlobe.add(line);
      }
    }
    const orbitA = new THREE.Mesh(new THREE.TorusGeometry(3.35,.018,8,120),standard(0xdce3cf,{ emissive:0xdce3cf,emissiveIntensity:.65 }));
    orbitA.rotation.set(1.1,.3,.2); atlas.add(orbitA);
    const orbitB = new THREE.Mesh(new THREE.TorusGeometry(3.8,.012,8,120),standard(0xaabe91,{ emissive:0xaabe91,emissiveIntensity:.55 }));
    orbitB.rotation.set(.4,1.1,-.2); atlas.add(orbitB);
    atlasGlobe.position.set(innerWidth > 760 ? 3.2 : 0,.1,0);
    atlas.add(atlasGlobe);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8,1.2),
      new THREE.MeshBasicMaterial({ map:canvasLabel("23 / STOPS","#223026","#dce3cf"),transparent:true })
    );
    label.position.set(innerWidth > 760 ? -3.9 : 0,-3.15,-.6); label.rotation.z = -.04; atlas.add(label);
    animationTasks.push(time => {
      orbitA.rotation.z = .2 + time * .035;
      orbitB.rotation.z = -.2 - time * .027;
      atlasGlobe.quaternion.slerp(atlasTargetQuaternion,reducedMotion ? 1 : .045);
      wire.rotation.y = time * -.015;
    });
    if (atlasItems[0]?.meta) setAtlasTarget({ ...atlasItems[0], lat:atlasItems[0].meta[0], lon:atlasItems[0].meta[1] });
  }
  function setAtlasTarget(item) {
    if (!atlasGlobe || item.lat == null) return;
    const direction = latLonVector(item.lat,item.lon,1).normalize();
    const front = new THREE.Vector3(0,0,1);
    atlasTargetQuaternion = new THREE.Quaternion().setFromUnitVectors(direction,front);
    markerGroup.children.forEach(marker => {
      const active = marker.userData.key === item.key;
      marker.scale.setScalar(active ? 2.8 : 1);
      if (active) {
        activeMarker?.children?.forEach(child => child.type === "Sprite" && child.removeFromParent());
        marker.add(makeGlow(marker.material.color.getHex(),1.3,.6));
        activeMarker = marker;
      }
    });
  }

  function createPostProcessing() {
    if (lowPower) return null;
    const target = new THREE.WebGLRenderTarget(1,1,{ samples:2,depthBuffer:true });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const postScene = new THREE.Scene(), postCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const material = new THREE.ShaderMaterial({
      uniforms:{ tDiffuse:{ value:target.texture }, uTime:{ value:0 }, uAmount:{ value:.4 }, uResolution:{ value:new THREE.Vector2(1,1) } },
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}`,
      fragmentShader:`
        uniform sampler2D tDiffuse;uniform float uTime;uniform float uAmount;uniform vec2 uResolution;varying vec2 vUv;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec2 c=vUv-.5;float edge=dot(c,c);float shift=(.00025+edge*.0012)*uAmount;
          float r=texture2D(tDiffuse,vUv+vec2(shift,0.)).r;
          float g=texture2D(tDiffuse,vUv).g;
          float b=texture2D(tDiffuse,vUv-vec2(shift,0.)).b;
          vec3 col=vec3(r,g,b);
          vec3 glow=texture2D(tDiffuse,vUv+vec2(1.5/uResolution.x,0.)).rgb+texture2D(tDiffuse,vUv-vec2(1.5/uResolution.x,0.)).rgb;
          col+=max(glow-1.15,0.)*.055*uAmount;
          float grain=(hash(vUv*uResolution+uTime*17.)-.5)*.022*uAmount;
          float vignette=smoothstep(.72,.16,edge);
          col=(col+grain)*mix(.84,1.,vignette);
          gl_FragColor=vec4(col,1.);
        }`,
      depthWrite:false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
    postScene.add(quad);
    return { target, scene:postScene, camera:postCamera, material };
  }

  function setScene(next) {
    const previous = activeScene;
    activeScene = next;
    hero.visible = next === "hero";
    work.visible = next === "work";
    atlas.visible = next === "atlas";
    const immersive = ["hero","work","atlas"].includes(next);
    canvas.style.opacity = immersive ? "1" : "0";
    if (next === "hero") {
      rendererColor.set(0x4b5247); scene.fog.density = .046; accent.color.set(0xf5efcf);
      post && (post.material.uniforms.uAmount.value = .24);
    } else if (next === "work") {
      rendererColor.set(0x16271e); scene.fog.density = .04; accent.color.set(0xe7e1bd);
      post && (post.material.uniforms.uAmount.value = .28);
    } else if (next === "atlas") {
      rendererColor.set(0x18231d); scene.fog.density = .032; accent.color.set(0xc8d6bb);
      post && (post.material.uniforms.uAmount.value = .22);
    }
    if ((camera.position.lengthSq() < .01 || !["hero","work","atlas"].includes(previous)) && ["hero","work","atlas"].includes(next)) {
      pose();
      camera.position.copy(desiredCamera);
      smoothTarget.copy(desiredTarget);
    }
  }
  function heroProgress() {
    const element = document.querySelector("#home"), rect = element.getBoundingClientRect();
    return THREE.MathUtils.clamp(-rect.top / Math.max(innerHeight,element.offsetHeight - innerHeight),0,1);
  }
  function pose() {
    if (activeScene === "hero") {
      const progress = heroProgress();
      const z = THREE.MathUtils.lerp(11.5,7.2,progress);
      desiredCamera.set(innerWidth > 760 ? 0 : .6,1 + progress * .55,z);
      desiredTarget.set(innerWidth > 760 ? .6 : .2,-.2,-1.8);
      hero.rotation.y = pointerSmooth.x * .035;
      hero.rotation.x = -pointerSmooth.y * .018;
    } else if (activeScene === "work") {
      desiredCamera.set(innerWidth > 760 ? .2 : 0,.3,10.2);
      desiredTarget.set(innerWidth > 760 ? .45 : 0,-.15,0);
      work.rotation.x = -pointerSmooth.y * .04;
    } else if (activeScene === "atlas") {
      desiredCamera.set(0,.55,9.3);
      desiredTarget.set(innerWidth > 760 ? 1.6 : 0,0,0);
      atlas.rotation.x = -pointerSmooth.y * .025;
    }
  }
  function resize() {
    const width = innerWidth, height = innerHeight;
    camera.aspect = width / Math.max(1,height);
    camera.fov = width < 600 ? 51 : width < 900 ? 46 : 42;
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    renderer.setPixelRatio(Math.min(devicePixelRatio,lowPower ? 1.2 : 1.65));
    if (post) {
      post.target.setSize(Math.max(1,width * Math.min(devicePixelRatio,1.5)),Math.max(1,height * Math.min(devicePixelRatio,1.5)));
      post.material.uniforms.uResolution.value.set(post.target.width,post.target.height);
    }
    if (work) work.position.x = width > 760 ? .25 : 0;
    if (atlasGlobe) atlasGlobe.position.x = width > 760 ? 3.2 : 0;
  }
  function render(now) {
    frame = 0;
    if (!visible || document.hidden) return;
    const delta = Math.min(.05,(now - lastTime) / 1000 || .016);
    lastTime = now; elapsed += delta;
    pointerSmooth.lerp(pointer,reducedMotion ? 1 : .035);
    pose();
    camera.position.lerp(desiredCamera,reducedMotion ? 1 : .12);
    smoothTarget.lerp(desiredTarget,reducedMotion ? 1 : .14);
    camera.lookAt(smoothTarget);
    scene.background.lerp(rendererColor,.05);
    scene.fog.color.copy(scene.background);
    accent.position.set(4 + pointerSmooth.x * 3,3 - pointerSmooth.y * 2,camera.position.z - 2);
    animationTasks.forEach(task => task(elapsed,delta));
    if (post) {
      renderer.setRenderTarget(post.target); renderer.render(scene,camera);
      renderer.setRenderTarget(null); post.material.uniforms.uTime.value = elapsed;
      renderer.render(post.scene,post.camera);
    } else renderer.render(scene,camera);
    frame = requestAnimationFrame(render);
  }

  buildEnvironment();
  buildHero();
  buildWork();
  buildAtlas();
  resize();
  setScene(document.body.dataset.scene || "hero");
  document.addEventListener("field:scene", event => setScene(event.detail.scene));
  document.addEventListener("field:work", event => { workStep = event.detail.index; });
  document.addEventListener("field:atlas", event => setAtlasTarget(event.detail));
  addEventListener("pointermove", event => {
    pointer.set(event.clientX / innerWidth * 2 - 1,-(event.clientY / innerHeight * 2 - 1));
    if (activeScene !== "work" || event.target.closest?.("button,a,input,select,dialog")) {
      hoveredWork = -1;
      delete canvas.dataset.workHover;
      document.body.classList.remove("work-hit");
      return;
    }
    raycaster.setFromCamera(pointer,camera);
    const hit = raycaster.intersectObjects(workLayers,false)[0];
    hoveredWork = hit?.object?.userData?.index ?? -1;
    if (hoveredWork >= 0) canvas.dataset.workHover = String(hoveredWork);
    else delete canvas.dataset.workHover;
    document.body.classList.toggle("work-hit",hoveredWork >= 0);
  }, { passive:true });
  addEventListener("pointerdown", event => {
    if (activeScene !== "work" || hoveredWork < 0 || event.target.closest?.("button,a,input,select,dialog")) return;
    document.dispatchEvent(new CustomEvent("field:work-select", { detail:{ index:hoveredWork } }));
  });
  addEventListener("resize", resize, { passive:true });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible && !frame) { lastTime = performance.now(); frame = requestAnimationFrame(render); }
  });
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault(); visible = false; document.documentElement.classList.add("world-fallback");
  });
  document.documentElement.classList.add("world-ready");
  document.dispatchEvent(new CustomEvent("field:progress", { detail:96 }));
  document.dispatchEvent(new CustomEvent("field:ready"));
  frame = requestAnimationFrame(render);
}
