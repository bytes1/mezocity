import * as THREE from "three";

export interface ProceduralIslandTextures {
  grassMap: THREE.CanvasTexture;
  cobbleMap: THREE.CanvasTexture;
  stoneMap: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  sandMap: THREE.CanvasTexture;
  gridMap: THREE.CanvasTexture;
  waterWaveMap: THREE.CanvasTexture;
  waterWaveMap2: THREE.CanvasTexture;
  shadowBlobMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function createTiledTex(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralIslandTextures(): ProceduralIslandTextures {
  // 1. Lush organic grass surface
  const [grassC, gCtx] = makeCanvas(512, 512);
  if (gCtx) {
    gCtx.fillStyle = "#95bd72";
    gCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) {
      const x = ((i * 73) % 512);
      const y = ((i * 139) % 512);
      const r = 18 + (i % 26);
      gCtx.fillStyle = i % 2 === 0 ? "rgba(165, 204, 120, 0.22)" : "rgba(116, 162, 82, 0.18)";
      gCtx.beginPath();
      gCtx.arc(x, y, r, 0, Math.PI * 2);
      gCtx.fill();
    }
    for (let i = 0; i < 650; i++) {
      const x = (i * 97 + (i % 13) * 19) % 512;
      const y = (i * 53 + (i % 17) * 23) % 512;
      gCtx.fillStyle = i % 5 === 0 ? "rgba(255,255,255,0.22)" : "rgba(75, 118, 52, 0.26)";
      gCtx.fillRect(x, y, 2, 4);
    }
  }
  const grassMap = createTiledTex(grassC, 4, 4, true);

  // 2. Warm sandstone cobble plaza & ring road
  const [cobbleC, cCtx] = makeCanvas(512, 512);
  if (cCtx) {
    cCtx.fillStyle = "#bfa37e";
    cCtx.fillRect(0, 0, 512, 512);
    const rows = 8;
    const cols = 8;
    const cellW = 512 / cols;
    const cellH = 512 / rows;
    const tones = ["#e2cbb0", "#d8be9a", "#dec6a6", "#cfa97c"];
    for (let r = 0; r < rows; r++) {
      const offsetX = r % 2 === 1 ? cellW * 0.5 : 0;
      for (let col = -1; col <= cols; col++) {
        const x = col * cellW + offsetX + 3;
        const y = r * cellH + 3;
        const w = cellW - 6;
        const h = cellH - 6;
        cCtx.fillStyle = tones[(r * 5 + col * 3 + 16) % tones.length];
        cCtx.beginPath();
        cCtx.roundRect(x, y, w, h, 8);
        cCtx.fill();
        cCtx.strokeStyle = "rgba(255,248,236,0.35)";
        cCtx.lineWidth = 1.5;
        cCtx.stroke();
      }
    }
  }
  const cobbleMap = createTiledTex(cobbleC, 3.5, 3.5, true);

  // 3. Stratified limestone / basalt rock face
  const [stoneC, sCtx] = makeCanvas(512, 512);
  if (sCtx) {
    sCtx.fillStyle = "#b8b2a6";
    sCtx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 16) {
      sCtx.fillStyle = (y / 16) % 2 === 0 ? "rgba(255,255,255,0.08)" : "rgba(45,42,38,0.1)";
      sCtx.fillRect(0, y, 512, 10);
    }
    for (let i = 0; i < 400; i++) {
      const x = (i * 89) % 512;
      const y = (i * 47) % 512;
      sCtx.fillStyle = i % 2 === 0 ? "rgba(70,65,58,0.18)" : "rgba(245,242,235,0.2)";
      sCtx.fillRect(x, y, 6 + (i % 10), 2);
    }
  }
  const stoneMap = createTiledTex(stoneC, 3, 1.5, true);

