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
import {
  animateArticulatedCharacter,
  type ArticulatedCharacterRig,
  configureRealisticLightingAndRenderer,
  createCharacterShadowMesh,
  createOceanAndVolumetricClouds,
  createProceduralIslandTextures,
  deriveMarketMood,
  type MarketMoodLevel,
  type OceanCloudsController,
  type ProceduralIslandTextures,
} from "./islandVisualHelpers";

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
  marketMoodInput?: {
    fearGreedIndex?: number;
    trendDirection?: "UPTREND" | "DOWNTREND" | "RANGE_BOUND";
    sentimentLabel?: "BULLISH" | "NEUTRAL" | "CAUTIOUS";
  };
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
    waterColor: string;
    deepColor: string;
    fogColor: string;
    hemiGround: string;
  }
> = {
  meadow: {
    skyClass: "from-[#82beef] via-[#bce0fc] to-[#eaf5ff]",
    outerRim: "#c9c3b8",
    subRim: "#789e59",
    ground: "#ffffff",
    ringRoad: "#ffffff",
    courtyard: "#e9e0cf",
    accentLight: "#fef9c3",
    propColor: "#68b678",
    waterColor: "#38bdf8",
    deepColor: "#0284c7",
    fogColor: "#d4ebfd",
    hemiGround: "#748f5a",
  },
  basalt: {
    skyClass: "from-[#1e1b4b] via-[#312e81] to-[#64748b]",
    outerRim: "#475569",
    subRim: "#334155",
    ground: "#64748b",
    ringRoad: "#52525b",
    courtyard: "#71717a",
    accentLight: "#f97316",
    propColor: "#ea580c",
    waterColor: "#0e7490",
    deepColor: "#0f172a",
    fogColor: "#475569",
    hemiGround: "#3f3f46",
  },
  sand: {
    skyClass: "from-[#7dd3fc] via-[#fde68a] to-[#fffbeb]",
    outerRim: "#d6b88d",
    subRim: "#e2c391",
    ground: "#ffffff",
    ringRoad: "#c89d6c",
    courtyard: "#f5e6cb",
    accentLight: "#fef3c7",
    propColor: "#65a30d",
    waterColor: "#22d3ee",
    deepColor: "#0369a1",
    fogColor: "#fde68a",
    hemiGround: "#c2a878",
  },
  grid: {
    skyClass: "from-[#0f172a] via-[#1e293b] to-[#334155]",
    outerRim: "#334155",
    subRim: "#0f766e",
    ground: "#e2e8f0",
    ringRoad: "#0ea5e9",
    courtyard: "#1e293b",
    accentLight: "#22d3ee",
    propColor: "#06b6d4",
    waterColor: "#0891b2",
    deepColor: "#020617",
    fogColor: "#334155",
    hemiGround: "#1e293b",
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
  1: [-2.0, 0.5, -0.7],
  2: [-1.1, 0.5, -1.9],
  3: [1.1, 0.5, -1.9],
  4: [2.0, 0.5, -0.7],
  5: [2.0, 0.5, 1.1],
  6: [1.0, 0.5, 2.0],
  7: [-1.0, 0.5, 2.0],
  8: [-2.0, 0.5, 1.1],
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
  shadowBlobMap?: THREE.CanvasTexture;
  startPos?: THREE.Vector3;
  blinkSeed?: number;
}): ArticulatedCharacterRig {
  const {
    chassis,
    primaryColor,
    secondaryColor,
    headgear,
    scaleFactor,
    shadowBlobMap,
    startPos,
    blinkSeed = 0.5,
  } = params;
  const g = new THREE.Group();
  const bodyGroup = new THREE.Group();
  g.add(bodyGroup);

  const currentPos = startPos ? startPos.clone() : new THREE.Vector3(0, 0.5, 0);
  g.position.copy(currentPos);

  const shadowMesh = shadowBlobMap
    ? createCharacterShadowMesh(shadowBlobMap, 0.44)
    : new THREE.Mesh(
        new THREE.CircleGeometry(0.42, 20),
        new THREE.MeshBasicMaterial({
          color: "#0f172a",
          transparent: true,
          opacity: 0.25,
          depthWrite: false,
        })
      );
  if (!shadowBlobMap) shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.012;
  g.add(shadowMesh);

  const pMat = new THREE.MeshPhysicalMaterial({
    color: primaryColor || "#8b5cf6",
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.22,
  });
  const sMat = new THREE.MeshStandardMaterial({
    color: secondaryColor || "#f59e0b",
    roughness: 0.34,
    metalness: 0.28,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.65,
  });
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const pupilMat = new THREE.MeshBasicMaterial({ color: "#0f172a" });

  let topY = 0.92;
  let leftArm: THREE.Object3D | undefined;
  let rightArm: THREE.Object3D | undefined;

  if (chassis === "mech") {
    const legs = [-0.14, 0.14];
    legs.forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.2), darkMat);
      leg.position.set(lx, 0.14, 0);
      leg.castShadow = true;
      bodyGroup.add(leg);
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.46, 0.36), pMat);
    torso.position.y = 0.5;
    torso.castShadow = true;
    bodyGroup.add(torso);
    [-0.36, 0.36].forEach((sx, idx) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(sx, 0.62, 0);
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.34), sMat);
      pauldron.castShadow = true;
      armPivot.add(pauldron);
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.16), pMat);
      forearm.position.y = -0.18;
      forearm.castShadow = true;
      armPivot.add(forearm);
      bodyGroup.add(armPivot);
      if (idx === 0) leftArm = armPivot;
      else rightArm = armPivot;
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.28), pMat);
    head.position.y = 0.85;
    head.castShadow = true;
    bodyGroup.add(head);
    topY = 0.98;
  } else if (chassis === "rover") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.52), darkMat);
    base.position.y = 0.18;
    base.castShadow = true;
    bodyGroup.add(base);
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
      bodyGroup.add(wheel);
    });
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.36, 18), pMat);
    pod.position.y = 0.44;
    pod.castShadow = true;
    bodyGroup.add(pod);
    topY = 0.64;
  } else if (chassis === "orb") {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), pMat);
    orb.position.y = 0.54;
    orb.castShadow = true;
    bodyGroup.add(orb);
    const gyro = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.04, 12, 32),
      new THREE.MeshStandardMaterial({
        color: secondaryColor || "#22d3ee",
        emissive: secondaryColor || "#22d3ee",
        emissiveIntensity: 0.45,
        metalness: 0.45,
        roughness: 0.25,
      })
    );
    gyro.position.y = 0.54;
    gyro.rotation.x = Math.PI / 2.6;
    bodyGroup.add(gyro);
    leftArm = gyro;
    topY = 0.88;
  } else if (chassis === "guardian") {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.56, 18), pMat);
    base.position.y = 0.3;
    base.castShadow = true;
    bodyGroup.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 18), sMat);
    dome.position.y = 0.66;
    dome.castShadow = true;
    bodyGroup.add(dome);
    const shieldPivot = new THREE.Group();
    shieldPivot.position.set(0.36, 0.42, 0.08);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.38), sMat);
    shield.castShadow = true;
    shieldPivot.add(shield);
    bodyGroup.add(shieldPivot);
    rightArm = shieldPivot;
    const armPivotL = new THREE.Group();
    armPivotL.position.set(-0.36, 0.48, 0);
    const leftGauntlet = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.14, 6, 10), pMat);
    leftGauntlet.position.y = -0.1;
    leftGauntlet.castShadow = true;
    armPivotL.add(leftGauntlet);
    bodyGroup.add(armPivotL);
    leftArm = armPivotL;
    topY = 0.96;
  } else {
    // "bot" clay buddy
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 22, 22), pMat);
    body.scale.set(1, 1.08, 0.96);
    body.position.y = 0.38;
    body.castShadow = true;
    bodyGroup.add(body);
    [-0.12, 0.12].forEach((fx) => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), sMat);
      foot.scale.set(0.95, 0.68, 1.25);
      foot.position.set(fx, 0.07, 0.07);
      foot.castShadow = true;
      bodyGroup.add(foot);
    });
    [-0.36, 0.36].forEach((ax, idx) => {
      const side = idx === 0 ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.set(ax, 0.42, 0);
      const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.14, 6, 10), pMat);
      limb.position.y = -0.09;
      limb.rotation.z = side * 0.24;
      limb.castShadow = true;
      pivot.add(limb);
      bodyGroup.add(pivot);
      if (idx === 0) leftArm = pivot;
      else rightArm = pivot;
    });
    topY = 0.74;
  }

  // Expressive Blinking Eyes on Front (+Z)
  const eyeY = chassis === "rover" ? 0.48 : chassis === "mech" ? 0.84 : chassis === "orb" ? 0.56 : 0.44;
  const eyeZ = chassis === "mech" ? 0.15 : chassis === "rover" ? 0.25 : 0.3;
  const eyeMeshes: THREE.Object3D[] = [];
  [-0.1, 0.1].forEach((ex) => {
    const eyeHolder = new THREE.Group();
    eyeHolder.position.set(ex, eyeY, eyeZ);
    const wEye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 12), eyeWhiteMat);
    eyeHolder.add(wEye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), pupilMat);
    pupil.position.set(0, 0, 0.038);
    eyeHolder.add(pupil);
    bodyGroup.add(eyeHolder);
    eyeMeshes.push(eyeHolder);
  });

  // Headgear attached as articulated headAcc
  let headAcc: THREE.Object3D | undefined;
  if (headgear === "crown") {
    const crownGroup = new THREE.Group();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.1, 12), sMat);
    band.position.y = topY + 0.04;
    crownGroup.add(band);
    [-0.12, 0, 0.12].forEach((cx) => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.15, 6), sMat);
      spike.position.set(cx, topY + 0.14, cx === 0 ? 0.12 : -0.06);
      crownGroup.add(spike);
    });
    bodyGroup.add(crownGroup);
    headAcc = crownGroup;
  } else if (headgear === "visor") {
    const visorMat = new THREE.MeshStandardMaterial({
      color: secondaryColor || "#22d3ee",
      emissive: secondaryColor || "#22d3ee",
      emissiveIntensity: 0.7,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.1), visorMat);
    visor.position.set(0, eyeY, eyeZ + 0.03);
    bodyGroup.add(visor);
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
    bodyGroup.add(halo);
    headAcc = halo;
  } else if (headgear === "radar") {
    const radarGroup = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), darkMat);
    mast.position.set(0.08, topY + 0.08, -0.04);
    radarGroup.add(mast);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      sMat
    );
    dish.position.set(0.08, topY + 0.2, -0.02);
    dish.rotation.x = Math.PI / 3;
    radarGroup.add(dish);
    bodyGroup.add(radarGroup);
    headAcc = radarGroup;
  } else {
    // "antenna"
    const antGroup = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 8), darkMat);
    stem.position.y = topY + 0.1;
    antGroup.add(stem);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({
        color: secondaryColor || "#38bdf8",
        emissive: secondaryColor || "#38bdf8",
        emissiveIntensity: 0.8,
      })
    );
    bulb.position.y = topY + 0.23;
    antGroup.add(bulb);
    bodyGroup.add(antGroup);
    headAcc = antGroup;
  }

  const clampedScale = Math.min(1.45, Math.max(0.7, scaleFactor || 1));
  g.scale.setScalar(clampedScale);

  return {
    group: g,
    bodyGroup,
    leftArm,
    rightArm,
    eyeMeshes,
    headAcc,
    shadowMesh,
    currentPos,
    facingYaw: 0,
    baseY: currentPos.y,
    blinkSeed,
  };
}

