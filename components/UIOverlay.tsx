
import React, { useState } from 'react';
import { AppState, AppSettings, InputMode } from '../App';

interface UIOverlayProps {
  statusText: string;
  onFileUpload: (files: FileList | null) => void;
  appState: AppState;
  setAppState: (state: AppState) => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  blessingCount: number;
  holdProgress: number;
  touchPos: { x: number, y: number };
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
    statusText, onFileUpload, appState, setAppState, settings, setSettings,
    blessingCount, holdProgress, touchPos, inputMode, setInputMode, videoRef
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const toggleSetting = (key: keyof AppSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getStatusColor = () => {
      if (appState === AppState.ZOOM) return "text-amber-400 border-amber-500/50 bg-amber-500/10";
      if (appState === AppState.SCATTER) return "text-cyan-400 border-cyan-500/50 bg-cyan-500/10";
      return "text-green-400 border-green-500/50 bg-green-500/10";
  };

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden font-sans select-none">
      
      {/* 1. Permanent Blessing Counter */}
      <div className="absolute bottom-6 left-6 z-20 pointer-events-none">
          <div className="flex items-center gap-3">
              <div className="text-4xl animate-bounce">❄️</div>
              <div className="flex flex-col">
                  <span className="text-[10px] text-amber-200/60 uppercase tracking-widest font-bold">Blessings</span>
                  <span className="text-2xl font-light text-white font-mono drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">
                      × {blessingCount.toString().padStart(3, '0')}
                  </span>
              </div>
          </div>
      </div>

      {/* 2. Hold Progress Ring */}
      {holdProgress > 0 && (
          <div 
            className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-transform duration-75 ease-out"
            style={{ left: touchPos.x, top: touchPos.y }}
          >
              <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl animate-pulse"></div>
                  <div className="absolute inset-0 rounded-full border border-amber-500/30 scale-110 animate-[spin_4s_linear_infinite]"></div>
                  <svg className="w-full h-full -rotate-90 drop-shadow-[0_0_10px_rgba(255,170,0,0.8)]">
                      <circle cx="64" cy="64" r="28" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
                      <circle 
                        cx="64" cy="64" r="28" 
                        stroke="#FFD700" 
                        strokeWidth="4" 
                        fill="none" 
                        strokeDasharray="176" 
                        strokeDashoffset={176 - (176 * holdProgress)}
                        strokeLinecap="round"
                        className="transition-all duration-100 ease-linear"
                      />
                  </svg>
                  {holdProgress >= 1 ? (
                       <span className="absolute text-amber-100 font-bold text-xs animate-ping">READY</span>
                  ) : (
                       <span className="absolute text-amber-100/80 font-mono text-[10px]">{Math.floor(holdProgress * 100)}%</span>
                  )}
              </div>
          </div>
      )}

      {/* 3. Main Control Panel */}
      <div className="absolute top-4 left-4 z-30 flex flex-col items-start origin-top-left transition-all duration-300 max-w-[90%] w-[320px]">
         <div className="pointer-events-auto w-full flex flex-col bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300">
            
            {/* Header */}
            <div 
                className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
               <div>
                  <h1 className="text-xl font-light tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-amber-500 uppercase drop-shadow-sm whitespace-nowrap">
                      Jewel Tree
                  </h1>
               </div>
               <div className={`shrink-0 w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-amber-400 transition-transform duration-300 ${!isExpanded ? '-rotate-90' : 'rotate-0'}`}>
                  ▼
               </div>
            </div>

            {/* Expanded Content */}
            <div className={`transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'}`}>
               <div className="p-4 space-y-5 overflow-y-auto max-h-[70vh] scrollbar-thin scrollbar-thumb-white/20">
                  
                  {/* Status Display */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${getStatusColor()} transition-colors duration-300`}>
                      <div className={`w-2 h-2 rounded-full animate-pulse bg-current`}></div>
                      <span className="text-xs font-bold uppercase tracking-widest truncate">{statusText}</span>
                  </div>

                  {/* Picture Insert Button */}
                  <label className="w-full bg-gradient-to-r from-amber-600/80 to-amber-500/80 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg border border-amber-400/30 cursor-pointer flex items-center justify-center gap-2 transition-all active:scale-95 group">
                      <span className="text-lg group-hover:scale-110 transition-transform">📷</span>
                      <span>插入照片 / Insert Photo</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => onFileUpload(e.target.files)} />
                  </label>

                  {/* Dynamic Interaction Guide */}
                  <div className="space-y-3">
                     <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/10 pb-1">
                        {inputMode === 'touch' ? '触屏指南 (Touch)' : 'AI 手势魔法 (Magic Hand)'}
                     </h3>
                     <div className="grid grid-cols-1 gap-3 text-xs text-gray-300">
                        {inputMode === 'touch' ? (
                            <>
                                <div className="flex gap-3">
                                   <div className="w-6 h-6 shrink-0 rounded bg-white/10 flex items-center justify-center text-amber-500">👆</div>
                                   <div className="flex flex-col">
                                      <span className="font-bold text-white">单指 (1 Finger)</span>
                                      <span className="text-[10px] text-white/60">旋转 / 点击照片 / 长按星星</span>
                                   </div>
                                </div>
                                <div className="flex gap-3">
                                   <div className="w-6 h-6 shrink-0 rounded bg-white/10 flex items-center justify-center text-amber-500">✌️</div>
                                   <div className="flex flex-col">
                                      <span className="font-bold text-white">双指 (2 Fingers)</span>
                                      <span className="text-[10px] text-white/60">缩放 / 双击切换星云</span>
                                   </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-white/5 p-2 rounded border border-white/5 space-y-2">
                                    <h4 className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-1">
                                        任意单手 (Any Hand)
                                    </h4>
                                    
                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-amber-500">✊</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">握拳 (Fist)</span>
                                          <span className="text-[10px] text-white/60">抓住圣诞树 + 左右移动旋转</span>
                                       </div>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-cyan-500">🖐</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">五指 (5 Fingers)</span>
                                          <span className="text-[10px] text-white/60">星云散开 (Scatter)</span>
                                       </div>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-purple-500">☝️</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">单指 (Point)</span>
                                          <span className="text-[10px] text-white/60">控制远近 (Zoom)</span>
                                       </div>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-pink-500">👌</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">捏合 (Pinch)</span>
                                          <span className="text-[10px] text-white/60">点击/选择照片</span>
                                       </div>
                                    </div>
                                    
                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-yellow-500">✌️</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">胜利 (Victory)</span>
                                          <span className="text-[10px] text-white/60">保持2秒触发彩蛋</span>
                                       </div>
                                    </div>

                                    <div className="flex gap-3 items-center">
                                       <div className="w-5 h-5 shrink-0 rounded bg-white/10 flex items-center justify-center text-yellow-300">🤟</div>
                                       <div className="flex flex-col">
                                          <span className="font-bold text-white">三指 (Three)</span>
                                          <span className="text-[10px] text-white/60">保持3秒纯金模式</span>
                                       </div>
                                    </div>
                                </div>
                            </>
                        )}
                     </div>
                  </div>

                  {/* Settings Toggles */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
                      <button onClick={() => toggleSetting('soundEnabled')} className={`p-2 rounded flex flex-col items-center gap-1 border ${settings.soundEnabled ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/5 bg-white/5 text-gray-500'}`}>
                         <span className="text-sm">♪</span><span className="text-[8px] font-bold">音效</span>
                      </button>
                      <button onClick={() => toggleSetting('rotationEnabled')} className={`p-2 rounded flex flex-col items-center gap-1 border ${settings.rotationEnabled ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/5 bg-white/5 text-gray-500'}`}>
                         <span className="text-sm">↻</span><span className="text-[8px] font-bold">自旋</span>
                      </button>
                      <button onClick={() => toggleSetting('ribbonVisible')} className={`p-2 rounded flex flex-col items-center gap-1 border ${settings.ribbonVisible ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/5 bg-white/5 text-gray-500'}`}>
                         <span className="text-sm">🎀</span><span className="text-[8px] font-bold">丝带</span>
                      </button>
                  </div>

                  {/* Back Button */}
                  {appState === AppState.ZOOM && (
                     <button onClick={() => setAppState(AppState.TREE)} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs text-white border border-white/10 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                        <span>↩</span> 返回全景 (Back)
                     </button>
                  )}
               </div>
            </div>
         </div>
      </div>
      
      {/* 4. Camera Preview (Only active in Camera Mode) */}
      <div 
        className={`pointer-events-auto fixed bottom-6 right-6 z-40 w-40 h-32 bg-black/80 rounded-xl border border-white/20 overflow-hidden shadow-2xl transition-all duration-500 ${inputMode === 'camera' ? 'translate-x-0 opacity-100' : 'translate-x-[200%] opacity-0'}`}
      >
          <div className="relative w-full h-full">
            <video ref={videoRef} id="input-video" className="absolute inset-0 w-full h-full object-cover opacity-50 mirror" playsInline muted autoPlay></video>
            <canvas id="skeleton-canvas" className="absolute inset-0 w-full h-full object-cover mirror"></canvas>
            <div className="absolute top-1 left-2 text-[8px] text-cyan-400 font-bold uppercase tracking-widest bg-black/50 px-1 rounded">
                AI Vision
            </div>
          </div>
          <style>{`.mirror { transform: scaleX(-1); }`}</style>
      </div>

      {/* 5. FAB (Only in Touch Mode) */}
      {inputMode === 'touch' && (
          <label className="pointer-events-auto fixed bottom-32 right-8 z-30 group cursor-pointer flex flex-col items-center gap-2">
             <div className="bg-black/60 backdrop-blur text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 shadow-lg whitespace-nowrap">
                插入照片 +
             </div>
             <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => onFileUpload(e.target.files)} />
             <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_30px_rgba(245,158,11,0.4)] border-2 border-white/20 flex items-center justify-center text-white animate-pulse transition-transform active:scale-90">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
             </div>
          </label>
      )}

      {/* 6. Close Button */}
      {appState === AppState.ZOOM && (
        <button
          onClick={() => setAppState(AppState.TREE)}
          className="pointer-events-auto fixed top-6 right-6 z-50 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white/90 flex items-center justify-center transition-all duration-300 hover:bg-white/20 hover:text-white hover:border-white/50 hover:scale-110 hover:shadow-[0_0_15px_rgba(255,255,255,0.8)] active:scale-95 group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* 7. Input Mode Toggle Button (Standalone) */}
      {appState !== AppState.ZOOM && (
        <button
            onClick={() => setInputMode(inputMode === 'touch' ? 'camera' : 'touch')}
            title={inputMode === 'touch' ? "切换到手势模式 (Switch to Gesture)" : "切换到触屏模式 (Switch to Touch)"}
            className={`pointer-events-auto fixed top-6 right-[70px] z-30 h-10 px-3 rounded-full backdrop-blur-md border border-white/20 flex items-center justify-center gap-2 transition-all duration-300 hover:scale-105 shadow-lg ${
                inputMode === 'camera' 
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 shadow-cyan-500/20' 
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-amber-500/20'
            }`}
        >
            <span className="text-lg">{inputMode === 'touch' ? '👆' : '📷'}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">
                {inputMode === 'touch' ? 'Touch' : 'Gesture'}
            </span>
        </button>
      )}

      {/* 8. Help Button */}
      {appState !== AppState.ZOOM && (
          <button
            onClick={() => setShowHelp(true)}
            className="pointer-events-auto fixed top-6 right-6 z-30 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white/90 flex items-center justify-center transition-all duration-300 hover:bg-white/20 hover:text-white hover:border-white/50 hover:scale-110 shadow-lg"
          >
            <span className="text-xl font-bold font-serif italic">?</span>
          </button>
      )}

      {/* 9. Help Modal */}
      {showHelp && (
        <div className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
           <div className="bg-gray-900/90 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                 <h2 className="text-lg font-bold text-amber-400 tracking-widest uppercase">操作指南 / Instructions</h2>
                 <button onClick={() => setShowHelp(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6 text-sm text-gray-300 scrollbar-thin scrollbar-thumb-white/20">
                 <div className="space-y-2">
                    <h3 className="text-white font-bold border-l-4 border-amber-500 pl-3">🌟 核心玩法</h3>
                    <p>这不仅是一棵圣诞树，更是一个互动的珠宝艺术装置。</p>
                 </div>

                 {/* Touch Controls Section */}
                 <div className="space-y-3">
                    <h3 className="text-white font-bold border-l-4 border-amber-500 pl-3">👆 触屏操作 (Touch)</h3>
                    <ul className="space-y-2 bg-white/5 p-4 rounded-lg text-xs">
                       <li className="flex gap-2 items-center"><span className="text-lg w-6">👆</span> <span><b>单指拖动:</b> 旋转圣诞树。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-lg w-6">🤏</span> <span><b>双指捏合:</b> 缩放视角。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-lg w-6">👆👆</span> <span><b>双指双击:</b> 切换 星云/树 模式。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-lg w-6">✨</span> <span><b>长按星星:</b> 触发史诗级许愿演出。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-lg w-6">🖐</span> <span><b>五指点击:</b> 触发纯金模式。</span></li>
                    </ul>
                 </div>

                 <div className="space-y-3">
                    <h3 className="text-white font-bold border-l-4 border-cyan-500 pl-3">🤖 AI 手势 (Any Hand)</h3>
                    <p className="text-xs text-white/50 italic">无需区分左右手。系统自动锁定最清晰的手。</p>
                    
                    <ul className="space-y-2 bg-white/5 p-4 rounded-lg">
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">✊</span> <span><b>握拳 (Fist):</b> 抓住树。左右移动手掌 = 旋转。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">🖐</span> <span><b>五指 (Open):</b> 星云散开。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">☝️</span> <span><b>单指 (Point):</b> 控制远近 (Zoom)。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">👌</span> <span><b>捏合 (Pinch):</b> 点击/选择照片。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">🤟</span> <span><b>三指 (Three):</b> 保持3秒纯金模式。</span></li>
                       <li className="flex gap-2 items-center"><span className="text-2xl w-8">✌️</span> <span><b>胜利 (Victory):</b> 保持2秒触发彩蛋。</span></li>
                    </ul>
                 </div>
              </div>
              <div className="p-4 border-t border-white/10 bg-white/5">
                 <button onClick={() => setShowHelp(false)} className="w-full py-3 bg-gradient-to-r from-amber-600 to-amber-500 rounded-xl text-white font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all">
                    开始体验 / Start
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default UIOverlay;