  // 4. Wood plank grain for bridges, docks & posts
  const [woodC, wCtx] = makeCanvas(256, 256);
  if (wCtx) {
    wCtx.fillStyle = "#9c6b43";
    wCtx.fillRect(0, 0, 256, 256);
    for (let p = 0; p < 8; p++) {
      const py = p * 32;
      wCtx.fillStyle = p % 2 === 0 ? "#a47148" : "#91623d";
      wCtx.fillRect(0, py + 1, 256, 30);
      wCtx.fillStyle = "rgba(62, 36, 16, 0.35)";
      wCtx.fillRect(0, py, 256, 2);
      for (let g = 0; g < 6; g++) {
        wCtx.fillStyle = "rgba(68, 40, 18, 0.14)";
        wCtx.fillRect((g * 43 + p * 17) % 240, py + 8 + g * 3, 36, 1.5);
      }
    }
  }
  const woodMap = createTiledTex(woodC, 1, 2, true);

  // 5. Wind-rippled desert sand
  const [sandC, saCtx] = makeCanvas(512, 512);
  if (saCtx) {
    saCtx.fillStyle = "#ebd2a2";
    saCtx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 22) {
      saCtx.strokeStyle = "rgba(210, 175, 118, 0.35)";
      saCtx.lineWidth = 4;
      saCtx.beginPath();
      saCtx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        saCtx.lineTo(x, y + Math.sin(x * 0.04 + y * 0.1) * 5);
      }
      saCtx.stroke();
    }
  }
  const sandMap = createTiledTex(sandC, 3, 3, true);

  // 6. Cyber Matrix tile grid
  const [gridC, grCtx] = makeCanvas(512, 512);
  if (grCtx) {
    grCtx.fillStyle = "#10192b";
    grCtx.fillRect(0, 0, 512, 512);
    grCtx.strokeStyle = "rgba(34, 211, 238, 0.25)";
    grCtx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      grCtx.beginPath();
      grCtx.moveTo(i, 0);
      grCtx.lineTo(i, 512);
      grCtx.stroke();
      grCtx.beginPath();
      grCtx.moveTo(0, i);
      grCtx.lineTo(512, i);
      grCtx.stroke();
    }
    grCtx.fillStyle = "rgba(56, 189, 248, 0.3)";
    for (let x = 64; x < 512; x += 64) {
      for (let y = 64; y < 512; y += 64) {
        grCtx.fillRect(x - 2, y - 2, 4, 4);
      }
    }
  }
  const gridMap = createTiledTex(gridC, 4, 4, true);

  // 7. Seamless Ocean Wave Height/Bump + Caustic Texture
  const buildWaterCanvas = (phaseShift: number) => {
    const [wc, ctx] = makeCanvas(512, 512);
    if (ctx) {
      ctx.fillStyle = "#7a7a7a";
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 180; i++) {
        const x = ((i * 67 + phaseShift * 31) % 512);
        const y = ((i * 113 + phaseShift * 19) % 512);
        const rx = 28 + (i % 24);
        const ry = 10 + (i % 10);
        const grad = ctx.createRadialGradient(x, y, 1, x, y, rx);
        grad.addColorStop(0, "rgba(255,255,255,0.45)");
        grad.addColorStop(0.55, "rgba(180,210,235,0.18)");
        grad.addColorStop(1, "rgba(128,128,128,0)");
        ctx.fillStyle = grad;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    return wc;
  };
  const waterWaveMap = createTiledTex(buildWaterCanvas(0), 10, 10, false);
  const waterWaveMap2 = createTiledTex(buildWaterCanvas(7), 7, 7, false);

  // 8. Soft contact shadow gradient under bots
  const [shC, shCtx] = makeCanvas(128, 128);
  if (shCtx) {
    const grad = shCtx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, "rgba(18, 24, 20, 0.42)");
    grad.addColorStop(0.65, "rgba(18, 24, 20, 0.18)");
    grad.addColorStop(1, "rgba(18, 24, 20, 0)");
    shCtx.fillStyle = grad;
    shCtx.fillRect(0, 0, 128, 128);
  }
  const shadowBlobMap = new THREE.CanvasTexture(shC);
  shadowBlobMap.needsUpdate = true;

  return {
    grassMap,
    cobbleMap,
    stoneMap,
    woodMap,
    sandMap,
    gridMap,
    waterWaveMap,
    waterWaveMap2,
    shadowBlobMap,
    dispose: () => {
      grassMap.dispose();
      cobbleMap.dispose();
      stoneMap.dispose();
      woodMap.dispose();
      sandMap.dispose();
      gridMap.dispose();
      waterWaveMap.dispose();
      waterWaveMap2.dispose();
      shadowBlobMap.dispose();
    },
  };
}

