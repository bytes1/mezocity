"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  AgentChassisType,
  AgentHeadgearType,
  CustomIslandAgent,
  CustomIslandVaultBuilding,
  IslandBiomeTheme,
} from "@/lib/island-db";

export interface WorkshopPreviewConfig {
  active: boolean;
  name?: string;
  chassis: AgentChassisType;
  primaryColor: string;
  secondaryColor: string;
  headgear: AgentHeadgearType;
  scaleFactor: number;
}

export interface CustomIslandSceneProps {
  islandName: string;
  biomeTheme: IslandBiomeTheme;
  vaults: CustomIslandVaultBuilding[];
  agents: CustomIslandAgent[];
  selectedPlotIndex: number | null;
  onSelectPlot: (plotIndex: number) => void;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  workshopPreview?: WorkshopPreviewConfig | null;
  cameraResetTick?: number;
}

interface ProjectedOverlay {
  x: number;
  y: number;
  visible: boolean;
}

const BIOME_PALETTES: Record<
  IslandBiomeTheme,
  {
    skyClass: string;
    outerRim: string;
    subRim: string;
    ground: string;
    ringRoad: string;
    courtyard: string;
    accentLight: string;
    propColor: string;
  }
> = {
  meadow: {
    skyClass: "from-[#93c5fd] via-[#c7e4fd] to-[#eef7ff]",
    outerRim: "#bfbab0",
    subRim: "#7ca35c",
    ground: "#98bf75",
    ringRoad: "#d9bf9b",
    courtyard: "#e5dccb",
    accentLight: "#fef9c3",
    propColor: "#68b678",
  },
  basalt: {
    skyClass: "from-[#1e1b4b] via-[#312e81] to-[#64748b]",
    outerRim: "#334155",
    subRim: "#475569",
    ground: "#3f3f46",
    ringRoad: "#52525b",
    courtyard: "#71717a",
    accentLight: "#f97316",
    propColor: "#ea580c",
  },
  sand: {
    skyClass: "from-[#7dd3fc] via-[#fde68a] to-[#fffbeb]",
    outerRim: "#d6b88d",
    subRim: "#e2c391",
    ground: "#edd5a7",
    ringRoad: "#c89d6c",
    courtyard: "#f5e6cb",
    accentLight: "#fef3c7",
    propColor: "#65a30d",
  },
  grid: {
    skyClass: "from-[#0f172a] via-[#1e293b] to-[#334155]",
    outerRim: "#1e293b",
    subRim: "#0f766e",
    ground: "#111827",
    ringRoad: "#0ea5e9",
    courtyard: "#1e293b",
    accentLight: "#22d3ee",
    propColor: "#06b6d4",
  },
};

export const PLOT_COORDINATES: Record<number, [number, number, number]> = {
  1: [-4.5, 0.49, 0.2],
  2: [-2.4, 0.49, -3.8],
  3: [2.4, 0.49, -3.8],
  4: [4.5, 0.49, 0.2],
  5: [2.6, 0.49, 3.8],
  6: [-2.6, 0.49, 3.8],
};

export const AGENT_SLOT_COORDINATES: Record<number, [number, number, number]> = {
  1: [-2.0, 0.52, -0.7],
  2: [-1.1, 0.52, -1.9],
  3: [1.1, 0.52, -1.9],
  4: [2.0, 0.52, -0.7],
  5: [2.0, 0.52, 1.1],
  6: [1.0, 0.52, 2.0],
  7: [-1.0, 0.52, 2.0],
  8: [-2.0, 0.52, 1.1],
};

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry?.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat?.dispose();
      }
    }
  });
}

