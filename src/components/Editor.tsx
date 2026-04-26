import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { ArrowLeft, Play, X, Download, Undo2, Redo2, Clock, Save, Copy, Settings, ChevronDown, BookOpenText, Pause, RotateCcw, Monitor, Share2, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

interface PlaybackEntry {
  c: string; // content
  s: number; // scroll
  t: number; // timestamp
  p: number; // cursor position
}

interface EditorProps {
  title: string;
  initialContent: string;
  initialPlaybackLog?: PlaybackEntry[];
  onBack: () => void;
  onSave: (content: string, playbackLog: PlaybackEntry[]) => void;
}

export default function Editor({ title, initialContent, initialPlaybackLog, onBack, onSave }: EditorProps) {
  const [content, setContent] = useState(initialContent);
  const [history, setHistory] = useState<string[]>([initialContent]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Use Ref for writing session to avoid massive state update lag
  const playbackLogRef = useRef<PlaybackEntry[]>(Array.isArray(initialPlaybackLog) ? initialPlaybackLog : []);
  // Separate state for playback theater to avoid re-calculating processedLog during typing
  const [activePlaybackLog, setActivePlaybackLog] = useState<PlaybackEntry[]>([]);
  
  const [showTimeLapse, setShowTimeLapse] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [toast, setToast] = useState('');
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exportRangeMode, setExportRangeMode] = useState<{show: boolean, type: 'download' | 'share' | null}>({ show: false, type: null });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const exportCanceledRef = useRef<boolean>(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  // --- 1. PERSISTENCE & DATA MANAGEMENT ---

  const recordState = useCallback((newContent: string, cursor: number) => {
    const scroll = textareaRef.current?.scrollTop || 0;
    const now = Date.now();
    
    // Update Ref (Immediate, no re-render)
    const prev = playbackLogRef.current;
    const last = prev[prev.length - 1];
    if (last && last.c === newContent && last.p === cursor) return;
    
    playbackLogRef.current = [...prev.slice(-150000), { c: newContent, s: scroll, t: now, p: cursor }];
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = e.target.value;
    setContent(raw);
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(raw);
    if (newHistory.length > 100) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    const cursor = e.target.selectionEnd || 0;
    recordState(raw, cursor);
  };

  // Auto-save debounced
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      onSave(content, playbackLogRef.current);
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 2000);
    }, 1500); // 1.5 seconds debounce
    
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [content, onSave]);

  // --- 2. WRITING SUPPORT (Auto-scroll & Toolbar) ---

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const textBeforeCursor = content.substring(0, textarea.selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    
    const fontSize = 24; 
    const lineHeight = fontSize * 1.8;
    const cursorY = currentLineIndex * lineHeight;
    const viewHeight = textarea.clientHeight;
    const targetScroll = cursorY - (viewHeight / 2) + (lineHeight / 2);
    
    textarea.scrollTop = Math.max(0, targetScroll);
  }, [content]);

  const insertBrackets = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newContent = content.substring(0, start) + '「' + selectedText + '」' + content.substring(end);
    setContent(newContent);
    recordState(newContent, start + 1);
    
    // Defer focus and selection to ensure content update is processed
    textarea.focus();
    setTimeout(() => {
      textarea.setSelectionRange(start + 1, start + 1 + selectedText.length);
      if (selectedText.length === 0) {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }
    }, 0);
  };

  const insertText = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + text + content.substring(end);
    setContent(newContent);
    recordState(newContent, start + text.length);
    textarea.focus();
    setTimeout(() => {
       textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 0);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const c = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setContent(c);
      recordState(c, c.length);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const c = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setContent(c);
      recordState(c, c.length);
    }
  };

  // --- 3. TIMELAPSE ENGINE (LOGIC & RENDERING) ---
  
  // Update playback log only when theater opens to avoid crash during writing
  useEffect(() => {
    if (showTimeLapse) {
      setActivePlaybackLog(playbackLogRef.current);
    }
  }, [showTimeLapse]);

  // RE-CALCULATE TIMESTAMPS FOR JUMP-CUT
  const processedLog = useMemo(() => {
    if (activePlaybackLog.length === 0) return [];
    const log: PlaybackEntry[] = [];
    let lastRealT = activePlaybackLog[0].t;
    let virtualT = 0;
    activePlaybackLog.forEach(e => {
        const delta = e.t - lastRealT;
        // Jump-cut: gaps > 0.5s are reduced to 0.1s
        const jumpValue = delta > 500 ? 100 : delta;
        virtualT += jumpValue;
        log.push({...e, t: virtualT});
        lastRealT = e.t;
    });
    return log;
  }, [activePlaybackLog]);

  const totalDuration = useMemo(() => {
    return processedLog.length > 0 ? processedLog[processedLog.length - 1].t : 0;
  }, [processedLog]);

  const renderFrame = useCallback((ctx: CanvasRenderingContext2D, entry: PlaybackEntry, progress: number, isExport: boolean = false) => {
    const canvas = ctx.canvas;
    const dpr = isExport ? 1 : (window.devicePixelRatio || 1);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // --- BACKGROUND WITH ATMOSPHERE ---
    ctx.fillStyle = '#0a0a0b'; 
    ctx.fillRect(0, 0, w, h);

    // Replicate App's atmosphere gradients
    ctx.save();
    const grad1 = ctx.createRadialGradient(w * 0.25, 0, 0, w * 0.25, 0, w * 0.8);
    grad1.addColorStop(0, 'rgba(79, 70, 229, 0.12)'); // indigo
    grad1.addColorStop(1, 'transparent');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, h);

    const grad2 = ctx.createRadialGradient(w * 0.75, h, 0, w * 0.75, h, w * 0.8);
    grad2.addColorStop(0, 'rgba(245, 158, 11, 0.04)'); // amber
    grad2.addColorStop(1, 'transparent');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (!entry) return;

    // --- REPRODUCE EDITOR WRAPPING (26 CHARS) ---
    const logicalLines = entry.c.split('\n');
    const visualLines: string[] = [];
    let cursorVisualLine = 0;
    let cursorVisualCol = 0;
    let charCount = 0;

    logicalLines.forEach((l, lIdx) => {
        const segments: string[] = [];
        const chars = Array.from(l);
        if (chars.length === 0) {
            segments.push("");
        } else {
            for (let i = 0; i < chars.length; i += 26) {
                segments.push(chars.slice(i, i + 26).join(''));
            }
        }

        segments.forEach((seg, sIdx) => {
            const startOfSeg = charCount;
            const endOfSeg = charCount + seg.length;
            
            // Check if cursor is in this visual segment
            if (entry.p >= startOfSeg && entry.p <= endOfSeg) {
                cursorVisualLine = visualLines.length;
                
                const textBeforeCursor = seg.substring(0, entry.p - startOfSeg);
                cursorVisualCol = Array.from(textBeforeCursor).length;
            }
            
            visualLines.push(seg);
            charCount += seg.length;
        });
        
        charCount += 1; 
    });

    const charSize = 32; 
    const lineHeight = charSize * 1.6;
    const blockWidth = 26 * charSize;
    const totalTextHeight = visualLines.length * lineHeight;
    
    // Calculate a scale that fits the width with margins
    const fitWidthScale = (w * 0.95) / blockWidth; // Use 95% of width for better size
    let scale = 1.0; 
    let tx = 0, ty = 0;

    if (progress > 0.96) {
       // --- FINISH EFFECT: ZOOM OUT ---
       const t = (progress - 0.96) / 0.04; 
       const targetScale = Math.min(fitWidthScale, (h * 0.85) / Math.max(totalTextHeight, 1));
       const startScale = isExport ? fitWidthScale : 0.42; 
       scale = startScale + (targetScale - startScale) * t;
       tx = (w / 2) - (blockWidth * scale / 2);
       ty = (h / 2) - (totalTextHeight * scale / 2);
    } else {
       // --- WRITING EFFECT: FOCUS ON CURSOR ---
       scale = isExport ? fitWidthScale : 0.42; 
       const cursorY = cursorVisualLine * lineHeight + (lineHeight / 2);
       ty = (h / 2.5) - (cursorY * scale); 
       tx = (w / 2) - (blockWidth * scale / 2);
    }

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    ctx.font = `${isExport ? 'bold ' : ''}${charSize}px "BIZ UDMincho Mono", "MS Mincho", monospace, serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF';
    
    visualLines.forEach((line, i) => {
       const chars = Array.from(line);
       for (let j = 0; j < chars.length; j++) {
           ctx.fillText(chars[j], j * charSize, i * lineHeight);
       }
    });

    if (progress <= 0.96) {
       ctx.fillStyle = '#6366f1';
       ctx.fillRect(cursorVisualCol * charSize, cursorVisualLine * lineHeight, 3, charSize);
    }
    ctx.restore();
  }, []);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const container = canvas.parentElement;
    if (!container) return;
    
    const w = container.clientWidth;
    const h = (w / 16) * 9;
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    
    // Initial draw
    const ctx = canvas.getContext('2d');
    if (ctx && processedLog.length > 0) {
      const entry = processedLog.find(e => e.t >= currentTimeMs) || processedLog[processedLog.length - 1];
      renderFrame(ctx, entry, totalDuration > 0 ? currentTimeMs / totalDuration : 1);
    }
  }, [processedLog, currentTimeMs, totalDuration, renderFrame]);

  // ANIMATION LOOP
  const tick = useCallback((time: number) => {
    if (isPaused) return;
    const delta = time - lastTimeRef.current;
    lastTimeRef.current = time;

    setCurrentTimeMs(prev => {
      const next = prev + (delta * playbackSpeed);
      if (next >= totalDuration) {
        setIsPaused(true);
        setIsFinished(true);
        return totalDuration;
      }
      return next;
    });

    animationRef.current = requestAnimationFrame(tick);
  }, [isPaused, playbackSpeed, totalDuration]);

  // SYNC CANVAS WITH CURRENT TIME
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showTimeLapse) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const entry = processedLog.find(e => e.t >= currentTimeMs) || processedLog[processedLog.length - 1];
    if (entry) {
        renderFrame(ctx, entry, totalDuration > 0 ? currentTimeMs / totalDuration : 1);
    }

    if (!isPaused) {
      lastTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animationRef.current!);
    }
  }, [currentTimeMs, isPaused, processedLog, totalDuration, renderFrame, showTimeLapse, tick]);

  useEffect(() => {
    if (showTimeLapse) {
      setupCanvas();
      window.addEventListener('resize', setupCanvas);
      return () => window.removeEventListener('resize', setupCanvas);
    }
  }, [showTimeLapse, setupCanvas]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTimeMs(Number(e.target.value));
    setIsFinished(false);
  };

  const [exportResult, setExportResult] = useState<{ blob: Blob; filename: string; mimeType: string } | null>(null);

  const runExport = async (mode: 'download' | 'share' = 'download', range: 'all' | 'recent100' | 'today' = 'all') => {
    setIsExporting(true);
    setExportRangeMode({ show: false, type: null }); // Close range modal
    setIsPaused(true);
    setExportProgress(0);
    setExportResult(null);
    exportCanceledRef.current = false;

    try {
        let playbackLog = playbackLogRef.current;
        
        if (range === 'recent100' && playbackLog.length > 0) {
           const finalLen = playbackLog[playbackLog.length - 1].c.length;
           const targetLen = Math.max(0, finalLen - 100);
           const startIdx = playbackLog.findIndex(e => e.c.length >= targetLen);
           if (startIdx !== -1) {
              playbackLog = playbackLog.slice(startIdx);
           }
        } else if (range === 'today' && playbackLog.length > 0) {
           const today = new Date();
           today.setHours(0,0,0,0);
           const startOfToday = today.getTime();
           const startIdx = playbackLog.findIndex(e => e.t >= startOfToday);
           if (startIdx !== -1) {
              playbackLog = playbackLog.slice(startIdx);
           }
        }

        const safeLog = playbackLog && playbackLog.length > 0 ? playbackLog : [{ t: Date.now(), c: '', p: 0 }];
    
        const processedLog: PlaybackEntry[] = [];
        let lastRealT = safeLog[0].t;
        let virtualT = 0;
        safeLog.forEach((entry) => {
            const delta = entry.t - lastRealT;
            const jumpValue = delta > 500 ? 100 : delta;
            virtualT += jumpValue;
            processedLog.push({...entry, t: virtualT});
            lastRealT = entry.t;
        });
        
        const _totalDuration = processedLog.length > 0 ? processedLog[processedLog.length - 1].t : 0;
        const totalDuration = Math.max(1000, _totalDuration);
        const FPS = 30;
        
        const w = 720;
        const h = 1280;

        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: w,
                height: h
            },
            fastStart: 'in-memory'
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => { 
                console.error('VideoEncoder error:', e);
                // Non-fatal error log to allow progress if possible, but usually fatal
            }
        });

        // Use a more widely supported Main Profile for better thumbnail/preview visibility on mobile
        videoEncoder.configure({
            codec: 'avc1.4d401f', // Main Profile, Level 3.1
            width: w,
            height: h,
            bitrate: 1_200_000, 
            framerate: FPS,
            latencyMode: 'quality'
        });

        const offscreen = new OffscreenCanvas(w, h);
        const ctx = offscreen.getContext('2d', { 
            alpha: false, 
            desynchronized: true,
            willReadFrequently: false
        }) as OffscreenCanvasRenderingContext2D;

        let exportVT = 0;
        let videoTime = 0;
        const VIDEO_FRAME_DUR = 1000 / Math.max(1, FPS);
        const VT_STEP = VIDEO_FRAME_DUR * Math.max(0.1, playbackSpeed);
        let framesEncoded = 0;
        let loops = 0;
        
        let lastEntryIndex = -1;

        if (videoEncoder.state === 'unconfigured') {
            throw new Error('VideoEncoder configuration failed');
        }

        const yieldToMain = () => new Promise(resolve => requestAnimationFrame(resolve));
        
        const INTRO_DUR = 1500; // 1.5s intro
        const totalVideoDur = INTRO_DUR + totalDuration;

        while (exportVT <= totalVideoDur) {
            if (exportCanceledRef.current) {
                try { muxer.finalize(); } catch {}
                setIsExporting(false);
                return;
            }

            if (exportVT < INTRO_DUR) {
                // --- RENDER TITLE INTRO ---
                const introProgress = exportVT / INTRO_DUR;
                
                ctx.fillStyle = '#0a0a0b'; 
                ctx.fillRect(0, 0, w, h);
                
                // Atmosphere (Gradients)
                ctx.save();
                const g1 = ctx.createRadialGradient(w/4, 0, 0, w/4, 0, w*0.8);
                g1.addColorStop(0, 'rgba(79, 70, 229, 0.15)');
                g1.addColorStop(1, 'transparent');
                ctx.fillStyle = g1;
                ctx.fillRect(0, 0, w, h);
                ctx.restore();

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                let alpha = 1;
                if (introProgress < 0.2) alpha = introProgress / 0.2;
                if (introProgress > 0.8) alpha = (1 - introProgress) / 0.2;
                ctx.globalAlpha = Math.max(0, alpha);
                
                ctx.fillStyle = '#FFFFFF';
                // Dynamic font size: Start at 5% of width, but scale down if too long for a 85% safe-zone
                const baseFontSize = Math.floor(w * 0.05);
                const maxWidth = w * 0.85;
                const titleText = title || 'Untitled';
                
                ctx.font = `bold ${baseFontSize}px "BIZ UDMincho", serif`;
                let metrics = ctx.measureText(titleText);
                let finalFontSize = baseFontSize;
                
                if (metrics.width > maxWidth) {
                    finalFontSize = Math.floor(baseFontSize * (maxWidth / metrics.width));
                    ctx.font = `bold ${finalFontSize}px "BIZ UDMincho", serif`;
                }
                
                ctx.fillText(titleText, w / 2, h / 2 - 20);
                
                ctx.fillStyle = '#6366f1';
                // Adjust underline width relative to final font size
                const underlineWidth = Math.min(maxWidth, finalFontSize * 2.5);
                ctx.fillRect(w / 2 - underlineWidth / 2, h / 2 + 50, underlineWidth, 4);
                ctx.restore();

                try {
                    const frame = new VideoFrame(offscreen, { 
                        timestamp: Math.round(videoTime * 1000),
                        duration: Math.round(VIDEO_FRAME_DUR * 1000)
                    });
                    videoEncoder.encode(frame, { keyFrame: framesEncoded % 60 === 0 });
                    frame.close();
                    framesEncoded++;
                } catch (e) { console.warn(e); }

            } else {
                // --- RENDER TIMELAPSE ---
                const timelapseVT = exportVT - INTRO_DUR;
                const progress = timelapseVT / totalDuration;
                const entry = processedLog.find((e) => e.t >= timelapseVT) || processedLog[processedLog.length - 1];
                const entryIndex = processedLog.indexOf(entry);
                
                const isVisualChange = progress > 0.96 || entryIndex !== lastEntryIndex;

                if (isVisualChange) {
                    renderFrame(ctx as unknown as CanvasRenderingContext2D, entry, progress, true);
                    lastEntryIndex = entryIndex;
                    
                    try {
                        const frame = new VideoFrame(offscreen, { 
                            timestamp: Math.round(videoTime * 1000),
                            duration: Math.round(VIDEO_FRAME_DUR * 1000)
                        });
                        videoEncoder.encode(frame, { keyFrame: framesEncoded % 60 === 0 });
                        frame.close();
                        framesEncoded++;
                    } catch (e) {
                        console.warn('Frame encode failed:', e);
                    }
                }
            }

            exportVT += VT_STEP;
            videoTime += VIDEO_FRAME_DUR;
            loops++;

            if (loops % 30 === 0) {
                setExportProgress(Math.min(99, (exportVT / totalVideoDur) * 100));
                
                await yieldToMain();
                
                while (videoEncoder.encodeQueueSize > 60) {
                    await new Promise(r => setTimeout(r, 10));
                }
            }
        }

        if (processedLog.length > 0) {
            renderFrame(ctx as unknown as CanvasRenderingContext2D, processedLog[processedLog.length - 1], 1, true);
            try {
                const finalFrame = new VideoFrame(offscreen, { 
                    timestamp: Math.round(videoTime * 1000),
                    duration: Math.round(VIDEO_FRAME_DUR * 1000)
                });
                videoEncoder.encode(finalFrame, { keyFrame: true });
                finalFrame.close();
            } catch (e) {
                console.warn('Final frame encode failed:', e);
            }
        }

        setExportProgress(99.9);
        await yieldToMain();
        
        try {
            await videoEncoder.flush();
        } catch (e) {
            console.warn('Flush error (attempting to finalize anyway):', e);
        }

        try {
            muxer.finalize();
        } catch (e) {
            console.error('Muxer finalize error:', e);
        }

        const buffer = muxer.target.buffer;
        if (!buffer || buffer.byteLength === 0) {
            throw new Error('Generated video buffer is empty');
        }

        const blob = new Blob([buffer], { type: 'video/mp4' });
        const filename = `${title || 'timelapse'}_${new Date().getTime()}.mp4`;
        const mimeType = 'video/mp4';

        setExportProgress(100);
        setExportResult({ blob, filename, mimeType });

        const doDownload = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        if (mode === 'share' && navigator.share) {
            const file = new File([blob], filename, { type: mimeType });
            navigator.share({
                title: title,
                files: [file]
            }).catch(e => {
                console.log("Share failed or was cancelled", e);
                doDownload(); 
            }).finally(() => {
                setTimeout(() => { setIsExporting(false); setExportResult(null); }, 1500);
            });
        } else {
            doDownload();
            setTimeout(() => { setIsExporting(false); setExportResult(null); }, 1500);
        }

    } catch (error: any) {
        console.error('Export Error:', error);
        setIsExporting(false);
        alert('動画生成中にエラーが発生しました: ' + error.message);
    }
  };

  const finalizeShare = async () => {
    if (!exportResult || !navigator.share) return;
    try {
      const file = new File([exportResult.blob], exportResult.filename, { type: exportResult.mimeType });
      await navigator.share({
        files: [file],
        title: `Time×Writer - ${title}`,
        text: 'Time×Writer：タイム×ライターで執筆したタイムラプス動画です。#タイムライター #TimeWriter',
      });
      setIsExporting(false);
      setExportResult(null);
    } catch (e) {
      console.error('Share failed', e);
      finalizeDownload();
    }
  };

  const finalizeDownload = () => {
    if (!exportResult) return;
    const url = URL.createObjectURL(exportResult.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportResult.filename;
    a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
    setExportResult(null);
  };

  const handleBackupText = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'backup'}_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowSettings(false);
  };

  return (
    <div className="bg-[#0b0b0d] min-h-screen flex flex-col items-center w-full overflow-hidden text-neutral-300">
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="fixed top-28 left-1/2 -translate-x-1/2 z-[100] bg-indigo-600 text-white px-6 py-2 rounded-full font-bold text-[10px] tracking-widest shadow-2xl border border-white/10 uppercase">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- EDITOR HEADER --- */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0b0b0d] border-b border-white/5 pt-safe shadow-lg">
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
             <button onClick={() => { onSave(content, playbackLogRef.current); onBack(); }} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-neutral-500 transition-colors">
               <ArrowLeft size={22} />
             </button>
             <div className="flex flex-col">
               <span className="text-[8px] font-bold tracking-widest text-neutral-600 uppercase">Manuscript</span>
               <h1 className="text-xs font-bold truncate max-w-[150px]">{title}</h1>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end mr-1 relative">
              <AnimatePresence>
                {showSavedIndicator && (
                  <motion.span 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute -top-4 right-0 text-[8px] font-bold text-green-500 tracking-widest flex items-center gap-1"
                  >
                    <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                    SAVED
                  </motion.span>
                )}
              </AnimatePresence>
              <span className="text-[7px] font-bold text-neutral-600 tracking-widest uppercase mb-0.5">CHARS</span>
              <span className="text-[11px] font-mono font-bold text-neutral-400">{content.length.toLocaleString()}</span>
            </div>
            <button onClick={() => { onSave(content, playbackLogRef.current); setShowSavedIndicator(true); setTimeout(() => setShowSavedIndicator(false), 2000); }} className="px-5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-bold tracking-widest flex items-center gap-2 active:scale-95 transition-all">
               <Save size={14} className="text-indigo-400" /> SAVE
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-neutral-500 transition-colors">
              <Settings size={20} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="h-14 px-4 flex items-center bg-[#111114] overflow-x-auto no-scrollbar gap-1 border-t border-white/5">
           <button onClick={undo} disabled={historyIndex <= 0} className="w-10 h-10 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90"><Undo2 size={18} /></button>
           <button onClick={redo} disabled={historyIndex >= history.length - 1} className="w-10 h-10 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-20 transition-all active:scale-90"><Redo2 size={18} /></button>
           <div className="h-4 w-px bg-white/10 mx-2 shrink-0" />
           <button onClick={() => insertText('|')} className="w-10 h-10 flex items-center justify-center text-[16px] font-serif font-bold text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">|</button>
           
           <button onClick={insertBrackets} className="px-3 h-10 flex items-center justify-center text-[18px] font-serif font-bold text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-all group shrink-0">
             <span className="group-hover:scale-110 transition-transform">「 」</span>
           </button>

           <button onClick={() => insertText('…')} className="w-10 h-10 flex items-center justify-center text-[18px] font-serif font-bold text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg">…</button>
           <button onClick={() => insertText('――')} className="w-10 h-10 flex items-center justify-center text-[18px] font-serif font-bold text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-90 shrink-0">――</button>
           <button onClick={() => insertText('≪ルビ≫')} className="w-10 h-10 flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-all active:scale-90 shrink-0"><BookOpenText size={18} /></button>
           
           <div className="flex-1" /> {/* Maximal separation between symbol group and system buttons */}
           
           <button onClick={() => { navigator.clipboard.writeText(content); showToast('COPIED'); }} className="px-4 h-10 flex items-center gap-2 text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors shrink-0 group">
             <Copy size={16} className="group-hover:scale-110 transition-transform" />
             <span className="text-[10px] font-bold tracking-widest uppercase">COPY</span>
           </button>
           
           <div className="flex-1 min-w-[40px]" /> {/* Increased gap */}
           
           <div className="flex items-center gap-4 pr-1 shrink-0">
             <button onClick={() => { setShowTimeLapse(true); setIsPaused(true); setCurrentTimeMs(0); }} className="flex items-center gap-2 pl-4 pr-5 h-10 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-full text-[9px] font-bold tracking-[0.2em] transition-all active:scale-95">
               <Play size={14} fill="currentColor" /> TIMELAPSE
             </button>
           </div>
        </div>
      </header>

      {/* --- MAIN EDITOR --- */}
      <main className="w-full h-screen pt-[112px] flex flex-col items-center">
        <textarea
          ref={textareaRef}
          className="editor-26 !w-[26em] max-w-full flex-1 bg-transparent text-[#f8fafc] leading-[1.8] text-[24px] font-serif outline-none resize-none overflow-y-auto block placeholder:opacity-5 caret-indigo-500 transition-colors"
          value={content}
          onChange={handleInput}
          onSelect={(e) => recordState(content, (e.target as HTMLTextAreaElement).selectionEnd)}
          placeholder="　……筆を。……動かせ。"
          spellCheck={false}
          autoFocus
        />
      </main>

      {/* --- TIMELAPSE THEATER --- */}
      <AnimatePresence>
        {showTimeLapse && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] bg-[#050506] flex flex-col overflow-hidden">
             
             {/* Timelapse Controls Bar */}
             <div className="h-16 px-6 flex items-center justify-between shrink-0 bg-black/60 border-b border-white/5 z-20">
               <button onClick={() => { setShowTimeLapse(false); setIsPaused(true); }} className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-neutral-500 transition-all active:scale-75">
                 <X size={32} />
               </button>
               
               <div className="flex items-center gap-1 bg-white/5 p-1.5 rounded-full border border-white/10 shadow-inner">
                 {[0.5, 1, 2, 4, 8].map(s => (
                   <button key={s} onClick={() => setPlaybackSpeed(s)} className={`px-4 py-2 rounded-full text-[10px] font-bold transition-all ${playbackSpeed === s ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-500 hover:text-white'}`}>
                     {s}x
                   </button>
                 ))}
               </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => setExportRangeMode({ show: true, type: 'share' })} disabled={isExporting} title="SNSへ共有" className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-indigo-400 disabled:opacity-20 transition-all">
                    <Share2 size={30} />
                  </button>
                  <button onClick={() => setExportRangeMode({ show: true, type: 'download' })} disabled={isExporting} title="ダウンロード" className="w-12 h-12 rounded-full hover:bg-white/5 flex items-center justify-center text-indigo-400 disabled:opacity-20 transition-all">
                    <Download size={32} />
                  </button>
                </div>
             </div>

             {/* Canvas Container */}
             <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-black overflow-hidden">
               <div className="w-full max-w-[min(100%,(100vh-180px)*16/9)] aspect-video bg-[#0a0a0c] rounded-2xl overflow-hidden shadow-[0_0_120px_-30px_rgba(99,102,241,0.25)] border border-white/5 relative ring-1 ring-white/10 mx-auto">
                  <canvas ref={canvasRef} className="w-full h-full object-contain" />
                  {isExporting && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center gap-6 z-30">
                       {!exportResult ? (
                         <>
                           <div className="w-14 h-14 border-[5px] border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin shadow-2xl" />
                           <div className="flex flex-col items-center gap-1.5 text-center">
                             <span className="text-[12px] font-bold tracking-[0.2em] text-white uppercase">
                               動画を生成中... {Math.floor(exportProgress)}%
                             </span>
                             <span className="text-[9px] text-neutral-500 tracking-widest uppercase">
                               {exportProgress < 100 ? 'Recording frames...' : 'Finalizing...'}
                             </span>
                           </div>
                           <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
                             <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${exportProgress}%` }} />
                           </div>
                           <button onClick={() => { exportCanceledRef.current = true; setIsExporting(false); setExportResult(null); }} className="mt-4 text-[10px] text-neutral-600 hover:text-white transition-colors uppercase tracking-widest font-bold">CANCEL</button>
                         </>
                       ) : (
                         <div className="flex flex-col items-center gap-8 animate-fade-in">
                            <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                               <Clock className="animate-pulse" size={32} />
                            </div>
                            <div className="flex flex-col items-center gap-1 text-center">
                               <span className="text-[14px] font-bold tracking-[0.3em] text-white uppercase">Ready to Share</span>
                               <span className="text-[10px] text-neutral-500 tracking-widest uppercase italic">The recording is finalized.</span>
                            </div>
                            <div className="flex gap-4">
                               <button onClick={finalizeShare} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-[12px] font-bold tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-3">
                                 <Share2 size={18} /> SNS SHARE
                               </button>
                               <button onClick={finalizeDownload} className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white rounded-full text-[12px] font-bold tracking-widest transition-all active:scale-95 flex items-center gap-3">
                                 <Download size={18} /> DOWNLOAD
                               </button>
                            </div>
                            <button onClick={() => { exportCanceledRef.current = true; setIsExporting(false); setExportResult(null); }} className="mt-4 text-[10px] text-neutral-600 hover:text-white transition-colors uppercase tracking-widest font-bold">CANCEL</button>
                         </div>
                       )}
                    </div>
                  )}
               </div>
             </div>

             {/* Interactive Playback Bar */}
             <div className="h-48 px-10 pb-10 flex flex-col items-center justify-center shrink-0 max-w-5xl mx-auto w-full gap-8">
                <div className="w-full flex items-center gap-8">
                   <button onClick={() => isPaused ? setIsPaused(false) : setIsPaused(true)} className="w-18 h-18 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white transition-all active:scale-90 shadow-[0_15px_40px_rgba(99,102,241,0.4)]">
                     {isPaused ? (isFinished ? <RotateCcw size={36} /> : <Play size={36} fill="currentColor" />) : <Pause size={36} fill="currentColor" />}
                   </button>
                   
                   <div className="flex-1 flex flex-col gap-4">
                     <div className="flex justify-between items-end px-1">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-bold text-neutral-600 tracking-[0.2em] uppercase mb-1">Elapsed</span>
                           <span className="text-[13px] font-mono text-indigo-400 font-bold">{new Date(currentTimeMs).toISOString().substr(14, 5)}</span>
                        </div>
                        <div className="flex flex-col items-end">
                           <span className="text-[9px] font-bold text-neutral-600 tracking-[0.2em] uppercase mb-1">Total Duration</span>
                           <span className="text-[13px] font-mono text-neutral-500 font-bold">{new Date(totalDuration).toISOString().substr(14, 5)}</span>
                        </div>
                     </div>
                     <input 
                       type="range" 
                       min="0" 
                       max={totalDuration} 
                       value={currentTimeMs} 
                       onChange={handleSeek}
                       className="w-full h-2 bg-white/5 rounded-full appearance-none accent-indigo-500 cursor-pointer transition-all shadow-inner relative z-10"
                       style={{ 
                         background: `linear-gradient(to right, #6366f1 ${totalDuration > 0 ? (currentTimeMs / totalDuration) * 100 : 0}%, rgba(255, 255, 255, 0.05) ${totalDuration > 0 ? (currentTimeMs / totalDuration) * 100 : 0}%)` 
                       }}
                     />
                   </div>
                </div>
                <div className="flex items-center gap-4 bg-white/5 px-8 py-3 rounded-full border border-white/5 opacity-40">
                   <Monitor size={14} className="text-neutral-500" />
                   <span className="text-[10px] font-bold tracking-[0.4em] uppercase text-neutral-400">16:9 Cinema Engine Active</span>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .editor-26 { font-family: "BIZ UDMincho Mono", "MS Mincho", serif; word-break: break-all; white-space: pre-wrap; box-sizing: border-box; }
        textarea::placeholder { opacity: 0.1; font-style: italic; }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          background: #6366f1;
          border-radius: 50%;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 0 0 20px rgba(99, 102, 241, 0.6);
          transition: transform 0.2s;
        }
        input[type='range']::-webkit-slider-thumb:hover { transform: scale(1.2); }
      `}</style>
      {/* --- SETTINGS MENU --- */}
      <AnimatePresence>
        {showSettings && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setShowSettings(false)} />
            <motion.div 
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="fixed right-6 top-16 w-52 bg-[#111111] border border-[#333333] rounded-2xl shadow-2xl z-[70] overflow-hidden flex flex-col py-1"
            >
              <button 
                onClick={handleBackupText}
                className="flex text-left items-center gap-3 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-white/10 transition-colors"
              >
                <Download size={16} className="text-white" />
                テキストバックアップ
              </button>
              <div className="px-4 py-2 text-[9px] text-neutral-500 font-bold uppercase tracking-widest border-t border-white/5">
                Version 1.6
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- EXPORT RANGE MODAL --- */}
      <AnimatePresence>
        {exportRangeMode.show && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-xs bg-[#111111] border border-white/10 rounded-[32px] p-8 shadow-2xl"
            >
              <h3 className="text-sm font-black text-white text-center mb-6 tracking-[0.2em] uppercase">書き出し範囲を選択</h3>
              <div className="flex flex-col gap-3">
                {[
                  { label: '全文', value: 'all' as const },
                  { label: '直近の100文字', value: 'recent100' as const },
                  { label: '今日書いた分', value: 'today' as const },
                ].map((range) => (
                  <button
                    key={range.value}
                    onClick={() => runExport(exportRangeMode.type || 'download', range.value)}
                    className="w-full py-4 text-[11px] font-bold text-neutral-300 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all"
                  >
                    {range.label}
                  </button>
                ))}
                <button
                  onClick={() => setExportRangeMode({ show: false, type: null })}
                  className="w-full py-4 text-[10px] font-bold text-neutral-500 uppercase tracking-widest mt-2"
                >
                  キャンセル
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
