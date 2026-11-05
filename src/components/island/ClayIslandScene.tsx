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
  vaultAlertState: "NORMAL" | "PASSED" | "BLOCKED";
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
  vaultAlertState,
}: ClayIslandSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store latest props in refs so the 60fps animation loop always reads fresh state
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const phaseRef = useRef(currentPhase);
  phaseRef.current = currentPhase;

  const vaultAlertRef = useRef(vaultAlertState);
  vaultAlertRef.current = vaultAlertState;

  // Compute target 3D coordinates around each agent's current station
  const agentTargets = useMemo(() => {
    const map: Record<number, [number, number, number]> = {};
    const stationCounts: Record<string, number> = {};

    agents.forEach((agent) => {
      const st =
        ISLAND_STATIONS.find((s) => s.id === agent.currentStationId) ||
        ISLAND_STATIONS[3];
      const idx = stationCounts[st.id] || 0;
      stationCounts[st.id] = idx + 1;

      const angle = (idx * Math.PI * 2) / 3 + agent.id * 0.7;
      const radius = 1.28;
      map[agent.id] = [
        st.position[0] + Math.cos(angle) * radius,
        0.55,
        st.position[2] + Math.sin(angle) * radius,
      ];
    });
    return map;
  }, [agents]);

  const agentTargetsRef = useRef(agentTargets);
  agentTargetsRef.current = agentTargets;

  // Projected 2D coordinates for floating HTML station pills & agent speech bubbles
  const [stationCoords, setStationCoords] = useState<
    Record<string, ProjectedOverlay>
  >({});
  const [agentCoords, setAgentCoords] = useState<
    Record<number, ProjectedOverlay>
  >({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d8ece8");
    scene.fog = new THREE.Fog("#d8ece8", 22, 44);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 11.5, 13.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
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
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.45;
    controls.minDistance = 8;
    controls.maxDistance = 21;
    controls.target.set(0, 0.6, 0);

    // 3. Warm Tabletop Clay Lighting
    const ambientLight = new THREE.AmbientLight("#fff8eb", 1.25);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight("#fff5e4", "#b39c82", 0.85);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight("#fff3db", 1.85);
    dirLight.position.set(10, 16, 9);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    scene.add(dirLight);

    // 4. Ocean, Foam & Sculpted Clay Island Tiers
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: "#8ecae6", roughness: 0.65 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.55;
    ocean.receiveShadow = true;
    scene.add(ocean);

    const foamRing = new THREE.Mesh(
      new THREE.CylinderGeometry(9.8, 10.4, 0.22, 48),
      new THREE.MeshStandardMaterial({ color: "#bde0fe", roughness: 0.8 })
    );
    foamRing.position.y = -0.38;
    foamRing.receiveShadow = true;
    scene.add(foamRing);

    const islandBase = new THREE.Mesh(
      new THREE.CylinderGeometry(8.9, 9.5, 0.65, 40),
      new THREE.MeshStandardMaterial({ color: "#e6ccb2", roughness: 0.86 })
    );
    islandBase.position.y = -0.1;
    islandBase.castShadow = true;
    islandBase.receiveShadow = true;
    scene.add(islandBase);

    const islandPlateau = new THREE.Mesh(
      new THREE.CylinderGeometry(8.1, 8.6, 0.42, 40),
      new THREE.MeshStandardMaterial({ color: "#a3b18a", roughness: 0.85 })
    );
    islandPlateau.position.y = 0.32;
    islandPlateau.castShadow = true;
    islandPlateau.receiveShadow = true;
    scene.add(islandPlateau);

    const centralPlaza = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.6, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: "#ede0d4", roughness: 0.88 })
    );
    centralPlaza.position.y = 0.54;
    centralPlaza.receiveShadow = true;
    scene.add(centralPlaza);

    // 5. Clay Trees Helper
    const addClayTree = (
      pos: [number, number, number],
      scale: number,
      foliageColor: string
    ) => {
      const tree = new THREE.Group();
      tree.position.set(pos[0], pos[1], pos[2]);
      tree.scale.setScalar(scale);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.14, 0.5, 10),
        new THREE.MeshStandardMaterial({ color: "#8d6346", roughness: 0.85 })
      );
      trunk.position.y = 0.25;
      trunk.castShadow = true;
      tree.add(trunk);

      const foliageMat = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.75,
      });
      const puff1 = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.38, 1),
        foliageMat
      );
      puff1.position.y = 0.62;
      puff1.castShadow = true;
      tree.add(puff1);

      const puff2 = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.26, 1),
        foliageMat
      );
      puff2.position.set(0.05, 0.95, -0.04);
      puff2.castShadow = true;
      tree.add(puff2);

      scene.add(tree);
    };

    addClayTree([-7.1, 0.5, -0.6], 1.1, "#588157");
    addClayTree([-6.4, 0.5, -5.1], 0.9, "#6b9e78");
    addClayTree([6.7, 0.5, -1.0], 1.15, "#588157");
    addClayTree([6.2, 0.5, -4.8], 0.85, "#84a98c");
    addClayTree([-2.6, 0.5, -5.8], 1.0, "#52796f");
    addClayTree([2.5, 0.5, -5.7], 0.95, "#6b9e78");
    addClayTree([-6.5, 0.5, 4.4], 0.9, "#588157");
    addClayTree([6.4, 0.5, 4.6], 1.0, "#84a98c");

    // 6. Build the 6 Island Stations
    let radarGroup: THREE.Group | null = null;
    let councilCrystal: THREE.Mesh | null = null;
    let vaultShieldRing: THREE.Mesh | null = null;
    let vaultShieldMat: THREE.MeshStandardMaterial | null = null;
    let vaultCubeMat: THREE.MeshStandardMaterial | null = null;
    const stationHalos: Record<string, THREE.Mesh> = {};

    ISLAND_STATIONS.forEach((station) => {
      const group = new THREE.Group();
      group.position.set(
        station.position[0],
        station.position[1],
        station.position[2]
      );

      // Clay Pad
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.45, 1.62, 0.18, 24),
        new THREE.MeshStandardMaterial({ color: "#dfd3c0", roughness: 0.8 })
      );
      pad.position.y = 0.08;
      pad.castShadow = true;
      pad.receiveShadow = true;
      group.add(pad);

      // Active Halo Ring
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(1.48, 1.68, 32),
        new THREE.MeshBasicMaterial({
          color: "#e06d53",
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.19;
      group.add(halo);
      stationHalos[station.id] = halo;

      if (station.id === "lighthouse") {
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.68, 1.5, 16),
          new THREE.MeshStandardMaterial({
            color: station.color,
            roughness: 0.78,
          })
        );
        tower.position.y = 0.9;
        tower.castShadow = true;
        group.add(tower);

        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.56, 0.35, 16),
          new THREE.MeshStandardMaterial({
            color: station.roofColor,
            roughness: 0.75,
          })
        );
        stripe.position.y = 1.0;
        group.add(stripe);

        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(0.56, 0.55, 16),
          new THREE.MeshStandardMaterial({
            color: station.roofColor,
            roughness: 0.7,
          })
        );
        roof.position.y = 1.82;
        roof.castShadow = true;
        group.add(roof);

        radarGroup = new THREE.Group();
        radarGroup.position.set(0, 2.2, 0);
        const dish = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.08, 0.12, 12),
          new THREE.MeshStandardMaterial({
            color: "#f6bd60",
            emissive: "#f6bd60",
            emissiveIntensity: 0.35,
          })
        );
        dish.rotation.x = 0.4;
        radarGroup.add(dish);
        group.add(radarGroup);
      } else if (station.id === "observatory") {
        const base = new THREE.Mesh(
          new THREE.CylinderGeometry(0.85, 0.95, 0.9, 18),
          new THREE.MeshStandardMaterial({
            color: station.color,
            roughness: 0.8,
          })
        );
        base.position.y = 0.6;
        base.castShadow = true;
        group.add(base);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(
            0.82,
            20,
            16,
            0,
            Math.PI * 2,
            0,
            Math.PI / 2
          ),
          new THREE.MeshStandardMaterial({
            color: station.roofColor,
            roughness: 0.72,
          })
        );
        dome.position.y = 1.05;
        dome.castShadow = true;
        group.add(dome);

        const scope = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.18, 0.85, 12),
          new THREE.MeshStandardMaterial({ color: "#e9c46a", roughness: 0.6 })
        );
        scope.position.set(0.45, 1.45, 0.35);
        scope.rotation.set(0.5, 0.6, -0.4);
        group.add(scope);
      } else if (station.id === "amphitheater") {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(1.25, 1.35, 0.42, 20),
          new THREE.MeshStandardMaterial({
            color: station.color,
            roughness: 0.82,
          })
        );
        ring.position.y = 0.35;
        ring.castShadow = true;
        group.add(ring);

        const bullPod = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.45, 0.46),
          new THREE.MeshStandardMaterial({ color: "#f4a261", roughness: 0.75 })
        );
        bullPod.position.set(-0.48, 0.72, 0);
        bullPod.castShadow = true;
        group.add(bullPod);

        const bearPod = new THREE.Mesh(
          new THREE.BoxGeometry(0.46, 0.45, 0.46),
          new THREE.MeshStandardMaterial({ color: "#9d4edd", roughness: 0.75 })
        );
        bearPod.position.set(0.48, 0.72, 0);
        bearPod.castShadow = true;
        group.add(bearPod);
      } else if (station.id === "council") {
        const hall = new THREE.Mesh(
          new THREE.BoxGeometry(1.65, 1.1, 1.35),
          new THREE.MeshStandardMaterial({
            color: station.color,
            roughness: 0.78,
          })
        );
        hall.position.y = 0.72;
        hall.castShadow = true;
        group.add(hall);

        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(1.38, 0.78, 4),
          new THREE.MeshStandardMaterial({
            color: station.roofColor,
            roughness: 0.72,
          })
        );
        roof.position.y = 1.55;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);

        councilCrystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28, 0),
          new THREE.MeshStandardMaterial({
            color: "#f7b267",
            emissive: "#f48c06",
            emissiveIntensity: 0.45,
            roughness: 0.35,
          })
        );
        councilCrystal.position.set(0, 2.15, 0);
        group.add(councilCrystal);
      } else if (station.id === "vault") {
        vaultCubeMat = new THREE.MeshStandardMaterial({
          color: station.color,
          roughness: 0.7,
        });
        const vaultCube = new THREE.Mesh(
          new THREE.BoxGeometry(1.42, 1.18, 1.42),
          vaultCubeMat
        );
        vaultCube.position.y = 0.75;
        vaultCube.castShadow = true;
        group.add(vaultCube);

        const door = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.12, 18),
          new THREE.MeshStandardMaterial({ color: "#2d6a4f", roughness: 0.5 })
        );
        door.position.set(0, 0.72, 0.73);
        group.add(door);

        vaultShieldMat = new THREE.MeshStandardMaterial({
          color: "#34d399",
          emissive: "#34d399",
          emissiveIntensity: 0.65,
        });
        vaultShieldRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.92, 0.07, 12, 32),
          vaultShieldMat
        );
        vaultShieldRing.position.set(0, 1.55, 0);
        vaultShieldRing.rotation.x = Math.PI / 2;
        group.add(vaultShieldRing);
      } else if (station.id === "dock") {
        const pier = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.25, 1.6),
          new THREE.MeshStandardMaterial({ color: "#b07d56", roughness: 0.85 })
        );
        pier.position.set(0, 0.35, 0.4);
        pier.castShadow = true;
        group.add(pier);

        const arch = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.11, 12, 24, Math.PI),
          new THREE.MeshStandardMaterial({
            color: station.roofColor,
            roughness: 0.65,
          })
        );
        arch.position.set(0, 0.95, -0.1);
        group.add(arch);

        const beacon = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.24, 0),
          new THREE.MeshStandardMaterial({
            color: "#4cc9f0",
            emissive: "#4895ef",
            emissiveIntensity: 0.6,
          })
        );
        beacon.position.set(0, 0.95, -0.1);
        group.add(beacon);
      }

      scene.add(group);
    });

    // 7. Build the 7 Clay Agent Figurines
    const agentMeshes: Record<
      number,
      { group: THREE.Group; currentPos: THREE.Vector3 }
    > = {};

    agentsRef.current.forEach((agent) => {
      const g = new THREE.Group();
      const initialTarget = agentTargetsRef.current[agent.id] || [0, 0.55, 0];
      const currentPos = new THREE.Vector3(
        initialTarget[0],
        initialTarget[1],
        initialTarget[2]
      );
      g.position.copy(currentPos);

      // Clay Body
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.2, 0.24, 10, 16),
        new THREE.MeshStandardMaterial({ color: agent.color, roughness: 0.68 })
      );
      body.position.y = 0.32;
      body.castShadow = true;
      g.add(body);

      // Clay Head
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 16),
        new THREE.MeshStandardMaterial({ color: "#fceade", roughness: 0.72 })
      );
      head.position.y = 0.72;
      head.castShadow = true;
      g.add(head);

      // Clay Hat
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.24, 12),
        new THREE.MeshStandardMaterial({
          color: agent.accentColor,
          roughness: 0.65,
        })
      );
      hat.position.y = 0.92;
      hat.castShadow = true;
      g.add(hat);

      // Eyes
      const eyeMat = new THREE.MeshBasicMaterial({ color: "#2b2118" });
      const leftEye = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 8, 8),
        eyeMat
      );
      leftEye.position.set(-0.07, 0.74, 0.19);
      g.add(leftEye);

      const rightEye = new THREE.Mesh(
        new THREE.SphereGeometry(0.032, 8, 8),
        eyeMat
      );
      rightEye.position.set(0.07, 0.74, 0.19);
      g.add(rightEye);

      scene.add(g);
      agentMeshes[agent.id] = { group: g, currentPos };
    });

    // Helper to project 3D world position to 2D container pixel coordinates
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
        visible: vec.z < 1 && x >= -100 && x <= w + 100 && y >= -100 && y <= h + 100,
      };
    };

    // 8. Animation Loop
    const clock = new THREE.Clock();
    let frameId = 0;
    let lastOverlayUpdate = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      controls.update();

      if (radarGroup) {
        radarGroup.rotation.y +=
          delta * (phaseRef.current === "SCANNING" ? 2.6 : 0.8);
      }

      if (councilCrystal) {
        councilCrystal.rotation.y += delta * 1.4;
        councilCrystal.position.y = 2.1 + Math.sin(elapsed * 2.5) * 0.1;
      }

      if (vaultShieldRing && vaultShieldMat && vaultCubeMat) {
        vaultShieldRing.rotation.z += delta * 0.9;
        const pulse = 1 + Math.sin(elapsed * 4) * 0.06;
        vaultShieldRing.scale.set(pulse, pulse, 1);

        const alertState = vaultAlertRef.current;
        const shieldHex =
          alertState === "BLOCKED"
            ? "#ef4444"
            : alertState === "PASSED"
            ? "#10b981"
            : "#34d399";
        vaultShieldMat.color.set(shieldHex);
        vaultShieldMat.emissive.set(shieldHex);
        vaultCubeMat.color.set(
          alertState === "BLOCKED" ? "#fee2e2" : "#dfd7cc"
        );
      }

      ISLAND_STATIONS.forEach((st) => {
        const halo = stationHalos[st.id];
        if (halo) {
          halo.visible = st.phase === phaseRef.current;
        }
      });

      // Interpolate clay agents smoothly
      agentsRef.current.forEach((ag) => {
        const entry = agentMeshes[ag.id];
        if (!entry) return;
        const target = agentTargetsRef.current[ag.id] || [0, 0.55, 0];
        const dest = new THREE.Vector3(target[0], target[1], target[2]);
        entry.currentPos.lerp(dest, Math.min(1, delta * 3.2));

        const bob = Math.abs(Math.sin(elapsed * 5.2 + ag.id * 1.3)) * 0.14;
        entry.group.position.set(
          entry.currentPos.x,
          entry.currentPos.y + bob,
          entry.currentPos.z
        );
        entry.group.rotation.y = Math.sin(elapsed * 1.5 + ag.id) * 0.35;
      });

      renderer.render(scene, camera);

      // Update projected 2D HTML labels ~20 times/sec for silky UI performance
      if (elapsed - lastOverlayUpdate > 0.05) {
        lastOverlayUpdate = elapsed;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        const nextStations: Record<string, ProjectedOverlay> = {};
        ISLAND_STATIONS.forEach((st) => {
          nextStations[st.id] = projectToScreen(
            new THREE.Vector3(
              st.position[0],
              st.position[1] + 2.45,
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
                entry.group.position.y + 1.25,
                entry.group.position.z
              ),
              w,
              h
            );
          }
        });
        setAgentCoords(nextAgents);
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
      cancelAnimationFrame(frameId);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* Three.js WebGL Mount Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 3D-Projected Station Pills */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {ISLAND_STATIONS.map((station) => {
          const coord = stationCoords[station.id];
          if (!coord || !coord.visible) return null;
          const isActivePhase = station.phase === currentPhase;
          const isSelected = selectedStationId === station.id;

          return (
            <button
              key={station.id}
              onClick={() => onSelectStation(station.id)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors border shadow-sm ${
                isActivePhase
                  ? "bg-[#d96543] text-white border-white scale-105 z-20"
                  : isSelected
                  ? "bg-[#2e2319] text-[#fbf6ee] border-[#4ea8de] z-20"
                  : "bg-[#fbf6ee]/90 text-[#3d3126] border-[#d8cbb8] hover:bg-white z-10"
              }`}
            >
              {station.name}
            </button>
          );
        })}

        {/* 3D-Projected Agent Name Tags & Speech Bubbles */}
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
                <div className="mb-1 max-w-[190px] rounded-xl bg-[#2e2319]/95 text-[#fbf6ee] px-2.5 py-1 text-[10px] leading-tight font-medium shadow-lg border border-[#d96543] text-center">
                  “{agent.speechBubble}”
                </div>
              )}
              <div
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight shadow-sm border transition-transform flex items-center gap-1 ${
                  isSelected
                    ? "bg-[#2e2319] text-[#fbf6ee] border-[#f7b267] scale-110"
                    : "bg-white/95 text-[#2e2319] border-[#d8cbb8] group-hover:scale-105"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: agent.color }}
                />
                {agent.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
