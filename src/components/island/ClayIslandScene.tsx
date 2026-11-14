"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ClayAgent,
  CyclePhase,
  ISLAND_STATIONS,
} from "@/lib/simulation-data";
import type {
  CustomIslandRecord,
  IslandBiomeTheme,
} from "@/lib/island-db";
import type { MainActionResult } from "@/lib/neon-db";
import {
  animateArticulatedCharacter,
  type ArticulatedCharacterRig,
  configureRealisticLightingAndRenderer,
  createCharacterShadowMesh,
  createOceanAndVolumetricClouds,
  createProceduralIslandTextures,
  deriveMarketMood,
  type MarketMoodLevel,
} from "./islandVisualHelpers";

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
  subIslands?: CustomIslandRecord[];
  connectedWalletAddress?: string;
  selectedSubIslandId?: string | null;
  onSelectSubIsland?: (islandId: string) => void;
  onEnterSubIsland?: (islandId: string) => void;
  archipelagoOverviewTick?: number;
  latestActions?: MainActionResult[];
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

interface SubIslandOverlayState extends ProjectedOverlay {
  islandId: string;
  name: string;
  biomeTheme: IslandBiomeTheme;
  isOwned: boolean;
  statusLabel: string;
  statusHex: string;
  mezoTierId?: "NONE" | "SUPPORTER" | "ALLIANCE" | "CITADEL_COUNCIL";
}

interface SatelliteAnimEntry {
  islandId: string;
  root: THREE.Group;
  baseY: number;
  phaseOffset: number;
  dockGem: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  orbs: THREE.Mesh[];
  flowDir: "main_to_sub" | "sub_to_main" | "bidirectional";
  haloMesh: THREE.Mesh;
  buoys: Array<{ mesh: THREE.Mesh; baseY: number; offset: number }>;
  anchorWorld: [number, number, number];
  isOwned: boolean;
  linkHex: string;
  overlayMeta: {
    islandId: string;
    name: string;
    biomeTheme: IslandBiomeTheme;
    isOwned: boolean;
    statusLabel: string;
    statusHex: string;
    mezoTierId?: "NONE" | "SUPPORTER" | "ALLIANCE" | "CITADEL_COUNCIL";
  };
}

const SUB_BIOME_COLORS: Record<
  IslandBiomeTheme,
  { outerRim: string; subRim: string; ground: string; courtyard: string; accent: string }
> = {
  meadow: {
    outerRim: "#bfbab0",
    subRim: "#7ca35c",
    ground: "#98bf75",
    courtyard: "#e5dccb",
    accent: "#10b981",
  },
  basalt: {
    outerRim: "#334155",
    subRim: "#475569",
    ground: "#3f3f46",
    courtyard: "#71717a",
    accent: "#f97316",
  },
  sand: {
    outerRim: "#d6b88d",
    subRim: "#e2c391",
    ground: "#edd5a7",
    courtyard: "#f5e6cb",
    accent: "#f59e0b",
  },
  grid: {
    outerRim: "#1e293b",
    subRim: "#0f766e",
    ground: "#111827",
    courtyard: "#1e293b",
    accent: "#22d3ee",
  },
};

// Staggered 12-slot orbital ordering so early islands sit prominently in unoccluded view
const ARCHIPELAGO_SLOT_ORDER = [0, 10, 2, 8, 11, 4, 6, 1, 9, 3, 7, 5];
const MAX_VISIBLE_SATELLITES = 12;

function resolveSubIslandLinkVisual(island: CustomIslandRecord): {
  hex: string;
  label: string;
  flowDir: "main_to_sub" | "sub_to_main" | "bidirectional";
} {
  const loanStatus = (island.latestLoanStatus || "").toUpperCase();
  if (loanStatus === "DISBURSED") {
    const amt = island.latestApprovedMusd
      ? `+${Math.round(island.latestApprovedMusd)} MUSD`
      : "ACTIVE LOAN";
    return { hex: "#10b981", label: amt, flowDir: "main_to_sub" };
  }
  if (loanStatus === "APPROVED_AWAITING_OWNER") {
    return { hex: "#10b981", label: "APPROVED", flowDir: "main_to_sub" };
  }
  if (loanStatus === "PENDING_COUNCIL") {
    return { hex: "#f59e0b", label: "COUNCIL REVIEW", flowDir: "sub_to_main" };
  }
  if (loanStatus === "DEFAULT_LIQUIDATED") {
    return { hex: "#f43f5e", label: "DEFAULTED", flowDir: "main_to_sub" };
  }
  if (loanStatus === "REJECTED") {
    return { hex: "#f43f5e", label: "REJECTED", flowDir: "main_to_sub" };
  }
  if (loanStatus === "REPAID") {
    return { hex: "#14b8a6", label: "REPAID", flowDir: "sub_to_main" };
  }
  if ((island.latestProfitUsd || 0) > 0 || island.latestCheckpointId) {
    const pnl =
      island.latestProfitUsd && island.latestProfitUsd > 0
        ? `+$${island.latestProfitUsd.toFixed(1)} PROOF`
        : "PROFIT PROOF";
    return { hex: "#f59e0b", label: pnl, flowDir: "sub_to_main" };
  }
  if ((island.vaultCount || 0) === 0 && (island.agentCount || 0) === 0) {
    return { hex: "#8b5cf6", label: "EMPTY PLOT", flowDir: "bidirectional" };
  }
  return { hex: "#6366f1", label: "LIVE LINK", flowDir: "bidirectional" };
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      mat.forEach((m) => m.dispose());
    } else if (mat) {
      mat.dispose();
    }
  });
}

