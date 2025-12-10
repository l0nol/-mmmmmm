
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { AppState, AppSettings, InputMode } from '../App';

// Configuration - Further optimized for mobile performance
const CONFIG = {
  goldCount: 1500,     
  silverCount: 1500,   
  gemCount: 500,      
  emeraldCount: 500,  
  trunkCount: 800,    // New: Trunk particles
  grassCount: 3000,   // New: Blue grass particles
  dustCount: 600,     
  treeHeight: 75,
  maxRadius: 30
};

// Types
interface InteractionState {
  touches: number;
  lastDistance: number;
  lastAngle: number;
  startPositions: { x: number, y: number }[];
  startTime: number;
  lastTapTime: number;
  lastX: number; // Added for single finger rotation
  lastY: number; // Added for single finger rotation
}

interface JewelTreeSceneProps {
  appState: AppState;
  setAppState: React.Dispatch<React.SetStateAction<AppState>>;
  setStatusText: (text: string) => void;
  uploadedImages: HTMLImageElement[];
  setAuroraActive: (active: boolean) => void;
  settings: AppSettings;
  setBlessingCount: React.Dispatch<React.SetStateAction<number>>;
  setHoldProgress: (p: number) => void;
  setTouchPos: (pos: {x: number, y: number}) => void;
  inputMode: InputMode;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const JewelTreeScene: React.FC<JewelTreeSceneProps> = ({ 
  appState, setAppState, setStatusText, uploadedImages, setAuroraActive, settings,
  setBlessingCount, setHoldProgress, setTouchPos, inputMode, videoRef
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Three.js Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mainGroupRef = useRef<THREE.Group | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  
  // Performance Optimization Refs (Object Reuse)
  const tempRef = useRef({
    dummy: new THREE.Object3D(),
    vec3A: new THREE.Vector3(),
    vec3B: new THREE.Vector3(),
    vec3C: new THREE.Vector3(),
    mat4: new THREE.Matrix4()
  });

  // Logic Data Refs
  const logicDataRef = useRef({
    gold: [] as any[],
    silver: [] as any[],
    gem: [] as any[],
    emerald: [] as any[],
    trunk: [] as any[], // New
    grass: [] as any[], // New
    dust: [] as any[],
    star: null as THREE.Mesh | null,
    ribbon: null as THREE.Mesh | null,
    tyndallBeams: null as THREE.InstancedMesh | null, 
    tyndallIndices: [] as number[], 
    fireworks: [] as any[],
    textTargets: null as { gold: THREE.Vector3[], silver: THREE.Vector3[] } | null
  });
  
  const photoMeshesRef = useRef<THREE.Object3D[]>([]);
  const zoomTargetIndexRef = useRef<number>(-1);
  const timeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Interaction/State Refs
  const isGoldModeRef = useRef(false);
  const goldModeTimerRef = useRef(0);
  const shakeIntensityRef = useRef(0);
  const rotationVelocityRef = useRef(0);
  
  // Epic Sequence Refs
  const isEpicSequenceRef = useRef(false);
  const epicTimerRef = useRef(0);
  const isHoldingStarRef = useRef(false);
  const starHoldStartTimeRef = useRef(0);
  const hasTriggeredEpicRef = useRef(false);
  const rainbowStarModeRef = useRef(false);

  // Interaction Vectors
  const interactionRef = useRef<InteractionState>({
    touches: 0, lastDistance: 0, lastAngle: 0, startPositions: [], startTime: 0, lastTapTime: 0, lastX: 0, lastY: 0
  });
  const repulsionPointRef = useRef<THREE.Vector3 | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));

  // MediaPipe Refs
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastPredictionTimeRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const gestureStateRef = useRef({
    isPinching: false,
    victoryTimer: 0,
    threeTimer: 0,
  });

  // State Mirror
  const appStateRef = useRef(appState);
  const settingsRef = useRef(settings);
  const inputModeRef = useRef(inputMode);

  // --- HELPER FUNCTIONS ---