function buildCustomAgentMesh(params: {
  chassis: AgentChassisType;
  primaryColor: string;
  secondaryColor: string;
  headgear: AgentHeadgearType;
  scaleFactor: number;
}): THREE.Group {
  const { chassis, primaryColor, secondaryColor, headgear, scaleFactor } = params;
  const g = new THREE.Group();

  const pMat = new THREE.MeshStandardMaterial({
    color: primaryColor || "#8b5cf6",
    roughness: 0.55,
  });
  const sMat = new THREE.MeshStandardMaterial({
    color: secondaryColor || "#f59e0b",
    roughness: 0.48,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.7,
  });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const pupilMat = new THREE.MeshBasicMaterial({ color: "#0f172a" });

  let topY = 0.92;

  if (chassis === "mech") {
    const legs = [-0.14, 0.14];
    legs.forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.2), darkMat);
      leg.position.set(lx, 0.14, 0);
      leg.castShadow = true;
      g.add(leg);
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.36), pMat);
    torso.position.y = 0.5;
    torso.castShadow = true;
    g.add(torso);
    [-0.35, 0.35].forEach((sx) => {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.34), sMat);
      pauldron.position.set(sx, 0.62, 0);
      pauldron.castShadow = true;
      g.add(pauldron);
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.28), pMat);
    head.position.y = 0.85;
    head.castShadow = true;
    g.add(head);
    topY = 0.98;
  } else if (chassis === "rover") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.52), darkMat);
    base.position.y = 0.18;
    base.castShadow = true;
    g.add(base);
    [
      [-0.34, 0.16],
      [0.34, 0.16],
      [-0.34, -0.16],
      [0.34, -0.16],
    ].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), sMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.12, wz);
      wheel.castShadow = true;
      g.add(wheel);
    });
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.36, 18), pMat);
    pod.position.y = 0.44;
    pod.castShadow = true;
    g.add(pod);
    topY = 0.64;
  } else if (chassis === "orb") {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), pMat);
    orb.position.y = 0.54;
    orb.castShadow = true;
    g.add(orb);
    const gyro = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.04, 12, 32),
      new THREE.MeshStandardMaterial({
        color: secondaryColor || "#22d3ee",
        emissive: secondaryColor || "#22d3ee",
        emissiveIntensity: 0.45,
      })
    );
    gyro.position.y = 0.54;
    gyro.rotation.x = Math.PI / 2.6;
    g.add(gyro);
    topY = 0.88;
  } else if (chassis === "guardian") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.56, 18), pMat);
    base.position.y = 0.3;
    base.castShadow = true;
    g.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 18), sMat);
    dome.position.y = 0.66;
    dome.castShadow = true;
    g.add(dome);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.38), sMat);
    shield.position.set(0.36, 0.42, 0.12);
    shield.castShadow = true;
    g.add(shield);
    topY = 0.96;
  } else {
    // "bot" clay buddy
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 22), pMat);
    body.scale.set(1, 1.08, 0.96);
    body.position.y = 0.38;
    body.castShadow = true;
    g.add(body);
    [-0.12, 0.12].forEach((fx) => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), sMat);
      foot.position.set(fx, 0.09, 0.08);
      foot.castShadow = true;
      g.add(foot);
    });
    topY = 0.74;
  }

  // Expressive Eyes on Front (+Z)
  const eyeY = chassis === "rover" ? 0.48 : chassis === "mech" ? 0.84 : chassis === "orb" ? 0.56 : 0.44;
  const eyeZ = chassis === "mech" ? 0.15 : chassis === "rover" ? 0.25 : 0.3;
  [-0.1, 0.1].forEach((ex) => {
    const wEye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), eyeWhiteMat);
    wEye.position.set(ex, eyeY, eyeZ);
    g.add(wEye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), pupilMat);
    pupil.position.set(ex, eyeY, eyeZ + 0.038);
    g.add(pupil);
  });

  // Headgear
  if (headgear === "crown") {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.1, 12), sMat);
    band.position.y = topY + 0.04;
    g.add(band);
    [-0.12, 0, 0.12].forEach((cx) => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 6), sMat);
      spike.position.set(cx, topY + 0.14, cx === 0 ? 0.12 : -0.06);
      g.add(spike);
    });
  } else if (headgear === "visor") {
    const visorMat = new THREE.MeshStandardMaterial({
      color: secondaryColor || "#22d3ee",
      emissive: secondaryColor || "#22d3ee",
      emissiveIntensity: 0.7,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.1), visorMat);
    visor.position.set(0, eyeY, eyeZ + 0.03);
    g.add(visor);
  } else if (headgear === "halo") {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.035, 10, 28),
      new THREE.MeshStandardMaterial({
        color: secondaryColor || "#fde047",
        emissive: secondaryColor || "#facc15",
        emissiveIntensity: 0.85,
      })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = topY + 0.16;
    g.add(halo);
  } else if (headgear === "radar") {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), darkMat);
    mast.position.set(0.08, topY + 0.08, -0.04);
    g.add(mast);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      sMat
    );
    dish.position.set(0.08, topY + 0.2, -0.02);
    dish.rotation.x = Math.PI / 3;
    g.add(dish);
  } else {
    // "antenna"
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), darkMat);
    stem.position.y = topY + 0.1;
    g.add(stem);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({
        color: secondaryColor || "#38bdf8",
        emissive: secondaryColor || "#38bdf8",
        emissiveIntensity: 0.8,
      })
    );
    bulb.position.y = topY + 0.23;
    g.add(bulb);
  }

  const clampedScale = Math.min(1.45, Math.max(0.7, scaleFactor || 1));
  g.scale.setScalar(clampedScale);
  return g;
}