export type MarketMoodLevel = "BULLISH" | "NEUTRAL" | "CAUTIOUS";

export function deriveMarketMood(params: {
  fearGreedIndex?: number;
  trendDirection?: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
  sentimentLabel?: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
}): MarketMoodLevel {
  const fg = params.fearGreedIndex ?? 55;
  if (
    params.sentimentLabel === "CAUTIOUS" ||
    fg <= 40 ||
    (params.trendDirection === "DOWNTREND" && fg < 52)
  ) {
    return "CAUTIOUS";
  }
  if (
    params.sentimentLabel === "BULLISH" ||
    (fg >= 60 && params.trendDirection !== "DOWNTREND")
  ) {
    return "BULLISH";
  }
  return "NEUTRAL";
}

export interface SceneLightingController {
  sunKey: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  skyRim: THREE.DirectionalLight;
  applyMood: (mood: MarketMoodLevel, delta: number, lockFogColor?: boolean) => void;
}

const MOOD_LIGHTING_TARGETS: Record<
  MarketMoodLevel,
  {
    ambientColor: string;
    ambientIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sunColor: string;
    sunIntensity: number;
    rimColor: string;
    rimIntensity: number;
    fogColor: string;
    fogDensity: number;
  }
> = {
  BULLISH: {
    ambientColor: "#fffdf7",
    ambientIntensity: 0.68,
    hemiSky: "#e0f2fe",
    hemiGround: "#84a965",
    hemiIntensity: 0.96,
    sunColor: "#fff1cf",
    sunIntensity: 2.3,
    rimColor: "#bae6fd",
    rimIntensity: 0.7,
    fogColor: "#dcf2ff",
    fogDensity: 0.0072,
  },
  NEUTRAL: {
    ambientColor: "#f8fafc",
    ambientIntensity: 0.58,
    hemiSky: "#dff2fe",
    hemiGround: "#748f5a",
    hemiIntensity: 0.85,
    sunColor: "#fff7e2",
    sunIntensity: 2.05,
    rimColor: "#bae6fd",
    rimIntensity: 0.65,
    fogColor: "#d4ebfd",
    fogDensity: 0.0085,
  },
  CAUTIOUS: {
    ambientColor: "#cbd5e1",
    ambientIntensity: 0.48,
    hemiSky: "#94a3b8",
    hemiGround: "#526348",
    hemiIntensity: 0.68,
    sunColor: "#e2e8f0",
    sunIntensity: 1.55,
    rimColor: "#60a5fa",
    rimIntensity: 0.88,
    fogColor: "#9fb5cf",
    fogDensity: 0.0124,
  },
};