  const initAudio = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch(e) { console.warn("Audio init failed", e); }
  };

  const playBellSound = () => {
    if (!settingsRef.current.soundEnabled) return;
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    const partials = [1, 2, 3, 4.2];
    const baseFreq = 880; 
    partials.forEach((partial, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * partial, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1 / (i + 1), t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 1.5);
    });
  };

  const playJingleBells = () => {
    if (!settingsRef.current.soundEnabled) return;
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const notes = [
      { f: 329.63, d: 0.2, t: 0 }, { f: 329.63, d: 0.2, t: 0.25 }, { f: 329.63, d: 0.4, t: 0.5 },
      { f: 329.63, d: 0.2, t: 1.0 }, { f: 329.63, d: 0.2, t: 1.25 }, { f: 329.63, d: 0.4, t: 1.5 },
      { f: 329.63, d: 0.2, t: 2.0 }, { f: 392.00, d: 0.2, t: 2.25 }, { f: 261.63, d: 0.2, t: 2.5 }, { f: 293.66, d: 0.2, t: 2.75 }, { f: 329.63, d: 0.8, t: 3.0 }
    ];
    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n.f;
      const startTime = ctx.currentTime + n.t;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + n.d);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + n.d);
    });
  };

  const playWeWishYou = () => {
    if (!settingsRef.current.soundEnabled) return;
    initAudio();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const melody = [
      {f: 261.63, t:0, d:0.4}, {f: 349.23, t:0.4, d:0.4}, {f: 349.23, t:0.8, d:0.2}, {f: 392.00, t:1.0, d:0.2}, {f: 349.23, t:1.2, d:0.2}, {f: 329.63, t:1.4, d:0.2},
      {f: 293.66, t:1.6, d:0.4}, {f: 293.66, t:2.0, d:0.4}, {f: 293.66, t:2.4, d:0.4}, {f: 392.00, t:2.8, d:0.4}, {f: 392.00, t:3.2, d:0.2}, {f: 440.00, t:3.4, d:0.2},
      {f: 392.00, t:3.6, d:0.2}, {f: 349.23, t:3.8, d:0.2}, {f: 329.63, t:4.0, d:0.4}, {f: 261.63, t:4.4, d:0.4}, {f: 261.63, t:4.8, d:0.4},
      {f: 440.00, t:5.2, d:0.4}, {f: 440.00, t:5.6, d:0.2}, {f: 493.88, t:5.8, d:0.2}, {f: 440.00, t:6.0, d:0.2}, {f: 392.00, t:6.2, d:0.2}, {f: 349.23, t:6.4, d:0.4},
      {f: 293.66, t:6.8, d:0.4}, {f: 261.63, t:7.2, d:0.2}, {f: 261.63, t:7.4, d:0.2}, {f: 293.66, t:7.6, d:0.4}, {f: 392.00, t:8.0, d:0.4}, {f: 329.63, t:8.4, d:0.4},
      {f: 349.23, t:8.8, d:1.5}
    ];
    melody.forEach(n => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = n.f;
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = n.f + 1.5;
        osc2.connect(gain);
        gain.gain.setValueAtTime(0, ctx.currentTime + n.t);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + n.t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + n.t + n.d);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + n.t);
        osc.stop(ctx.currentTime + n.t + n.d);
        osc2.start(ctx.currentTime + n.t);
        osc2.stop(ctx.currentTime + n.t + n.d);
    });
  };

  // Centralized Trigger for Epic Sequence
  const triggerEpicSequence = () => {
    if (hasTriggeredEpicRef.current) return;
    
    hasTriggeredEpicRef.current = true;
    isEpicSequenceRef.current = true;
    epicTimerRef.current = 0;
    rainbowStarModeRef.current = true;
    
    // Play Audio
    playWeWishYou();
    
    // Increment Blessing
    setBlessingCount(prev => prev + 1);
    
    // Reset any hold progress
    setHoldProgress(0);
    
    // Visual Impact: Big Shake
    shakeIntensityRef.current = 3.0;
    setStatusText("🌟 圣诞快乐! 🌟");
  };

  const addPhotoMesh = (img: HTMLImageElement) => {
    if (!mainGroupRef.current) return;
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    
    let w = 4, h = 4;
    if(img.width > img.height) h = 4 * (img.height/img.width); 
    else w = 4 * (img.width/img.height);
    
    const photoGeo = new THREE.PlaneGeometry(w, h);
    // FIX: Use Emissive Map to ensure photo is bright and clear regardless of lighting
    const photoMat = new THREE.MeshStandardMaterial({ 
        map: tex, 
        side: THREE.DoubleSide,
        roughness: 0.2,
        metalness: 0.0,
        emissive: 0xffffff,
        emissiveMap: tex, 
        emissiveIntensity: 1.0 // Default high intensity for distance visibility
    });
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    photoMesh.name = 'photo'; // Name for identification
    photoMesh.position.z = 0.06; 
    photoMesh.castShadow = true;
    photoMesh.receiveShadow = true;

    const frameGeo = new THREE.BoxGeometry(w + 0.5, h + 0.8, 0.1);
    const frameMat = new THREE.MeshStandardMaterial({ 
        color: 0xFFFFFF, 
        roughness: 0.4, 
        metalness: 0.1,
        emissive: 0x222222, 
        emissiveIntensity: 0.2
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.name = 'frame'; // Name for identification
    frameMesh.castShadow = true;
    frameMesh.receiveShadow = true;
    
    const group = new THREE.Group();
    group.add(frameMesh);
    group.add(photoMesh);
    
    // Random position on the tree for TREE mode
    const h_pos = (Math.random() - 0.5) * CONFIG.treeHeight;
    const normH = (h_pos + CONFIG.treeHeight/2) / CONFIG.treeHeight;
    const maxR = CONFIG.maxRadius * (1 - normH);
    const r = maxR + 2 + Math.random() * 5; 
    const theta = Math.random() * Math.PI * 2;
    const treePos = new THREE.Vector3(r * Math.cos(theta), h_pos, r * Math.sin(theta));

    // SCATTER MODE: Place photos in an outer orbit (Radius 75+), outside the particle shells (max ~65)
    // This ensures they are visible and clickable
    const scatterR = 75 + (Math.random() * 10);
    const scatterPhi = Math.acos(2 * Math.random() - 1);
    const scatterTheta = Math.random() * Math.PI * 2;
    const scatterPos = new THREE.Vector3(
        scatterR * Math.sin(scatterPhi) * Math.cos(scatterTheta),
        scatterR * Math.sin(scatterPhi) * Math.sin(scatterTheta),
        scatterR * Math.cos(scatterPhi)
    );

    group.lookAt(new THREE.Vector3(0, h_pos, 0)); 
    const baseRot = group.rotation.clone();

    group.userData = { treePos, scatterPos, baseRot, isPhoto: true };
    group.position.copy(treePos);
    
    photoMeshesRef.current.push(group);
    mainGroupRef.current.add(group);
  };

  const handlePhotoClick = (cx: number, cy: number) => {
      if (!containerRef.current || !cameraRef.current || !mainGroupRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((cx - rect.left) / rect.width) * 2 - 1;
      const y = -((cy - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(new THREE.Vector2(x,y), cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(photoMeshesRef.current, true);
      if (intersects.length > 0) {
          let targetObj = intersects[0].object;
          while(targetObj.parent && targetObj.parent !== mainGroupRef.current) targetObj = targetObj.parent;
          const index = photoMeshesRef.current.indexOf(targetObj);
          if (index !== -1) {
              zoomTargetIndexRef.current = index;
              setAppState(AppState.ZOOM);
          }
      }
  };

  // --- EFFECTS ---

  useEffect(() => {
    appStateRef.current = appState;
    settingsRef.current = settings;
    inputModeRef.current = inputMode;
    if (inputMode === 'touch') {
        if (appState === AppState.TREE) setStatusText("状态：圣诞树 (单指旋转/双指缩放)");
        if (appState === AppState.SCATTER) setStatusText("状态：星云球壳 (双指点击复原)");
        if (appState === AppState.ZOOM) setStatusText("状态：照片详情");
    }
  }, [appState, settings, inputMode, setStatusText]);

  useEffect(() => {
    if (!mainGroupRef.current) return;
    if (uploadedImages.length > photoMeshesRef.current.length) {
        const newImages = uploadedImages.slice(photoMeshesRef.current.length);
        newImages.forEach(img => addPhotoMesh(img));
        setStatusText(`已添加照片 (${uploadedImages.length})`);
    }
  }, [uploadedImages, setStatusText]);

  // --- MediaPipe Initialization ---
  useEffect(() => {
      let stream: MediaStream | null = null;
      let landmarker: HandLandmarker | null = null;
      let isCancelled = false;

      if (inputMode === 'camera') {
          const initVision = async () => {
              try {
                  setStatusText("初始化: 检查环境...");

                  // Secure Context Check
                  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
                      throw new Error("摄像头需 HTTPS 或 Localhost 环境");
                  }
                  
                  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                      throw new Error("浏览器不支持摄像头 API");
                  }

                  setStatusText("初始化: 加载 AI 模型...");

                  // Initialize Vision Tasks
                  const vision = await FilesetResolver.forVisionTasks(
                      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
                  );
                  
                  if (isCancelled) return;
                  
                  // NOTE: 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.' is a standard log, not an error.
                  // We use CPU delegate for stability to prevent WebGL context loss from Three.js competition.
                  landmarker = await HandLandmarker.createFromOptions(vision, {
                      baseOptions: {
                          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                          delegate: "CPU" 
                      },
                      runningMode: "VIDEO", 
                      numHands: 1, // Single Hand Master Mode
                      minHandDetectionConfidence: 0.5,
                      minHandPresenceConfidence: 0.5,
                      minTrackingConfidence: 0.5
                  });

                  if (isCancelled) {
                      landmarker.close();
                      return;
                  }
                  handLandmarkerRef.current = landmarker;

                  setStatusText("初始化: 请求摄像头权限...");
                  
                  if (videoRef.current) {
                      const video = videoRef.current;
                      
                      // Try accessing camera with fallbacks
                      try {
                          stream = await navigator.mediaDevices.getUserMedia({ 
                              video: { 
                                  facingMode: "user",
                                  width: { ideal: 640 },
                                  height: { ideal: 480 }
                              },
                              audio: false
                          });
                      } catch (err) {
                          console.warn("Standard constraints failed, trying basic...", err);
                          try {
                             stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                          } catch (err2: any) {
                             if (err2.name === 'NotAllowedError' || err2.name === 'PermissionDeniedError') {
                                throw new Error("请允许摄像头权限");
                             } else if (err2.name === 'NotFoundError') {
                                throw new Error("未检测到摄像头");
                             } else {
                                throw new Error(`无法开启摄像头: ${err2.message}`);
                             }
                          }
                      }

                      if (isCancelled) {
                          if (stream) stream.getTracks().forEach(t => t.stop());
                          return;
                      }
                      
                      video.srcObject = stream;
                      video.setAttribute('playsinline', 'true');
                      video.muted = true;
                      
                      // Wait for video to be ready before playing to avoid "The play() request was interrupted" errors
                      await new Promise<void>((resolve) => {
                          if (video.readyState >= 2) {
                              resolve();
                          } else {
                              video.onloadeddata = () => resolve();
                          }
                      });
                      
                      video.play().catch(e => {
                          console.error("Play failed", e);
                          setStatusText("请点击屏幕以启动摄像头");
                      });
                      
                      setStatusText("AI Ready: 请举起一只手 👋");
                  } else {
                      setStatusText("Error: 视频组件未加载");
                  }
              } catch (err: any) {
                  console.error("Camera/AI initialization failed:", err);
                  setStatusText(`Error: ${err.message || "初始化失败"}`);
              }
          };
          initVision();
      } else {
          // Cleanup handled in return function
      }

      return () => {
          isCancelled = true;
          if (landmarker) {
              landmarker.close();
          }
          if (stream) {
              stream.getTracks().forEach(t => t.stop());
          }
          // Clear Ref but don't close if it was the one from the previous effect that might be still running?
          // Actually, React Strict Mode cleanup runs before the next setup completes.
          // It is safer to clear the ref here.
          handLandmarkerRef.current = null;
          
          if (videoRef.current) {
              videoRef.current.srcObject = null;
          }
      };
  }, [inputMode]);

  // --- Main 3D Initialization ---
  useEffect(() => {
    if (!containerRef.current) return;

    logicDataRef.current.gold = [];
    logicDataRef.current.silver = [];
    logicDataRef.current.gem = [];
    logicDataRef.current.emerald = [];
    logicDataRef.current.trunk = [];
    logicDataRef.current.grass = [];
    logicDataRef.current.dust = [];
    logicDataRef.current.fireworks = [];
    logicDataRef.current.textTargets = null;
    logicDataRef.current.tyndallIndices = [];
    photoMeshesRef.current = [];

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width === 0 || height === 0) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // CAMERA FIX: INCREASED FAR PLANE TO 5000 TO PREVENT DISAPPEARING
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 5000);
    camera.position.set(0, 0, 110);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9; // Adjusted brightness
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);
    
    const spotLight = new THREE.SpotLight(0xffddaa, 100);
    spotLight.position.set(30, 60, 50);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.5;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    scene.add(spotLight);
    
    const blueLight = new THREE.PointLight(0xaaddff, 40, 100);
    blueLight.position.set(-30, -20, 30);
    scene.add(blueLight);

    const frontLight = new THREE.DirectionalLight(0xffffff, 1.5);
    frontLight.position.set(0, 10, 100);
    frontLight.castShadow = false;
    scene.add(frontLight);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.55; // Higher threshold to reduce overall glow
    bloomPass.strength = 0.4;   // Lower strength for subtler effect
    bloomPass.radius = 0.8;     // Wider radius for atmospheric feel
    bloomPassRef.current = bloomPass; // Save for dynamic updates

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);
    mainGroupRef.current = mainGroup;

    // Helper: Generate points on a spherical shell (surface only, with slight thickness)
    const getShellPosition = (radius: number, thickness: number = 2) => {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius + (Math.random() - 0.5) * thickness;
        return new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.sin(phi) * Math.sin(theta),
            r * Math.cos(phi)
        );
    };

    // Helper: Random point inside a sphere (Volume)
    const randomSpherePoint = (r: number) => {
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
        const randR = Math.pow(Math.random(), 1/3) * r; // Uniform volume distribution
        return new THREE.Vector3(randR * Math.sin(phi) * Math.cos(theta), randR * Math.sin(phi) * Math.sin(theta), randR * Math.cos(phi));
    };

    const createInstancedMesh = (
        geo: THREE.BufferGeometry, 
        mat: THREE.Material, 
        count: number, 
        dataArray: any[], 
        name: string,
        positionGen?: (i: number) => { treePos: THREE.Vector3, scatterPos: THREE.Vector3 }
    ) => {
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = name; 
        mainGroup.add(mesh);
        
        for (let i = 0; i < count; i++) {
            let treePos, scatterPos;
            
            if (positionGen) {
                const pos = positionGen(i);
                treePos = pos.treePos;
                scatterPos = pos.scatterPos;
            } else {
                // Default Tree Cone Logic if not provided
                const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
                const normH = (h + CONFIG.treeHeight/2) / CONFIG.treeHeight;
                const rMax = CONFIG.maxRadius * (1 - normH);
                const r = Math.sqrt(Math.random()) * rMax; 
                const theta = Math.random() * Math.PI * 2;
                treePos = new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta));
                // Default scatter fallback
                scatterPos = randomSpherePoint(60); 
            }

            dataArray.push({
                treePos: treePos,
                scatterPos: scatterPos,
                currentPos: treePos.clone(),
                scale: 0.6 + Math.random() * 0.8,
                rotSpeed: new THREE.Euler(Math.random()*0.03, Math.random()*0.03, Math.random()*0.03),
                rotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, 0)
            });
        }
    };

    const createMaterialsAndMeshes = () => {
        // OPTIMIZATION: Reduced emissive intensity significantly to avoid excessive glow
        const goldMat = new THREE.MeshStandardMaterial({ 
            color: 0xffaa00, 
            metalness: 1.0, 
            roughness: 0.2, 
            emissive: 0xaa5500, 
            emissiveIntensity: 0.05 
        });
        goldMat.userData = { origEmissive: 0xaa5500, origEmissiveIntensity: 0.05 };

        const silverMat = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee, 
            metalness: 0.9, 
            roughness: 0.2, 
            emissive: 0x222222, 
            emissiveIntensity: 0.05 
        });
        silverMat.userData = { origEmissive: 0x222222, origEmissiveIntensity: 0.05 };

        const gemMat = new THREE.MeshStandardMaterial({ 
            color: 0xff0044, 
            metalness: 0.1, 
            roughness: 0.1, 
            transparent: true,
            opacity: 0.8,
            emissive: 0x440011, 
            emissiveIntensity: 0.1 
        });
        gemMat.userData = { origEmissive: 0x440011, origEmissiveIntensity: 0.1 };

        const emeraldMat = new THREE.MeshStandardMaterial({ 
            color: 0x00aa55, 
            metalness: 0.2, 
            roughness: 0.1, 
            transparent: true,
            opacity: 0.8,
            emissive: 0x002211, 
            emissiveIntensity: 0.1 
        });
        emeraldMat.userData = { origEmissive: 0x002211, origEmissiveIntensity: 0.1 };

        // New Materials for Trunk and Grass
        const trunkMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.8,
            metalness: 0.1,
            emissive: 0x444444,
            emissiveIntensity: 0.1
        });
        trunkMat.userData = { origEmissive: 0x444444, origEmissiveIntensity: 0.1 };

        const grassMat = new THREE.MeshStandardMaterial({
            color: 0x0088ff,
            roughness: 0.4,
            metalness: 0.5,
            emissive: 0x004488,
            emissiveIntensity: 0.3
        });
        grassMat.userData = { origEmissive: 0x004488, origEmissiveIntensity: 0.3 };

        const sphereGeo = new THREE.SphereGeometry(0.7, 12, 12); // Reduced segments
        const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const diamondGeo = new THREE.OctahedronGeometry(0.8, 0);
        const coneGeo = new THREE.ConeGeometry(0.5, 1.2, 6); // Reduced segments
        const smallCubeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6); // For Trunk
        const tinyConeGeo = new THREE.ConeGeometry(0.3, 0.8, 4); // For Grass

        // --- LAYERED SHELLS DEFINITION (NEBULA MODE) ---
        
        // 1. Trunk: Innermost core (Tree) / Innermost shell (Scatter)
        createInstancedMesh(smallCubeGeo, trunkMat, CONFIG.trunkCount, logicDataRef.current.trunk, 'trunk', () => {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const r = Math.random() * 2.0; 
            const theta = Math.random() * Math.PI * 2;
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(15, 3) // Radius 15, Thickness 3
            };
        });

        // 2. Gold: Inner Shell
        createInstancedMesh(sphereGeo, goldMat, CONFIG.goldCount, logicDataRef.current.gold, 'gold', () => {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const normH = (h + CONFIG.treeHeight/2) / CONFIG.treeHeight;
            const rMax = CONFIG.maxRadius * (1 - normH);
            const r = Math.sqrt(Math.random()) * rMax; 
            const theta = Math.random() * Math.PI * 2;
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(28, 4) // Radius 28
            };
        });

        // 3. Silver: Middle Shell
        createInstancedMesh(boxGeo, silverMat, CONFIG.silverCount, logicDataRef.current.silver, 'silver', () => {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const normH = (h + CONFIG.treeHeight/2) / CONFIG.treeHeight;
            const rMax = CONFIG.maxRadius * (1 - normH);
            const r = Math.sqrt(Math.random()) * rMax; 
            const theta = Math.random() * Math.PI * 2;
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(40, 4) // Radius 40
            };
        });

        // 4. Gems & Emeralds: Outer Shells
        createInstancedMesh(diamondGeo, gemMat, CONFIG.gemCount, logicDataRef.current.gem, 'gem', () => {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const normH = (h + CONFIG.treeHeight/2) / CONFIG.treeHeight;
            const rMax = CONFIG.maxRadius * (1 - normH);
            const r = Math.sqrt(Math.random()) * rMax; 
            const theta = Math.random() * Math.PI * 2;
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(52, 4) // Radius 52
            };
        });

        createInstancedMesh(coneGeo, emeraldMat, CONFIG.emeraldCount, logicDataRef.current.emerald, 'emerald', () => {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const normH = (h + CONFIG.treeHeight/2) / CONFIG.treeHeight;
            const rMax = CONFIG.maxRadius * (1 - normH);
            const r = Math.sqrt(Math.random()) * rMax; 
            const theta = Math.random() * Math.PI * 2;
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(54, 5) // Radius 54 (Mixed with Gems)
            };
        });

        // 5. Grass: Outermost Halo
        createInstancedMesh(tinyConeGeo, grassMat, CONFIG.grassCount, logicDataRef.current.grass, 'grass', () => {
            const rMax = CONFIG.maxRadius * 1.5;
            const r = Math.sqrt(Math.random()) * rMax;
            const theta = Math.random() * Math.PI * 2;
            const h = -CONFIG.treeHeight/2 - 2 + Math.random() * 2; // Bottom layer in Tree mode
            return {
                treePos: new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta)),
                scatterPos: getShellPosition(65, 6) // Radius 65
            };
        });

        const star = new THREE.Mesh(
            new THREE.OctahedronGeometry(3.0, 0), 
            new THREE.MeshStandardMaterial({ color: 0xffffff, metalness:0.8, roughness:0.2, emissive:0xffffee, emissiveIntensity:1 })
        );
        star.userData = { treePos: new THREE.Vector3(0, CONFIG.treeHeight/2 + 2, 0), scatterPos: new THREE.Vector3(0, 0, 0) }; // Center
        star.position.copy(star.userData.treePos);
        mainGroup.add(star);
        logicDataRef.current.star = star;
    };

    const createDust = () => {
        const geo = new THREE.BufferGeometry();
        const pos = [];
        for(let i=0; i<CONFIG.dustCount; i++) {
            const h = Math.random() * CONFIG.treeHeight - CONFIG.treeHeight/2;
            const r = Math.random() * CONFIG.maxRadius * (1 - (h + CONFIG.treeHeight/2)/CONFIG.treeHeight) + 2; 
            const theta = Math.random() * Math.PI * 2;
            
            // Randomly fill the gaps between shells (10 to 70 radius) to add volume
            const gapRadius = 10 + Math.random() * 60;
            const gapTheta = Math.random() * Math.PI * 2;
            const gapPhi = Math.acos(2 * Math.random() - 1);
            const scatterX = gapRadius * Math.sin(gapPhi) * Math.cos(gapTheta);
            const scatterY = gapRadius * Math.sin(gapPhi) * Math.sin(gapTheta);
            const scatterZ = gapRadius * Math.cos(gapPhi);

            pos.push(r*Math.cos(theta), h, r*Math.sin(theta));
            logicDataRef.current.dust.push({
                treePos: new THREE.Vector3(r*Math.cos(theta), h, r*Math.sin(theta)),
                scatterPos: new THREE.Vector3(scatterX, scatterY, scatterZ),
                currentPos: new THREE.Vector3(r*Math.cos(theta), h, r*Math.sin(theta))
            });
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const dustSystem = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffee, size: 0.6, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        dustSystem.userData = { isDust: true };
        mainGroup.add(dustSystem);
    };

    // --- Tyndall Effect Light Beams System (Attached to Particles) ---
    const createTyndallSystem = () => {
        const beamCount = 120; // Number of gold particles that will emit beams
        // Pick random gold particles
        const indices = [];
        const totalGold = CONFIG.goldCount;
        for(let i=0; i<beamCount; i++) {
            indices.push(Math.floor(Math.random() * totalGold));
        }
        logicDataRef.current.tyndallIndices = indices;

        const beamGeo = new THREE.CylinderGeometry(0.0, 3.5, 60, 8, 1, true);
        beamGeo.translate(0, -30, 0);
        beamGeo.rotateX(-Math.PI / 2); // Rotate so it points along +Z. Tip at 0, Base at +Z.

        const beamMat = new THREE.MeshBasicMaterial({
            color: 0xFFF8DC, // Cornsilk/Gold-ish
            transparent: true,
            opacity: 0.15, // Very Low opacity for volumetric accumulation
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const beams = new THREE.InstancedMesh(beamGeo, beamMat, beamCount);
        beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        beams.name = 'tyndallBeams';
        mainGroup.add(beams);
        logicDataRef.current.tyndallBeams = beams;
    };

    const createStarField = () => {
        const geo = new THREE.BufferGeometry();
        const pos = [];
        for(let i=0; i<800; i++) pos.push((Math.random()-0.5)*1000, (Math.random()-0.5)*1000, (Math.random()-0.5)*1000);
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const stars = new THREE.Points(geo, new THREE.PointsMaterial({color: 0x888888, size: 1.2, transparent: true, opacity: 0.5}));
        scene.add(stars);
    };

    const createRibbonWithMorph = () => {
        const spiralPoints = [];
        const turns = 5;
        const height = CONFIG.treeHeight + 10;
        const steps = 300; 
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = t * Math.PI * 2 * turns;
            const y = (t - 0.5) * height; 
            const normH = (y + CONFIG.treeHeight/2) / CONFIG.treeHeight;
            const r = (CONFIG.maxRadius + 5) * (1 - Math.max(0, normH*0.8));
            spiralPoints.push(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r));
        }

        const framePoints = [];
        const w = 90; 
        const topY = 40;
        const botY = -30;
        const corners = [
            new THREE.Vector3(w, topY, 0),
            new THREE.Vector3(-w, topY, 0),
            new THREE.Vector3(-w, botY, 0),
            new THREE.Vector3(w, botY, 0),
            new THREE.Vector3(w, topY, 0)
        ];
        const frameCurve = new THREE.CatmullRomCurve3(corners, true, 'catmullrom', 0.1); 
        for (let i = 0; i <= steps; i++) {
            framePoints.push(frameCurve.getPoint(i / steps));
        }

        const spiralCurve = new THREE.CatmullRomCurve3(spiralPoints);
        const spiralGeo = new THREE.TubeGeometry(spiralCurve, steps, 0.5, 4, false);
        const frameCurveFinal = new THREE.CatmullRomCurve3(framePoints);
        const frameGeo = new THREE.TubeGeometry(frameCurveFinal, steps, 0.5, 4, false);

        spiralGeo.morphAttributes.position = [];
        spiralGeo.morphAttributes.position[0] = frameGeo.attributes.position;
        
        const canvas = document.createElement('canvas');
        canvas.width = 2048; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = 'rgba(139, 0, 0, 0.6)'; ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#8B0000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#FFD700'; ctx.fillRect(0, 0, canvas.width, 10); ctx.fillRect(0, canvas.height-10, canvas.width, 10);
            ctx.font = 'bold 70px "Times New Roman", serif'; ctx.fillStyle = '#FFD700'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const text = "圣诞快乐！  🎄  Merry Christmas!  ❄️  ";
            const repeats = Math.ceil(canvas.width / ctx.measureText(text).width) + 1;
            for(let i=0; i<repeats; i++) ctx.fillText(text, (i * ctx.measureText(text).width) + 300, canvas.height/2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping; texture.repeat.set(5, 1);

        const material = new THREE.MeshStandardMaterial({
            map: texture, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.3, 
            emissive: 0x550000, emissiveIntensity: 0.1, transparent: true, opacity: 0.6
        });

        const ribbon = new THREE.Mesh(spiralGeo, material);
        ribbon.morphTargetInfluences = [0]; 
        mainGroup.add(ribbon);
        logicDataRef.current.ribbon = ribbon;
    };

    const createTextTargets = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024; canvas.height = 512; 
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const scanPixels = (text: string, font: string, offsetY: number, scaleMultiplier: number = 0.4) => {
            ctx.clearRect(0, 0, 1024, 512);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 512, 256);
            
            const imageData = ctx.getImageData(0, 0, 1024, 512).data;
            const points = [];
            // Optimized scanning step
            for (let y = 0; y < 512; y += 4) {
                for (let x = 0; x < 1024; x += 4) {
                    if (imageData[(y * 1024 + x) * 4 + 3] > 128) {
                        points.push(new THREE.Vector3((x - 512) * scaleMultiplier, (256 - y) * scaleMultiplier + offsetY, 25));
                    }
                }
            }
            
            // Shuffle points to ensure particles are distributed across the whole text even if count is low
            for (let i = points.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [points[i], points[j]] = [points[j], points[i]];
            }

            return points;
        };

        const runScan = () => {
            // Updated to use Calligraphy fonts with fallbacks
            // English: Great Vibes, Chinese: Ma Shan Zheng
            // Default first to avoid empty/black screen if fonts not loaded
            const goldTargets = scanPixels("Merry Christmas!", "150px 'Great Vibes', cursive", 15, 0.4); 
            const silverTargets = scanPixels("圣诞快乐！", "120px 'Ma Shan Zheng', cursive", -55, 0.4);
            logicDataRef.current.textTargets = { gold: goldTargets, silver: silverTargets };
        };

        // Run immediately
        runScan();

        // Try to update again after a second to catch loaded fonts
        // This prevents black screen/infinite wait
        setTimeout(runScan, 1000);
        if ('fonts' in document) {
            document.fonts.ready.then(runScan).catch(() => {});
        }
    };

    createMaterialsAndMeshes();
    createDust();
    createTyndallSystem(); // Changed from createLightBeams
    createStarField();
    createRibbonWithMorph();
    createTextTargets();

    // --- Gesture Prediction Engine (Single Hand Master) ---
    const predictWebcam = () => {
        if (!handLandmarkerRef.current || !videoRef.current || inputModeRef.current !== 'camera') return;
        const video = videoRef.current;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        const now = Date.now();
        if (now - lastPredictionTimeRef.current < 100) return;
        lastPredictionTimeRef.current = now;

        if (video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime;
            
            try {
                const result = handLandmarkerRef.current.detectForVideo(video, now);
                const canvas = document.getElementById('skeleton-canvas') as HTMLCanvasElement;
                if (canvas && canvas.getContext('2d')) {
                    const ctx = canvas.getContext('2d')!;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
                    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
                    
                    if (result.landmarks && result.landmarks.length > 0) {
                        const landmarks = result.landmarks[0]; 

                        ctx.lineWidth = 3; ctx.strokeStyle = '#FFD700'; ctx.fillStyle = '#FF4400';
                        const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
                        ctx.beginPath();
                        connections.forEach(([s, e]) => {
                            ctx.moveTo(landmarks[s].x * canvas.width, landmarks[s].y * canvas.height);
                            ctx.lineTo(landmarks[e].x * canvas.width, landmarks[e].y * canvas.height);
                        });
                        ctx.stroke();

                        const dist = (i1: number, i2: number) => {
                            const dx = landmarks[i1].x - landmarks[i2].x;
                            const dy = landmarks[i1].y - landmarks[i2].y;
                            const dz = landmarks[i1].z - landmarks[i2].z;
                            return Math.sqrt(dx*dx + dy*dy + dz*dz);
                        };
                        const isExt = (tip: number, pip: number) => dist(0, tip) > dist(0, pip) * 1.1;

                        const thumbOpen = isExt(4, 2);
                        const indexOpen = isExt(8, 6);
                        const midOpen = isExt(12, 10);
                        const ringOpen = isExt(16, 14);
                        const pinkyOpen = isExt(20, 18);
                        const extendedCount = (thumbOpen?1:0)+(indexOpen?1:0)+(midOpen?1:0)+(ringOpen?1:0)+(pinkyOpen?1:0);

                        const isFist = !indexOpen && !midOpen && !ringOpen && !pinkyOpen;
                        const isOpen = extendedCount === 5;
                        const isPointing = indexOpen && !midOpen && !ringOpen && !pinkyOpen;
                        const isVictory = indexOpen && midOpen && !ringOpen && !pinkyOpen;
                        const isThreeFinger = indexOpen && midOpen && ringOpen && !pinkyOpen;
                        const pinchDist = dist(4, 8);
                        const isPinch = pinchDist < 0.05;

                        let status = "AI: ";

                        if (isPointing) {
                            status += "☝️ Point (Zoom)";
                            const handSize = dist(0, 12); 
                            if (cameraRef.current) {
                                let targetZ = 250 - (handSize * 600);
                                targetZ = Math.max(30, Math.min(220, targetZ));
                                cameraRef.current.position.z = THREE.MathUtils.lerp(cameraRef.current.position.z, targetZ, 0.05);
                            }
                        }

                        if (isFist) {
                            status += "✊ Fist (Spin)";
                            if (appStateRef.current !== AppState.TREE) setAppState(AppState.TREE);
                            
                            const palmX = landmarks[9].x; 
                            const deviation = palmX - 0.5; 
                            
                            if (Math.abs(deviation) > 0.05) {
                                rotationVelocityRef.current = -deviation * 0.2; 
                                if (mainGroupRef.current) mainGroupRef.current.rotation.y += rotationVelocityRef.current;
                            }
                        } 
                        else if (isOpen) {
                            status += "🖐 Open (Scatter)";
                            if (appStateRef.current !== AppState.SCATTER) setAppState(AppState.SCATTER);
                        }
                        else if (isPinch) {
                             status += "👌 Pinch (Select)";
                             if (!gestureStateRef.current.isPinching) {
                                 if (photoMeshesRef.current.length > 0) {
                                     playBellSound();
                                     const randomIndex = Math.floor(Math.random() * photoMeshesRef.current.length);
                                     zoomTargetIndexRef.current = randomIndex;
                                     setAppState(AppState.ZOOM);
                                     setStatusText("AI: 🎁 随机展示照片!");
                                 } else {
                                    setStatusText("AI: ⚠️ 空空如也 (请先插入照片)");
                                 }
                             }
                             gestureStateRef.current.isPinching = true;
                        } 
                        else if (isVictory) {
                            status += `✌️ Victory (${Math.floor(gestureStateRef.current.victoryTimer)}s)`;
                            gestureStateRef.current.victoryTimer += 0.1; // Faster tick due to lower FPS
                             if (gestureStateRef.current.victoryTimer > 2.0 && !isEpicSequenceRef.current) {
                                 triggerEpicSequence(); // USE CENTRALIZED TRIGGER
                                 gestureStateRef.current.victoryTimer = 0;
                            }
                        }
                        else if (isThreeFinger) {
                            status += `🤟 Gold (${Math.floor(gestureStateRef.current.threeTimer)}s)`;
                            gestureStateRef.current.threeTimer += 0.1; // Faster tick due to lower FPS
                            if (gestureStateRef.current.threeTimer > 3.0) {
                                isGoldModeRef.current = true;
                                goldModeTimerRef.current = 8.0; 
                                playJingleBells(); 
                                gestureStateRef.current.threeTimer = 0;
                            }
                        }
                        else {
                            status += "Tracing...";
                            gestureStateRef.current.isPinching = false;
                            gestureStateRef.current.victoryTimer = 0;
                            gestureStateRef.current.threeTimer = 0;
                        }

                        setStatusText(status);

                        const cursorX = (1 - landmarks[8].x) * canvas.width; 
                        const cursorY = landmarks[8].y * canvas.height;
                        ctx.beginPath();
                        ctx.arc(cursorX, cursorY, 8, 0, 2*Math.PI);
                        ctx.fillStyle = isPinch ? '#00FF00' : '#FFFFFF';
                        ctx.fill();
                        ctx.strokeStyle = '#000000';
                        ctx.stroke();

                    } else {
                        setStatusText("AI: 寻找手掌...");
                    }
                }
            } catch(e) {}
        }
    };

    const spawnFirework = (colorOverride?: number, type = 'normal') => {
        const colors = colorOverride ? [colorOverride] : [0xff0000, 0xffd700, 0x00ff00];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const cx = (Math.random() - 0.5) * 40;
        const cy = 20; 
        const cz = (Math.random() - 0.5) * 40;
        
        const rocket = {
            pos: new THREE.Vector3(cx, -30, cz),
            vel: new THREE.Vector3(0, 1.5 + Math.random(), 0),
            targetY: 40 + Math.random() * 20,
            life: 1.0,
            color: color,
            isRocket: true,
            type: type
        };
        logicDataRef.current.fireworks.push(rocket);
    };

    const explodeFirework = (rocket: any) => {
        const count = rocket.type === 'snow' ? 60 : 30;
        for(let i=0; i<count; i++) {
            logicDataRef.current.fireworks.push({
                pos: rocket.pos.clone(),
                vel: new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5)).normalize().multiplyScalar(0.5 + Math.random()),
                life: rocket.type === 'snow' ? 3.0 : 1.0,
                color: rocket.type === 'snow' ? 0xFFFFFF : rocket.color, 
                type: rocket.type,
                isParticle: true
            });
        }
    };

    const updateInstancedSystem = (dataArray: any[], group: THREE.Group, state: AppState, type: string) => {
        const mesh = group.children.find(c => c.name === type) as THREE.InstancedMesh;
        if (!mesh) return;

        const { dummy } = tempRef.current; // Use pooled dummy
        const isGold = isGoldModeRef.current;
        const isEpic = isEpicSequenceRef.current;
        const epicTime = epicTimerRef.current;
        const repelPos = repulsionPointRef.current;

        const mat = mesh.material as THREE.MeshStandardMaterial;
        
        const formingText = isEpic && epicTime > 4.0 && epicTime < 16.0;
        const textTargets = logicDataRef.current.textTargets;
        
        // Text formation logic: only specific types participate to keep text clean
        const participatesInText = (type === 'gold' || type === 'silver' || type === 'gem');

        if (formingText && participatesInText) {
             if (type === 'gold') {
                 mat.color.setHex(0xFFD700); 
                 mat.emissive.setHex(0xFFAA00);
                 mat.emissiveIntensity = 2.0 + Math.sin(timeRef.current * 5); 
             } else if (type === 'silver' || type === 'gem') {
                 mat.color.setHex(0xD40000); // Red
                 mat.emissive.setHex(0xFF0000); 
                 mat.emissiveIntensity = 1.0 + Math.sin(timeRef.current * 8); 
             } else {
                 mat.emissiveIntensity = 0.1;
             }
        } else if (isGold || (isEpic && epicTime < 3.0)) {
            mat.emissive.setHex(0xFFAA00);
            mat.emissiveIntensity = 2.0;
        } else {
            // Restore original colors
            if (type === 'trunk') mat.color.setHex(0xffffff);
            else if (type === 'grass') mat.color.setHex(0x0088ff);
            else mat.color.setHex(type === 'gold' ? 0xffaa00 : type === 'silver' ? 0xeeeeee : type === 'gem' ? 0xff0044 : 0x00aa55);
            
            mat.emissive.setHex(mesh.userData.origEmissive || 0x000000);
            // Default reduced emissive for normal state
            mat.emissiveIntensity = mesh.userData.origEmissiveIntensity || 0.05;
        }

        for (let i = 0; i < dataArray.length; i++) {
            const item = dataArray[i];
            let target = state === AppState.TREE ? item.treePos : item.scatterPos;
            if (state === AppState.ZOOM) target = item.scatterPos;

            if (formingText && textTargets && participatesInText) {
                if (type === 'gold' && textTargets.gold.length > 0) {
                    target = textTargets.gold[i % textTargets.gold.length];
                } 
                else if ((type === 'silver' || type === 'gem') && textTargets.silver.length > 0) {
                    target = textTargets.silver[i % textTargets.silver.length];
                }
            }

            // --- CRASH FIX: Ensure target is valid ---
            if (!target) target = item.currentPos;

            if (repelPos && state === AppState.TREE && !isEpic) {
                const localRepel = repelPos.clone().applyMatrix4(group.matrixWorld.clone().invert());
                if (item.currentPos.distanceTo(localRepel) < 18.0) {
                    const pushDir = item.currentPos.clone().sub(localRepel).normalize();
                    item.currentPos.add(pushDir.multiplyScalar(0.2));
                }
            }

            const speed = formingText ? 0.08 : 0.05;
            item.currentPos.lerp(target, speed);
            item.rotation.x += item.rotSpeed.x;
            item.rotation.y += item.rotSpeed.y;

            dummy.position.copy(item.currentPos);
            dummy.rotation.copy(item.rotation);
            let s = item.scale;
            if (state === AppState.ZOOM) s *= 0.5;
            if (formingText) s *= 0.8; 
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    };

    const updateDustParticles = (state: AppState) => {
        const dustSystem = mainGroup.children.find(c => c.userData.isDust) as THREE.Points;
        if(!dustSystem) return;
        const positions = dustSystem.geometry.attributes.position.array as Float32Array;
        const speedBoost = interactionRef.current.touches >= 3 ? 5.0 : 1.0;
        for(let i=0; i<logicDataRef.current.dust.length; i++) {
            const item = logicDataRef.current.dust[i];
            
            if (state === AppState.TREE) {
                item.currentPos.y += 0.05 * speedBoost;
                if(item.currentPos.y > CONFIG.treeHeight/2) item.currentPos.y = -CONFIG.treeHeight/2;
                const normH = (item.currentPos.y + CONFIG.treeHeight/2) / CONFIG.treeHeight;
                const rMax = CONFIG.maxRadius * (1-normH) + 2;
                if(Math.sqrt(item.currentPos.x**2 + item.currentPos.z**2) > rMax) {
                    item.currentPos.x *= 0.98;
                    item.currentPos.z *= 0.98;
                }
            } else {
                item.currentPos.lerp(item.scatterPos, 0.05);
            }
            positions[i*3] = item.currentPos.x;
            positions[i*3+1] = item.currentPos.y;
            positions[i*3+2] = item.currentPos.z;
        }
        dustSystem.geometry.attributes.position.needsUpdate = true;
    };

    const updateFireworks = () => {
        let fwSystem = mainGroup.children.find(c => c.name === 'fireworks') as THREE.Points;
        if (!fwSystem) {
            const geo = new THREE.BufferGeometry();
            const mat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true });
            fwSystem = new THREE.Points(geo, mat);
            fwSystem.name = 'fireworks';
            mainGroup.add(fwSystem);
        }
        const activeFW = logicDataRef.current.fireworks;
        fwSystem.visible = activeFW.length > 0;
        if (!fwSystem.visible) return;

        const positions = [];
        const colors = [];
        for (let i = activeFW.length - 1; i >= 0; i--) {
            const p = activeFW[i];
            if (p.isRocket) {
                p.pos.add(p.vel);
                if (p.pos.y >= p.targetY) {
                    explodeFirework(p);
                    activeFW.splice(i, 1);
                } else {
                    positions.push(p.pos.x, p.pos.y, p.pos.z);
                    const c = new THREE.Color(p.color);
                    colors.push(c.r, c.g, c.b);
                }
                continue;
            }
            p.life -= 0.01;
            p.pos.add(p.vel);
            if (p.type === 'snow') {
                p.vel.multiplyScalar(0.95);
                p.vel.y -= 0.005;
                p.pos.lerp(new THREE.Vector3(0, -CONFIG.treeHeight/2, 0), 0.005);
            } else {
                p.vel.y -= 0.01;
            }
            if (p.life <= 0) {
                activeFW.splice(i, 1);
            } else {
                positions.push(p.pos.x, p.pos.y, p.pos.z);
                const c = new THREE.Color(p.color);
                colors.push(c.r, c.g, c.b);
            }
        }
        fwSystem.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        fwSystem.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        fwSystem.geometry.computeBoundingSphere();
    };

    const updateRibbon = (state: AppState) => {
        const ribbon = logicDataRef.current.ribbon;
        if (ribbon) {
            ribbon.visible = settingsRef.current.ribbonVisible;
            if (!ribbon.visible) return;
            const isEpic = isEpicSequenceRef.current;
            const time = timeRef.current;
            const mat = ribbon.material as THREE.MeshStandardMaterial;

            if (isEpic) {
                const epicProgress = Math.min(epicTimerRef.current / 3.0, 1.0);
                const t = THREE.MathUtils.smoothstep(epicProgress, 0, 1);
                if (ribbon.morphTargetInfluences) ribbon.morphTargetInfluences[0] = t;
                ribbon.rotation.set(0, 0, 0); 
                ribbon.scale.set(1, 1, 1);
                ribbon.position.set(0, 5, 0); 
                mat.emissive.setHex(0xFFD700);
                mat.emissiveIntensity = 1.0 + Math.sin(time * 5.0) * 0.5;
                mat.opacity = 0.9;
                
                // --- ADAPTIVE CAMERA ZOOM ---
                if (cameraRef.current) {
                     const cam = cameraRef.current;
                     const aspect = cam.aspect;
                     const vFOV = cam.fov * Math.PI / 180;
                     
                     // Text World Width ~ 400 units (1024 * 0.4)
                     // Text World Height ~ 200 units (512 * 0.4)
                     const requiredWidth = 450; // Padding added
                     const requiredHeight = 220; // Padding added
                     
                     const distHeight = requiredHeight / (2 * Math.tan(vFOV / 2));
                     const distWidth = requiredWidth / (2 * aspect * Math.tan(vFOV / 2));
                     
                     // Choose the max distance needed to fit both width and height
                     const targetZ = Math.max(distHeight, distWidth, 120);
                     
                     // Smooth zoom with limits
                     const clampedTarget = Math.min(targetZ, 3000); // Respect Far Plane
                     cam.position.z = THREE.MathUtils.lerp(cam.position.z, clampedTarget, 0.05);
                }
            } else {
                if (ribbon.morphTargetInfluences) ribbon.morphTargetInfluences[0] = THREE.MathUtils.lerp(ribbon.morphTargetInfluences[0], 0, 0.1);
                const waveSpeed = 0.5;
                const waveAmp = 1.5;
                ribbon.position.set(0, Math.sin(time * waveSpeed) * waveAmp, 0);
                ribbon.scale.lerp(new THREE.Vector3(1,1,1), 0.05);
                if(ribbon.userData.texture) ribbon.userData.texture.offset.x -= 0.002;
                mat.emissive.setHex(0x550000);
                mat.emissiveIntensity = 0.2;
                mat.opacity = THREE.MathUtils.lerp(mat.opacity, state === AppState.ZOOM ? 0.1 : 0.6, 0.05);
            }
        }
    };

    const updateStar = (state: AppState) => {
        const star = logicDataRef.current.star;
        if (star) {
            let target = state === AppState.TREE ? star.userData.treePos : star.userData.scatterPos;
            
            star.position.lerp(target, 0.05);
            star.rotation.y += 0.01;
            if (rainbowStarModeRef.current) {
                const hue = (timeRef.current * 0.1) % 1;
                const mat = star.material as THREE.MeshStandardMaterial;
                if (mat) {
                    mat.emissive.setHSL(hue, 1, 0.5);
                    mat.emissiveIntensity = 2.0;
                }
            }
        }
    };

    const updatePhotos = (state: AppState) => {
        photoMeshesRef.current.forEach((group, idx) => {
            let targetPos, targetScale = 1.0; 
            const isTarget = (state === AppState.ZOOM && idx === zoomTargetIndexRef.current);
            
            const photoMesh = group.children.find(c => c.name === 'photo') as THREE.Mesh;
            const frameMesh = group.children.find(c => c.name === 'frame') as THREE.Mesh;

            if (isTarget) {
                targetPos = mainGroup.worldToLocal(new THREE.Vector3(0, 0, 80));
                targetScale = 3.5;
                group.lookAt(camera.position); 

                // ZOOM MODE: Turn off emissive glow completely for clarity
                if (photoMesh && photoMesh.material instanceof THREE.MeshStandardMaterial) {
                     photoMesh.material.emissiveIntensity = 0.0; // NO GLOW
                     photoMesh.material.roughness = 1.0; // MAX ROUGHNESS (MATTE)
                     photoMesh.material.metalness = 0.0;
                }
                // Frame: Minimal glow to show selection
                if (frameMesh && frameMesh.material instanceof THREE.MeshStandardMaterial) {
                     frameMesh.material.emissive.setHex(0xFFD700);
                     frameMesh.material.emissiveIntensity = 0.2; 
                }

            } else {
                // ... positioning ...
                if (state === AppState.SCATTER) {
                    targetScale = 2.0; 
                    group.lookAt(camera.position);
                    targetPos = group.userData.scatterPos;
                } else {
                    targetPos = group.userData.treePos;
                    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, group.userData.baseRot.x, 0.1);
                    group.rotation.y = group.userData.baseRot.y + timeRef.current * 0.5; 
                    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, group.userData.baseRot.z, 0.1);
                }

                // NORMAL MODE: High glow for visibility
                if (photoMesh && photoMesh.material instanceof THREE.MeshStandardMaterial) {
                     photoMesh.material.emissiveIntensity = 1.0;
                     photoMesh.material.roughness = 0.2;
                }
                if (frameMesh && frameMesh.material instanceof THREE.MeshStandardMaterial) {
                     frameMesh.material.emissive.setHex(0x222222);
                     frameMesh.material.emissiveIntensity = 0.2;
                }
            }
            group.position.lerp(targetPos, 0.1);
            group.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
        });
    };

    const animate = () => {
        requestRef.current = requestAnimationFrame(animate);
        timeRef.current += 0.016;

        // --- GLOBAL CRASH PROTECTION ---
        try {
            predictWebcam();
            
            const state = appStateRef.current;
            const group = mainGroupRef.current;
            if (!group) return; 

            // -- New Feature: Nebula Rotation --
            if (state === AppState.SCATTER) {
                group.rotation.y += 0.005; // Auto-rotate slowly in scatter mode
            }

            // -- New Feature: Tyndall Beams attached to flashing particles --
            const beams = logicDataRef.current.tyndallBeams;
            const beamIndices = logicDataRef.current.tyndallIndices;
            const goldParticles = logicDataRef.current.gold;
            const { dummy } = tempRef.current;

            if (beams && beamIndices && goldParticles.length > 0) {
                const isScatter = state === AppState.SCATTER;
                beams.visible = isScatter; // Only visible in scatter mode
                
                if (isScatter) {
                    for (let i = 0; i < beamIndices.length; i++) {
                        const idx = beamIndices[i];
                        if (idx < goldParticles.length) {
                            const particle = goldParticles[idx];
                            const pos = particle.currentPos;
                            
                            // Calculate "Flash" intensity for breathing effect
                            // Use index offset to de-sync breathing
                            const flashSpeed = 2.0;
                            const flashOffset = idx * 0.1;
                            const intensity = Math.sin(timeRef.current * flashSpeed + flashOffset);
                            // Breathing Scale (width modulation)
                            const scale = THREE.MathUtils.mapLinear(intensity, -1, 1, 0.2, 1.8);
                            
                            dummy.position.copy(pos);
                            // Point beam outwards from center (0,0,0)
                            // 1. Look at center
                            dummy.lookAt(0,0,0);
                            // 2. Rotate so the cone points AWAY from center.
                            // The cone geometry is defined pointing along +Z (rotateX(-PI/2) was applied to default cylinder)
                            // LookAt aligns +Z to target (center).
                            // So currently +Z points to center. We want +Z to point away.
                            // Rotate 180 degrees around Y or X.
                            dummy.rotateY(Math.PI);

                            // Apply breathing scale to width (X/Y local) but keep length (Z local) constant-ish
                            dummy.scale.set(scale, scale, 1); 
                            dummy.updateMatrix();
                            beams.setMatrixAt(i, dummy.matrix);
                        }
                    }
                    beams.instanceMatrix.needsUpdate = true;
                }
            }

            if (isHoldingStarRef.current && !isEpicSequenceRef.current) {
                if (inputModeRef.current === 'touch' && starHoldStartTimeRef.current > 0) {
                    const holdTime = Date.now() - starHoldStartTimeRef.current;
                    const progress = Math.min(holdTime / 3000, 1.0);
                    setHoldProgress(progress);
                    if (progress >= 1.0 && !hasTriggeredEpicRef.current) {
                        triggerEpicSequence(); // USE CENTRALIZED TRIGGER
                    }
                }
            }

            if (isEpicSequenceRef.current) {
                epicTimerRef.current += 0.016;
                const t = epicTimerRef.current;
                if (group.rotation.y > Math.PI) group.rotation.y -= 2 * Math.PI;
                if (group.rotation.y < -Math.PI) group.rotation.y += 2 * Math.PI;
                group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0, 0.05);
                group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, 0, 0.05);
                group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, 0.05);
                rotationVelocityRef.current = 0;
                if (t < 3.0) group.scale.setScalar(1.0 + Math.sin(t * Math.PI * 2) * 0.1);
                else group.scale.setScalar(1.0);
                if (t > 3.0 && t < 6.0 && Math.random() < 0.1) {
                    const warmColors = [0xFFD700, 0xFFA500, 0xFF4500];
                    const c = warmColors[Math.floor(Math.random()*warmColors.length)];
                    spawnFirework(c, 'snow');
                }
                if (t > 18.0) {
                    isEpicSequenceRef.current = false;
                    setAppState(AppState.TREE);
                }
            }

            if (state !== AppState.ZOOM && state !== AppState.SCATTER && interactionRef.current.touches !== 2 && interactionRef.current.touches !== 1 && !isGoldModeRef.current && !isEpicSequenceRef.current && (inputModeRef.current === 'touch')) {
                group.rotation.y += rotationVelocityRef.current;
                rotationVelocityRef.current *= 0.95; 
                if (settingsRef.current.rotationEnabled && Math.abs(rotationVelocityRef.current) < 0.0005 && state === AppState.TREE) {
                    group.rotation.y += 0.002;
                }
            }
            if (shakeIntensityRef.current > 0) {
                // Apply shake to camera or root object
                group.position.x = (Math.random() - 0.5) * shakeIntensityRef.current;
                group.position.y = (Math.random() - 0.5) * shakeIntensityRef.current;
                shakeIntensityRef.current *= 0.9; // Decay

                // Visual Shockwave: Dynamic Bloom Strength based on Shake
                if (bloomPassRef.current) {
                    bloomPassRef.current.strength = 0.4 + shakeIntensityRef.current * 0.5;
                    bloomPassRef.current.radius = 0.8 + shakeIntensityRef.current * 0.1;
                }
            } else {
                group.position.set(0,0,0);
                // Reset Bloom
                if (bloomPassRef.current) {
                    bloomPassRef.current.strength = THREE.MathUtils.lerp(bloomPassRef.current.strength, 0.4, 0.1);
                    bloomPassRef.current.radius = THREE.MathUtils.lerp(bloomPassRef.current.radius, 0.8, 0.1);
                }
            }

            if (interactionRef.current.touches === 4 && (Date.now() - interactionRef.current.startTime) > 500 && Math.random() < 0.1) spawnFirework(undefined, 'normal');

            updateInstancedSystem(logicDataRef.current.gold, group, state, 'gold');
            updateInstancedSystem(logicDataRef.current.silver, group, state, 'silver');
            updateInstancedSystem(logicDataRef.current.gem, group, state, 'gem');
            updateInstancedSystem(logicDataRef.current.emerald, group, state, 'emerald');
            updateInstancedSystem(logicDataRef.current.trunk, group, state, 'trunk'); // Update trunk
            updateInstancedSystem(logicDataRef.current.grass, group, state, 'grass'); // Update grass
            updateDustParticles(state);
            updatePhotos(state);
            updateRibbon(state);
            updateStar(state);
            updateFireworks();

            composer.render();
        } catch (error) {
            console.error("Animation Loop Crash:", error);
            // Optionally set text to error
        }
    };

    animate();

    const onWindowResize = () => {
        if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
        composer.setSize(width, height);
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
        window.removeEventListener('resize', onWindowResize);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        if (containerRef.current && renderer.domElement) containerRef.current.removeChild(renderer.domElement);
        renderer.dispose();
    };
  }, []); 

  const handleTouch = (e: any, type: string) => {
      if (inputModeRef.current === 'camera') return;

      initAudio();
      
      const isTouch = 'touches' in e;
      const touches = isTouch ? e.touches : [];
      const touchCount = isTouch ? touches.length : (e.buttons === 1 ? 1 : 0);
      
      interactionRef.current.touches = touchCount;

      if (type === 'start') {
          interactionRef.current.startTime = Date.now();
          const positions = [];
          if (isTouch) {
              for(let i=0; i<touches.length; i++) positions.push({x: touches[i].clientX, y: touches[i].clientY});
          } else {
              positions.push({x: e.clientX, y: e.clientY});
          }
          interactionRef.current.startPositions = positions;
          
          // Store initial positions for single touch rotation
          if (positions.length > 0) {
              interactionRef.current.lastX = positions[0].x;
              interactionRef.current.lastY = positions[0].y;
          }

          if (touchCount === 2) {
              const dx = touches[0].clientX - touches[1].clientX;
              const dy = touches[0].clientY - touches[1].clientY;
              interactionRef.current.lastDistance = Math.sqrt(dx*dx + dy*dy);
              interactionRef.current.lastAngle = Math.atan2(dy, dx);
          }
          rotationVelocityRef.current = 0;

          if (touchCount === 1) {
              const cx = positions[0].x;
              const cy = positions[0].y;
              if (containerRef.current && cameraRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const x = ((cx - rect.left) / rect.width) * 2 - 1;
                  const y = -((cy - rect.top) / rect.height) * 2 + 1;
                  raycasterRef.current.setFromCamera(new THREE.Vector2(x,y), cameraRef.current);
                  
                  if (logicDataRef.current.star) {
                      const intersects = raycasterRef.current.intersectObject(logicDataRef.current.star);
                      if (intersects.length > 0) {
                          isHoldingStarRef.current = true;
                          starHoldStartTimeRef.current = Date.now();
                          setTouchPos({x: cx, y: cy});
                      }
                  }
              }
          }
      }

      if (type === 'move') {
          if (touchCount === 1) {
              const cx = isTouch ? touches[0].clientX : e.clientX;
              const cy = isTouch ? touches[0].clientY : e.clientY;
              
              // FIX: Add Single Finger Rotation
              const deltaX = cx - interactionRef.current.lastX;
              if (Math.abs(deltaX) > 1) { // Threshold to avoid jitter
                   rotationVelocityRef.current = deltaX * 0.005;
                   // Directly rotate for responsiveness
                   if (mainGroupRef.current) mainGroupRef.current.rotation.y += deltaX * 0.005;
              }
              interactionRef.current.lastX = cx;
              interactionRef.current.lastY = cy;

              if (isHoldingStarRef.current) {
                   setTouchPos({x: cx, y: cy});
              }

              if (containerRef.current && cameraRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = ((cx - rect.left) / rect.width) * 2 - 1;
                const y = -((cy - rect.top) / rect.height) * 2 + 1;
                raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
                
                const intersection = new THREE.Vector3();
                raycasterRef.current.ray.intersectPlane(planeRef.current, intersection);
                repulsionPointRef.current = intersection;
              }
          } else if (touchCount === 2 && isTouch) {
              const dx = touches[0].clientX - touches[1].clientX;
              const dy = touches[0].clientY - touches[1].clientY;
              const dist = Math.sqrt(dx*dx + dy*dy);
              const angle = Math.atan2(dy, dx);
              
              const dDist = dist - interactionRef.current.lastDistance;
              
              let dAngle = angle - interactionRef.current.lastAngle;
              if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
              else if (dAngle < -Math.PI) dAngle += 2 * Math.PI;
              
              if (cameraRef.current) {
                  cameraRef.current.position.z -= dDist * 0.15;
                  cameraRef.current.position.z = Math.max(20, Math.min(200, cameraRef.current.position.z));
              }
              
              if (mainGroupRef.current) {
                  mainGroupRef.current.rotation.y += dAngle * 2.0; 
                  rotationVelocityRef.current = dAngle * 0.5;
              }

              interactionRef.current.lastDistance = dist;
              interactionRef.current.lastAngle = angle;
          }
      }

      if (type === 'end') {
          repulsionPointRef.current = null;
          isHoldingStarRef.current = false;
          setHoldProgress(0);

          if (Date.now() - interactionRef.current.startTime < 300) {
             const lastCount = interactionRef.current.startPositions.length;
             
             if (lastCount === 1) {
                 const now = Date.now();
                 if (now - interactionRef.current.lastTapTime < 300) {
                     shakeIntensityRef.current = 5.0;
                 } else {
                     playBellSound(); 
                     const pos = interactionRef.current.startPositions[0];
                     handlePhotoClick(pos.x, pos.y);
                 }
                 interactionRef.current.lastTapTime = now;
             } else if (lastCount === 2) {
                 setAppState(prev => prev === AppState.TREE ? AppState.SCATTER : AppState.TREE);
             }
          }
          if (touchCount === 5) {
             isGoldModeRef.current = true;
             goldModeTimerRef.current = 8.0; 
             playJingleBells();
          }
      }
  };

  return (
    <div 
        ref={containerRef} 
        className="w-full h-full cursor-pointer"
        onMouseDown={(e) => handleTouch(e, 'start')}
        onMouseMove={(e) => handleTouch(e, 'move')}
        onMouseUp={(e) => handleTouch(e, 'end')}
        onMouseLeave={(e) => handleTouch(e, 'end')}
        onTouchStart={(e) => handleTouch(e, 'start')}
        onTouchMove={(e) => handleTouch(e, 'move')}
        onTouchEnd={(e) => handleTouch(e, 'end')}
    />
  );
};

export default JewelTreeScene;
