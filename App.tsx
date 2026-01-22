
import React, { useState, useRef, useEffect } from 'react';
import { AspectRatio, GenerationStatus, TextbookScript, Scene } from './types';
import { analyzeTextbook, generateImage, generateVideoClip } from './services/geminiService';

declare const window: any;

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<string>('');
  const [script, setScript] = useState<TextbookScript | null>(null);
  const [mode, setMode] = useState<'analyze' | 'direct'>('analyze');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeProgress, setMergeProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setInputImage(base64);
        runFullPipeline(inputText, base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const runFullPipeline = async (text: string, image: string | null) => {
    if (!text && !image) return;
    
    setIsPipelineRunning(true);
    setScript(null);
    
    try {
      setPipelineStep(mode === 'analyze' ? 'Đang phân tích nội dung...' : 'Đang chuẩn hóa kịch bản của bạn...');
      const result = await analyzeTextbook(text, image || undefined, mode === 'direct');
      setScript(result);

      setPipelineStep('Đang khởi tạo trình vẽ ảnh hàng loạt...');
      
      let currentScript = { ...result };
      
      for (let i = 0; i < currentScript.scenes.length; i++) {
        const scene = currentScript.scenes[i];
        setPipelineStep(`Đang vẽ minh họa cảnh ${i + 1}/${currentScript.scenes.length}...`);
        
        setScript(prev => prev ? {
          ...prev,
          scenes: prev.scenes.map((s, idx) => idx === i ? { ...s, status: GenerationStatus.PENDING } : s)
        } : null);

        try {
          const url = await generateImage(scene.visualPrompt, selectedAspectRatio, 'standard');
          setScript(prev => prev ? {
            ...prev,
            scenes: prev.scenes.map((s, idx) => idx === i ? { ...s, status: GenerationStatus.SUCCESS, imageUrl: url } : s)
          } : null);
        } catch (err) {
          setScript(prev => prev ? {
            ...prev,
            scenes: prev.scenes.map((s, idx) => idx === i ? { ...s, status: GenerationStatus.ERROR } : s)
          } : null);
        }
        
        await new Promise(r => setTimeout(r, 800));
      }

      setPipelineStep('Hoàn tất toàn bộ quy trình!');
      setTimeout(() => setIsPipelineRunning(false), 2000);

    } catch (err) {
      alert("Lỗi hệ thống: " + err);
      setIsPipelineRunning(false);
    }
  };

  const createVideoForScene = async (sceneId: string) => {
    if (!script) return;
    const hasKey = await window.aistudio?.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio?.openSelectKey();
      return;
    }

    const scene = script.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setScript(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: GenerationStatus.PENDING } : s)
    } : null);

    try {
      const videoUrl = await generateVideoClip(scene.visualPrompt, scene.imageUrl);
      setScript(prev => prev ? {
        ...prev,
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: GenerationStatus.SUCCESS, videoUrl } : s)
      } : null);
    } catch (err) {
      alert("Lỗi tạo video: " + err);
      setScript(prev => prev ? {
        ...prev,
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: GenerationStatus.ERROR } : s)
      } : null);
    }
  };

  const mergeAllVideos = async () => {
    if (!script) return;
    const scenesWithVideo = script.scenes.filter(s => !!s.videoUrl);
    if (scenesWithVideo.length === 0) {
      alert("Bạn cần tạo ít nhất một video clip trước khi ghép nối.");
      return;
    }

    setIsMerging(true);
    setMergeProgress(0);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvas context not available");

      const width = 1280;
      let height = 720;
      if (selectedAspectRatio === AspectRatio.SQUARE) height = 1280;
      if (selectedAspectRatio === AspectRatio.PORTRAIT) {
        canvas.width = 720;
        canvas.height = 1280;
      } else {
        canvas.width = width;
        canvas.height = height;
      }

      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.start();

      for (let i = 0; i < scenesWithVideo.length; i++) {
        setMergeProgress(Math.round(((i) / scenesWithVideo.length) * 100));
        const scene = scenesWithVideo[i];
        const video = document.createElement('video');
        video.src = scene.videoUrl!;
        video.crossOrigin = "anonymous";
        video.muted = true;
        await video.play();

        await new Promise<void>((resolve) => {
          const drawFrame = () => {
            if (video.paused || video.ended) {
              resolve();
              return;
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(drawFrame);
          };
          drawFrame();
        });
      }

      setMergeProgress(100);
      recorder.stop();

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hoan-chinh-${script.topic.replace(/\s+/g, '-').toLowerCase()}.webm`;
        a.click();
        setIsMerging(false);
      };
    } catch (err) {
      console.error(err);
      alert("Lỗi khi ghép nối video. Vui lòng thử lại.");
      setIsMerging(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      {(isPipelineRunning || isMerging) && (
        <div className="fixed top-0 left-0 w-full h-1 z-[100] bg-indigo-50 overflow-hidden">
          <div className="h-full bg-indigo-600 animate-[loading_2s_infinite] w-[40%]"></div>
        </div>
      )}

      {isMerging && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-center">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300">
             <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl mx-auto flex items-center justify-center animate-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
             </div>
             <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Đang ghép nối video...</h3>
                <p className="text-slate-400 text-sm font-medium leading-relaxed">Vui lòng không đóng tab này trong khi chúng tôi hoàn thiện bộ phim của bạn.</p>
             </div>
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${mergeProgress}%` }}></div>
             </div>
             <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">{mergeProgress}% Hoàn thành</p>
          </div>
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-100 py-4">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight text-slate-800 uppercase">TỰ ĐỘNG PHÂN TÍCH - CHUYỂN ẢNH TÌNH HUỐNG SGK THÀNH VIDEO</h1>
              <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">ĐƯỢC TẠO BỞI THẦY HỒ ĐỊNH - 0846666637</p>
            </div>
          </div>
          <button 
            onClick={() => window.aistudio?.openSelectKey()}
            className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 px-3 py-1.5 border border-slate-100 rounded-lg transition-all"
          >
            Cấu hình Veo Key
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <section className={`max-w-4xl mx-auto transition-all duration-700 ${script ? 'opacity-40 pointer-events-none scale-95' : 'py-4'}`}>
          <div className="text-center mb-10 space-y-6">
            <h2 className="text-3xl font-black text-slate-800 tracking-tight leading-tight">
              TỰ ĐỘNG PHÂN TÍCH <br/>
              <span className="text-indigo-600">CHUYỂN ẢNH TÌNH HUỐNG SGK THÀNH VIDEO</span>
            </h2>
            <p className="text-slate-500 font-bold text-sm tracking-wide">Giải pháp sáng tạo nội dung của Thầy Hồ Định (Hotline: 0846.666.637)</p>
            
            <div className="flex flex-col items-center gap-6">
              <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                <button 
                  onClick={() => setMode('analyze')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${mode === 'analyze' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Phân tích từ ảnh/văn bản thô
                </button>
                <button 
                  onClick={() => setMode('direct')}
                  className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-bold transition-all ${mode === 'direct' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Kịch bản có sẵn
                </button>
              </div>

              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tỷ lệ khung hình</span>
                <div className="flex gap-3">
                  {[
                    { label: '1:1', value: AspectRatio.SQUARE, icon: 'M4 4h16v16H4z' },
                    { label: '16:9', value: AspectRatio.LANDSCAPE, icon: 'M2 6h20v12H2z' },
                    { label: '9:16', value: AspectRatio.PORTRAIT, icon: 'M6 2h12v20H6z' }
                  ].map((ratio) => (
                    <button
                      key={ratio.value}
                      onClick={() => setSelectedAspectRatio(ratio.value)}
                      className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-xl transition-all border ${
                        selectedAspectRatio === ratio.value 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' 
                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ratio.icon} />
                      </svg>
                      <span className="text-[10px] font-black">{ratio.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {mode === 'analyze' && (
              <div 
                onClick={() => !isPipelineRunning && fileInputRef.current?.click()}
                className={`w-full aspect-[21/9] rounded-[2.5rem] border-2 border-dashed flex flex-col items-center justify-center transition-all bg-white relative overflow-hidden group shadow-sm
                  ${isPipelineRunning ? 'border-indigo-100 cursor-not-allowed' : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/10 cursor-pointer'}
                `}
              >
                {inputImage && <img src={inputImage} className="absolute inset-0 w-full h-full object-cover opacity-10" />}
                <div className="relative z-10 text-center space-y-4">
                  <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${isPipelineRunning ? 'bg-indigo-600 animate-pulse' : 'bg-indigo-50 text-indigo-600'}`}>
                    {isPipelineRunning ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0l-4-4m4 4v12" />
                      </svg>
                    )}
                  </div>
                  <p className="font-bold text-slate-700">{isPipelineRunning ? pipelineStep : 'Tải lên ảnh bài học SGK hoặc kéo thả'}</p>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>
            )}

            <div className="relative group">
              <textarea 
                className="w-full p-6 bg-white rounded-[2rem] border border-slate-200 shadow-sm focus:ring-4 ring-indigo-50 outline-none text-sm transition-all resize-none h-40 font-medium text-slate-600 placeholder:text-slate-300"
                placeholder={mode === 'analyze' 
                  ? "Dán nội dung bài học SGK thô vào đây (AI sẽ tự động tóm tắt thành kịch bản)..." 
                  : "Dán kịch bản chi tiết của bạn vào đây (Ví dụ: Cảnh 1: Một chú robot nhỏ đang tưới hoa trong vườn mây...)"}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) runFullPipeline(inputText, inputImage);
                }}
              />
              {!isPipelineRunning && (
                <button 
                  onClick={() => runFullPipeline(inputText, inputImage)}
                  disabled={!inputText && (mode === 'direct' || (mode === 'analyze' && !inputImage))}
                  className="absolute bottom-4 right-4 bg-indigo-600 text-white px-6 py-2.5 rounded-2xl text-xs font-bold shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none"
                >
                  Bắt đầu xử lý
                </button>
              )}
            </div>
          </div>
        </section>

        {script && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 mt-6">
             <div className="flex items-end justify-between border-b border-slate-100 pb-6">
                <div>
                   <h2 className="text-2xl font-black text-slate-800">{script.topic}</h2>
                   <div className="flex gap-3 mt-1">
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Kịch bản bài học SGK</p>
                      <span className="text-indigo-500 text-[10px] font-black uppercase tracking-widest border-l border-slate-200 pl-3">Tỷ lệ {selectedAspectRatio}</span>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                  {script.scenes.some(s => !!s.videoUrl) && (
                    <button 
                      onClick={mergeAllVideos}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Xuất video hoàn chỉnh
                    </button>
                  )}
                  <button 
                    onClick={() => { setScript(null); setInputImage(null); setInputText(''); }}
                    className="text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Xóa kết quả
                  </button>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {script.scenes.map((scene, idx) => (
                  <div key={scene.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl transition-all duration-500">
                    <div className={`relative bg-slate-50 overflow-hidden ${
                      selectedAspectRatio === AspectRatio.PORTRAIT ? 'aspect-[9/16]' : 
                      selectedAspectRatio === AspectRatio.LANDSCAPE ? 'aspect-video' : 'aspect-square'
                    }`}>
                       {scene.videoUrl ? (
                         <video src={scene.videoUrl} className="w-full h-full object-cover" controls autoPlay loop muted />
                       ) : scene.imageUrl ? (
                         <img src={scene.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                       ) : (
                         <div className="absolute inset-0 flex items-center justify-center bg-slate-50/50">
                            {scene.status === GenerationStatus.PENDING ? (
                               <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                               </svg>
                            )}
                         </div>
                       )}
                       <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black text-indigo-700 shadow-sm uppercase tracking-tighter">Cảnh {idx + 1}</div>
                    </div>

                    <div className="p-6 space-y-3 flex-1">
                       <h3 className="font-bold text-slate-800 text-sm line-clamp-1">{scene.title}</h3>
                       <p className="text-[11px] text-slate-500 font-medium leading-relaxed italic line-clamp-3">"{scene.narration}"</p>
                    </div>

                    <div className="px-6 pb-6 pt-0">
                       {scene.imageUrl && !scene.videoUrl && (
                          <button 
                             onClick={() => createVideoForScene(scene.id)}
                             disabled={scene.status === GenerationStatus.PENDING}
                             className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-600 transition-all disabled:bg-slate-100 disabled:text-slate-300"
                          >
                             {scene.status === GenerationStatus.PENDING ? 'ĐANG DỰNG...' : 'DỰNG VIDEO'}
                          </button>
                       )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-10 border-t border-slate-100 text-center">
         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
           Sáng tạo nội dung giáo dục thông minh © 2024 - Thiết kế bởi Thầy Hồ Định
         </p>
      </footer>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};

export default App;