function buildVaultBuildingMesh(vault: CustomIslandVaultBuilding): THREE.Group {
  const g = new THREE.Group();
  g.userData.plotIndex = vault.plotIndex;
  const pos = PLOT_COORDINATES[vault.plotIndex] || PLOT_COORDINATES[1];
  g.position.set(pos[0], pos[1], pos[2]);

  const basePad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 0.14, 24),
    new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.78 })
  );
  basePad.position.y = 0.07;
  basePad.receiveShadow = true;
  g.add(basePad);

  if (vault.assetType === "BTC") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.78, 1.15, 22),
      new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.5 })
    );
    body.position.y = 0.72;
    body.castShadow = true;
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.76, 0.18, 22),
      new THREE.MeshStandardMaterial({ color: "#fbbf24", roughness: 0.42 })
    );
    cap.position.y = 1.36;
    cap.castShadow = true;
    g.add(cap);
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20),
      new THREE.MeshStandardMaterial({
        color: "#fde047",
        emissive: "#f59e0b",
        emissiveIntensity: 0.45,
      })
    );
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 1.82;
    coin.userData.animateSpin = true;
    g.add(coin);
  } else if (vault.assetType === "MUSD") {
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.84, 0.55, 24),
      new THREE.MeshStandardMaterial({ color: "#0f766e", roughness: 0.58 })
    );
    plinth.position.y = 0.42;
    plinth.castShadow = true;
    g.add(plinth);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: "#10b981",
        emissive: "#059669",
        emissiveIntensity: 0.3,
        roughness: 0.35,
      })
    );
    dome.position.y = 0.7;
    dome.castShadow = true;
    g.add(dome);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.055, 12, 32),
      new THREE.MeshStandardMaterial({
        color: "#34d399",
        emissive: "#10b981",
        emissiveIntensity: 0.65,
      })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.98;
    halo.userData.animateBob = true;
    g.add(halo);
  } else {
    // MULTI_ASSET
    const tower = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 1.1, 1.15),
      new THREE.MeshStandardMaterial({ color: "#3b82f6", roughness: 0.55 })
    );
    tower.position.y = 0.68;
    tower.castShadow = true;
    g.add(tower);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36),
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        emissive: "#f59e0b",
        emissiveIntensity: 0.55,
      })
    );
    core.position.y = 1.62;
    core.userData.animateSpin = true;
    g.add(core);
  }

  return g;
}