function buildVaultBuildingMesh(
  vault: CustomIslandVaultBuilding,
  stoneMap?: THREE.CanvasTexture
): THREE.Group {
  const g = new THREE.Group();
  g.userData.plotIndex = vault.plotIndex;
  const pos = PLOT_COORDINATES[vault.plotIndex] || PLOT_COORDINATES[1];
  g.position.set(pos[0], pos[1], pos[2]);

  const basePad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 0.14, 24),
    new THREE.MeshStandardMaterial({
      color: "#e2e8f0",
      map: stoneMap,
      roughness: 0.78,
    })
  );
  basePad.position.y = 0.07;
  basePad.receiveShadow = true;
  g.add(basePad);

  if (vault.assetType === "BTC") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.78, 1.15, 22),
      new THREE.MeshStandardMaterial({
        color: "#f59e0b",
        metalness: 0.35,
        roughness: 0.36,
      })
    );
    body.position.y = 0.72;
    body.castShadow = true;
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.76, 0.18, 22),
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        metalness: 0.52,
        roughness: 0.28,
      })
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
        metalness: 0.75,
        roughness: 0.2,
      })
    );
    coin.rotation.x = Math.PI / 2;
    coin.position.y = 1.82;
    coin.userData.animateSpin = true;
    g.add(coin);
  } else if (vault.assetType === "MUSD") {
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.84, 0.55, 24),
      new THREE.MeshStandardMaterial({ color: "#0f766e", roughness: 0.52 })
    );
    plinth.position.y = 0.42;
    plinth.castShadow = true;
    g.add(plinth);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: "#10b981",
        emissive: "#059669",
        emissiveIntensity: 0.32,
        roughness: 0.18,
        clearcoat: 0.85,
      })
    );
    dome.position.y = 0.7;
    dome.castShadow = true;
    g.add(dome);
    const ribMat = new THREE.MeshStandardMaterial({
      color: "#fbbf24",
      metalness: 0.7,
      roughness: 0.25,
    });
    for (let ri = 0; ri < 3; ri++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.022, 8, 20, Math.PI), ribMat);
      rib.position.y = 0.7;
      rib.rotation.y = (ri * Math.PI) / 3;
      g.add(rib);
    }
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.055, 12, 32),
      new THREE.MeshStandardMaterial({
        color: "#34d399",
        emissive: "#10b981",
        emissiveIntensity: 0.65,
        metalness: 0.5,
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
      new THREE.MeshStandardMaterial({
        color: "#3b82f6",
        roughness: 0.45,
        metalness: 0.22,
      })
    );
    tower.position.y = 0.68;
    tower.castShadow = true;
    g.add(tower);
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36),
      new THREE.MeshPhysicalMaterial({
        color: "#fbbf24",
        emissive: "#f59e0b",
        emissiveIntensity: 0.55,
        roughness: 0.12,
        clearcoat: 0.9,
      })
    );
    core.position.y = 1.62;
    core.userData.animateSpin = true;
    g.add(core);
  }

  return g;
}