export function configureRealisticLightingAndRenderer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  options?: {
    fogColor?: string;
    fogDensity?: number;
    hemiGround?: string;
  }
): SceneLightingController {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  if (options?.fogColor) {
    scene.fog = new THREE.FogExp2(options.fogColor, options.fogDensity ?? 0.011);
  }

  // Balanced 3-point sunlit diorama rig (less flat ambient wash = deeper, crisper shadows)
  const ambient = new THREE.AmbientLight("#f8fafc", 0.58);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(
    "#dff2fe",
    options?.hemiGround || "#748f5a",
    0.85
  );
  scene.add(hemi);

  const sunKey = new THREE.DirectionalLight("#fff7e2", 2.05);
  sunKey.position.set(12, 19, 11);
  sunKey.castShadow = true;
  sunKey.shadow.mapSize.set(2048, 2048);
  sunKey.shadow.camera.near = 2;
  sunKey.shadow.camera.far = 56;
  sunKey.shadow.camera.left = -13;
  sunKey.shadow.camera.right = 13;
  sunKey.shadow.camera.top = 13;
  sunKey.shadow.camera.bottom = -13;
  sunKey.shadow.bias = -0.0004;
  sunKey.shadow.normalBias = 0.02;
  scene.add(sunKey);

  // Cool sky rim light opposite the sun for 3D edge separation
  const skyRim = new THREE.DirectionalLight("#bae6fd", 0.65);
  skyRim.position.set(-14, 10, -12);
  scene.add(skyRim);

  const cAmb = new THREE.Color();
  const cHemiSky = new THREE.Color();
  const cHemiGnd = new THREE.Color();
  const cSun = new THREE.Color();
  const cRim = new THREE.Color();
  const cFog = new THREE.Color();

  return {
    sunKey,
    ambient,
    hemi,
    skyRim,
    applyMood: (mood, delta, lockFogColor = false) => {
      const target = MOOD_LIGHTING_TARGETS[mood];
      const alpha = Math.min(1, Math.max(0.01, 1 - Math.exp(-delta * 1.8)));

      ambient.color.lerp(cAmb.set(target.ambientColor), alpha);
      ambient.intensity += (target.ambientIntensity - ambient.intensity) * alpha;

      hemi.color.lerp(cHemiSky.set(target.hemiSky), alpha);
      if (!options?.hemiGround) {
        hemi.groundColor.lerp(cHemiGnd.set(target.hemiGround), alpha);
      }
      hemi.intensity += (target.hemiIntensity - hemi.intensity) * alpha;

      sunKey.color.lerp(cSun.set(target.sunColor), alpha);
      sunKey.intensity += (target.sunIntensity - sunKey.intensity) * alpha;

      skyRim.color.lerp(cRim.set(target.rimColor), alpha);
      skyRim.intensity += (target.rimIntensity - skyRim.intensity) * alpha;

      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.density += (target.fogDensity - scene.fog.density) * alpha;
        if (!lockFogColor) {
          scene.fog.color.lerp(cFog.set(target.fogColor), alpha);
        }
      }
    },
  };
}

export interface OceanCloudsController {
  update: (
    elapsed: number,
    options?: {
      delta?: number;
      stormIntensity?: number;
      targetWaterColor?: string;
      targetDeepColor?: string;
    }
  ) => void;
  updatePalette: (palette: { waterColor: string; deepColor: string; fogColor: string }) => void;
}

