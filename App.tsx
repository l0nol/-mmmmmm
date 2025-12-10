import React, { useState, useCallback, useRef } from 'react';
import JewelTreeScene from './components/JewelTreeScene';
import UIOverlay from './components/UIOverlay';

// Define shared types
export enum AppState {
  TREE = 'tree',
  SCATTER = 'scatter',
  ZOOM = 'zoom'
}

export interface AppSettings {
  soundEnabled: boolean;
  rotationEnabled: boolean;
  ribbonVisible: boolean;
}

export type InputMode = 'touch' | 'camera';

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.TREE);
  const [statusText, setStatusText] = useState<string>("系统初始化...");
  const [uploadedImages, setUploadedImages] = useState<HTMLImageElement[]>([]);
  
  // Settings State
  const [settings, setSettings] = useState<AppSettings>({
    soundEnabled: true,
    rotationEnabled: true,
    ribbonVisible: true
  });
  
  // Input Mode State
  const [inputMode, setInputMode] = useState<InputMode>('touch');
  
  // Visual effects state
  const [auroraActive, setAuroraActive] = useState(false);
  
  // Epic Interaction State
  const [blessingCount, setBlessingCount] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0); // 0.0 to 1.0
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });

  // Shared Video Ref for Camera Mode
  const videoRef = useRef<HTMLVideoElement>(null);

  // Callback to handle file uploads from UI
  const handleFileUpload = useCallback((files: FileList | null) => {
    if (!files) return;
    
    const newImages: HTMLImageElement[] = [];
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const img = new Image();
          img.src = e.target.result as string;
          img.onload = () => {
            setUploadedImages(prev => [...prev, img]);
          };
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-black overflow-hidden select-none touch-none">
      {/* Aurora Background Layer */}
      <div 
        className={`absolute inset-0 z-0 transition-opacity duration-1000 ease-in-out pointer-events-none
          bg-gradient-to-t from-black via-purple-900/40 to-green-900/30
          ${auroraActive ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-200 contrast-200"></div>
        {/* Dynamic lights for Aurora feel */}
        <div className={`absolute top-0 left-0 w-full h-full mix-blend-screen opacity-50 ${auroraActive ? 'animate-pulse' : ''}`}>
           <div className="absolute top-[-50%] left-[-20%] w-[150%] h-[150%] bg-gradient-to-r from-transparent via-green-500/20 to-transparent rotate-12 blur-3xl animate-[spin_20s_linear_infinite]"></div>
           <div className="absolute top-[-50%] right-[-20%] w-[150%] h-[150%] bg-gradient-to-l from-transparent via-purple-500/20 to-transparent -rotate-12 blur-3xl animate-[spin_15s_linear_infinite_reverse]"></div>
        </div>
      </div>

      {/* 3D Scene Layer */}
      <div className="relative z-10 w-full h-full">
        <JewelTreeScene 
          appState={appState} 
          setAppState={setAppState}
          setStatusText={setStatusText}
          uploadedImages={uploadedImages}
          setAuroraActive={setAuroraActive}
          settings={settings}
          setBlessingCount={setBlessingCount}
          setHoldProgress={setHoldProgress}
          setTouchPos={setTouchPos}
          inputMode={inputMode}
          videoRef={videoRef}
        />
      </div>

      {/* UI Overlay Layer */}
      <div className="relative z-20 pointer-events-none">
        <UIOverlay 
          statusText={statusText}
          onFileUpload={handleFileUpload}
          appState={appState}
          setAppState={setAppState}
          settings={settings}
          setSettings={setSettings}
          blessingCount={blessingCount}
          holdProgress={holdProgress}
          touchPos={touchPos}
          inputMode={inputMode}
          setInputMode={setInputMode}
          videoRef={videoRef}
        />
      </div>
    </div>
  );
}