function buildBiomePropsGroup(
  biome: IslandBiomeTheme,
  textures: ProceduralIslandTextures
): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: textures.woodMap,
    roughness: 0.86,
  });
  const spotAngles = [0.48, 1.48, 2.38, 3.25, 4.18, 5.25];

  spotAngles.forEach((ang, i) => {
    const r = 6.2 + (i % 2) * 0.45;
    const px = Math.cos(ang) * r;
    const pz = Math.sin(ang) * r;

    if (biome === "meadow") {
      const tree = new THREE.Group();
      tree.position.set(px, 0.48, pz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.48, 10), trunkMat);
      trunk.position.y = 0.24;
      trunk.castShadow = true;
      tree.add(trunk);
      const leafMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? "#68b678" : "#7cc682",
        roughness: 0.78,
      });
      const mainCanopy = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 14), leafMat);
      mainCanopy.position.y = 0.64;
      mainCanopy.castShadow = true;
      tree.add(mainCanopy);
      const sideTuft = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), leafMat);
      sideTuft.position.set(0.2, 0.56, 0.12);
      sideTuft.castShadow = true;
      tree.add(sideTuft);
      group.add(tree);
    } else if (biome === "basalt") {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.24 + (i % 2) * 0.08, 0.85, 6),
        new THREE.MeshStandardMaterial({
          color: "#1e293b",
          emissive: "#ea580c",
          emissiveIntensity: i % 2 === 0 ? 0.45 : 0.15,
          roughness: 0.75,
          flatShading: true,
        })
      );
      spike.position.set(px, 0.88, pz);
      spike.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.12;
      spike.castShadow = true;
      group.add(spike);
    } else if (biome === "sand") {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.3, 0),
        new THREE.MeshStandardMaterial({
          color: "#d9b37c",
          map: textures.sandMap,
          roughness: 0.9,
          flatShading: true,
        })
      );
      rock.scale.set(1.2, 0.75, 1.0);
      rock.position.set(px, 0.6, pz);
      rock.castShadow = true;
      group.add(rock);
      if (i % 2 === 0) {
        const cactus = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.11, 0.42, 6, 10),
          new THREE.MeshStandardMaterial({ color: "#65a30d", roughness: 0.75 })
        );
        cactus.position.set(px + 0.32, 0.72, pz - 0.18);
        cactus.castShadow = true;
        group.add(cactus);
      }
    } else {
      // grid cyber pylons
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6),
        new THREE.MeshStandardMaterial({
          color: "#0f172a",
          emissive: "#06b6d4",
          emissiveIntensity: 0.55,
          roughness: 0.35,
        })
      );
      pylon.position.set(px, 0.92, pz);
      pylon.castShadow = true;
      group.add(pylon);
    }
  });

  return group;
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
  marketMoodInput,
}: CustomIslandSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const marketMood: MarketMoodLevel = useMemo(
    () =>
      deriveMarketMood({
        fearGreedIndex: marketMoodInput?.fearGreedIndex,
        trendDirection: marketMoodInput?.trendDirection,
        sentimentLabel: marketMoodInput?.sentimentLabel,
      }),
    [
      marketMoodInput?.fearGreedIndex,
      marketMoodInput?.trendDirection,
      marketMoodInput?.sentimentLabel,
    ]
  );
  const marketMoodRef = useRef<MarketMoodLevel>(marketMood);
  marketMoodRef.current = marketMood;

  const onSelectPlotRef = useRef(onSelectPlot);
  onSelectPlotRef.current = onSelectPlot;

  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;

  const vaultsLayerRef = useRef<THREE.Group | null>(null);
  const agentsLayerRef = useRef<THREE.Group | null>(null);
  const workshopLayerRef = useRef<THREE.Group | null>(null);
  const biomePropsLayerRef = useRef<THREE.Group | null>(null);
  const texturesRef = useRef<ProceduralIslandTextures | null>(null);
  const oceanEnvRef = useRef<OceanCloudsController | null>(null);
  const terrainMatsRef = useRef<{
    outerRim?: THREE.MeshStandardMaterial;
    subRim?: THREE.MeshStandardMaterial;
    ground?: THREE.MeshStandardMaterial;
    ringRoad?: THREE.MeshStandardMaterial;
    courtyard?: THREE.MeshStandardMaterial;
    cliff?: THREE.MeshStandardMaterial;
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

  // Mount single WebGLRenderer + textured biome island ONCE
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 220);
    camera.position.set(0, 12.2, 14.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.45;
    controls.minDistance = 4.2;
    controls.maxDistance = 30;
    controls.target.set(0, 0.4, 0.2);
    const stopTween = () => {
      isTweeningRef.current = false;
    };
    controls.addEventListener("start", stopTween);

    const pal = BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow;
    const textures = createProceduralIslandTextures();
    texturesRef.current = textures;

    const lightingCtrl = configureRealisticLightingAndRenderer(renderer, scene, {
      fogColor: pal.fogColor,
      fogDensity: 0.0085,
      hemiGround: pal.hemiGround,
    });

    const oceanEnv = createOceanAndVolumetricClouds(scene, textures, {
      waterColor: pal.waterColor,
      deepColor: pal.deepColor,
      fogColor: pal.fogColor,
    });
    oceanEnvRef.current = oceanEnv;

    const outerRimMat = new THREE.MeshStandardMaterial({
      color: pal.outerRim,
      map: textures.stoneMap,
      bumpMap: textures.stoneMap,
      bumpScale: 0.035,
      roughness: 0.86,
    });
    const outerRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.95, 8.18, 0.48, 64),
      outerRimMat
    );
    outerRim.position.y = 0.08;
    outerRim.castShadow = true;
    outerRim.receiveShadow = true;
    scene.add(outerRim);

    const cliffMat = new THREE.MeshStandardMaterial({
      color: biomeTheme === "basalt" || biomeTheme === "grid" ? "#334155" : "#9a9488",
      map: textures.stoneMap,
      roughness: 0.92,
      flatShading: true,
    });
    const cliffUnderbelly = new THREE.Mesh(
      new THREE.CylinderGeometry(8.18, 7.35, 0.72, 28),
      cliffMat
    );
    cliffUnderbelly.position.y = -0.36;
    cliffUnderbelly.receiveShadow = true;
    scene.add(cliffUnderbelly);

    for (let bi = 0; bi < 12; bi++) {
      const ba = (bi * Math.PI * 2) / 12 + (bi % 3) * 0.16;
      const br = 8.05 + (bi % 3) * 0.2;
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.28 + (bi % 3) * 0.08, 0),
        cliffMat
      );
      boulder.scale.set(1.2, 0.65, 1.0);
      boulder.position.set(Math.cos(ba) * br, -0.25, Math.sin(ba) * br);
      boulder.rotation.set(0.4 * bi, ba, 0.25 * bi);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      scene.add(boulder);
    }

    const subRimMat = new THREE.MeshStandardMaterial({
      color: pal.subRim,
      roughness: 0.88,
    });
    const subRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.72, 7.82, 0.52, 64),
      subRimMat
    );
    subRim.position.y = 0.14;
    subRim.receiveShadow = true;
    scene.add(subRim);

    const getBiomeSurfaceTex = (b: IslandBiomeTheme) =>
      b === "sand"
        ? textures.sandMap
        : b === "grid"
        ? textures.gridMap
        : b === "basalt"
        ? textures.stoneMap
        : textures.grassMap;

    const initialSurfTex = getBiomeSurfaceTex(biomeTheme);
    const groundMat = new THREE.MeshStandardMaterial({
      color: pal.ground,
      map: initialSurfTex,
      bumpMap: initialSurfTex,
      bumpScale: 0.025,
      roughness: biomeTheme === "grid" ? 0.52 : 0.88,
    });
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(7.58, 7.65, 0.56, 64),
      groundMat
    );
    ground.position.y = 0.18;
    ground.receiveShadow = true;
    scene.add(ground);

    const ringRoadMat = new THREE.MeshStandardMaterial({
      color: pal.ringRoad,
      map: textures.cobbleMap,
      bumpMap: textures.cobbleMap,
      bumpScale: 0.02,
      roughness: 0.86,
    });
    const ringRoad = new THREE.Mesh(
      new THREE.RingGeometry(3.85, 4.9, 64),
      ringRoadMat
    );
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.47;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    const curbMat = new THREE.MeshStandardMaterial({
      color: "#cfc8bc",
      map: textures.stoneMap,
      roughness: 0.84,
    });
    [3.85, 4.9].forEach((curbR) => {
      const curb = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.036, 8, 64),
        curbMat
      );
      curb.rotation.x = Math.PI / 2;
      curb.position.y = 0.48;
      curb.receiveShadow = true;
      scene.add(curb);
    });

    const courtyardMat = new THREE.MeshStandardMaterial({
      color: pal.courtyard,
      map: textures.cobbleMap,
      roughness: 0.82,
    });
    const courtyard = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.5, 0.06, 48),
      courtyardMat
    );
    courtyard.position.y = 0.465;
    courtyard.receiveShadow = true;
    scene.add(courtyard);

    terrainMatsRef.current = {
      outerRim: outerRimMat,
      subRim: subRimMat,
      ground: groundMat,
      ringRoad: ringRoadMat,
      courtyard: courtyardMat,
      cliff: cliffMat,
    };

    // Empty Workshop Pedestal at Center (used cleanly for Agent Studio preview)
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.08, 0.12, 32),
      new THREE.MeshStandardMaterial({
        color: "#f8fafc",
        map: textures.stoneMap,
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
    const biomePropsLayer = new THREE.Group();
    biomePropsLayer.add(buildBiomePropsGroup(biomeTheme, textures));
    scene.add(vaultsLayer);
    scene.add(agentsLayer);
    scene.add(workshopLayer);
    scene.add(biomePropsLayer);
    vaultsLayerRef.current = vaultsLayer;
    agentsLayerRef.current = agentsLayer;
    workshopLayerRef.current = workshopLayer;
    biomePropsLayerRef.current = biomePropsLayer;

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

      const mood = marketMoodRef.current;
      lightingCtrl.applyMood(mood, delta, true);
      const stormIntensity =
        mood === "CAUTIOUS" ? 0.78 : mood === "BULLISH" ? 0.08 : 0.2;
      oceanEnv.update(elapsed, { delta, stormIntensity });

      // Gentle idle animation on custom vaults + articulated custom agents + workshop preview
      vaultsLayer.traverse((obj) => {
        if (obj.userData?.animateSpin) obj.rotation.y += delta * 1.4;
        if (obj.userData?.animateBob) obj.position.y = 0.98 + Math.sin(elapsed * 2.4) * 0.06;
      });
      const livePosMap: Record<string, THREE.Vector3> = {};
      agentsLayer.children.forEach((agGroup, idx) => {
        const rig = agGroup.userData?.rig as ArticulatedCharacterRig | undefined;
        const home = agGroup.userData?.homePos as THREE.Vector3 | undefined;
        if (rig && home) {
          const patrolDest = new THREE.Vector3(
            home.x + Math.sin(elapsed * 0.42 + idx * 1.7) * 0.28,
            home.y,
            home.z + Math.cos(elapsed * 0.36 + idx * 2.1) * 0.28
          );
          animateArticulatedCharacter(rig, patrolDest, delta, elapsed, idx + 1);
          if (typeof agGroup.userData?.agentIdStr === "string") {
            livePosMap[agGroup.userData.agentIdStr] = new THREE.Vector3(
              rig.group.position.x,
              rig.group.position.y + rig.bodyGroup.position.y,
              rig.group.position.z
            );
          }
        }
      });
      if (workshopLayer.children.length > 0 && workshopActiveRef.current) {
        const wRig = workshopLayer.children[0]?.userData?.rig as
          | ArticulatedCharacterRig
          | undefined;
        if (wRig) {
          animateArticulatedCharacter(
            wRig,
            new THREE.Vector3(0, 0.57, 0),
            delta,
            elapsed,
            0
          );
        }
        workshopLayer.rotation.y += delta * 0.65;
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
          const live = livePosMap[ag.agentId];
          const [ax, ay, az] = live
            ? [live.x, live.y, live.z]
            : AGENT_SLOT_COORDINATES[ag.spawnSlotIndex] || [0, 0.5, 0];
          nextAgents[ag.agentId] = project(
            new THREE.Vector3(ax, ay + 1.12 * (ag.scaleFactor || 1), az),
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
      textures.dispose();
      texturesRef.current = null;
      oceanEnvRef.current = null;
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Biome Palette, Terrain Texture, Ocean Colors & Props Reactively
  useEffect(() => {
    const pal = BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow;
    terrainMatsRef.current.outerRim?.color.set(pal.outerRim);
    terrainMatsRef.current.subRim?.color.set(pal.subRim);
    terrainMatsRef.current.ground?.color.set(pal.ground);
    terrainMatsRef.current.ringRoad?.color.set(pal.ringRoad);
    terrainMatsRef.current.courtyard?.color.set(pal.courtyard);
    terrainMatsRef.current.cliff?.color.set(
      biomeTheme === "basalt" || biomeTheme === "grid" ? "#334155" : "#9a9488"
    );

    const textures = texturesRef.current;
    const groundMat = terrainMatsRef.current.ground;
    if (textures && groundMat) {
      const nextTex =
        biomeTheme === "sand"
          ? textures.sandMap
          : biomeTheme === "grid"
          ? textures.gridMap
          : biomeTheme === "basalt"
          ? textures.stoneMap
          : textures.grassMap;
      groundMat.map = nextTex;
      groundMat.bumpMap = nextTex;
      groundMat.roughness = biomeTheme === "grid" ? 0.52 : 0.88;
      groundMat.needsUpdate = true;
    }

    oceanEnvRef.current?.updatePalette({
      waterColor: pal.waterColor,
      deepColor: pal.deepColor,
      fogColor: pal.fogColor,
    });

    const propsLayer = biomePropsLayerRef.current;
    if (propsLayer && textures) {
      while (propsLayer.children.length > 0) {
        const child = propsLayer.children[0];
        propsLayer.remove(child);
        disposeObjectTree(child);
      }
      propsLayer.add(buildBiomePropsGroup(biomeTheme, textures));
    }
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
        layer.add(buildVaultBuildingMesh(existing, texturesRef.current?.stoneMap));
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

    agents.forEach((agent, idx) => {
      const [ax, ay, az] =
        AGENT_SLOT_COORDINATES[agent.spawnSlotIndex] || AGENT_SLOT_COORDINATES[1];
      const homePos = new THREE.Vector3(ax, ay, az);
      const rig = buildCustomAgentMesh({
        chassis: agent.chassis,
        primaryColor: agent.primaryColor,
        secondaryColor: agent.secondaryColor,
        headgear: agent.headgear,
        scaleFactor: agent.scaleFactor,
        shadowBlobMap: texturesRef.current?.shadowBlobMap,
        startPos: homePos,
        blinkSeed: idx * 1.15 + 0.3,
      });
      rig.group.userData.agentIdStr = agent.agentId;
      rig.group.userData.rig = rig;
      rig.group.userData.homePos = homePos;
      layer.add(rig.group);
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
      const rig = buildCustomAgentMesh({
        chassis: workshopPreview.chassis,
        primaryColor: workshopPreview.primaryColor,
        secondaryColor: workshopPreview.secondaryColor,
        headgear: workshopPreview.headgear,
        scaleFactor: workshopPreview.scaleFactor,
        shadowBlobMap: texturesRef.current?.shadowBlobMap,
        startPos: new THREE.Vector3(0, 0.57, 0),
        blinkSeed: 0.25,
      });
      rig.group.userData.rig = rig;
      layer.add(rig.group);
    }
  }, [
    workshopPreview?.active,
    workshopPreview?.chassis,
    workshopPreview?.primaryColor,
    workshopPreview?.secondaryColor,
    workshopPreview?.headgear,
    workshopPreview?.scaleFactor,
  ]);

  const baseSkyGradient = (BIOME_PALETTES[biomeTheme] || BIOME_PALETTES.meadow).skyClass;
  const skyGradient =
    biomeTheme === "meadow"
      ? marketMood === "CAUTIOUS"
        ? "from-[#6f859d] via-[#9ab0c7] to-[#dce6f0]"
        : marketMood === "BULLISH"
        ? "from-[#6fb4f5] via-[#aee2ff] to-[#f4faff]"
        : baseSkyGradient
      : baseSkyGradient;

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-gradient-to-b ${skyGradient} transition-colors duration-1000`}
    >
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