export function createOceanAndVolumetricClouds(
  scene: THREE.Scene,
  textures: ProceduralIslandTextures,
  palette: {
    waterColor: string;
    deepColor: string;
    fogColor: string;
  }
): OceanCloudsController {
  const envGroup = new THREE.Group();
  scene.add(envGroup);

  // Deep water base plane
  const deepMat = new THREE.MeshStandardMaterial({
    color: palette.deepColor,
    roughness: 0.45,
    metalness: 0.15,
  });
  const deepSea = new THREE.Mesh(new THREE.CircleGeometry(95, 64), deepMat);
  deepSea.rotation.x = -Math.PI / 2;
  deepSea.position.y = -0.55;
  envGroup.add(deepSea);

  // Shimmering upper sunlit water surface with animated dual bump ripples
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: palette.waterColor,
    roughness: 0.14,
    metalness: 0.12,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    bumpMap: textures.waterWaveMap,
    bumpScale: 0.16,
    transparent: true,
    opacity: 0.88,
  });
  const waterSurface = new THREE.Mesh(new THREE.CircleGeometry(92, 64), waterMat);
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.position.y = -0.32;
  waterSurface.receiveShadow = true;
  envGroup.add(waterSurface);

  // Soft shoreline surf / foam collar rings lapping around Main Island coast
  const foamRingInnerMat = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const foamRingInner = new THREE.Mesh(
    new THREE.RingGeometry(8.05, 8.65, 64),
    foamRingInnerMat
  );
  foamRingInner.rotation.x = -Math.PI / 2;
  foamRingInner.position.y = -0.28;
  envGroup.add(foamRingInner);

  const foamRingOuterMat = new THREE.MeshBasicMaterial({
    color: "#e0f2fe",
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const foamRingOuter = new THREE.Mesh(
    new THREE.RingGeometry(8.85, 9.6, 64),
    foamRingOuterMat
  );
  foamRingOuter.rotation.x = -Math.PI / 2;
  foamRingOuter.position.y = -0.29;
  envGroup.add(foamRingOuter);

  // 3D volumetric clay cloud clusters slowly drifting through the sky
  interface CloudEntry {
    group: THREE.Group;
    angle: number;
    radius: number;
    baseY: number;
    speed: number;
    scale: number;
  }
  const clouds: CloudEntry[] = [];
  const cloudMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.92,
    metalness: 0.0,
    transparent: true,
    opacity: 0.92,
  });

  const cloudSpecs: Array<[number, number, number, number, number]> = [
    [0.4, 24, 8.6, 0.018, 1.15],
    [1.75, 28, 9.8, 0.014, 1.35],
    [2.9, 25, 7.9, 0.02, 1.0],
    [4.2, 30, 10.4, 0.012, 1.4],
    [5.35, 26, 8.8, 0.016, 1.1],
  ];

  cloudSpecs.forEach(([angle, radius, baseY, speed, scale]) => {
    const cg = new THREE.Group();
    const puffs: Array<[number, number, number, number]> = [
      [0, 0.15, 0, 1.05],
      [-0.95, 0, 0.1, 0.78],
      [0.95, -0.02, -0.1, 0.82],
      [-0.4, 0.45, -0.15, 0.72],
      [0.48, 0.4, 0.12, 0.68],
    ];
    puffs.forEach(([px, py, pz, pr]) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(pr, 16, 14), cloudMat);
      puff.position.set(px, py, pz);
      puff.scale.set(1.15, 0.76, 0.92);
      cg.add(puff);
    });
    cg.scale.setScalar(scale);
    cg.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
    cg.rotation.y = -angle + Math.PI / 2;
    envGroup.add(cg);
    clouds.push({ group: cg, angle, radius, baseY, speed, scale });
  });

  const cWater = new THREE.Color();
  const cDeep = new THREE.Color();
  const cCloud = new THREE.Color();
  let wavePhase = 0;
  let cloudTravel = 0;

  return {
    update: (elapsed: number, options) => {
      const dt = Math.min(0.1, options?.delta ?? 0.016);
      const storm = Math.max(0, Math.min(1, options?.stormIntensity ?? 0));
      const waveRate = 1 + storm * 0.9;
      wavePhase += dt * waveRate;

      textures.waterWaveMap.offset.set(wavePhase * 0.018, wavePhase * 0.012);
      textures.waterWaveMap2.offset.set(-wavePhase * 0.014, wavePhase * 0.02);

      const wave1 = (wavePhase * 0.45) % 1;
      foamRingInner.scale.setScalar(0.98 + Math.sin(wave1 * Math.PI) * (0.055 + storm * 0.03));
      foamRingInnerMat.opacity = 0.28 + Math.sin(wave1 * Math.PI) * (0.24 + storm * 0.14);

      const wave2 = (wavePhase * 0.45 + 0.5) % 1;
      foamRingOuter.scale.setScalar(0.97 + Math.sin(wave2 * Math.PI) * (0.075 + storm * 0.035));
      foamRingOuterMat.opacity = 0.12 + Math.sin(wave2 * Math.PI) * (0.18 + storm * 0.12);

      cloudTravel += dt * (1 + storm * 1.15);
      clouds.forEach((c, idx) => {
        const a = c.angle + cloudTravel * c.speed;
        c.group.position.set(
          Math.cos(a) * c.radius,
          c.baseY + Math.sin(elapsed * (0.5 + storm * 0.35) + idx) * (0.18 + storm * 0.08),
          Math.sin(a) * c.radius
        );
        c.group.rotation.y = -a + Math.PI / 2;
      });

      const lerpAlpha = Math.min(1, 1 - Math.exp(-dt * 1.8));
      cloudMat.color.lerp(
        cCloud.set(storm > 0.4 ? "#dbe4f0" : "#ffffff"),
        lerpAlpha
      );
      if (options?.targetWaterColor) {
        waterMat.color.lerp(cWater.set(options.targetWaterColor), lerpAlpha);
      }
      if (options?.targetDeepColor) {
        deepMat.color.lerp(cDeep.set(options.targetDeepColor), lerpAlpha);
      }
    },
    updatePalette: (next) => {
      waterMat.color.set(next.waterColor);
      deepMat.color.set(next.deepColor);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.set(next.fogColor);
      }
    },
  };
}

