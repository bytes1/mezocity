"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ClayAgent,
  CyclePhase,
  ISLAND_STATIONS,
} from "@/lib/simulation-data";

interface ClayIslandSceneProps {
  agents: ClayAgent[];
  currentPhase: CyclePhase;
  selectedAgentId: number | null;
  onSelectAgent: (id: number) => void;
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  cameraResetTick?: number;
  vaultAlertState: "NORMAL" | "PASSED" | "BLOCKED" | "RECTIFIED";
  modelDecision?: "EXECUTE_DCA" | "RECTIFY_AND_EXECUTE" | "HOLD";
  headlineSpeech: string;
  dcaCountdown: string;
}

interface ProjectedOverlay {
  x: number;
  y: number;
  visible: boolean;
}

export function ClayIslandScene({
  agents,
  currentPhase,
  selectedAgentId,
  onSelectAgent,
  selectedStationId,
  onSelectStation,
  cameraResetTick = 0,
  vaultAlertState,
  modelDecision = "HOLD",
  headlineSpeech,
  dcaCountdown,
}: ClayIslandSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const phaseRef = useRef(currentPhase);
  phaseRef.current = currentPhase;

  const vaultAlertRef = useRef(vaultAlertState);
  vaultAlertRef.current = vaultAlertState;

  const decisionRef = useRef(modelDecision);
  decisionRef.current = modelDecision;

  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;

  const selectedStationIdRef = useRef(selectedStationId);
  selectedStationIdRef.current = selectedStationId;

  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;

  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;

  const desiredOrbitTargetRef = useRef<THREE.Vector3 | null>(null);
  const desiredCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const isCameraTweeningRef = useRef(false);
  const hasInitializedFocusRef = useRef(false);

  // Compute target 3D positions for the 5 Transformers agents
  const agentTargets = useMemo(() => {
    const map: Record<number, [number, number, number]> = {};
    const stationOffsets: Record<number, [number, number]> = {
      1: [-0.4, -1.55], // Optimus Prime near Central Mezo Astrolabe Citadel
      2: [-3.4, 0.55],  // Bumblebee right in front of the Golden Piggy DCA Vault
      3: [-2.6, 2.75],  // Ratchet right next to the Error Rectifier Crane Lab
      4: [3.2, 0.95],   // Ironhide guarding the Policy Vault Fortress
      5: [0.95, -3.75], // Soundwave right by the Lighthouse News Observatory
    };

    agents.forEach((agent) => {
      const st = ISLAND_STATIONS.find((s) => s.id === agent.currentStationId);
      if (st && agent.currentStationId !== agent.homeStationId) {
        const angle = agent.id * 1.4;
        map[agent.id] = [
          st.position[0] + Math.cos(angle) * 1.15,
          0.56,
          st.position[2] + Math.sin(angle) * 1.15,
        ];
      } else {
        const home = stationOffsets[agent.id] || [0, 0];
        map[agent.id] = [home[0], 0.56, home[1]];
      }
    });
    return map;
  }, [agents]);

  const agentTargetsRef = useRef(agentTargets);
  agentTargetsRef.current = agentTargets;

  // Smoothly pan & zoom OrbitControls toward selected 3D station or Autobot
  useEffect(() => {
    if (!hasInitializedFocusRef.current) {
      hasInitializedFocusRef.current = true;
      return;
    }

    if (selectedStationId) {
      const station = ISLAND_STATIONS.find((s) => s.id === selectedStationId);
      if (station) {
        const [sx, , sz] = station.position;
        desiredOrbitTargetRef.current = new THREE.Vector3(sx, 0.95, sz);
        desiredCameraPosRef.current = new THREE.Vector3(
          sx * 0.58,
          8.6,
          sz * 0.58 + 9.4
        );
        isCameraTweeningRef.current = true;
        return;
      }
    }

    if (selectedAgentId !== null) {
      const targetPos = agentTargetsRef.current[selectedAgentId] || [0, 0.56, 0];
      desiredOrbitTargetRef.current = new THREE.Vector3(
        targetPos[0],
        0.9,
        targetPos[2]
      );
      desiredCameraPosRef.current = new THREE.Vector3(
        targetPos[0] * 0.65,
        8.1,
        targetPos[2] * 0.65 + 8.8
      );
      isCameraTweeningRef.current = true;
      return;
    }

    // Reset back to full island overview
    desiredOrbitTargetRef.current = new THREE.Vector3(0, 0.4, 0.2);
    desiredCameraPosRef.current = new THREE.Vector3(0, 12.8, 15.2);
    isCameraTweeningRef.current = true;
  }, [selectedAgentId, selectedStationId, cameraResetTick]);

  const [stationCoords, setStationCoords] = useState<
    Record<string, ProjectedOverlay>
  >({});
  const [agentCoords, setAgentCoords] = useState<
    Record<number, ProjectedOverlay>
  >({});
  const [piggyTimerCoord, setPiggyTimerCoord] = useState<ProjectedOverlay>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [topBannerCoord, setTopBannerCoord] = useState<ProjectedOverlay>({
    x: 0,
    y: 0,
    visible: false,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer (Alpha true so CSS sky gradient shines through)
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 120);
    camera.position.set(0, 12.8, 15.2);

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

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 5.5;
    controls.maxPolarAngle = Math.PI / 2.5;
    controls.minDistance = 8;
    controls.maxDistance = 22;
    controls.target.set(0, 0.4, 0.2);
    const cancelFocusTween = () => {
      isCameraTweeningRef.current = false;
    };
    controls.addEventListener("start", cancelFocusTween);

    // 3. Soft Polly.town Toy-Diorama Lighting
    const ambientLight = new THREE.AmbientLight("#ffffff", 1.35);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight("#ffffff", "#9dc183", 0.75);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight("#fffbeb", 1.75);
    dirLight.position.set(11, 18, 11);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -11;
    dirLight.shadow.camera.right = 11;
    dirLight.shadow.camera.top = 11;
    dirLight.shadow.camera.bottom = -11;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // 4. Circular Island Base, Stone Rim, Grass Disc, Ring Road & Radial Paths
    const outerRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.95, 8.15, 0.48, 64),
      new THREE.MeshStandardMaterial({ color: "#bfbab0", roughness: 0.85 })
    );
    outerRim.position.y = 0.08;
    outerRim.castShadow = true;
    outerRim.receiveShadow = true;
    scene.add(outerRim);

    const grassSubRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.72, 7.82, 0.52, 64),
      new THREE.MeshStandardMaterial({ color: "#7ca35c", roughness: 0.85 })
    );
    grassSubRim.position.y = 0.14;
    grassSubRim.receiveShadow = true;
    scene.add(grassSubRim);

    const mainGrass = new THREE.Mesh(
      new THREE.CylinderGeometry(7.58, 7.65, 0.56, 64),
      new THREE.MeshStandardMaterial({ color: "#98bf75", roughness: 0.82 })
    );
    mainGrass.position.y = 0.18;
    mainGrass.receiveShadow = true;
    scene.add(mainGrass);

    const roadMat = new THREE.MeshStandardMaterial({
      color: "#d9bf9b",
      roughness: 0.86,
    });

    // Central Circular Cobblestone Plaza
    const centerPlaza = new THREE.Mesh(
      new THREE.CylinderGeometry(2.25, 2.3, 0.06, 48),
      roadMat
    );
    centerPlaza.position.y = 0.46;
    centerPlaza.receiveShadow = true;
    scene.add(centerPlaza);

    // Outer Ring Road (Flat Ring)
    const ringRoad = new THREE.Mesh(
      new THREE.RingGeometry(4.0, 4.75, 64),
      roadMat
    );
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.47;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    // 4 Radial Spoke Roads connecting Center Plaza to Outer Ring Road
    [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach((angle) => {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.04, 5.2),
        roadMat
      );
      spoke.position.set(
        Math.sin(angle) * 2.4,
        0.465,
        Math.cos(angle) * 2.4
      );
      spoke.rotation.y = angle;
      spoke.receiveShadow = true;
      scene.add(spoke);
    });

    // Wooden Pier Bridge on Bottom-Left (Matches screenshot 7 o'clock bridge)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-4.6, 0.42, 5.8);
    bridgeGroup.rotation.y = -0.58;
    const bridgeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.12, 2.2),
      new THREE.MeshStandardMaterial({ color: "#9c6b43", roughness: 0.85 })
    );
    bridgeDeck.castShadow = true;
    bridgeGroup.add(bridgeDeck);
    [-0.58, 0.58].forEach((rx) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 2.1),
        new THREE.MeshStandardMaterial({ color: "#7f5539", roughness: 0.85 })
      );
      rail.position.set(rx, 0.2, 0);
      bridgeGroup.add(rail);
    });
    scene.add(bridgeGroup);

    // 5. Centerpiece: Aura's 4-Tower Astrolabe Citadel with Exact Mezo Chain Logo on the Core Sphere
    const astrolabeGroup = new THREE.Group();
    astrolabeGroup.position.set(0, 0.48, 0);

    const MEZO_RIBBON_SVG_PATH =
      "M 62 512 L 278 512 C 278 432, 332 392, 396 392 C 445 392, 478 412, 510 444 L 566 508 C 566 432, 618 392, 682 392 C 732 392, 765 412, 796 444 L 852 512 L 924 512 C 924 590, 868 632, 804 632 C 754 632, 720 612, 688 580 L 636 512 C 636 590, 582 632, 518 632 C 468 632, 434 612, 402 580 L 348 512 L 284 580 C 252 612, 218 632, 174 632 C 108 632, 62 590, 62 512 Z";

    // High-DPI Equirectangular Texture for the Central Citadel Sphere with Exact Mezo Logo
    const createMezoSphereTexture = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2048;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Vibrant Mezo Crimson Red (#FF083B) base across the entire sphere
        ctx.fillStyle = "#FF083B";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const ribbonPath = new Path2D(MEZO_RIBBON_SVG_PATH);

        // Stamp the white Mezo ribbon on both the Front (x=512) and Back (x=1536) hemispheres
        [512, 1536].forEach((centerX) => {
          ctx.save();
          ctx.translate(centerX, 512);
          // Scale horizontally slightly narrower to compensate for spherical equirectangular projection near equator
          ctx.scale(0.54, 0.72);
          ctx.translate(-500, -500);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill(ribbonPath);
          ctx.restore();
        });
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    };

    const mezoSphereTex = createMezoSphereTexture();

    // Central Stone Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.68, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: "#d8d4cf", roughness: 0.75 })
    );
    ped.position.y = 0.22;
    ped.castShadow = true;
    astrolabeGroup.add(ped);

    // Central Mezo Chain Logo Orb inside the Two Golden Astrolabe Rings
    const coreOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.43, 40, 40),
      new THREE.MeshStandardMaterial({
        map: mezoSphereTex,
        roughness: 0.35,
        metalness: 0.04,
      })
    );
    coreOrb.position.y = 0.85;
    coreOrb.rotation.y = -Math.PI / 2; // Orient front Mezo ribbon directly toward camera (+Z)
    coreOrb.castShadow = true;
    astrolabeGroup.add(coreOrb);

    const gyroRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.04, 12, 40),
      new THREE.MeshStandardMaterial({ color: "#f4c54e", roughness: 0.4 })
    );
    gyroRing1.position.y = 0.85;
    astrolabeGroup.add(gyroRing1);

    const gyroRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.035, 12, 40),
      new THREE.MeshStandardMaterial({ color: "#e09f3e", roughness: 0.4 })
    );
    gyroRing2.position.y = 0.85;
    gyroRing2.rotation.x = Math.PI / 3;
    astrolabeGroup.add(gyroRing2);

    // 4 Corner Pastel Spires with Floating Gems
    const towerSpecs: {
      pos: [number, number];
      roof: string;
      gem: string;
    }[] = [
      { pos: [-1.05, -1.05], roof: "#5b85d9", gem: "#60a5fa" },
      { pos: [1.05, -1.05], roof: "#d96552", gem: "#f87171" },
      { pos: [-1.05, 1.05], roof: "#48a9a6", gem: "#34d399" },
      { pos: [1.05, 1.05], roof: "#8b5cf6", gem: "#c084fc" },
    ];
    const floatingGems: THREE.Mesh[] = [];

    towerSpecs.forEach((t) => {
      const spire = new THREE.Group();
      spire.position.set(t.pos[0], 0, t.pos[1]);

      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.28, 1.25, 16),
        new THREE.MeshStandardMaterial({ color: "#e6e1da", roughness: 0.78 })
      );
      col.position.y = 0.62;
      col.castShadow = true;
      spire.add(col);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.42, 16),
        new THREE.MeshStandardMaterial({ color: t.roof, roughness: 0.65 })
      );
      cone.position.y = 1.45;
      cone.castShadow = true;
      spire.add(cone);

      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.14, 0),
        new THREE.MeshStandardMaterial({
          color: t.gem,
          emissive: t.gem,
          emissiveIntensity: 0.4,
        })
      );
      gem.position.y = 1.85;
      floatingGems.push(gem);
      spire.add(gem);

      astrolabeGroup.add(spire);
    });

    // Citadel Verdict Aura Rings (reacts to EXECUTE_DCA / HOLD / RECTIFY_AND_EXECUTE)
    const verdictRingOuterMat = new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      emissive: "#f59e0b",
      emissiveIntensity: 0.75,
      roughness: 0.35,
    });
    const verdictRingOuter = new THREE.Mesh(
      new THREE.TorusGeometry(1.85, 0.085, 16, 64),
      verdictRingOuterMat
    );
    verdictRingOuter.rotation.x = Math.PI / 2;
    verdictRingOuter.position.y = 0.08;
    astrolabeGroup.add(verdictRingOuter);

    const verdictRingInnerMat = new THREE.MeshStandardMaterial({
      color: "#fbbf24",
      emissive: "#f59e0b",
      emissiveIntensity: 0.5,
      roughness: 0.35,
    });
    const verdictRingInner = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.05, 14, 64),
      verdictRingInnerMat
    );
    verdictRingInner.rotation.x = Math.PI / 2;
    verdictRingInner.position.y = 0.14;
    astrolabeGroup.add(verdictRingInner);

    const verdictPulseMat = new THREE.MeshBasicMaterial({
      color: "#10b981",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const verdictPulseWave = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.72, 48),
      verdictPulseMat
    );
    verdictPulseWave.rotation.x = -Math.PI / 2;
    verdictPulseWave.position.y = 0.04;
    astrolabeGroup.add(verdictPulseWave);

    const verdictPointLight = new THREE.PointLight("#f59e0b", 0.9, 6.5);
    verdictPointLight.position.set(0, 1.65, 0);
    astrolabeGroup.add(verdictPointLight);

    // Amber Shield Dome on Central Citadel (active when HOLD preserves capital)
    const holdShieldMat = new THREE.MeshStandardMaterial({
      color: "#f59e0b",
      emissive: "#d97706",
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.24,
      roughness: 0.2,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const holdShieldDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.92, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.52),
      holdShieldMat
    );
    holdShieldDome.position.y = 0.02;
    astrolabeGroup.add(holdShieldDome);

    const holdShieldWireMat = new THREE.MeshBasicMaterial({
      color: "#fde68a",
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    });
    const holdShieldWire = new THREE.Mesh(
      new THREE.SphereGeometry(1.95, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      holdShieldWireMat
    );
    holdShieldWire.position.y = 0.02;
    astrolabeGroup.add(holdShieldWire);

    astrolabeGroup.userData.stationId = "head_citadel";
    scene.add(astrolabeGroup);

    // 6. Top Landmark: Striped Purple & Cream Lighthouse + Town Status Chalkboard Sign
    const lighthouseGroup = new THREE.Group();
    lighthouseGroup.userData.stationId = "lighthouse_beacon";
    lighthouseGroup.position.set(0.35, 0.48, -5.2);

    const lhBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 0.9, 20),
      new THREE.MeshStandardMaterial({ color: "#b392dc", roughness: 0.78 })
    );
    lhBase.position.y = 0.45;
    lhBase.castShadow = true;
    lighthouseGroup.add(lhBase);

    const lhMid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.55, 0.85, 20),
      new THREE.MeshStandardMaterial({ color: "#f5ebd6", roughness: 0.78 })
    );
    lhMid.position.y = 1.32;
    lhMid.castShadow = true;
    lighthouseGroup.add(lhMid);

    const lhTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.46, 0.65, 20),
      new THREE.MeshStandardMaterial({ color: "#b392dc", roughness: 0.78 })
    );
    lhTop.position.y = 2.05;
    lhTop.castShadow = true;
    lighthouseGroup.add(lhTop);

    const lhLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.38, 16),
      new THREE.MeshStandardMaterial({
        color: "#fde68a",
        emissive: "#fbbf24",
        emissiveIntensity: 0.6,
      })
    );
    lhLantern.position.y = 2.55;
    lighthouseGroup.add(lhLantern);

    const lhRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: "#8b5cf6", roughness: 0.7 })
    );
    lhRoof.position.y = 2.95;
    lhRoof.castShadow = true;
    lighthouseGroup.add(lhRoof);
    scene.add(lighthouseGroup);

    // Town Status Chalkboard Sign (Top-Left of Lighthouse, just like screenshot)
    const signGroup = new THREE.Group();
    signGroup.position.set(-1.85, 0.48, -5.05);
    signGroup.rotation.y = 0.22;
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 1.05, 0.14),
      new THREE.MeshStandardMaterial({ color: "#2d3a2e", roughness: 0.85 })
    );
    signBoard.position.y = 1.1;
    signBoard.castShadow = true;
    signGroup.add(signBoard);
    const signFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.16, 0.2),
      new THREE.MeshStandardMaterial({ color: "#d9822b", roughness: 0.75 })
    );
    signFrame.position.y = 1.65;
    signGroup.add(signFrame);
    [-0.65, 0.65].forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.2, 10),
        new THREE.MeshStandardMaterial({ color: "#8d5b3c", roughness: 0.85 })
      );
      post.position.set(px, 0.6, 0);
      signGroup.add(post);
    });
    scene.add(signGroup);

    // Cozy Green-Roofed Cottage (Top-Left 10 o'clock in screenshot)
    const cottageGroup = new THREE.Group();
    cottageGroup.position.set(-4.2, 0.48, -3.5);
    cottageGroup.rotation.y = 0.45;
    const cotWalls = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.95, 1.2),
      new THREE.MeshStandardMaterial({ color: "#c2cfb2", roughness: 0.8 })
    );
    cotWalls.position.y = 0.48;
    cotWalls.castShadow = true;
    cottageGroup.add(cotWalls);
    const cotRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.75, 4),
      new THREE.MeshStandardMaterial({ color: "#689f4d", roughness: 0.75 })
    );
    cotRoof.position.y = 1.32;
    cotRoof.rotation.y = Math.PI / 4;
    cotRoof.castShadow = true;
    cottageGroup.add(cotRoof);
    scene.add(cottageGroup);

    // 7. Left Landmark: Kronos Golden Piggy-Bank DCA Vault (Exact match to 9 o'clock piggy bank in screenshot)
    const piggyGroup = new THREE.Group();
    piggyGroup.position.set(-5.25, 0.48, 0.45);
    piggyGroup.rotation.y = 0.35;

    const pigMat = new THREE.MeshStandardMaterial({
      color: "#f4c44e",
      roughness: 0.65,
    });
    const pigBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 24),
      pigMat
    );
    pigBody.scale.set(1.15, 0.95, 0.95);
    pigBody.position.y = 0.95;
    pigBody.castShadow = true;
    piggyGroup.add(pigBody);

    // Piggy Snout
    const snout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.36, 0.35, 18),
      new THREE.MeshStandardMaterial({ color: "#e5a93c", roughness: 0.7 })
    );
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(1.05, 0.9, 0);
    snout.castShadow = true;
    piggyGroup.add(snout);

    // Coin Slot on top of Piggy Bank + Golden BTC Coin
    const coinSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.08, 0.12),
      new THREE.MeshStandardMaterial({ color: "#5c4018" })
    );
    coinSlot.position.set(0, 1.82, 0);
    piggyGroup.add(coinSlot);

    const dcaCoin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20),
      new THREE.MeshStandardMaterial({
        color: "#ffd166",
        emissive: "#f59e0b",
        emissiveIntensity: 0.35,
      })
    );
    dcaCoin.rotation.x = Math.PI / 2;
    dcaCoin.position.set(0, 2.08, 0);
    piggyGroup.add(dcaCoin);

    // 4 Little Piggy Legs
    [
      [-0.45, -0.45],
      [0.45, -0.45],
      [-0.45, 0.45],
      [0.45, 0.45],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.14, 0.4, 12),
        pigMat
      );
      leg.position.set(lx, 0.2, lz);
      piggyGroup.add(leg);
    });
    piggyGroup.userData.stationId = "dca_piggy";
    scene.add(piggyGroup);

    // 8. Bottom-Left Landmark: Ratchet's Error Rectifier Lab & Yellow Diagnostic Crane
    const rectifierGroup = new THREE.Group();
    rectifierGroup.userData.stationId = "rectifier_lab";
    rectifierGroup.position.set(-4.35, 0.48, 3.6);

    const rectBlockMat = new THREE.MeshStandardMaterial({
      color: "#c5cbd3",
      roughness: 0.78,
    });
    const rectBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.15, 1.35),
      rectBlockMat
    );
    rectBlock.position.y = 0.58;
    rectBlock.castShadow = true;
    rectifierGroup.add(rectBlock);

    // Yellow Diagnostic Crane Mast & Boom
    const craneMat = new THREE.MeshStandardMaterial({
      color: "#f5b82e",
      roughness: 0.6,
    });
    const craneMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.09, 1.9, 12),
      craneMat
    );
    craneMast.position.set(-0.55, 1.1, -0.55);
    craneMast.castShadow = true;
    rectifierGroup.add(craneMast);

    const craneBoom = new THREE.Group();
    craneBoom.position.set(-0.55, 2.0, -0.55);
    const boomArm = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.1, 0.1),
      craneMat
    );
    boomArm.position.set(0.55, 0, 0);
    craneBoom.add(boomArm);
    rectifierGroup.add(craneBoom);

    // Status Halo above Rectifier Lab
    const rectifierRingMat = new THREE.MeshStandardMaterial({
      color: "#10b981",
      emissive: "#10b981",
      emissiveIntensity: 0.6,
    });
    const rectifierRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.055, 12, 32),
      rectifierRingMat
    );
    rectifierRing.position.set(0, 1.4, 0);
    rectifierRing.rotation.x = Math.PI / 2;
    rectifierGroup.add(rectifierRing);
    scene.add(rectifierGroup);

    // Cyan Healing Beam from Ratchet's Lab -> Central Mezo Citadel (active on RECTIFY_AND_EXECUTE)
    const beamStart = new THREE.Vector3(-4.35, 1.88, 3.6);
    const beamEnd = new THREE.Vector3(0, 1.33, 0);
    const beamVec = new THREE.Vector3().subVectors(beamEnd, beamStart);
    const beamLen = beamVec.length();
    const beamMid = new THREE.Vector3()
      .addVectors(beamStart, beamEnd)
      .multiplyScalar(0.5);
    const beamQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      beamVec.clone().normalize()
    );

    const healingBeamGroup = new THREE.Group();
    healingBeamGroup.visible = false;

    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: 0,
    });
    const beamCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, beamLen, 16),
      beamCoreMat
    );
    beamCore.position.copy(beamMid);
    beamCore.quaternion.copy(beamQuat);
    healingBeamGroup.add(beamCore);

    const beamSheathMat = new THREE.MeshBasicMaterial({
      color: "#06b6d4",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamSheath = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, beamLen, 16),
      beamSheathMat
    );
    beamSheath.position.copy(beamMid);
    beamSheath.quaternion.copy(beamQuat);
    healingBeamGroup.add(beamSheath);

    const beamOrbs: THREE.Mesh[] = [];
    const beamOrbGeo = new THREE.SphereGeometry(0.13, 14, 14);
    const beamOrbMat = new THREE.MeshBasicMaterial({
      color: "#ecfeff",
      transparent: true,
      opacity: 0,
    });
    for (let i = 0; i < 4; i++) {
      const orb = new THREE.Mesh(beamOrbGeo, beamOrbMat);
      healingBeamGroup.add(orb);
      beamOrbs.push(orb);
    }
    scene.add(healingBeamGroup);

    const colorEmerald = new THREE.Color("#10b981");
    const colorPurple = new THREE.Color("#8b5cf6");
    const colorAmber = new THREE.Color("#f59e0b");
    const colorAmberLight = new THREE.Color("#fbbf24");
    const colorCyan = new THREE.Color("#06b6d4");
    const colorCyanLight = new THREE.Color("#22d3ee");
    const colorBlend = new THREE.Color();

    // 9. Right Landmarks: Giant Spherical Treehouse (2 o'clock) + Sentinel Blue Policy Vault Tower (3 o'clock) + Terracotta House (4 o'clock)
    const bigTreeGroup = new THREE.Group();
    bigTreeGroup.position.set(3.2, 0.48, -3.7);
    const bigTrunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.48, 1.5, 14),
      new THREE.MeshStandardMaterial({ color: "#8d5b3c", roughness: 0.85 })
    );
    bigTrunk.position.y = 0.75;
    bigTrunk.castShadow = true;
    bigTreeGroup.add(bigTrunk);
    const bigCanopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 24, 24),
      new THREE.MeshStandardMaterial({ color: "#68b678", roughness: 0.78 })
    );
    bigCanopy.position.y = 2.05;
    bigCanopy.castShadow = true;
    bigTreeGroup.add(bigCanopy);
    scene.add(bigTreeGroup);

    // Ironhide Policy Fortress (Blue Shield Tower at 3 o'clock)
    const policyGroup = new THREE.Group();
    policyGroup.userData.stationId = "policy_fortress";
    policyGroup.position.set(4.95, 0.48, 0.8);
    const policyTowerMat = new THREE.MeshStandardMaterial({
      color: "#77aadd",
      roughness: 0.72,
    });
    const policyBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 1.65, 20),
      policyTowerMat
    );
    policyBody.position.y = 0.82;
    policyBody.castShadow = true;
    policyGroup.add(policyBody);
    const policyDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      policyTowerMat
    );
    policyDome.position.y = 1.64;
    policyDome.castShadow = true;
    policyGroup.add(policyDome);

    const policyShieldMat = new THREE.MeshStandardMaterial({
      color: "#3b82f6",
      emissive: "#3b82f6",
      emissiveIntensity: 0.5,
    });
    const policyShieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.06, 12, 32),
      policyShieldMat
    );
    policyShieldRing.position.set(0, 1.35, 0);
    policyShieldRing.rotation.x = Math.PI / 2;
    policyGroup.add(policyShieldRing);
    scene.add(policyGroup);

    // Warm Terracotta Cottage (4-5 o'clock in screenshot)
    const warmHouse = new THREE.Group();
    warmHouse.position.set(3.8, 0.48, 3.7);
    warmHouse.rotation.y = -0.5;
    const whWalls = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.85, 1.15),
      new THREE.MeshStandardMaterial({ color: "#f3e5d0", roughness: 0.8 })
    );
    whWalls.position.y = 0.42;
    whWalls.castShadow = true;
    warmHouse.add(whWalls);
    const whRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.08, 0.68, 4),
      new THREE.MeshStandardMaterial({ color: "#e59872", roughness: 0.75 })
    );
    whRoof.position.y = 1.18;
    whRoof.rotation.y = Math.PI / 4;
    whRoof.castShadow = true;
    warmHouse.add(whRoof);
    scene.add(warmHouse);

    // 10. Cute Round Lollipop Trees Dotted Around the Lawn (Just like screenshot)
    const treePositions: [number, number, string, number][] = [
      [-2.3, -2.5, "#5ca468", 0.9],
      [-3.1, -1.6, "#7bc47f", 0.75],
      [1.8, -2.6, "#5ca468", 0.85],
      [2.6, -1.5, "#8fd18e", 0.7],
      [-2.2, 2.1, "#5ca468", 0.85],
      [-1.4, 3.2, "#e59872", 0.75],
      [-3.0, 5.1, "#7bc47f", 0.8],
      [2.2, 2.2, "#5ca468", 0.85],
      [1.5, 3.4, "#7bc47f", 0.7],
      [2.8, 4.9, "#5ca468", 0.8],
    ];
    treePositions.forEach(([tx, tz, col, sc]) => {
      const t = new THREE.Group();
      t.position.set(tx, 0.48, tz);
      t.scale.setScalar(sc);
      const tr = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 0.38, 10),
        new THREE.MeshStandardMaterial({ color: "#8d5b3c", roughness: 0.85 })
      );
      tr.position.y = 0.19;
      tr.castShadow = true;
      t.add(tr);
      const cr = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 16, 16),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.78 })
      );
      cr.position.y = 0.52;
      cr.castShadow = true;
      t.add(cr);
      scene.add(t);
    });

    // 11. Build ONLY the 4 Real Functional Agents (Aura, Kronos, Patch, Sentinel)
    const agentMeshes: Record<
      number,
      { group: THREE.Group; currentPos: THREE.Vector3 }
    > = {};

    agentsRef.current.forEach((agent) => {
      const g = new THREE.Group();
      const initialTarget = agentTargetsRef.current[agent.id] || [0, 0.56, 0];
      const currentPos = new THREE.Vector3(
        initialTarget[0],
        initialTarget[1],
        initialTarget[2]
      );
      g.position.copy(currentPos);

      // Cute Chubby Clay Character Body (Matches screenshot characters!)
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.36, 22, 22),
        new THREE.MeshStandardMaterial({ color: agent.color, roughness: 0.62 })
      );
      body.scale.set(1, 1.08, 0.95);
      body.position.y = 0.38;
      body.castShadow = true;
      g.add(body);

      // Big Cute Eyes with White Sclera
      [-0.12, 0.12].forEach((ex) => {
        const whiteEye = new THREE.Mesh(
          new THREE.SphereGeometry(0.068, 12, 12),
          new THREE.MeshBasicMaterial({ color: "#ffffff" })
        );
        whiteEye.position.set(ex, 0.44, 0.31);
        g.add(whiteEye);

        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 10, 10),
          new THREE.MeshBasicMaterial({ color: "#1e1b18" })
        );
        pupil.position.set(ex, 0.44, 0.36);
        g.add(pupil);
      });

      // Distinct Headgear per Real Agent Role
      if (agent.archetype === "head") {
        // Aura: Black Beret & Antenna (Just like purple character in screenshot!)
        const beret = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.24, 0.1, 16),
          new THREE.MeshStandardMaterial({ color: "#1f242d", roughness: 0.7 })
        );
        beret.position.set(0, 0.76, 0);
        beret.rotation.z = -0.15;
        g.add(beret);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8),
          new THREE.MeshStandardMaterial({ color: "#1f242d" })
        );
        stem.position.set(0, 0.88, 0);
        g.add(stem);
      } else if (agent.archetype === "dca") {
        // Kronos: Golden DCA Sprout Leaf on Head (Like yellow character by Piggy Bank!)
        const leaf = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.24, 8),
          new THREE.MeshStandardMaterial({ color: "#4d9057", roughness: 0.7 })
        );
        leaf.position.set(0, 0.82, 0);
        leaf.rotation.z = 0.25;
        g.add(leaf);
      } else if (agent.archetype === "rectifier") {
        // Patch: Headset / Diagnostic Visor Arch (Like teal character with headphones in screenshot!)
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.37, 0.035, 10, 24, Math.PI),
          new THREE.MeshStandardMaterial({ color: "#1f242d", roughness: 0.5 })
        );
        band.position.set(0, 0.42, 0);
        g.add(band);
      } else if (agent.archetype === "sentinel") {
        // Ironhide: Guardian Cannon Crest
        const crest = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.14, 0),
          new THREE.MeshStandardMaterial({
            color: "#fde68a",
            emissive: "#f59e0b",
            emissiveIntensity: 0.3,
          })
        );
        crest.position.set(0, 0.86, 0);
        g.add(crest);
      } else if (agent.archetype === "news") {
        // Soundwave: Comms Dish & Golden News Halo
        const topknot = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 14, 14),
          new THREE.MeshStandardMaterial({ color: "#fbbf24", roughness: 0.5 })
        );
        topknot.position.set(0, 0.81, 0);
        g.add(topknot);

        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.025, 10, 24),
          new THREE.MeshStandardMaterial({
            color: "#fef08a",
            emissive: "#f59e0b",
            emissiveIntensity: 0.45,
          })
        );
        halo.position.set(0, 0.93, 0);
        halo.rotation.x = Math.PI / 2;
        g.add(halo);
      }

      g.userData.agentId = agent.id;
      scene.add(g);
      agentMeshes[agent.id] = { group: g, currentPos };
    });

    // Selection Halo Ring on the Ground (follows selected 3D Autobot or Station)
    const selectionRingMat = new THREE.MeshBasicMaterial({
      color: "#8b5cf6",
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.78, 36),
      selectionRingMat
    );
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.set(0, 0.52, 0);
    selectionRing.visible = false;
    scene.add(selectionRing);

    // 3D Raycasting for direct clicking/hovering on Autobots and Island Stations
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const interactiveRoots: THREE.Object3D[] = [
      ...Object.values(agentMeshes).map((m) => m.group),
      astrolabeGroup,
      lighthouseGroup,
      piggyGroup,
      rectifierGroup,
      policyGroup,
    ];
    let pointerDownPos: { x: number; y: number } | null = null;
    let lastHoverCheck = 0;

    const findInteractiveTarget = (
      clientX: number,
      clientY: number
    ): { agentId?: number; stationId?: string } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactiveRoots, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (typeof node.userData?.agentId === "number") {
            return { agentId: node.userData.agentId };
          }
          if (typeof node.userData?.stationId === "string") {
            return { stationId: node.userData.stationId };
          }
          node = node.parent;
        }
      }
      return null;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      pointerDownPos = null;
      if (dist > 6) return; // Ignore OrbitControls drag gestures
      const hit = findInteractiveTarget(e.clientX, e.clientY);
      if (hit?.agentId !== undefined) {
        onSelectAgentRef.current(hit.agentId);
      } else if (hit?.stationId) {
        onSelectStationRef.current(hit.stationId);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 60) return;
      lastHoverCheck = now;
      const hit = findInteractiveTarget(e.clientX, e.clientY);
      renderer.domElement.style.cursor = hit ? "pointer" : "";
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);

    const projectToScreen = (
      worldPos: THREE.Vector3,
      w: number,
      h: number
    ): ProjectedOverlay => {
      const vec = worldPos.clone().project(camera);
      const x = (vec.x * 0.5 + 0.5) * w;
      const y = (-(vec.y * 0.5) + 0.5) * h;
      return {
        x,
        y,
        visible:
          vec.z < 1 && x >= -100 && x <= w + 100 && y >= -100 && y <= h + 100,
      };
    };

    // 12. Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let lastOverlayUpdate = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controls.update();

      // Rotate Astrolabe Rings, Mezo Core Orb & Floating Spire Gems
      coreOrb.rotation.y = -Math.PI / 2 + Math.sin(elapsed * 0.7) * 0.22;
      gyroRing1.rotation.y += delta * 0.9;
      gyroRing1.rotation.x = Math.sin(elapsed * 0.8) * 0.4;
      gyroRing2.rotation.z += delta * 1.1;

      floatingGems.forEach((gem, idx) => {
        gem.rotation.y += delta * 1.6;
        gem.position.y = 1.85 + Math.sin(elapsed * 2.5 + idx) * 0.07;
      });

      // Animate DCA Coin above Golden Piggy Bank
      dcaCoin.rotation.z += delta * 2.0;
      dcaCoin.position.y = 2.08 + Math.sin(elapsed * 3.2) * 0.08;

      // Rotate Patch's Diagnostic Crane Boom when rectifying or active
      const decision = decisionRef.current;
      const alertState = vaultAlertRef.current;
      const isRectifying =
        decision === "RECTIFY_AND_EXECUTE" || alertState === "RECTIFIED";

      craneBoom.rotation.y = isRectifying
        ? Math.sin(elapsed * 2.4) * 0.75
        : Math.sin(elapsed * 0.9) * 0.55;

      // Alert states on Policy Vault & Rectifier Lab
      if (alertState === "BLOCKED") {
        policyShieldMat.color.set("#ef4444");
        policyShieldMat.emissive.set("#ef4444");
        rectifierRingMat.color.set("#f59e0b");
        rectifierRingMat.emissive.set("#f59e0b");
        rectifierRingMat.emissiveIntensity = 0.6;
      } else if (isRectifying) {
        policyShieldMat.color.set("#10b981");
        policyShieldMat.emissive.set("#10b981");
        rectifierRingMat.color.copy(colorCyanLight);
        rectifierRingMat.emissive.copy(colorCyan);
        rectifierRingMat.emissiveIntensity = 0.85 + 0.45 * Math.sin(elapsed * 5);
      } else {
        policyShieldMat.color.set("#3b82f6");
        policyShieldMat.emissive.set("#3b82f6");
        rectifierRingMat.color.set("#10b981");
        rectifierRingMat.emissive.set("#10b981");
        rectifierRingMat.emissiveIntensity = 0.6;
      }

      // Verdict Aura Ring & Amber Shield Dome on Central Mezo Citadel
      verdictRingOuter.rotation.z = elapsed * 0.35;
      verdictRingInner.rotation.z = -elapsed * 0.55;

      if (decision === "EXECUTE_DCA") {
        const wave = 0.5 + 0.5 * Math.sin(elapsed * 3.0);
        colorBlend.copy(colorEmerald).lerp(colorPurple, wave);
        verdictRingOuterMat.color.copy(colorBlend);
        verdictRingOuterMat.emissive.copy(colorBlend);
        verdictRingOuterMat.emissiveIntensity = 0.9 + 0.45 * Math.sin(elapsed * 3.4);

        verdictRingInnerMat.color.copy(colorPurple).lerp(colorEmerald, wave);
        verdictRingInnerMat.emissive.copy(verdictRingInnerMat.color);
        verdictRingInnerMat.emissiveIntensity = 0.85;

        verdictPointLight.color.copy(colorBlend);
        verdictPointLight.intensity = 1.45 + 0.4 * Math.sin(elapsed * 3.0);

        const pulsePhase = (elapsed * 0.75) % 1;
        const pulseScale = 1 + pulsePhase * 0.48;
        verdictPulseWave.scale.set(pulseScale, pulseScale, 1);
        verdictPulseMat.color.copy(colorBlend);
        verdictPulseMat.opacity = (1 - pulsePhase) * 0.58;

        holdShieldMat.opacity += (0 - holdShieldMat.opacity) * 0.12;
        holdShieldWireMat.opacity += (0 - holdShieldWireMat.opacity) * 0.12;
      } else if (isRectifying) {
        const cyanPulse = 0.95 + 0.5 * Math.sin(elapsed * 4.4);
        verdictRingOuterMat.color.copy(colorCyanLight);
        verdictRingOuterMat.emissive.copy(colorCyan);
        verdictRingOuterMat.emissiveIntensity = cyanPulse;

        verdictRingInnerMat.color.copy(colorCyan);
        verdictRingInnerMat.emissive.copy(colorCyanLight);
        verdictRingInnerMat.emissiveIntensity = 0.95;

        verdictPointLight.color.copy(colorCyanLight);
        verdictPointLight.intensity = 1.65 + 0.45 * Math.sin(elapsed * 4.5);

        const pulsePhase = (elapsed * 1.05) % 1;
        const pulseScale = 1 + pulsePhase * 0.45;
        verdictPulseWave.scale.set(pulseScale, pulseScale, 1);
        verdictPulseMat.color.copy(colorCyanLight);
        verdictPulseMat.opacity = (1 - pulsePhase) * 0.62;

        holdShieldMat.opacity += (0 - holdShieldMat.opacity) * 0.14;
        holdShieldWireMat.opacity += (0 - holdShieldWireMat.opacity) * 0.14;
      } else {
        // HOLD: Amber Shield Dome protecting Central Citadel
        verdictRingOuterMat.color.copy(colorAmber);
        verdictRingOuterMat.emissive.copy(colorAmber);
        verdictRingOuterMat.emissiveIntensity = 0.65 + 0.2 * Math.sin(elapsed * 1.8);

        verdictRingInnerMat.color.copy(colorAmberLight);
        verdictRingInnerMat.emissive.copy(colorAmber);
        verdictRingInnerMat.emissiveIntensity = 0.55;

        verdictPointLight.color.copy(colorAmber);
        verdictPointLight.intensity = 1.05 + 0.25 * Math.sin(elapsed * 1.8);

        verdictPulseMat.opacity += (0 - verdictPulseMat.opacity) * 0.14;

        const targetDomeOpacity = 0.22 + 0.06 * Math.sin(elapsed * 2.2);
        const targetWireOpacity = 0.26 + 0.08 * Math.sin(elapsed * 2.2);
        holdShieldMat.opacity += (targetDomeOpacity - holdShieldMat.opacity) * 0.1;
        holdShieldWireMat.opacity += (targetWireOpacity - holdShieldWireMat.opacity) * 0.1;
        holdShieldWire.rotation.y = elapsed * 0.18;
      }

      holdShieldDome.visible = holdShieldMat.opacity > 0.01;
      holdShieldWire.visible = holdShieldWireMat.opacity > 0.01;

      // Cyan Healing Beam from Ratchet's Lab -> Central Citadel
      const targetCoreOpacity = isRectifying ? 0.85 : 0;
      const targetSheathOpacity = isRectifying
        ? 0.34 + 0.14 * Math.sin(elapsed * 6)
        : 0;
      const targetOrbOpacity = isRectifying ? 0.95 : 0;

      beamCoreMat.opacity += (targetCoreOpacity - beamCoreMat.opacity) * 0.14;
      beamSheathMat.opacity += (targetSheathOpacity - beamSheathMat.opacity) * 0.14;
      beamOrbMat.opacity += (targetOrbOpacity - beamOrbMat.opacity) * 0.14;
      healingBeamGroup.visible = beamCoreMat.opacity > 0.01;

      if (healingBeamGroup.visible) {
        beamOrbs.forEach((orb, idx) => {
          const t = (elapsed * 0.9 + idx * 0.25) % 1;
          orb.position.lerpVectors(beamStart, beamEnd, t);
          const s = 0.85 + 0.38 * Math.sin(t * Math.PI);
          orb.scale.setScalar(s);
        });
      }

      // Smoothly move & bob the 4 real agents
      agentsRef.current.forEach((ag) => {
        const entry = agentMeshes[ag.id];
        if (!entry) return;
        const target = agentTargetsRef.current[ag.id] || [0, 0.56, 0];
        const dest = new THREE.Vector3(target[0], target[1], target[2]);
        entry.currentPos.lerp(dest, Math.min(1, delta * 3.0));

        const bob = Math.abs(Math.sin(elapsed * 4.8 + ag.id * 1.5)) * 0.12;
        entry.group.position.set(
          entry.currentPos.x,
          entry.currentPos.y + bob,
          entry.currentPos.z
        );
        entry.group.rotation.y = Math.sin(elapsed * 1.4 + ag.id) * 0.3;
      });

      // Smoothly glide OrbitControls toward selected 3D Station or Autobot
      if (
        isCameraTweeningRef.current &&
        desiredOrbitTargetRef.current &&
        desiredCameraPosRef.current
      ) {
        const lerpAlpha = Math.min(1, delta * 4.2);
        controls.target.lerp(desiredOrbitTargetRef.current, lerpAlpha);
        camera.position.lerp(desiredCameraPosRef.current, lerpAlpha);
        if (
          controls.target.distanceTo(desiredOrbitTargetRef.current) < 0.04 &&
          camera.position.distanceTo(desiredCameraPosRef.current) < 0.06
        ) {
          isCameraTweeningRef.current = false;
        }
      }

      // Highlight selected Autobot or Station with pulsing ground ring
      const activeStationId = selectedStationIdRef.current;
      const activeAgentId = selectedAgentIdRef.current;
      if (activeStationId) {
        const st = ISLAND_STATIONS.find((s) => s.id === activeStationId);
        if (st) {
          selectionRing.visible = true;
          selectionRing.position.set(st.position[0], 0.52, st.position[2]);
          const pulse = 1.9 + Math.sin(elapsed * 4) * 0.14;
          selectionRing.scale.set(pulse, pulse, 1);
          selectionRingMat.color.set(st.color);
          selectionRingMat.opacity = 0.72 + Math.sin(elapsed * 4) * 0.18;
        } else {
          selectionRing.visible = false;
        }
      } else if (activeAgentId !== null && agentMeshes[activeAgentId]) {
        const pos = agentMeshes[activeAgentId].currentPos;
        const ag = agentsRef.current.find((a) => a.id === activeAgentId);
        selectionRing.visible = true;
        selectionRing.position.set(pos.x, 0.52, pos.z);
        const pulse = 0.92 + Math.sin(elapsed * 4.5) * 0.12;
        selectionRing.scale.set(pulse, pulse, 1);
        selectionRingMat.color.set(ag?.color || "#8b5cf6");
        selectionRingMat.opacity = 0.78 + Math.sin(elapsed * 4.5) * 0.18;
      } else {
        selectionRing.visible = false;
      }

      renderer.render(scene, camera);

      if (elapsed - lastOverlayUpdate > 0.05) {
        lastOverlayUpdate = elapsed;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        const nextStations: Record<string, ProjectedOverlay> = {};
        ISLAND_STATIONS.forEach((st) => {
          nextStations[st.id] = projectToScreen(
            new THREE.Vector3(
              st.position[0],
              st.position[1] + 2.35,
              st.position[2]
            ),
            w,
            h
          );
        });
        setStationCoords(nextStations);

        const nextAgents: Record<number, ProjectedOverlay> = {};
        agentsRef.current.forEach((ag) => {
          const entry = agentMeshes[ag.id];
          if (entry) {
            nextAgents[ag.id] = projectToScreen(
              new THREE.Vector3(
                entry.group.position.x,
                entry.group.position.y + 1.05,
                entry.group.position.z
              ),
              w,
              h
            );
          }
        });
        setAgentCoords(nextAgents);

        setPiggyTimerCoord(
          projectToScreen(new THREE.Vector3(-4.1, 1.35, 0.45), w, h)
        );
        setTopBannerCoord(
          projectToScreen(new THREE.Vector3(0.1, 3.85, -5.0), w, h)
        );
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
      controls.removeEventListener("start", cancelFocusTween);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-gradient-to-b from-[#98cbf6] via-[#c7e4fd] to-[#eef7ff]">
      {/* Stylized Fluffy White Clay Clouds in the Sky (Matching Polly.town screenshot) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[11%] left-[56%] w-44 h-20 rounded-full bg-white/90 shadow-[0_12px_30px_rgba(120,165,210,0.25)] blur-[0.5px]" />
        <div className="absolute top-[9%] left-[59%] w-28 h-24 rounded-full bg-white/95" />
        <div className="absolute top-[33%] left-[5%] w-40 h-16 rounded-full bg-white/85 shadow-[0_10px_25px_rgba(120,165,210,0.2)]" />
        <div className="absolute top-[30%] left-[7%] w-24 h-20 rounded-full bg-white/90" />
        <div className="absolute bottom-[12%] left-[8%] w-52 h-24 rounded-full bg-white/90 shadow-[0_14px_30px_rgba(120,165,210,0.22)]" />
        <div className="absolute bottom-[15%] left-[12%] w-32 h-28 rounded-full bg-white/95" />
        <div className="absolute bottom-[14%] right-[24%] w-44 h-20 rounded-full bg-white/85 shadow-[0_12px_28px_rgba(120,165,210,0.2)]" />
      </div>

      {/* Three.js WebGL Mount Container */}
      <div
        ref={containerRef}
        className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* 3D-Projected Floating Pills & Agent Labels */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {/* Top White Speech Bubble Pill above Lighthouse (Exact match to "All quiet..." pill in screenshot) */}
        {topBannerCoord.visible && (
          <div
            style={{
              transform: `translate3d(${topBannerCoord.x}px, ${topBannerCoord.y}px, 0) translate(-50%, -50%)`,
            }}
            className="absolute left-0 top-0 rounded-2xl bg-white/95 px-4 py-2 text-xs font-semibold text-[#2d2620] shadow-[0_8px_24px_rgba(45,38,32,0.12)] border border-white whitespace-nowrap"
          >
            {headlineSpeech}
          </div>
        )}

        {/* Golden Piggy Bank DCA Countdown Timer Pill (Exact match to "⏱ 7:41:45" pill in screenshot) */}
        {piggyTimerCoord.visible && (
          <button
            onClick={() => onSelectStation("dca_piggy")}
            style={{
              transform: `translate3d(${piggyTimerCoord.x}px, ${piggyTimerCoord.y}px, 0) translate(-50%, -50%)`,
            }}
            className="pointer-events-auto absolute left-0 top-0 flex items-center gap-1.5 rounded-full bg-[#fdf6e2]/95 px-2.5 py-1 text-[11px] font-extrabold text-[#4a3718] shadow-md border border-[#e6d09c] hover:scale-105 transition-transform"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            <span>⏱ {dcaCountdown}</span>
          </button>
        )}

        {/* 4 Real AI-Connected Agents (Aura, Kronos, Patch, Sentinel) */}
        {agents.map((agent) => {
          const coord = agentCoords[agent.id];
          if (!coord || !coord.visible) return null;
          const isSelected = selectedAgentId === agent.id;

          return (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -100%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 cursor-pointer flex flex-col items-center group ${
                isSelected ? "z-30" : "z-20"
              }`}
            >
              {isSelected && (
                <div className="mb-1.5 max-w-[210px] rounded-2xl bg-white/95 text-[#2d2620] px-3 py-1.5 text-[11px] leading-snug font-semibold shadow-xl border-2 border-[#8b5cf6] text-center">
                  <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#7c3aed] mb-0.5">
                    {agent.aiProviderBadge}
                  </div>
                  “{agent.speechBubble}”
                </div>
              )}
              <div
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold tracking-tight shadow-md border transition-transform flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-[#231f20] text-white border-[#c4b5fd] scale-110"
                    : "bg-white/95 text-[#231f20] border-white/80 group-hover:scale-105"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
                <span>{agent.name}</span>
                <span className="text-[9px] opacity-70 font-semibold">
                  ({agent.role.split(" ")[0]})
                </span>
              </div>
            </div>
          );
        })}

        {/* Station Badges */}
        {ISLAND_STATIONS.map((station) => {
          const coord = stationCoords[station.id];
          if (!coord || !coord.visible) return null;
          const isActive = station.phase === currentPhase;
          const isSelected = selectedStationId === station.id;

          const isCitadel = station.id === "head_citadel";
          const isRectifiedVisual =
            modelDecision === "RECTIFY_AND_EXECUTE" ||
            vaultAlertState === "RECTIFIED";
          const citadelVerdictBadge = !isCitadel
            ? null
            : isRectifiedVisual
            ? {
                label: "CYAN HEAL",
                cls: "bg-cyan-500/20 text-cyan-800 border-cyan-400/50",
                dot: "bg-cyan-400",
              }
            : modelDecision === "EXECUTE_DCA"
            ? {
                label: "DCA PULSE",
                cls: "bg-emerald-500/20 text-emerald-800 border-emerald-400/50",
                dot: "bg-emerald-400",
              }
            : {
                label: "HOLD SHIELD",
                cls: "bg-amber-500/20 text-amber-800 border-amber-400/50",
                dot: "bg-amber-400",
              };

          return (
            <button
              key={station.id}
              onClick={() => onSelectStation(station.id)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap transition-all border shadow-md flex items-center gap-1.5 ${
                isActive
                  ? "bg-[#7c3aed] text-white border-white scale-105"
                  : isSelected
                  ? "bg-[#231f20] text-white border-white"
                  : "bg-white/95 text-[#231f20] border-white hover:bg-white"
              }`}
            >
              {isCitadel && (
                <svg
                  viewBox="0 0 1000 1000"
                  className="h-4 w-4 shrink-0 rounded-full shadow-sm"
                >
                  <circle cx="500" cy="500" r="495" fill="#FF083B" />
                  <path
                    fill="#FFFFFF"
                    d="M 62 512 L 278 512 C 278 432, 332 392, 396 392 C 445 392, 478 412, 510 444 L 566 508 C 566 432, 618 392, 682 392 C 732 392, 765 412, 796 444 L 852 512 L 924 512 C 924 590, 868 632, 804 632 C 754 632, 720 612, 688 580 L 636 512 C 636 590, 582 632, 518 632 C 468 632, 434 612, 402 580 L 348 512 L 284 580 C 252 612, 218 632, 174 632 C 108 632, 62 590, 62 512 Z"
                  />
                </svg>
              )}
              <span>{station.name}</span>
              {citadelVerdictBadge && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-black border ${
                    isActive || isSelected
                      ? "bg-white/20 text-white border-white/40"
                      : citadelVerdictBadge.cls
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full animate-pulse ${citadelVerdictBadge.dot}`}
                  />
                  {citadelVerdictBadge.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