export const MAIN_MUSD_VAULT_STATION = {
  id: "musd_vault_dome",
  name: "MUSD Treasury Vault",
  position: [0.1, 0.55, 5.45] as [number, number, number],
  color: "#10b981",
};

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
  subIslands = [],
  connectedWalletAddress,
  selectedSubIslandId = null,
  onSelectSubIsland,
  onEnterSubIsland,
  archipelagoOverviewTick = 0,
  latestActions = [],
  marketMoodInput,
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

  const marketMood = useMemo<MarketMoodLevel>(
    () => deriveMarketMood(marketMoodInput || {}),
    [
      marketMoodInput?.fearGreedIndex,
      marketMoodInput?.trendDirection,
      marketMoodInput?.sentimentLabel,
    ]
  );
  const marketMoodRef = useRef<MarketMoodLevel>(marketMood);
  marketMoodRef.current = marketMood;

  const choreoSnapshot = useMemo(() => {
    const executed = latestActions.filter((a) => a.status === "EXECUTED");
    const hasMusdDeposit = executed.some((a) => a.type === "DEPOSIT_MUSD_VAULT");
    const hasMusdWithdraw = executed.some((a) => a.type === "WITHDRAW_MUSD_VAULT");
    const hasStrategicRecord = executed.some(
      (a) => a.type === "RECORD_STRATEGIC_ALLOCATION"
    );
    const hasRescueTrove = executed.some((a) => a.type === "RESCUE_TROVE");
    const hasLoanSweep = executed.some((a) => a.type === "SWEEP_OVERDUE_LOAN");
    const hasPolicyTune = executed.some(
      (a) => a.type === "TUNE_POLICY_GUARDRAILS"
    );
    const hasDebateAnchor = executed.some(
      (a) => a.type === "ANCHOR_COUNCIL_DEBATE"
    );
    const sig = executed.map((a) => `${a.type}:${a.txHash || a.label}`).join("|");
    return {
      hasMusdDeposit,
      hasMusdWithdraw,
      hasStrategicRecord,
      hasRescueTrove,
      hasLoanSweep,
      hasPolicyTune,
      hasDebateAnchor,
      sig,
    };
  }, [latestActions]);

  const choreoRef = useRef({
    ...choreoSnapshot,
    burstUntilMs: 0,
  });

  useEffect(() => {
    if (
      choreoSnapshot.sig &&
      choreoSnapshot.sig !== choreoRef.current.sig
    ) {
      choreoRef.current = {
        ...choreoSnapshot,
        burstUntilMs: Date.now() + 14_000,
      };
    } else {
      choreoRef.current = {
        ...choreoSnapshot,
        burstUntilMs: choreoRef.current.burstUntilMs,
      };
    }
  }, [choreoSnapshot]);

  const stationActionBadges = useMemo(() => {
    const badges: Record<string, { label: string; cls: string }> = {};
    for (const act of latestActions) {
      if (act.status !== "EXECUTED") continue;
      if (act.type === "DEPOSIT_MUSD_VAULT") {
        badges[MAIN_MUSD_VAULT_STATION.id] = {
          label: act.amountLabel ? `+${act.amountLabel} Deposit` : "+Vault Deposit",
          cls: "bg-emerald-500/20 text-emerald-900 border-emerald-400/50",
        };
      } else if (act.type === "WITHDRAW_MUSD_VAULT") {
        badges[MAIN_MUSD_VAULT_STATION.id] = {
          label: act.amountLabel ? `-${act.amountLabel} Withdrawn` : "Vault Liquidity Out",
          cls: "bg-sky-500/20 text-sky-900 border-sky-400/50",
        };
      } else if (act.type === "SWEEP_OVERDUE_LOAN") {
        badges[MAIN_MUSD_VAULT_STATION.id] = {
          label: act.amountLabel ? `Sweep ${act.amountLabel}` : "Loan Swept",
          cls: "bg-rose-500/20 text-rose-900 border-rose-400/50",
        };
      } else if (act.type === "RESCUE_TROVE") {
        badges.policy_fortress = {
          label: act.amountLabel ? `Guard ${act.amountLabel}` : "Trove Protected",
          cls: "bg-cyan-500/20 text-cyan-900 border-cyan-400/50",
        };
      } else if (act.type === "TUNE_POLICY_GUARDRAILS") {
        badges.policy_fortress = {
          label: act.amountLabel || "Guardrails Tuned",
          cls: "bg-indigo-500/20 text-indigo-900 border-indigo-400/50",
        };
      } else if (act.type === "ANCHOR_COUNCIL_DEBATE") {
        badges.lighthouse_beacon = {
          label: act.amountLabel ? `Debate ${act.amountLabel}` : "Debate Anchored",
          cls: "bg-amber-500/20 text-amber-900 border-amber-400/50",
        };
      } else if (act.type === "DEPLOY_EARN_VAULT") {
        badges[MAIN_MUSD_VAULT_STATION.id] = {
          label: act.amountLabel ? `Earn ${act.amountLabel}` : "Earn Deployed",
          cls: "bg-emerald-500/20 text-emerald-900 border-emerald-400/50",
        };
      } else if (act.type === "DEPLOY_TIGRIS_POOL") {
        badges.dca_piggy = {
          label: act.amountLabel ? `Tigris ${act.amountLabel}` : "Tigris LP",
          cls: "bg-teal-500/20 text-teal-900 border-teal-400/50",
        };
      } else if (act.type === "EXECUTE_DCA") {
        badges.dca_piggy = {
          label: act.amountLabel || "Capital Executed",
          cls: "bg-emerald-500/20 text-emerald-900 border-emerald-400/50",
        };
      } else if (act.type === "RECTIFY_AND_EXECUTE") {
        badges.rectifier_lab = {
          label: act.amountLabel ? `Healed ${act.amountLabel}` : "Slice Healed",
          cls: "bg-cyan-500/20 text-cyan-900 border-cyan-400/50",
        };
      }
    }
    return badges;
  }, [latestActions]);

  const selectedAgentIdRef = useRef(selectedAgentId);
  selectedAgentIdRef.current = selectedAgentId;

  const selectedStationIdRef = useRef(selectedStationId);
  selectedStationIdRef.current = selectedStationId;

  const selectedSubIslandIdRef = useRef(selectedSubIslandId);
  selectedSubIslandIdRef.current = selectedSubIslandId;

  const subIslandsRef = useRef(subIslands);
  subIslandsRef.current = subIslands;

  const onSelectAgentRef = useRef(onSelectAgent);
  onSelectAgentRef.current = onSelectAgent;

  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;

  const onSelectSubIslandRef = useRef(onSelectSubIsland);
  onSelectSubIslandRef.current = onSelectSubIsland;

  const desiredOrbitTargetRef = useRef<THREE.Vector3 | null>(null);
  const desiredCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const isCameraTweeningRef = useRef(false);
  const hasInitializedFocusRef = useRef(false);
  const lastArchipelagoTickRef = useRef(archipelagoOverviewTick);

  const archipelagoGroupRef = useRef<THREE.Group | null>(null);
  const interactiveRootsRef = useRef<THREE.Object3D[]>([]);
  const satelliteAnimsRef = useRef<SatelliteAnimEntry[]>([]);
  const satelliteCoordsMapRef = useRef<Record<string, [number, number, number]>>({});

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
    const allStations = [...ISLAND_STATIONS, MAIN_MUSD_VAULT_STATION];

    agents.forEach((agent) => {
      const st = allStations.find((s) => s.id === agent.currentStationId);
      if (st && agent.currentStationId !== agent.homeStationId) {
        if (st.id === MAIN_MUSD_VAULT_STATION.id) {
          // Place visiting agents cleanly in front of the MUSD Vault Dome plaza entrance
          const xBias = (agent.id - 2.5) * 0.45;
          map[agent.id] = [st.position[0] + xBias, 0.5, st.position[2] - 1.45];
        } else {
          const angle = agent.id * 1.4;
          map[agent.id] = [
            st.position[0] + Math.cos(angle) * 1.15,
            0.5,
            st.position[2] + Math.sin(angle) * 1.15,
          ];
        }
      } else {
        const home = stationOffsets[agent.id] || [0, 0];
        map[agent.id] = [home[0], 0.5, home[1]];
      }
    });
    return map;
  }, [agents]);

  const agentTargetsRef = useRef(agentTargets);
  agentTargetsRef.current = agentTargets;

  const satellitePlacements = useMemo(() => {
    if (!subIslands.length) {
      satelliteCoordsMapRef.current = {};
      return [];
    }
    const walletLower = (connectedWalletAddress || "").toLowerCase();
    const score = (isl: CustomIslandRecord) => {
      let s = 0;
      if (walletLower && isl.ownerAddress.toLowerCase() === walletLower) s += 1000;
      const loanSt = (isl.latestLoanStatus || "").toUpperCase();
      if (
        loanSt === "DISBURSED" ||
        loanSt === "APPROVED_AWAITING_OWNER" ||
        loanSt === "PENDING_COUNCIL"
      ) {
        s += 250;
      }
      if (
        (isl.latestProfitUsd || 0) > 0 ||
        (isl.vaultCount || 0) > 0 ||
        (isl.agentCount || 0) > 0
      ) {
        s += 50;
      }
      return s;
    };

    const sorted = [...subIslands].sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const sliced = sorted.slice(0, MAX_VISIBLE_SATELLITES);
    if (
      selectedSubIslandId &&
      !sliced.some((i) => i.islandId === selectedSubIslandId)
    ) {
      const match = sorted.find((i) => i.islandId === selectedSubIslandId);
      if (match && sliced.length > 0) {
        sliced[sliced.length - 1] = match;
      }
    }

    const placements = sliced.map((isl, idx) => {
      const slot = ARCHIPELAGO_SLOT_ORDER[idx % ARCHIPELAGO_SLOT_ORDER.length];
      const angle = -Math.PI * 0.75 + (slot * Math.PI * 2) / 12;
      const radius = 13.6 + (slot % 2) * 2.15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 0.25 + (idx % 3) * 0.26;
      const isOwned = Boolean(
        walletLower && isl.ownerAddress.toLowerCase() === walletLower
      );
      return { island: isl, idx, slot, angle, radius, x, y, z, isOwned };
    });

    const coordMap: Record<string, [number, number, number]> = {};
    placements.forEach((p) => {
      coordMap[p.island.islandId] = [p.x, p.y, p.z];
    });
    satelliteCoordsMapRef.current = coordMap;
    return placements;
  }, [subIslands, connectedWalletAddress, selectedSubIslandId]);

  // Smoothly pan & zoom OrbitControls toward selected 3D station, Autobot, Sub-Island, or overview
  useEffect(() => {
    if (!hasInitializedFocusRef.current) {
      hasInitializedFocusRef.current = true;
      return;
    }

    if (archipelagoOverviewTick !== lastArchipelagoTickRef.current) {
      lastArchipelagoTickRef.current = archipelagoOverviewTick;
      desiredOrbitTargetRef.current = new THREE.Vector3(0, 0.4, -0.4);
      desiredCameraPosRef.current = new THREE.Vector3(0, 18.8, 25.6);
      isCameraTweeningRef.current = true;
      return;
    }

    if (selectedSubIslandId) {
      const coords = satelliteCoordsMapRef.current[selectedSubIslandId];
      if (coords) {
        const [sx, sy, sz] = coords;
        desiredOrbitTargetRef.current = new THREE.Vector3(
          sx * 0.78,
          sy + 0.55,
          sz * 0.78
        );
        desiredCameraPosRef.current = new THREE.Vector3(
          sx * 0.52,
          11.4,
          sz * 0.52 + 11.2
        );
        isCameraTweeningRef.current = true;
        return;
      }
    }

    if (selectedStationId) {
      const station =
        selectedStationId === MAIN_MUSD_VAULT_STATION.id
          ? MAIN_MUSD_VAULT_STATION
          : ISLAND_STATIONS.find((s) => s.id === selectedStationId);
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

    // Reset back to island overview
    desiredOrbitTargetRef.current = new THREE.Vector3(0, 0.4, 0.2);
    desiredCameraPosRef.current =
      subIslandsRef.current.length > 0
        ? new THREE.Vector3(0, 14.2, 17.8)
        : new THREE.Vector3(0, 12.8, 15.2);
    isCameraTweeningRef.current = true;
  }, [
    selectedAgentId,
    selectedStationId,
    selectedSubIslandId,
    cameraResetTick,
    archipelagoOverviewTick,
  ]);

  const [stationCoords, setStationCoords] = useState<
    Record<string, ProjectedOverlay>
  >({});
  const [agentCoords, setAgentCoords] = useState<
    Record<number, ProjectedOverlay>
  >({});
  const [subIslandOverlays, setSubIslandOverlays] = useState<
    SubIslandOverlayState[]
  >([]);
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

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 220);
    camera.position.set(0, 13.6, 16.8);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const textures = createProceduralIslandTextures();
    const lightingCtrl = configureRealisticLightingAndRenderer(renderer, scene, {
      fogColor: "#d4ebfd",
      fogDensity: 0.0085,
    });

    const oceanEnv = createOceanAndVolumetricClouds(scene, textures, {
      waterColor: "#38bdf8",
      deepColor: "#0284c7",
      fogColor: "#d4ebfd",
    });

    const archipelagoGroup = new THREE.Group();
    scene.add(archipelagoGroup);
    archipelagoGroupRef.current = archipelagoGroup;

    // 2. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.panSpeed = 0.75;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = Math.PI / 6;
    controls.maxPolarAngle = Math.PI / 2.4;
    controls.minDistance = 7.5;
    controls.maxDistance = 42;
    controls.target.set(0, 0.4, 0.2);
    const cancelFocusTween = () => {
      isCameraTweeningRef.current = false;
    };
    controls.addEventListener("start", cancelFocusTween);

    // 4. Sculpted Rock Cliff Base, Textured Island Disc, Cobblestone Plaza, Ring Road & Radial Paths
    const outerRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.95, 8.18, 0.48, 64),
      new THREE.MeshStandardMaterial({
        color: "#c9c3b8",
        map: textures.stoneMap,
        bumpMap: textures.stoneMap,
        bumpScale: 0.04,
        roughness: 0.86,
      })
    );
    outerRim.position.y = 0.08;
    outerRim.castShadow = true;
    outerRim.receiveShadow = true;
    scene.add(outerRim);

    // Stratified rocky cliff underbelly plunging into the sunlit ocean
    const cliffUnderbelly = new THREE.Mesh(
      new THREE.CylinderGeometry(8.18, 7.35, 0.72, 28),
      new THREE.MeshStandardMaterial({
        color: "#9a9488",
        map: textures.stoneMap,
        bumpMap: textures.stoneMap,
        bumpScale: 0.06,
        roughness: 0.94,
        flatShading: true,
      })
    );
    cliffUnderbelly.position.y = -0.36;
    cliffUnderbelly.receiveShadow = true;
    scene.add(cliffUnderbelly);

    // Seeded coastal shoreline boulders seated against the cliff edge & surf ring
    const coastalBoulderMat = new THREE.MeshStandardMaterial({
      color: "#a8a196",
      map: textures.stoneMap,
      roughness: 0.92,
      flatShading: true,
    });
    for (let bi = 0; bi < 16; bi++) {
      const ba = (bi * Math.PI * 2) / 16 + (bi % 3) * 0.14;
      const br = 8.05 + (bi % 3) * 0.22;
      const boulder = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.28 + (bi % 4) * 0.07, 0),
        coastalBoulderMat
      );
      boulder.scale.set(1.25, 0.65 + (bi % 2) * 0.2, 1.05);
      boulder.position.set(
        Math.cos(ba) * br,
        -0.25 + (bi % 2) * 0.06,
        Math.sin(ba) * br
      );
      boulder.rotation.set((bi * 0.5) % 1.2, ba, (bi * 0.3) % 0.8);
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      scene.add(boulder);
    }

    const grassSubRim = new THREE.Mesh(
      new THREE.CylinderGeometry(7.72, 7.82, 0.52, 64),
      new THREE.MeshStandardMaterial({
        color: "#789e59",
        roughness: 0.9,
      })
    );
    grassSubRim.position.y = 0.14;
    grassSubRim.receiveShadow = true;
    scene.add(grassSubRim);

    const mainGrass = new THREE.Mesh(
      new THREE.CylinderGeometry(7.58, 7.65, 0.56, 64),
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        map: textures.grassMap,
        bumpMap: textures.grassMap,
        bumpScale: 0.025,
        roughness: 0.88,
      })
    );
    mainGrass.position.y = 0.18;
    mainGrass.receiveShadow = true;
    scene.add(mainGrass);

    const roadMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: textures.cobbleMap,
      bumpMap: textures.cobbleMap,
      bumpScale: 0.025,
      roughness: 0.88,
    });
    const curbMat = new THREE.MeshStandardMaterial({
      color: "#cfc8bc",
      map: textures.stoneMap,
      roughness: 0.84,
    });

    // Central Circular Cobblestone Plaza + Raised Stone Curb
    const centerPlaza = new THREE.Mesh(
      new THREE.CylinderGeometry(2.25, 2.3, 0.06, 48),
      roadMat
    );
    centerPlaza.position.y = 0.46;
    centerPlaza.receiveShadow = true;
    scene.add(centerPlaza);

    const plazaCurb = new THREE.Mesh(
      new THREE.TorusGeometry(2.27, 0.045, 8, 48),
      curbMat
    );
    plazaCurb.rotation.x = Math.PI / 2;
    plazaCurb.position.y = 0.48;
    plazaCurb.receiveShadow = true;
    scene.add(plazaCurb);

    // Outer Ring Road (Flat Ring + Inner/Outer Stone Edging)
    const ringRoad = new THREE.Mesh(
      new THREE.RingGeometry(4.0, 4.75, 64),
      roadMat
    );
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = 0.47;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    [4.0, 4.75].forEach((curbR) => {
      const ringCurb = new THREE.Mesh(
        new THREE.TorusGeometry(curbR, 0.036, 8, 64),
        curbMat
      );
      ringCurb.rotation.x = Math.PI / 2;
      ringCurb.position.y = 0.48;
      ringCurb.receiveShadow = true;
      scene.add(ringCurb);
    });

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

    // Warm Timber Pier Bridge on Bottom-Left with underwater pilings
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-4.6, 0.42, 5.8);
    bridgeGroup.rotation.y = -0.58;
    const woodDeckMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: textures.woodMap,
      bumpMap: textures.woodMap,
      bumpScale: 0.03,
      roughness: 0.85,
    });
    const railWoodMat = new THREE.MeshStandardMaterial({
      color: "#7f5539",
      map: textures.woodMap,
      roughness: 0.88,
    });
    const bridgeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.12, 2.2),
      woodDeckMat
    );
    bridgeDeck.castShadow = true;
    bridgeDeck.receiveShadow = true;
    bridgeGroup.add(bridgeDeck);
    [-0.58, 0.58].forEach((rx) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 2.1),
        railWoodMat
      );
      rail.position.set(rx, 0.2, 0);
      rail.castShadow = true;
      bridgeGroup.add(rail);
      [-0.85, 0.85].forEach((rz) => {
        const piling = new THREE.Mesh(
          new THREE.CylinderGeometry(0.065, 0.08, 0.98, 10),
          railWoodMat
        );
        piling.position.set(rx, -0.34, rz);
        piling.castShadow = true;
        bridgeGroup.add(piling);
      });
    });
    scene.add(bridgeGroup);

    // 4 Warm Clay Courtyard Path Lanterns around the plaza ring
    const lanternGlowMat = new THREE.MeshStandardMaterial({
      color: "#fef3c7",
      emissive: "#f59e0b",
      emissiveIntensity: 1.15,
      roughness: 0.2,
    });
    [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach(
      (la) => {
        const lGroup = new THREE.Group();
        lGroup.position.set(Math.cos(la) * 3.85, 0.47, Math.sin(la) * 3.85);
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.05, 0.56, 8),
          new THREE.MeshStandardMaterial({ color: "#334155", metalness: 0.45, roughness: 0.5 })
        );
        post.position.y = 0.28;
        post.castShadow = true;
        lGroup.add(post);
        const lampHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.095, 10, 10),
          lanternGlowMat
        );
        lampHead.position.y = 0.6;
        lGroup.add(lampHead);
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(0.13, 0.09, 8),
          new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.6 })
        );
        cap.position.y = 0.69;
        lGroup.add(cap);
        scene.add(lGroup);
      }
    );

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

    // Central Stone Pedestal + Stepped Trim
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.72, 0.45, 24),
      new THREE.MeshStandardMaterial({
        color: "#e2ded8",
        map: textures.stoneMap,
        bumpMap: textures.stoneMap,
        bumpScale: 0.02,
        roughness: 0.74,
      })
    );
    ped.position.y = 0.22;
    ped.castShadow = true;
    ped.receiveShadow = true;
    astrolabeGroup.add(ped);

    const pedCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.045, 10, 28),
      new THREE.MeshStandardMaterial({
        color: "#d4af37",
        metalness: 0.68,
        roughness: 0.28,
      })
    );
    pedCollar.rotation.x = Math.PI / 2;
    pedCollar.position.y = 0.44;
    astrolabeGroup.add(pedCollar);

    // Central Mezo Chain Logo Orb inside the Two Brushed Brass Astrolabe Rings
    const coreOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.43, 40, 40),
      new THREE.MeshPhysicalMaterial({
        map: mezoSphereTex,
        roughness: 0.22,
        metalness: 0.08,
        clearcoat: 0.65,
        clearcoatRoughness: 0.14,
      })
    );
    coreOrb.position.y = 0.85;
    coreOrb.rotation.y = -Math.PI / 2; // Orient front Mezo ribbon directly toward camera (+Z)
    coreOrb.castShadow = true;
    astrolabeGroup.add(coreOrb);

    const gyroRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.042, 14, 48),
      new THREE.MeshStandardMaterial({
        color: "#f4c54e",
        metalness: 0.76,
        roughness: 0.24,
      })
    );
    gyroRing1.position.y = 0.85;
    gyroRing1.castShadow = true;
    astrolabeGroup.add(gyroRing1);

    const gyroRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.56, 0.036, 14, 48),
      new THREE.MeshStandardMaterial({
        color: "#e09f3e",
        metalness: 0.74,
        roughness: 0.26,
      })
    );
    gyroRing2.position.y = 0.85;
    gyroRing2.rotation.x = Math.PI / 3;
    gyroRing2.castShadow = true;
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
    const spireColMat = new THREE.MeshStandardMaterial({
      color: "#ebe6df",
      map: textures.stoneMap,
      roughness: 0.78,
    });

    towerSpecs.forEach((t) => {
      const spire = new THREE.Group();
      spire.position.set(t.pos[0], 0, t.pos[1]);

      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.29, 1.25, 16),
        spireColMat
      );
      col.position.y = 0.62;
      col.castShadow = true;
      col.receiveShadow = true;
      spire.add(col);

      const capRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.26, 0.1, 16),
        spireColMat
      );
      capRing.position.y = 1.24;
      spire.add(capRing);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.33, 0.44, 16),
        new THREE.MeshStandardMaterial({ color: t.roof, roughness: 0.58 })
      );
      cone.position.y = 1.48;
      cone.castShadow = true;
      spire.add(cone);

      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.145, 0),
        new THREE.MeshPhysicalMaterial({
          color: t.gem,
          emissive: t.gem,
          emissiveIntensity: 0.55,
          roughness: 0.12,
          clearcoat: 0.9,
        })
      );
      gem.position.y = 1.88;
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

    const lhBalcony = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.46, 0.08, 20),
      new THREE.MeshStandardMaterial({
        color: "#475569",
        metalness: 0.45,
        roughness: 0.48,
      })
    );
    lhBalcony.position.y = 2.36;
    lighthouseGroup.add(lhBalcony);

    const lhLanternMat = new THREE.MeshPhysicalMaterial({
      color: "#fef08a",
      emissive: "#fbbf24",
      emissiveIntensity: 0.85,
      roughness: 0.1,
      clearcoat: 0.9,
    });
    const lhLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.38, 16),
      lhLanternMat
    );
    lhLantern.position.y = 2.57;
    lighthouseGroup.add(lhLantern);

    // Expanding radio/debate telemetry pulse ring around Lighthouse lantern
    const lhRadioRingMat = new THREE.MeshBasicMaterial({
      color: "#fde047",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lhRadioRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.035, 8, 32),
      lhRadioRingMat
    );
    lhRadioRing.rotation.x = Math.PI / 2;
    lhRadioRing.position.y = 2.57;
    lighthouseGroup.add(lhRadioRing);

    // Volumetric rotating spotlight beam sweeping out from Lighthouse lantern
    const lhSweepPivot = new THREE.Group();
    lhSweepPivot.position.y = 2.57;
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: "#fde68a",
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 5.2, 20, 1, true),
      beamConeMat
    );
    beamCone.rotation.z = Math.PI / 2;
    beamCone.position.set(2.75, 0, 0);
    lhSweepPivot.add(beamCone);
    lighthouseGroup.add(lhSweepPivot);

    const lhRoof = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 0.45, 20),
      new THREE.MeshStandardMaterial({ color: "#8b5cf6", roughness: 0.58 })
    );
    lhRoof.position.y = 2.97;
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
      new THREE.MeshStandardMaterial({
        color: "#d9822b",
        map: textures.woodMap,
        roughness: 0.78,
      })
    );
    signFrame.position.y = 1.65;
    signGroup.add(signFrame);
    [-0.65, 0.65].forEach((px) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 1.2, 10),
        railWoodMat
      );
      post.position.set(px, 0.6, 0);
      post.castShadow = true;
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
    cotWalls.receiveShadow = true;
    cottageGroup.add(cotWalls);
    const cotRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 0.75, 4),
      new THREE.MeshStandardMaterial({ color: "#689f4d", roughness: 0.72 })
    );
    cotRoof.position.y = 1.32;
    cotRoof.rotation.y = Math.PI / 4;
    cotRoof.castShadow = true;
    cottageGroup.add(cotRoof);
    const cotDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.54, 0.06),
      railWoodMat
    );
    cotDoor.position.set(0, 0.27, 0.61);
    cottageGroup.add(cotDoor);
    [-0.38, 0.38].forEach((wx) => {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.24, 0.05),
        lanternGlowMat
      );
      win.position.set(wx, 0.56, 0.61);
      cottageGroup.add(win);
    });
    const cotChimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.45, 0.22),
      curbMat
    );
    cotChimney.position.set(0.36, 1.48, -0.2);
    cotChimney.castShadow = true;
    cottageGroup.add(cotChimney);
    scene.add(cottageGroup);

    // 7. Left Landmark: Kronos Golden Piggy-Bank DCA Vault (Exact match to 9 o'clock piggy bank in screenshot)
    const piggyGroup = new THREE.Group();
    piggyGroup.position.set(-5.25, 0.48, 0.45);
    piggyGroup.rotation.y = 0.35;

    const pigMat = new THREE.MeshStandardMaterial({
      color: "#f4c44e",
      metalness: 0.34,
      roughness: 0.36,
    });
    const pigBody = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 24, 24),
      pigMat
    );
    pigBody.scale.set(1.15, 0.95, 0.95);
    pigBody.position.y = 0.95;
    pigBody.castShadow = true;
    piggyGroup.add(pigBody);

    // Floppy Piggy Ears & Curly Tail
    [-0.28, 0.28].forEach((ez) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.32, 10),
        pigMat
      );
      ear.position.set(0.55, 1.56, ez);
      ear.rotation.z = -0.35;
      ear.rotation.x = ez > 0 ? 0.25 : -0.25;
      ear.castShadow = true;
      piggyGroup.add(ear);
    });
    const pigTail = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.04, 8, 16, Math.PI * 1.45),
      pigMat
    );
    pigTail.position.set(-1.12, 1.02, 0);
    pigTail.rotation.y = Math.PI / 2;
    piggyGroup.add(pigTail);

    // Piggy Snout
    const snout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.36, 0.35, 18),
      new THREE.MeshStandardMaterial({
        color: "#e5a93c",
        metalness: 0.28,
        roughness: 0.4,
      })
    );
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(1.05, 0.9, 0);
    snout.castShadow = true;
    piggyGroup.add(snout);

    // Glossy Coin Stacks beside Piggy Bank
    const stackCoinMat = new THREE.MeshStandardMaterial({
      color: "#fbbf24",
      metalness: 0.65,
      roughness: 0.25,
    });
    [
      [1.22, 0.14, 0.52, 5],
      [1.45, 0.1, 0.28, 3],
    ].forEach(([cx, , cz, count]) => {
      for (let ci = 0; ci < count; ci++) {
        const c = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16),
          stackCoinMat
        );
        c.position.set(cx, 0.03 + ci * 0.055, cz);
        c.castShadow = true;
        piggyGroup.add(c);
      }
    });

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
        emissiveIntensity: 0.42,
        metalness: 0.7,
        roughness: 0.22,
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
      color: "#cbd5e1",
      map: textures.stoneMap,
      roughness: 0.74,
    });
    const rectBlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 1.15, 1.35),
      rectBlockMat
    );
    rectBlock.position.y = 0.58;
    rectBlock.castShadow = true;
    rectBlock.receiveShadow = true;
    rectifierGroup.add(rectBlock);

    // Yellow Diagnostic Crane Mast, Boom & Swinging Cable Hook
    const craneMat = new THREE.MeshStandardMaterial({
      color: "#f5b82e",
      metalness: 0.28,
      roughness: 0.42,
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
    boomArm.castShadow = true;
    craneBoom.add(boomArm);

    const craneHookGroup = new THREE.Group();
    craneHookGroup.position.set(1.12, -0.02, 0);
    const hookCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.48, 6),
      new THREE.MeshStandardMaterial({ color: "#475569", metalness: 0.7 })
    );
    hookCable.position.y = -0.24;
    craneHookGroup.add(hookCable);
    const hookBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.14, 0.16),
      new THREE.MeshStandardMaterial({
        color: "#0ea5e9",
        emissive: "#0284c7",
        emissiveIntensity: 0.45,
        metalness: 0.3,
      })
    );
    hookBlock.position.y = -0.52;
    craneHookGroup.add(hookBlock);
    craneBoom.add(craneHookGroup);
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

    // 9. Right Landmarks: Multi-Tuft Giant Treehouse + Sentinel Policy Fortress + Warm Cottage + Ribbed MUSD Vault Dome
    const bigTreeGroup = new THREE.Group();
    bigTreeGroup.position.set(3.2, 0.48, -3.7);
    const bigTrunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.5, 1.5, 14),
      railWoodMat
    );
    bigTrunk.position.y = 0.75;
    bigTrunk.castShadow = true;
    bigTrunk.receiveShadow = true;
    bigTreeGroup.add(bigTrunk);
    const bigCanopyMat = new THREE.MeshStandardMaterial({
      color: "#68b678",
      roughness: 0.78,
    });
    const bigCanopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.18, 22, 20),
      bigCanopyMat
    );
    bigCanopy.position.y = 2.05;
    bigCanopy.castShadow = true;
    bigTreeGroup.add(bigCanopy);
    [
      [-0.68, 1.82, 0.48, 0.72, "#74c284"],
      [0.65, 1.92, -0.42, 0.68, "#5aa86a"],
      [0.12, 2.48, 0.28, 0.62, "#80cd8f"],
    ].forEach(([cx, cy, cz, cr, col]) => {
      const tuft = new THREE.Mesh(
        new THREE.SphereGeometry(cr as number, 16, 16),
        new THREE.MeshStandardMaterial({ color: col as string, roughness: 0.78 })
      );
      tuft.position.set(cx as number, cy as number, cz as number);
      tuft.castShadow = true;
      bigTreeGroup.add(tuft);
    });
    scene.add(bigTreeGroup);

    // Ironhide Policy Fortress (Blue Shield Tower with Battlements at 3 o'clock)
    const policyGroup = new THREE.Group();
    policyGroup.userData.stationId = "policy_fortress";
    policyGroup.position.set(4.95, 0.48, 0.8);
    const policyTowerMat = new THREE.MeshStandardMaterial({
      color: "#77aadd",
      map: textures.stoneMap,
      roughness: 0.68,
    });
    const policyBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.85, 1.65, 20),
      policyTowerMat
    );
    policyBody.position.y = 0.82;
    policyBody.castShadow = true;
    policyBody.receiveShadow = true;
    policyGroup.add(policyBody);
    const policyDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: "#60a5fa",
        roughness: 0.25,
        metalness: 0.25,
        clearcoat: 0.6,
      })
    );
    policyDome.position.y = 1.64;
    policyDome.castShadow = true;
    policyGroup.add(policyDome);
    // Stone rampart crenellations around parapet
    for (let bi = 0; bi < 8; bi++) {
      const ba = (bi * Math.PI * 2) / 8;
      const merlon = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.22, 0.16),
        curbMat
      );
      merlon.position.set(Math.cos(ba) * 0.76, 1.72, Math.sin(ba) * 0.76);
      merlon.rotation.y = -ba;
      merlon.castShadow = true;
      policyGroup.add(merlon);
    }

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

    // Reactive Trove Rescue & Guardrail Calibration Wave around Policy Fortress
    const troveWaveMat = new THREE.MeshBasicMaterial({
      color: "#22d3ee",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const troveShieldWave = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.045, 10, 32),
      troveWaveMat
    );
    troveShieldWave.rotation.x = Math.PI / 2;
    troveShieldWave.position.set(0, 0.9, 0);
    policyGroup.add(troveShieldWave);

    const troveSparkMat = new THREE.MeshBasicMaterial({
      color: "#34d399",
      transparent: true,
      opacity: 0,
    });
    const troveSparks: THREE.Mesh[] = [];
    for (let si = 0; si < 3; si++) {
      const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), troveSparkMat);
      sp.visible = false;
      policyGroup.add(sp);
      troveSparks.push(sp);
    }
    scene.add(policyGroup);

    // Warm Terracotta Cottage with Lit Windows & Door (4-5 o'clock)
    const warmHouse = new THREE.Group();
    warmHouse.position.set(3.8, 0.48, 3.7);
    warmHouse.rotation.y = -0.5;
    const whWalls = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.85, 1.15),
      new THREE.MeshStandardMaterial({ color: "#f3e5d0", roughness: 0.8 })
    );
    whWalls.position.y = 0.42;
    whWalls.castShadow = true;
    whWalls.receiveShadow = true;
    warmHouse.add(whWalls);
    const whRoof = new THREE.Mesh(
      new THREE.ConeGeometry(1.08, 0.68, 4),
      new THREE.MeshStandardMaterial({ color: "#e59872", roughness: 0.72 })
    );
    whRoof.position.y = 1.18;
    whRoof.rotation.y = Math.PI / 4;
    whRoof.castShadow = true;
    warmHouse.add(whRoof);
    const whDoor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.48, 0.06),
      railWoodMat
    );
    whDoor.position.set(0, 0.24, 0.58);
    warmHouse.add(whDoor);
    [-0.36, 0.36].forEach((wx) => {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.05),
        lanternGlowMat
      );
      win.position.set(wx, 0.5, 0.58);
      warmHouse.add(win);
    });
    scene.add(warmHouse);

    // Additive Main MUSD Treasury Vault Dome (6 o'clock Plaza — Preserves existing landmarks)
    const musdVaultDomeGroup = new THREE.Group();
    musdVaultDomeGroup.userData.stationId = MAIN_MUSD_VAULT_STATION.id;
    musdVaultDomeGroup.position.set(0.1, 0.48, 5.45);
    const musdBasePad = new THREE.Mesh(
      new THREE.CylinderGeometry(1.08, 1.22, 0.14, 28),
      curbMat
    );
    musdBasePad.position.y = 0.07;
    musdBasePad.receiveShadow = true;
    musdVaultDomeGroup.add(musdBasePad);

    const musdPlinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.76, 0.86, 0.62, 24),
      new THREE.MeshStandardMaterial({ color: "#047857", roughness: 0.48 })
    );
    musdPlinth.position.y = 0.44;
    musdPlinth.castShadow = true;
    musdPlinth.receiveShadow = true;
    musdVaultDomeGroup.add(musdPlinth);

    const musdDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: "#10b981",
        emissive: "#059669",
        emissiveIntensity: 0.32,
        roughness: 0.18,
        clearcoat: 0.85,
      })
    );
    musdDome.position.y = 0.75;
    musdDome.castShadow = true;
    musdVaultDomeGroup.add(musdDome);

    // 3 Golden Arch Ribs across the MUSD Treasury Dome
    const domeRibMat = new THREE.MeshStandardMaterial({
      color: "#fbbf24",
      metalness: 0.72,
      roughness: 0.25,
    });
    for (let ri = 0; ri < 3; ri++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.695, 0.024, 8, 24, Math.PI),
        domeRibMat
      );
      rib.position.y = 0.75;
      rib.rotation.y = (ri * Math.PI) / 3;
      musdVaultDomeGroup.add(rib);
    }

    const musdVaultHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.88, 0.055, 12, 36),
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        emissive: "#f59e0b",
        emissiveIntensity: 0.55,
        metalness: 0.65,
        roughness: 0.28,
      })
    );
    musdVaultHalo.rotation.x = Math.PI / 2;
    musdVaultHalo.position.y = 1.05;
    musdVaultDomeGroup.add(musdVaultHalo);

    const musdBeaconGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.24),
      new THREE.MeshPhysicalMaterial({
        color: "#34d399",
        emissive: "#10b981",
        emissiveIntensity: 0.8,
        roughness: 0.1,
        clearcoat: 0.9,
      })
    );
    musdBeaconGem.position.y = 1.72;
    musdVaultDomeGroup.add(musdBeaconGem);

    const loanSweepMat = new THREE.MeshBasicMaterial({
      color: "#f43f5e",
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const loanSweepRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.045, 10, 32),
      loanSweepMat
    );
    loanSweepRing.rotation.x = Math.PI / 2;
    loanSweepRing.position.y = 0.6;
    musdVaultDomeGroup.add(loanSweepRing);
    scene.add(musdVaultDomeGroup);

    // Reactive MUSD Treasury Transfer Conduit (Central Citadel <-> Main MUSD Vault Dome)
    const musdTransferCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.35, 0),
      new THREE.Vector3(0.05, 2.35, 2.75),
      new THREE.Vector3(0.1, 1.8, 5.45),
    ]);
    const musdConduitMat = new THREE.MeshBasicMaterial({
      color: "#34d399",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const musdConduitTube = new THREE.Mesh(
      new THREE.TubeGeometry(musdTransferCurve, 28, 0.045, 8, false),
      musdConduitMat
    );
    const musdTransferOrbMat = new THREE.MeshBasicMaterial({
      color: "#fef08a",
      transparent: true,
      opacity: 0,
    });
    const musdTransferOrbs: THREE.Mesh[] = [];
    const musdTransferGroup = new THREE.Group();
    musdTransferGroup.add(musdConduitTube);
    for (let mi = 0; mi < 4; mi++) {
      const mOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        musdTransferOrbMat
      );
      musdTransferGroup.add(mOrb);
      musdTransferOrbs.push(mOrb);
    }
    musdTransferGroup.visible = false;
    scene.add(musdTransferGroup);

    // 10. Multi-Tuft Stylized Clay Trees & Flowers Around the Lawn
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
    treePositions.forEach(([tx, tz, col, sc], tidx) => {
      const t = new THREE.Group();
      t.position.set(tx, 0.48, tz);
      t.scale.setScalar(sc);
      const tr = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 0.42, 10),
        railWoodMat
      );
      tr.position.y = 0.21;
      tr.castShadow = true;
      t.add(tr);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.76,
      });
      const crMain = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 16, 14),
        canopyMat
      );
      crMain.position.y = 0.56;
      crMain.castShadow = true;
      t.add(crMain);
      const sideA = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 12),
        canopyMat
      );
      sideA.position.set(0.18, 0.48, 0.12);
      sideA.castShadow = true;
      t.add(sideA);
      const sideB = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 12, 12),
        canopyMat
      );
      sideB.position.set(-0.16, 0.5, -0.1);
      sideB.castShadow = true;
      t.add(sideB);
      if (tidx % 2 === 0) {
        const bush = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 10, 10),
          canopyMat
        );
        bush.position.set(0.24, 0.1, -0.18);
        t.add(bush);
      }
      scene.add(t);
    });

    // 11. Build Articulated Characters (Aura, Kronos, Patch, Sentinel, Soundwave)
    const agentMeshes: Record<number, ArticulatedCharacterRig> = {};

    agentsRef.current.forEach((agent, agentIdx) => {
      const g = new THREE.Group();
      const bodyGroup = new THREE.Group();
      g.add(bodyGroup);

      const initialTarget = agentTargetsRef.current[agent.id] || [0, 0.5, 0];
      const currentPos = new THREE.Vector3(
        initialTarget[0],
        initialTarget[1],
        initialTarget[2]
      );
      g.position.copy(currentPos);

      const shadowMesh = createCharacterShadowMesh(textures.shadowBlobMap, 0.44);
      shadowMesh.position.y = 0.012;
      g.add(shadowMesh);

      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: agent.color,
        roughness: 0.42,
        metalness: 0.06,
        clearcoat: 0.3,
        clearcoatRoughness: 0.25,
      });

      // Cute Chubby Clay Character Body
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 22, 22),
        bodyMat
      );
      body.scale.set(1, 1.08, 0.95);
      body.position.y = 0.39;
      body.castShadow = true;
      bodyGroup.add(body);

      // Stubby rounded feet
      const footMat = new THREE.MeshStandardMaterial({
        color: "#1e293b",
        roughness: 0.65,
      });
      [-0.13, 0.13].forEach((fx) => {
        const foot = new THREE.Mesh(
          new THREE.SphereGeometry(0.085, 10, 10),
          footMat
        );
        foot.scale.set(0.95, 0.65, 1.3);
        foot.position.set(fx, 0.06, 0.06);
        foot.castShadow = true;
        bodyGroup.add(foot);
      });

      // Articulated swinging arms
      const buildArm = (side: -1 | 1) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.36, 0.42, 0);
        const limb = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.065, 0.14, 6, 10),
          bodyMat
        );
        limb.position.y = -0.09;
        limb.rotation.z = side * 0.24;
        limb.castShadow = true;
        pivot.add(limb);
        bodyGroup.add(pivot);
        return pivot;
      };
      const leftArm = buildArm(-1);
      const rightArm = buildArm(1);

      // Expressive blinking eyes with white sclera & dark pupil
      const eyeMeshes: THREE.Object3D[] = [];
      [-0.12, 0.12].forEach((ex) => {
        const eyeHolder = new THREE.Group();
        eyeHolder.position.set(ex, 0.46, 0.31);
        const whiteEye = new THREE.Mesh(
          new THREE.SphereGeometry(0.068, 12, 12),
          new THREE.MeshBasicMaterial({ color: "#ffffff" })
        );
        eyeHolder.add(whiteEye);

        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 10, 10),
          new THREE.MeshBasicMaterial({ color: "#1e1b18" })
        );
        pupil.position.set(0, 0, 0.05);
        eyeHolder.add(pupil);

        bodyGroup.add(eyeHolder);
        eyeMeshes.push(eyeHolder);
      });

      // Distinct Headgear per Real Agent Role
      let headAcc: THREE.Object3D | undefined;
      if (agent.archetype === "head") {
        // Aura: Black Beret & Antenna
        const beretGroup = new THREE.Group();
        const beret = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.24, 0.1, 16),
          new THREE.MeshStandardMaterial({ color: "#1f242d", roughness: 0.7 })
        );
        beret.position.set(0, 0.77, 0);
        beret.rotation.z = -0.15;
        beretGroup.add(beret);

        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8),
          new THREE.MeshStandardMaterial({ color: "#1f242d" })
        );
        stem.position.set(0, 0.89, 0);
        beretGroup.add(stem);
        bodyGroup.add(beretGroup);
        headAcc = beretGroup;
      } else if (agent.archetype === "dca") {
        // Kronos: Golden DCA Sprout Leaf on Head
        const leaf = new THREE.Mesh(
          new THREE.ConeGeometry(0.12, 0.24, 8),
          new THREE.MeshStandardMaterial({ color: "#4d9057", roughness: 0.65 })
        );
        leaf.position.set(0, 0.83, 0);
        leaf.rotation.z = 0.25;
        bodyGroup.add(leaf);
        headAcc = leaf;
      } else if (agent.archetype === "rectifier") {
        // Patch: Headset / Diagnostic Visor Arch
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(0.37, 0.035, 10, 24, Math.PI),
          new THREE.MeshStandardMaterial({
            color: "#1f242d",
            metalness: 0.35,
            roughness: 0.4,
          })
        );
        band.position.set(0, 0.44, 0);
        bodyGroup.add(band);
        headAcc = band;
      } else if (agent.archetype === "sentinel") {
        // Ironhide: Guardian Cannon Crest
        const crest = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.14, 0),
          new THREE.MeshStandardMaterial({
            color: "#fde68a",
            emissive: "#f59e0b",
            emissiveIntensity: 0.35,
          })
        );
        crest.position.set(0, 0.87, 0);
        bodyGroup.add(crest);
        headAcc = crest;
      } else if (agent.archetype === "news") {
        // Soundwave: Comms Dish & Golden News Halo
        const haloGroup = new THREE.Group();
        const topknot = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 14, 14),
          new THREE.MeshStandardMaterial({ color: "#fbbf24", roughness: 0.45 })
        );
        topknot.position.set(0, 0.82, 0);
        haloGroup.add(topknot);

        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(0.26, 0.025, 10, 24),
          new THREE.MeshStandardMaterial({
            color: "#fef08a",
            emissive: "#f59e0b",
            emissiveIntensity: 0.45,
          })
        );
        halo.position.set(0, 0.94, 0);
        halo.rotation.x = Math.PI / 2;
        haloGroup.add(halo);
        bodyGroup.add(haloGroup);
        headAcc = haloGroup;
      }

      g.userData.agentId = agent.id;
      scene.add(g);
      agentMeshes[agent.id] = {
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
        blinkSeed: agentIdx * 1.15 + 0.4,
      };
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

    // 3D Raycasting for direct clicking/hovering on Autobots, Island Stations, and Connected Sub-Islands
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const mainInteractiveRoots: THREE.Object3D[] = [
      ...Object.values(agentMeshes).map((m) => m.group),
      astrolabeGroup,
      lighthouseGroup,
      piggyGroup,
      rectifierGroup,
      policyGroup,
      musdVaultDomeGroup,
    ];
    interactiveRootsRef.current = [...mainInteractiveRoots, archipelagoGroup];
    let pointerDownPos: { x: number; y: number } | null = null;
    let lastHoverCheck = 0;

    const findInteractiveTarget = (
      clientX: number,
      clientY: number
    ): { agentId?: number; stationId?: string; subIslandId?: string } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactiveRootsRef.current, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          if (typeof node.userData?.agentId === "number") {
            return { agentId: node.userData.agentId };
          }
          if (typeof node.userData?.stationId === "string") {
            return { stationId: node.userData.stationId };
          }
          if (typeof node.userData?.subIslandId === "string") {
            return { subIslandId: node.userData.subIslandId };
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
      } else if (hit?.subIslandId) {
        onSelectSubIslandRef.current?.(hit.subIslandId);
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
      controls.target.x = Math.max(-14, Math.min(14, controls.target.x));
      controls.target.z = Math.max(-14, Math.min(14, controls.target.z));
      controls.target.y = Math.max(0, Math.min(2.6, controls.target.y));

      // Apply Smooth Market-Mood Atmosphere, Sunlit Ocean Ripples & Volumetric 3D Clouds
      const mood = marketMoodRef.current;
      const choreo = choreoRef.current;
      const isBurstActive = Date.now() < choreo.burstUntilMs;
      const stormIntensity =
        mood === "CAUTIOUS" ? 0.85 : mood === "BULLISH" ? 0.08 : 0.22;

      lightingCtrl.applyMood(mood, delta, false);
      oceanEnv.update(elapsed, {
        delta,
        stormIntensity,
        targetWaterColor:
          mood === "CAUTIOUS"
            ? "#0e7490"
            : mood === "BULLISH"
            ? "#38bdf8"
            : "#22b8ee",
        targetDeepColor:
          mood === "CAUTIOUS"
            ? "#0f172a"
            : mood === "BULLISH"
            ? "#0284c7"
            : "#0369a1",
      });

      const targetBeamOpacity = mood === "CAUTIOUS" ? 0.26 : 0.14;
      beamConeMat.opacity += (targetBeamOpacity - beamConeMat.opacity) * 0.08;
      const targetLanternGlow = mood === "CAUTIOUS" ? 1.35 : 0.85;
      lhLanternMat.emissiveIntensity +=
        (targetLanternGlow - lhLanternMat.emissiveIntensity) * 0.08;
      lanternGlowMat.emissiveIntensity +=
        ((mood === "CAUTIOUS" ? 1.55 : 1.05) - lanternGlowMat.emissiveIntensity) *
        0.08;
      lhSweepPivot.rotation.y += delta * (mood === "CAUTIOUS" ? 0.98 : 0.65);

      const debateOrScanActive =
        phaseRef.current === "NEWS_SCANNING" || choreo.hasDebateAnchor;
      if (debateOrScanActive) {
        const rWave = (elapsed * 0.72) % 1;
        lhRadioRing.visible = true;
        lhRadioRing.scale.setScalar(0.85 + rWave * 1.15);
        lhRadioRing.position.y = 2.57 + rWave * 0.45;
        lhRadioRingMat.opacity =
          (1 - rWave) * (isBurstActive || phaseRef.current === "NEWS_SCANNING" ? 0.68 : 0.35);
      } else {
        lhRadioRingMat.opacity += (0 - lhRadioRingMat.opacity) * 0.12;
        lhRadioRing.visible = lhRadioRingMat.opacity > 0.01;
      }

      // Rotate Astrolabe Rings, Mezo Core Orb & Floating Spire Gems
      coreOrb.rotation.y = -Math.PI / 2 + Math.sin(elapsed * 0.7) * 0.22;
      gyroRing1.rotation.y += delta * 0.9;
      gyroRing1.rotation.x = Math.sin(elapsed * 0.8) * 0.4;
      gyroRing2.rotation.z += delta * 1.1;

      floatingGems.forEach((gem, idx) => {
        gem.rotation.y += delta * 1.6;
        gem.position.y = 1.88 + Math.sin(elapsed * 2.5 + idx) * 0.07;
      });

      // Animate DCA Coin above Golden Piggy Bank + Main MUSD Treasury Dome
      dcaCoin.rotation.z += delta * 2.0;
      dcaCoin.position.y = 2.08 + Math.sin(elapsed * 3.2) * 0.08;
      musdBeaconGem.rotation.y += delta * 1.5;
      musdBeaconGem.position.y = 1.72 + Math.sin(elapsed * 2.6) * 0.07;
      musdVaultHalo.rotation.z = elapsed * 0.5;

      // Animate Floating Archipelago Satellites (Buoyancy), Crystal Beacons, Bridges & Buoys
      const activeSubId = selectedSubIslandIdRef.current;
      satelliteAnimsRef.current.forEach((sat) => {
        sat.root.position.y =
          sat.baseY + Math.sin(elapsed * 1.45 + sat.phaseOffset) * 0.11;
        sat.root.rotation.z =
          Math.sin(elapsed * 1.1 + sat.phaseOffset) * 0.018;
        sat.root.rotation.x =
          Math.cos(elapsed * 0.95 + sat.phaseOffset) * 0.014;
        sat.dockGem.rotation.y = elapsed * 1.8 + sat.phaseOffset;
        sat.dockGem.rotation.z =
          Math.sin(elapsed * 1.2 + sat.phaseOffset) * 0.14;

        sat.orbs.forEach((orb, orbIdx) => {
          const raw = (elapsed * 0.28 + orbIdx * 0.5) % 1;
          const u =
            sat.flowDir === "main_to_sub"
              ? raw
              : sat.flowDir === "sub_to_main"
              ? 1 - raw
              : orbIdx % 2 === 0
              ? raw
              : 1 - raw;
          const pt = sat.curve.getPointAt(u);
          orb.position.copy(pt);
          const s = 0.8 + 0.35 * Math.sin(raw * Math.PI);
          orb.scale.setScalar(s);
        });

        sat.buoys.forEach((b) => {
          b.mesh.position.y =
            b.baseY + Math.sin(elapsed * 2.1 + b.offset) * 0.05;
          b.mesh.rotation.z = Math.sin(elapsed * 1.9 + b.offset) * 0.04;
        });

        const haloMat = sat.haloMesh.material as THREE.MeshBasicMaterial;
        if (activeSubId === sat.islandId) {
          sat.haloMesh.visible = true;
          const p = 1.03 + Math.sin(elapsed * 4.2) * 0.05;
          sat.haloMesh.scale.set(p, p, 1);
          haloMat.color.set(sat.linkHex);
          haloMat.opacity = 0.78 + Math.sin(elapsed * 4.2) * 0.18;
        } else if (sat.isOwned) {
          sat.haloMesh.visible = true;
          sat.haloMesh.scale.set(1, 1, 1);
          haloMat.color.set("#f59e0b");
          haloMat.opacity = 0.32 + Math.sin(elapsed * 2.0 + sat.phaseOffset) * 0.08;
        } else {
          sat.haloMesh.visible = false;
        }
      });

      // Rotate Patch's Diagnostic Crane Boom + Pendulum Hook Swing
      const decision = decisionRef.current;
      const alertState = vaultAlertRef.current;
      const isRectifying =
        decision === "RECTIFY_AND_EXECUTE" || alertState === "RECTIFIED";

      craneBoom.rotation.y = isRectifying
        ? Math.sin(elapsed * 2.4) * 0.75
        : Math.sin(elapsed * 0.9) * 0.55;
      craneHookGroup.rotation.z =
        Math.sin(elapsed * 2.3) * (isRectifying ? 0.18 : 0.06);
      craneHookGroup.rotation.x = Math.cos(elapsed * 1.8) * 0.04;

      // Reactive Policy Fortress: Blocked / Rectifying / Guardrail Tune / Trove Rescue Wave
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
      } else if (choreo.hasPolicyTune) {
        const tuneWave = 0.5 + 0.5 * Math.sin(elapsed * 5.2);
        policyShieldMat.color.set("#818cf8");
        policyShieldMat.emissive.set("#6366f1");
        policyShieldMat.emissiveIntensity = 0.6 + tuneWave * 0.5;
        rectifierRingMat.color.set("#10b981");
        rectifierRingMat.emissive.set("#10b981");
        rectifierRingMat.emissiveIntensity = 0.6;
      } else {
        policyShieldMat.color.set("#3b82f6");
        policyShieldMat.emissive.set("#3b82f6");
        policyShieldMat.emissiveIntensity = 0.5;
        rectifierRingMat.color.set("#10b981");
        rectifierRingMat.emissive.set("#10b981");
        rectifierRingMat.emissiveIntensity = 0.6;
      }

      if (choreo.hasRescueTrove || choreo.hasPolicyTune) {
        const waveT = (elapsed * 0.85) % 1;
        troveShieldWave.visible = true;
        troveShieldWave.scale.setScalar(0.95 + waveT * 0.9);
        troveShieldWave.position.y = 0.75 + waveT * 0.95;
        troveWaveMat.color.set(choreo.hasRescueTrove ? "#22d3ee" : "#818cf8");
        troveWaveMat.opacity = (1 - waveT) * (isBurstActive ? 0.72 : 0.34);

        troveSparkMat.opacity = isBurstActive ? 0.9 : 0.45;
        troveSparks.forEach((sp, si) => {
          sp.visible = choreo.hasRescueTrove;
          if (sp.visible) {
            const sa = elapsed * 2.2 + (si * Math.PI * 2) / 3;
            sp.position.set(
              Math.cos(sa) * 1.15,
              1.15 + Math.sin(elapsed * 3.5 + si) * 0.25,
              Math.sin(sa) * 1.15
            );
            sp.rotation.y += delta * 2.4;
          }
        });
      } else {
        troveWaveMat.opacity += (0 - troveWaveMat.opacity) * 0.14;
        troveShieldWave.visible = troveWaveMat.opacity > 0.01;
        troveSparks.forEach((sp) => {
          sp.visible = false;
        });
      }

      // Reactive MUSD Treasury Transfer Conduit + Overdue Loan Sweep Wave
      const hasMusdFlow =
        choreo.hasMusdDeposit || choreo.hasMusdWithdraw || choreo.hasStrategicRecord;
      const targetMusdConduitOpacity = hasMusdFlow
        ? isBurstActive
          ? 0.56
          : 0.25
        : 0;
      const targetMusdOrbOpacity = hasMusdFlow ? (isBurstActive ? 0.96 : 0.55) : 0;

      musdConduitMat.opacity += (targetMusdConduitOpacity - musdConduitMat.opacity) * 0.12;
      musdTransferOrbMat.opacity += (targetMusdOrbOpacity - musdTransferOrbMat.opacity) * 0.12;
      musdTransferGroup.visible = musdConduitMat.opacity > 0.01;

      if (musdTransferGroup.visible) {
        const flowColor = choreo.hasMusdWithdraw
          ? "#38bdf8"
          : choreo.hasMusdDeposit
          ? "#34d399"
          : "#c084fc";
        musdConduitMat.color.set(flowColor);
        musdTransferOrbMat.color.set(choreo.hasMusdWithdraw ? "#e0f2fe" : "#fef08a");

        musdTransferOrbs.forEach((orb, idx) => {
          const raw = (elapsed * 0.52 + idx * 0.25) % 1;
          const u = choreo.hasMusdWithdraw ? 1 - raw : raw;
          orb.position.copy(musdTransferCurve.getPointAt(u));
          orb.scale.setScalar(0.75 + 0.4 * Math.sin(raw * Math.PI));
        });
      }

      if (choreo.hasLoanSweep) {
        const sWave = (elapsed * 0.9) % 1;
        loanSweepRing.visible = true;
        loanSweepRing.scale.setScalar(0.95 + sWave * 1.15);
        loanSweepMat.opacity = (1 - sWave) * (isBurstActive ? 0.78 : 0.36);
      } else {
        loanSweepMat.opacity += (0 - loanSweepMat.opacity) * 0.14;
        loanSweepRing.visible = loanSweepMat.opacity > 0.01;
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

      // Smoothly move & animate the articulated real AI agents
      agentsRef.current.forEach((ag, idx) => {
        const entry = agentMeshes[ag.id];
        if (!entry) return;
        const target = agentTargetsRef.current[ag.id] || [0, 0.5, 0];
        const dest = new THREE.Vector3(target[0], target[1], target[2]);
        animateArticulatedCharacter(entry, dest, delta, elapsed, ag.id + idx);
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
        const st =
          activeStationId === MAIN_MUSD_VAULT_STATION.id
            ? MAIN_MUSD_VAULT_STATION
            : ISLAND_STATIONS.find((s) => s.id === activeStationId);
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
        nextStations[MAIN_MUSD_VAULT_STATION.id] = projectToScreen(
          new THREE.Vector3(
            MAIN_MUSD_VAULT_STATION.position[0],
            MAIN_MUSD_VAULT_STATION.position[1] + 2.25,
            MAIN_MUSD_VAULT_STATION.position[2]
          ),
          w,
          h
        );
        setStationCoords(nextStations);

        const nextAgents: Record<number, ProjectedOverlay> = {};
        agentsRef.current.forEach((ag) => {
          const entry = agentMeshes[ag.id];
          if (entry) {
            nextAgents[ag.id] = projectToScreen(
              new THREE.Vector3(
                entry.group.position.x,
                entry.group.position.y + entry.bodyGroup.position.y + 1.08,
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

        const nextSubOverlays: SubIslandOverlayState[] =
          satelliteAnimsRef.current.map((sat) => {
            const proj = projectToScreen(
              new THREE.Vector3(
                sat.anchorWorld[0],
                sat.root.position.y + 1.55,
                sat.anchorWorld[2]
              ),
              w,
              h
            );
            return {
              ...proj,
              ...sat.overlayMeta,
            };
          });
        setSubIslandOverlays(nextSubOverlays);
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
      disposeObjectTree(archipelagoGroup);
      archipelagoGroup.clear();
      archipelagoGroupRef.current = null;
      satelliteAnimsRef.current = [];
      disposeObjectTree(scene);
      textures.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Build & refresh connected Floating Archipelago Sub-Islands + bridges without recreating WebGLRenderer
  useEffect(() => {
    const archipelagoGroup = archipelagoGroupRef.current;
    if (!archipelagoGroup) return;

    disposeObjectTree(archipelagoGroup);
    archipelagoGroup.clear();
    satelliteAnimsRef.current = [];

    if (!satellitePlacements.length) {
      setSubIslandOverlays([]);
      return;
    }

    const mainVaultStart = new THREE.Vector3(
      MAIN_MUSD_VAULT_STATION.position[0],
      1.92,
      MAIN_MUSD_VAULT_STATION.position[2]
    );
    const botPalette = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b"];
    const animEntries: SatelliteAnimEntry[] = [];

    satellitePlacements.forEach((p) => {
      const { island, idx, angle, radius, x, y, z, isOwned } = p;
      const palette =
        SUB_BIOME_COLORS[island.biomeTheme] || SUB_BIOME_COLORS.meadow;
      const link = resolveSubIslandLinkVisual(island);

      const satGroup = new THREE.Group();
      satGroup.position.set(x, y, z);
      satGroup.userData.subIslandId = island.islandId;
      archipelagoGroup.add(satGroup);

      // Outer clay stone rim
      const outerRim = new THREE.Mesh(
        new THREE.CylinderGeometry(2.05, 2.16, 0.34, 28),
        new THREE.MeshStandardMaterial({
          color: palette.outerRim,
          roughness: 0.85,
        })
      );
      outerRim.position.y = 0.02;
      outerRim.receiveShadow = true;
      satGroup.add(outerRim);

      // Floating island underbelly monolith cone
      const underbelly = new THREE.Mesh(
        new THREE.ConeGeometry(1.98, 1.18, 16),
        new THREE.MeshStandardMaterial({
          color:
            island.biomeTheme === "basalt" || island.biomeTheme === "grid"
              ? "#334155"
              : "#a89f91",
          roughness: 0.92,
        })
      );
      underbelly.rotation.x = Math.PI;
      underbelly.position.y = -0.72;
      satGroup.add(underbelly);

      // Sub-rim accent band
      const subRim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.94, 1.98, 0.14, 24),
        new THREE.MeshStandardMaterial({
          color: palette.subRim,
          roughness: 0.84,
        })
      );
      subRim.position.y = 0.15;
      satGroup.add(subRim);

      // Primary biome land disc
      const groundDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.86, 0.14, 24),
        new THREE.MeshStandardMaterial({
          color: palette.ground,
          roughness: 0.88,
        })
      );
      groundDisc.position.y = 0.22;
      satGroup.add(groundDisc);

      // Courtyard inner plateau
      const courtyard = new THREE.Mesh(
        new THREE.CylinderGeometry(1.12, 1.16, 0.08, 20),
        new THREE.MeshStandardMaterial({
          color: palette.courtyard,
          roughness: 0.82,
        })
      );
      courtyard.position.y = 0.28;
      satGroup.add(courtyard);

      // Cyber Grid wireframe accent if biome === grid
      if (island.biomeTheme === "grid") {
        const cyberRing = new THREE.Mesh(
          new THREE.RingGeometry(1.14, 1.22, 24),
          new THREE.MeshBasicMaterial({
            color: "#22d3ee",
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
          })
        );
        cyberRing.rotation.x = -Math.PI / 2;
        cyberRing.position.y = 0.33;
        satGroup.add(cyberRing);
      }

      const vCount = Math.min(4, Math.max(0, island.vaultCount || 0));
      const aCount = Math.min(4, Math.max(0, island.agentCount || 0));

      if (vCount === 0 && aCount === 0) {
        // Empty seeded land visual: glowing survey circle + corner stakes
        const surveyPad = new THREE.Mesh(
          new THREE.RingGeometry(0.64, 0.78, 24),
          new THREE.MeshBasicMaterial({
            color: link.hex,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          })
        );
        surveyPad.rotation.x = -Math.PI / 2;
        surveyPad.position.y = 0.33;
        satGroup.add(surveyPad);

        for (let k = 0; k < 4; k++) {
          const sa = (k * Math.PI) / 2 + Math.PI / 4;
          const stake = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.26, 6),
            new THREE.MeshStandardMaterial({
              color: "#d97706",
              roughness: 0.75,
            })
          );
          stake.position.set(Math.cos(sa) * 0.72, 0.42, Math.sin(sa) * 0.72);
          satGroup.add(stake);
        }
      } else {
        // Render miniature Vault Domes
        for (let vi = 0; vi < vCount; vi++) {
          const va = (vi * Math.PI * 2) / Math.max(1, vCount) + 0.45;
          const vx = Math.cos(va) * 1.36;
          const vz = Math.sin(va) * 1.36;
          const vBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.26, 0.22, 12),
            new THREE.MeshStandardMaterial({
              color: vi % 2 === 0 ? "#10b981" : "#f59e0b",
              roughness: 0.45,
              metalness: 0.15,
            })
          );
          vBase.position.set(vx, 0.4, vz);
          satGroup.add(vBase);

          const vDome = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 12, 10),
            new THREE.MeshStandardMaterial({
              color: vi % 2 === 0 ? "#6ee7b7" : "#fde68a",
              roughness: 0.35,
            })
          );
          vDome.position.set(vx, 0.52, vz);
          satGroup.add(vDome);
        }

        // Render miniature AI Bot Capsules
        for (let ai = 0; ai < aCount; ai++) {
          const aa = (ai * Math.PI * 2) / Math.max(1, aCount) - 0.3;
          const ax = Math.cos(aa) * 0.56;
          const az = Math.sin(aa) * 0.56;
          const botMatColor = botPalette[ai % botPalette.length];
          const botBody = new THREE.Mesh(
            new THREE.CylinderGeometry(0.13, 0.17, 0.3, 10),
            new THREE.MeshStandardMaterial({
              color: botMatColor,
              roughness: 0.45,
            })
          );
          botBody.position.set(ax, 0.48, az);
          satGroup.add(botBody);

          const botHead = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 10, 8),
            new THREE.MeshStandardMaterial({
              color: "#fef08a",
              emissive: botMatColor,
              emissiveIntensity: 0.3,
              roughness: 0.3,
            })
          );
          botHead.position.set(ax, 0.68, az);
          satGroup.add(botHead);
        }
      }

      // Inward Crystal Dock Pier pointing toward MAIN_MUSD_VAULT_STATION
      const toMainX = MAIN_MUSD_VAULT_STATION.position[0] - x;
      const toMainZ = MAIN_MUSD_VAULT_STATION.position[2] - z;
      const lenToMain = Math.hypot(toMainX, toMainZ) || 1;
      const dirX = toMainX / lenToMain;
      const dirZ = toMainZ / lenToMain;
      const dockYaw = Math.atan2(dirX, dirZ);

      const dockGroup = new THREE.Group();
      dockGroup.position.set(dirX * 1.98, 0.14, dirZ * 1.98);
      dockGroup.rotation.y = dockYaw;
      satGroup.add(dockGroup);

      const dockPlank = new THREE.Mesh(
        new THREE.BoxGeometry(0.58, 0.14, 0.78),
        new THREE.MeshStandardMaterial({
          color: "#cbd5e1",
          roughness: 0.75,
        })
      );
      dockPlank.position.set(0, 0.08, 0.14);
      dockGroup.add(dockPlank);

      const dockPylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.14, 0.36, 10),
        new THREE.MeshStandardMaterial({
          color: "#475569",
          roughness: 0.6,
        })
      );
      dockPylon.position.set(0, 0.3, 0.28);
      dockGroup.add(dockPylon);

      const dockGem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.21, 0),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          emissive: link.hex,
          emissiveIntensity: 0.85,
          roughness: 0.2,
          metalness: 0.15,
        })
      );
      dockGem.position.set(0, 0.72, 0.28);
      dockGroup.add(dockGem);

      // Selection / Ownership halo ring around satellite
      const haloMesh = new THREE.Mesh(
        new THREE.RingGeometry(2.26, 2.52, 36),
        new THREE.MeshBasicMaterial({
          color: link.hex,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        })
      );
      haloMesh.rotation.x = -Math.PI / 2;
      haloMesh.position.y = 0.08;
      haloMesh.visible = false;
      satGroup.add(haloMesh);

      // Connection 1: High-arcing parabolic CatmullRom energy tether from Main MUSD Vault -> Satellite Crystal Dock
      const dockWorldX = x + dirX * 2.26;
      const dockWorldY = y + 0.86;
      const dockWorldZ = z + dirZ * 2.26;
      const bridgeEnd = new THREE.Vector3(dockWorldX, dockWorldY, dockWorldZ);
      const dist = mainVaultStart.distanceTo(bridgeEnd);

      const liftPt = new THREE.Vector3(
        mainVaultStart.x + (bridgeEnd.x - mainVaultStart.x) * 0.2,
        4.35,
        mainVaultStart.z + (bridgeEnd.z - mainVaultStart.z) * 0.2
      );
      const peakPt = new THREE.Vector3(
        (mainVaultStart.x + bridgeEnd.x) * 0.52,
        5.15 + Math.min(2.15, dist * 0.075),
        (mainVaultStart.z + bridgeEnd.z) * 0.52
      );
      const curve = new THREE.CatmullRomCurve3([
        mainVaultStart,
        liftPt,
        peakPt,
        bridgeEnd,
      ]);

      const outerTube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.052, 7, false),
        new THREE.MeshStandardMaterial({
          color: link.hex,
          emissive: link.hex,
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.28,
          roughness: 0.25,
        })
      );
      archipelagoGroup.add(outerTube);

      const innerTube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.018, 6, false),
        new THREE.MeshStandardMaterial({
          color: "#ffffff",
          emissive: link.hex,
          emissiveIntensity: 0.85,
          transparent: true,
          opacity: 0.82,
        })
      );
      archipelagoGroup.add(innerTube);

      const orbs: THREE.Mesh[] = [];
      for (let oi = 0; oi < 2; oi++) {
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 10, 10),
          new THREE.MeshStandardMaterial({
            color: "#ffffff",
            emissive: link.hex,
            emissiveIntensity: 0.95,
            roughness: 0.1,
          })
        );
        archipelagoGroup.add(orb);
        orbs.push(orb);
      }

      // Connection 2: Clay stepping-stone buoys spanning the gap from Main rim (8.15) toward Satellite rim
      const buoys: Array<{ mesh: THREE.Mesh; baseY: number; offset: number }> = [];
      const radDirX = Math.cos(angle);
      const radDirZ = Math.sin(angle);
      const buoyStartR = 8.75;
      const buoyEndR = Math.max(buoyStartR + 1.2, radius - 2.65);
      for (let bi = 0; bi < 3; bi++) {
        const bt = (bi + 0.5) / 3;
        const br = buoyStartR + (buoyEndR - buoyStartR) * bt;
        const buoyMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.32, 0.14, 12),
          new THREE.MeshStandardMaterial({
            color: "#e2e8f0",
            roughness: 0.8,
          })
        );
        const capGem = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 8),
          new THREE.MeshStandardMaterial({
            color: link.hex,
            emissive: link.hex,
            emissiveIntensity: 0.55,
          })
        );
        capGem.position.y = 0.09;
        buoyMesh.add(capGem);

        const buoyBaseY = 0.14 + bi * 0.03;
        buoyMesh.position.set(radDirX * br, buoyBaseY, radDirZ * br);
        archipelagoGroup.add(buoyMesh);
        buoys.push({
          mesh: buoyMesh,
          baseY: buoyBaseY,
          offset: idx * 0.9 + bi * 1.1,
        });
      }

      animEntries.push({
        islandId: island.islandId,
        root: satGroup,
        baseY: y,
        phaseOffset: idx * 1.15,
        dockGem,
        curve,
        orbs,
        flowDir: link.flowDir,
        haloMesh,
        buoys,
        anchorWorld: [x, y, z],
        isOwned,
        linkHex: link.hex,
        overlayMeta: {
          islandId: island.islandId,
          name: island.name,
          biomeTheme: island.biomeTheme,
          isOwned,
          statusLabel: link.label,
          statusHex: link.hex,
          mezoTierId: island.mezoTierId,
        },
      });
    });

    satelliteAnimsRef.current = animEntries;

    return () => {
      disposeObjectTree(archipelagoGroup);
      archipelagoGroup.clear();
      satelliteAnimsRef.current = [];
    };
  }, [satellitePlacements]);

  const skyMoodClass =
    marketMood === "CAUTIOUS"
      ? "from-[#526c8c] via-[#8ca5c2] to-[#cad8ea]"
      : marketMood === "BULLISH"
      ? "from-[#76bcf6] via-[#bce4ff] to-[#f1f9ff]"
      : "from-[#82beef] via-[#bce0fc] to-[#eaf5ff]";

  const moodChipMeta =
    marketMood === "CAUTIOUS"
      ? {
          icon: "⛈️",
          label: "Storm Watch",
          cls: "bg-slate-800/10 text-slate-700 border-slate-400/30",
        }
      : marketMood === "BULLISH"
      ? {
          icon: "☀️",
          label: "Bullish Oasis",
          cls: "bg-amber-400/15 text-amber-800 border-amber-400/40",
        }
      : {
          icon: "⛅",
          label: "Clear Market",
          cls: "bg-sky-400/15 text-sky-800 border-sky-400/35",
        };

  return (
    <div
      className={`relative w-full h-full select-none overflow-hidden bg-gradient-to-b transition-colors duration-1000 ${skyMoodClass}`}
    >
      {/* Three.js WebGL Mount Container */}
      <div
        ref={containerRef}
        className="relative z-10 w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* 3D-Projected Floating Pills & Agent Labels */}
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {/* Top White Speech Bubble Pill above Lighthouse */}
        {topBannerCoord.visible && (
          <div
            style={{
              transform: `translate3d(${topBannerCoord.x}px, ${topBannerCoord.y}px, 0) translate(-50%, -50%)`,
            }}
            className="absolute left-0 top-0 rounded-2xl bg-white/95 px-3.5 py-1.5 text-xs font-semibold text-[#2d2620] shadow-[0_8px_24px_rgba(45,38,32,0.12)] border border-white whitespace-nowrap flex items-center gap-2"
          >
            <span>{headlineSpeech}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-black ${moodChipMeta.cls}`}
            >
              <span>{moodChipMeta.icon}</span>
              <span>{moodChipMeta.label}</span>
            </span>
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
          const hasEarnOrPoolDeploy = (latestActions || []).some(
            (a) =>
              a.status === "EXECUTED" &&
              (a.type === "DEPLOY_EARN_VAULT" ||
                a.type === "DEPLOY_TIGRIS_POOL" ||
                a.type === "DEPOSIT_MUSD_VAULT")
          );
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
                label: "CAPITAL PULSE",
                cls: "bg-emerald-500/20 text-emerald-800 border-emerald-400/50",
                dot: "bg-emerald-400",
              }
            : hasEarnOrPoolDeploy
            ? {
                label: "EARN ROTATE",
                cls: "bg-teal-500/20 text-teal-900 border-teal-400/50",
                dot: "bg-teal-500",
              }
            : {
                label: "YIELD SHIELD",
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
              {stationActionBadges[station.id] && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-black border ${
                    isActive || isSelected
                      ? "bg-white/20 text-white border-white/40"
                      : stationActionBadges[station.id].cls
                  }`}
                >
                  {stationActionBadges[station.id].label}
                </span>
              )}
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

        {/* Additive Main MUSD Treasury Vault Badge */}
        {(() => {
          const coord = stationCoords[MAIN_MUSD_VAULT_STATION.id];
          if (!coord || !coord.visible) return null;
          const isSelected = selectedStationId === MAIN_MUSD_VAULT_STATION.id;
          const vaultActionBadge =
            stationActionBadges[MAIN_MUSD_VAULT_STATION.id];
          return (
            <button
              key={MAIN_MUSD_VAULT_STATION.id}
              onClick={() => onSelectStation(MAIN_MUSD_VAULT_STATION.id)}
              style={{
                transform: `translate3d(${coord.x}px, ${coord.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold whitespace-nowrap transition-all border shadow-md flex items-center gap-1.5 ${
                isSelected
                  ? "bg-emerald-700 text-white border-white scale-105"
                  : "bg-emerald-50/95 text-emerald-900 border-emerald-300 hover:bg-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{MAIN_MUSD_VAULT_STATION.name}</span>
              {vaultActionBadge && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-black border ${
                    isSelected
                      ? "bg-white/20 text-white border-white/40"
                      : vaultActionBadge.cls
                  }`}
                >
                  {vaultActionBadge.label}
                </span>
              )}
            </button>
          );
        })()}

        {/* Connected Floating Sub-Island Badges */}
        {subIslandOverlays.map((sub) => {
          if (!sub.visible) return null;
          const isSelected = selectedSubIslandId === sub.islandId;
          const biomeAccent =
            SUB_BIOME_COLORS[sub.biomeTheme]?.accent || "#6366f1";
          return (
            <div
              key={sub.islandId}
              style={{
                transform: `translate3d(${sub.x}px, ${sub.y}px, 0) translate(-50%, -50%)`,
              }}
              className={`pointer-events-auto absolute left-0 top-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold whitespace-nowrap transition-all border shadow-md ${
                isSelected
                  ? "bg-[#231f20] text-white border-white scale-105 z-30"
                  : "bg-white/95 text-[#231f20] border-white/90 hover:bg-white hover:scale-105 z-20"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSubIsland?.(sub.islandId)}
                className="flex items-center gap-1.5"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: biomeAccent }}
                />
                {sub.isOwned && (
                  <span className="rounded px-1 py-0.2 bg-amber-400/25 text-amber-700 text-[8px] font-black border border-amber-400/40">
                    YOU
                  </span>
                )}
                {sub.mezoTierId && sub.mezoTierId !== "NONE" && (
                  <span className="rounded px-1 py-0.2 bg-amber-500/20 text-amber-800 text-[8px] font-black border border-amber-400/50">
                    ⚡ MEZO
                  </span>
                )}
                <span className="max-w-[105px] truncate">{sub.name}</span>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-black border"
                  style={{
                    backgroundColor: isSelected
                      ? "rgba(255,255,255,0.16)"
                      : `${sub.statusHex}18`,
                    color: isSelected ? "#ffffff" : sub.statusHex,
                    borderColor: isSelected
                      ? "rgba(255,255,255,0.3)"
                      : `${sub.statusHex}44`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: sub.statusHex }}
                  />
                  {sub.statusLabel}
                </span>
              </button>
              {isSelected && onEnterSubIsland && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnterSubIsland(sub.islandId);
                  }}
                  className="ml-0.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white px-2 py-0.5 text-[9px] font-black transition-colors"
                >
                  Enter -&gt;
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