export interface ArticulatedCharacterRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  eyeMeshes: THREE.Object3D[];
  headAcc?: THREE.Object3D;
  shadowMesh: THREE.Mesh;
  currentPos: THREE.Vector3;
  facingYaw: number;
  baseY: number;
  blinkSeed: number;
}

export function createCharacterShadowMesh(
  shadowBlobMap: THREE.CanvasTexture,
  radius = 0.48
): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: shadowBlobMap,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  return mesh;
}

export function animateArticulatedCharacter(
  rig: ArticulatedCharacterRig,
  dest: THREE.Vector3,
  delta: number,
  elapsed: number,
  phaseIdx: number
) {
  const prevX = rig.currentPos.x;
  const prevZ = rig.currentPos.z;
  const lerpStep = Math.min(1, delta * 3.4);
  rig.currentPos.lerp(dest, lerpStep);

  const moveDx = rig.currentPos.x - prevX;
  const moveDz = rig.currentPos.z - prevZ;
  const speed = delta > 0.0001 ? Math.hypot(moveDx, moveDz) / delta : 0;
  const isWalking = speed > 0.08;

  // Smooth facing direction toward movement vector, or gently scan around while idle
  let targetYaw = Math.sin(elapsed * 0.75 + phaseIdx * 1.4) * 0.28;
  if (isWalking) {
    targetYaw = Math.atan2(moveDx, moveDz);
  }
  const yawDiff = Math.atan2(
    Math.sin(targetYaw - rig.facingYaw),
    Math.cos(targetYaw - rig.facingYaw)
  );
  rig.facingYaw += yawDiff * Math.min(1, delta * (isWalking ? 8 : 2.5));

  // Realistic locomotion hop + squash & stretch vs gentle organic idle breathing
  let hopY = 0;
  let stretchY = 1;
  let pitchX = 0;
  let swing = 0;

  if (isWalking) {
    const stride = elapsed * 10.5 + phaseIdx;
    const stepWave = Math.abs(Math.sin(stride));
    hopY = stepWave * 0.14;
    stretchY = 0.94 + stepWave * 0.13;
    pitchX = 0.09;
    swing = Math.sin(stride) * 0.45;
  } else {
    const breath = Math.sin(elapsed * 2.3 + phaseIdx * 1.3);
    hopY = Math.max(0, breath) * 0.025;
    stretchY = 1 + breath * 0.025;
    swing = Math.sin(elapsed * 1.6 + phaseIdx) * 0.08;
  }

  const squashXZ = 1 / Math.sqrt(stretchY);
  rig.group.position.set(rig.currentPos.x, rig.currentPos.y, rig.currentPos.z);

  rig.bodyGroup.position.y = hopY;
  rig.bodyGroup.rotation.y = rig.facingYaw;
  rig.bodyGroup.rotation.x = pitchX;
  rig.bodyGroup.scale.set(squashXZ, stretchY, squashXZ);

  if (rig.leftArm) rig.leftArm.rotation.x = swing;
  if (rig.rightArm) rig.rightArm.rotation.x = -swing;
  if (rig.headAcc) {
    rig.headAcc.rotation.z = Math.sin(elapsed * 2.1 + phaseIdx) * 0.07;
  }

  // Contact shadow shrinks subtly as bot jumps higher
  const shadowScale = Math.max(0.72, 1 - hopY * 1.3);
  rig.shadowMesh.scale.setScalar(shadowScale);
  (rig.shadowMesh.material as THREE.MeshBasicMaterial).opacity =
    Math.max(0.35, 0.72 - hopY * 1.8);

  // Natural staggered eye blink every ~4s
  const blinkCycle = (elapsed + rig.blinkSeed) % 4.1;
  const isBlinking = blinkCycle > 3.92;
  const eyeScaleY = isBlinking ? 0.12 : 1;
  rig.eyeMeshes.forEach((em) => {
    em.scale.y = eyeScaleY;
  });
}