export function CustomIslandScene({
  islandName,
  biomeTheme,
  vaults,
  agents,
  selectedPlotIndex,
  onSelectPlot,
  selectedAgentId,
  onSelectAgent,
  workshopPreview,
  cameraResetTick = 0,
}: CustomIslandSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onSelectPlotRef = useRef(onSelectPlot);
  onSelectPlotRef.current = onSelectPlot;

  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;

  const vaultsLayerRef = useRef<THREE.Group | null>(null);
  const agentsLayerRef = useRef<THREE.Group | null>(null);
  const workshopLayerRef = useRef<THREE.Group | null>(null);
  const terrainMatsRef = useRef<{
    outerRim?: THREE.MeshStandardMaterial;
    subRim?: THREE.MeshStandardMaterial;
    ground?: THREE.MeshStandardMaterial;
    ringRoad?: THREE.MeshStandardMaterial;
    courtyard?: THREE.MeshStandardMaterial;
  }>({});

  const desiredTargetRef = useRef<THREE.Vector3 | null>(null);
  const desiredCameraRef = useRef<THREE.Vector3 | null>(null);
  const isTweeningRef = useRef(false);

  const [plotOverlays, setPlotOverlays] = useState<Record<number, ProjectedOverlay>>({});
  const [agentOverlays, setAgentOverlays] = useState<Record<string, ProjectedOverlay>>({});

  const vaultsByPlot = useMemo(() => {
    const map = new Map<number, CustomIslandVaultBuilding>();
    vaults.forEach((v) => map.set(v.plotIndex, v));
    return map;
  }, [vaults]);

  const vaultsRef = useRef(vaults);
  vaultsRef.current = vaults;
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const workshopActiveRef = useRef(Boolean(workshopPreview?.active));
  workshopActiveRef.current = Boolean(workshopPreview?.active);

  // Camera tweening when Workshop Preview / Plot / Agent / Reset changes
  useEffect(() => {
    if (workshopPreview?.active) {
      desiredTargetRef.current = new THREE.Vector3(0, 1.05, 0);
      desiredCameraRef.current = new THREE.Vector3(0.4, 3.0, 5.2);
      isTweeningRef.current = true;
      return;
    }

    if (selectedPlotIndex !== null && PLOT_COORDINATES[selectedPlotIndex]) {
      const [px, , pz] = PLOT_COORDINATES[selectedPlotIndex];
      desiredTargetRef.current = new THREE.Vector3(px, 0.9, pz);
      desiredCameraRef.current = new THREE.Vector3(px * 0.55, 8.2, pz * 0.55 + 9.2);
      isTweeningRef.current = true;
      return;
    }

    if (selectedAgentId !== null) {
      const ag = agentsRef.current.find((a) => a.agentId === selectedAgentId);
      const pos = ag ? AGENT_SLOT_COORDINATES[ag.spawnSlotIndex] || [0, 0.52, 0] : [0, 0.52, 0];
      desiredTargetRef.current = new THREE.Vector3(pos[0], 0.9, pos[2]);
      desiredCameraRef.current = new THREE.Vector3(pos[0] * 0.65, 7.6, pos[2] * 0.65 + 8.4);
      isTweeningRef.current = true;
      return;
    }

    desiredTargetRef.current = new THREE.Vector3(0, 0.4, 0.2);
    desiredCameraRef.current = new THREE.Vector3(0, 12.2, 14.8);
    isTweeningRef.current = true;
  }, [workshopPreview?.active, selectedPlotIndex, selectedAgentId, cameraResetTick]);

  // Mount single WebGLRenderer + empty circular terrain ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 120);
    camera.position.set(0, 12.2, 14.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.45;
    controls.minDistance = 4.2;
    controls.maxDistance = 22;
    controls.target.set(0, 0.4, 0.2);
    const stopTween = () => {
      isTweeningRef.current = false;
    };
    controls.addEventListener("start", stopTween);

    scene.add(new THREE.AmbientLight("#ffffff", 1.35));
    scene.add(new THREE.HemisphereLight("#ffffff", "#9dc183", 0.75));
    const dirLight = new THREE.DirectionalLight("#fffbeb", 1.7);
    dirLight.position.set(11, 18, 11);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -11;
    dirLight.shadow.camera.right = 11;
    dirLight.shadow.camera.top = 11;
    dirLight.shadow.camera.bottom = -11;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const pal = BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow;

    const outerRimMat = new THREE.MeshStandardMaterial({ color: pal.outerRim, roughness: 0.85 });
    const outerRim = new THREE.Mesh(new THREE.CylinderGeometry(7.95, 8.15, 0.48, 64), outerRimMat);
    outerRim.position.y = 0.08;
    outerRim.receiveShadow = true;
    scene.add(outerRim);

    const subRimMat = new THREE.MeshStandardMaterial({ color: pal.subRim, roughness: 0.85 });
    const subRim = new THREE.Mesh(new THREE.CylinderGeometry(7.72, 7.82, 0.52, 64), subRimMat);
    subRim.position.y = 0.14;
    subRim.receiveShadow = true;
    scene.add(subRim);

    const groundMat = new THREE.MeshStandardMaterial({ color: pal.ground, roughness: 0.82 });
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(7.58, 7.65, 0.56, 64), groundMat);
    ground.position.y = 0.18;
    ground.receiveShadow = true;
    scene.add(ground);

    const ringRoadMat = new THREE.MeshStandardMaterial({ color: pal.ringRoad, roughness: 0.85 });
    const ringRoad = new THREE.Mesh(new THREE.RingGeometry(3.85, 4.9, 64), ringRoadMat);
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.47;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    const courtyardMat = new THREE.MeshStandardMaterial({ color: pal.courtyard, roughness: 0.8 });
    const courtyard = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.5, 0.06, 48), courtyardMat);
    courtyard.position.y = 0.465;
    courtyard.receiveShadow = true;
    scene.add(courtyard);

    terrainMatsRef.current = {
      outerRim: outerRimMat,
      subRim: subRimMat,
      ground: groundMat,
      ringRoad: ringRoadMat,
      courtyard: courtyardMat,
    };

    // Empty Workshop Pedestal at Center (used cleanly for Agent Studio preview)
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.08, 0.12, 32),
      new THREE.MeshStandardMaterial({
        color: "#f8fafc",
        roughness: 0.55,
      })
    );
    pedestal.position.y = 0.51;
    pedestal.receiveShadow = true;
    scene.add(pedestal);

    const pedestalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.035, 10, 48),
      new THREE.MeshStandardMaterial({
        color: "#8b5cf6",
        emissive: "#8b5cf6",
        emissiveIntensity: 0.55,
      })
    );
    pedestalRing.rotation.x = Math.PI / 2;
    pedestalRing.position.y = 0.56;
    scene.add(pedestalRing);

    const vaultsLayer = new THREE.Group();
    const agentsLayer = new THREE.Group();
    const workshopLayer = new THREE.Group();
    scene.add(vaultsLayer);
    scene.add(agentsLayer);
    scene.add(workshopLayer);
    vaultsLayerRef.current = vaultsLayer;
    agentsLayerRef.current = agentsLayer;
    workshopLayerRef.current = workshopLayer;

    // Click Raycaster for plots + agents
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;

    const hitTest = (cx: number, cy: number): { plotIndex?: number; agentId?: string } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointerNdc.x = ((cx - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((cy - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects([agentsLayer, vaultsLayer], true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (typeof node.userData?.agentIdStr === "string") {
            return { agentId: node.userData.agentIdStr };
          }
          if (typeof node.userData?.plotIndex === "number") {
            return { plotIndex: node.userData.plotIndex };
          }
          node = node.parent;
        }
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      pointerDown = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      const dist = Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y);
      pointerDown = null;
      if (dist > 6) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit?.agentId !== undefined) {
        onSelectAgentRef.current(hit.agentId);
      } else if (hit?.plotIndex !== undefined) {
        onSelectPlotRef.current(hit.plotIndex);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const project = (world: THREE.Vector3, w: number, h: number): ProjectedOverlay => {
      const v = world.clone().project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-(v.y * 0.5) + 0.5) * h;
      return {
        x,
        y,
        visible: v.z < 1 && x >= -80 && x <= w + 80 && y >= -80 && y <= h + 80,
      };
    };

    const clock = new THREE.Clock();
    let frameId = 0;
    let lastOverlaySync = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      if (isTweeningRef.current && desiredTargetRef.current && desiredCameraRef.current) {
        controls.target.lerp(desiredTargetRef.current, 0.1);
        camera.position.lerp(desiredCameraRef.current, 0.1);
        if (
          controls.target.distanceTo(desiredTargetRef.current) < 0.04 &&
          camera.position.distanceTo(desiredCameraRef.current) < 0.05
        ) {
          isTweeningRef.current = false;
        }
      }
      controls.update();

      // Gentle idle animation on custom vaults + agents + workshop preview
      vaultsLayer.traverse((obj) => {
        if (obj.userData?.animateSpin) obj.rotation.y += delta * 1.4;
        if (obj.userData?.animateBob) obj.position.y = 0.98 + Math.sin(elapsed * 2.4) * 0.06;
      });
      agentsLayer.children.forEach((agGroup, idx) => {
        agGroup.position.y = 0.52 + Math.abs(Math.sin(elapsed * 2.2 + idx * 0.9)) * 0.05;
        agGroup.rotation.y = Math.sin(elapsed * 0.8 + idx) * 0.35;
      });
      if (workshopLayer.children.length > 0 && workshopActiveRef.current) {
        workshopLayer.rotation.y += delta * 0.7;
      }
      pedestalRing.visible = workshopActiveRef.current || agentsRef.current.length === 0;

      renderer.render(scene, camera);

      if (elapsed - lastOverlaySync > 0.06) {
        lastOverlaySync = elapsed;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        const nextPlots: Record<number, ProjectedOverlay> = {};
        for (let p = 1; p <= 6; p++) {
          const [px, py, pz] = PLOT_COORDINATES[p];
          const hasBuilding = vaultsRef.current.some((v) => v.plotIndex === p);
          nextPlots[p] = project(
            new THREE.Vector3(px, py + (hasBuilding ? 2.1 : 0.75), pz),
            w,
            h
          );
        }
        setPlotOverlays(nextPlots);

        const nextAgents: Record<string, ProjectedOverlay> = {};
        agentsRef.current.forEach((ag) => {
          const [ax, ay, az] = AGENT_SLOT_COORDINATES[ag.spawnSlotIndex] || [0, 0.52, 0];
          nextAgents[ag.agentId] = project(
            new THREE.Vector3(ax, ay + 1.15 * (ag.scaleFactor || 1), az),
            w,
            h
          );
        });
        setAgentOverlays(nextAgents);
      }
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      controls.removeEventListener("start", stopTween);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(frameId);
      disposeObjectTree(scene);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Biome Palette Reactively without recreating WebGLRenderer
  useEffect(() => {
    const pal = BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow;
    terrainMatsRef.current.outerRim?.color.set(pal.outerRim);
    terrainMatsRef.current.subRim?.color.set(pal.subRim);
    terrainMatsRef.current.ground?.color.set(pal.ground);
    terrainMatsRef.current.ringRoad?.color.set(pal.ringRoad);
    terrainMatsRef.current.courtyard?.color.set(pal.courtyard);
  }, [biomeTheme]);

  // Rebuild Empty Plots & Vault Buildings Layer Reactively
  useEffect(() => {
    const layer = vaultsLayerRef.current;
    if (!layer) return;
    while (layer.children.length > 0) {
      const child = layer.children[0];
      layer.remove(child);
      disposeObjectTree(child);
    }

    for (let plotIndex = 1; plotIndex <= 6; plotIndex++) {
      const existing = vaultsByPlot.get(plotIndex);
      if (existing) {
        layer.add(buildVaultBuildingMesh(existing));
      } else {
        const [px, py, pz] = PLOT_COORDINATES[plotIndex];
        const emptyPad = new THREE.Group();
        emptyPad.userData.plotIndex = plotIndex;
        emptyPad.position.set(px, py, pz);

        const disc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.92, 0.96, 0.05, 24),
          new THREE.MeshStandardMaterial({
            color: selectedPlotIndex === plotIndex ? "#ddd6fe" : "#f1f5f9",
            transparent: true,
            opacity: 0.72,
            roughness: 0.9,
          })
        );
        disc.position.y = 0.025;
        emptyPad.add(disc);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.84, 0.96, 32),
          new THREE.MeshBasicMaterial({
            color: selectedPlotIndex === plotIndex ? "#7c3aed" : "#94a3b8",
            side: THREE.DoubleSide,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.055;
        emptyPad.add(ring);

        layer.add(emptyPad);
      }
    }
  }, [vaults, vaultsByPlot, selectedPlotIndex]);

  // Rebuild Placed Sub-Island Agents Layer Reactively
  useEffect(() => {
    const layer = agentsLayerRef.current;
    if (!layer) return;
    while (layer.children.length > 0) {
      const child = layer.children[0];
      layer.remove(child);
      disposeObjectTree(child);
    }

    agents.forEach((agent) => {
      const [ax, ay, az] =
        AGENT_SLOT_COORDINATES[agent.spawnSlotIndex] || AGENT_SLOT_COORDINATES[1];
      const mesh = buildCustomAgentMesh({
        chassis: agent.chassis,
        primaryColor: agent.primaryColor,
        secondaryColor: agent.secondaryColor,
        headgear: agent.headgear,
        scaleFactor: agent.scaleFactor,
      });
      mesh.userData.agentIdStr = agent.agentId;
      mesh.position.set(ax, ay, az);
      layer.add(mesh);
    });
  }, [agents]);

  // Rebuild Live Workshop Pedestal Agent Preview Reactively
  useEffect(() => {
    const layer = workshopLayerRef.current;
    if (!layer) return;
    while (layer.children.length > 0) {
      const child = layer.children[0];
      layer.remove(child);
      disposeObjectTree(child);
    }

    if (workshopPreview?.active) {
      const previewMesh = buildCustomAgentMesh({
        chassis: workshopPreview.chassis,
        primaryColor: workshopPreview.primaryColor,
        secondaryColor: workshopPreview.secondaryColor,
        headgear: workshopPreview.headgear,
        scaleFactor: workshopPreview.scaleFactor,
      });
      previewMesh.position.set(0, 0.56, 0);
      layer.add(previewMesh);
    }
  }, [
    workshopPreview?.active,
    workshopPreview?.chassis,
    workshopPreview?.primaryColor,
    workshopPreview?.secondaryColor,
    workshopPreview?.headgear,
    workshopPreview?.scaleFactor,
  ]);

  const skyGradient = (BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow).skyClass;

  return (
    <div className={`relative w-full h-full overflow-hidden bg-gradient-to-b ${skyGradient}`}>
      <div
        ref={containerRef}
        className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* Projected 3D Labels for Empty/Built Plots & Custom Agents */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map((plotIndex) => {
          const coord = plotOverlays[plotIndex];
          if (!coord || !coord.visible) return null;
          const building = vaultsByPlot.get(plotIndex);
          const isSelected = selectedPlotIndex === plotIndex;

          return (
            <button
              key={`plot-${plotIndex}`}
              type="button"
              onClick={() => onSelectPlot(plotIndex)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold whitespace-nowrap border shadow-md transition-all ${
                building
                  ? isSelected
                    ? "bg-[#231f20] text-white border-white scale-105"
                    : "bg-white/95 text-[#231f20] border-white hover:scale-105"
                  : isSelected
                  ? "bg-[#7c3aed] text-white border-white scale-105"
                  : "bg-white/80 text-stone-600 border-dashed border-stone-400 hover:bg-white"
              }`}
            >
              {building
                ? `${building.assetType} • ${building.vaultName}`
                : `+ Plot #${plotIndex} (Empty)`}
            </button>
          );
        })}

        {agents.map((ag) => {
          const coord = agentOverlays[ag.agentId];
          if (!coord || !coord.visible) return null;
          const isSelected = selectedAgentId === ag.agentId;
          return (
            <button
              key={`ag-${ag.agentId}`}
              type="button"
              onClick={() => onSelectAgent(ag.agentId)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold whitespace-nowrap border shadow-md flex items-center gap-1.5 transition-all ${
                isSelected
                  ? "bg-[#231f20] text-white border-[#c4b5fd] scale-110 z-30"
                  : "bg-white/95 text-[#231f20] border-white/90 hover:scale-105 z-20"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: ag.primaryColor }}
              />
              <span>{ag.name}</span>
              <span className="text-[8.5px] opacity-70">{ag.role.split(" ")[0]}</span>
            </button>
          );
        })}

        {workshopPreview?.active && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[#242331]/90 text-white px-4 py-1.5 text-xs font-extrabold shadow-xl border border-white/20 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-ping" />
            <span>
              Workshop Pedestal Live Preview: {workshopPreview.name || "Custom Agent"} (
              {islandName})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
