import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export type PlaybackEntry = { t: number; c: string; p: number };

export type ExportRequest = {
  processedLog: PlaybackEntry[];
  totalDuration: number;
  playbackSpeed: number;
  title: string;
};

// Extracted from Editor.tsx
const renderFrame = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, entry: PlaybackEntry, progress: number, w: number, h: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    
    // --- BACKGROUND WITH ATMOSPHERE ---
    ctx.fillStyle = '#0a0a0b'; 
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    const grad1 = ctx.createRadialGradient(w * 0.25, 0, 0, w * 0.25, 0, w * 0.8);
    grad1.addColorStop(0, 'rgba(79, 70, 229, 0.12)'); 
    grad1.addColorStop(1, 'transparent');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, h);

    const grad2 = ctx.createRadialGradient(w * 0.75, h, 0, w * 0.75, h, w * 0.8);
    grad2.addColorStop(0, 'rgba(245, 158, 11, 0.04)'); 
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

    logicalLines.forEach((l) => {
        const segments: string[] = [];
        const chars = Array.from(l);
        if (chars.length === 0) {
            segments.push("");
        } else {
            for (let i = 0; i < chars.length; i += 26) {
                segments.push(chars.slice(i, i + 26).join(''));
            }
        }

        segments.forEach((seg) => {
            const startOfSeg = charCount;
            const endOfSeg = charCount + seg.length;
            
            // Check if cursor is in this visual segment
            if (entry.p >= startOfSeg && entry.p <= endOfSeg) {
                cursorVisualLine = visualLines.length;
                
                // Cursor visual col needs to map UTF-16 index back to Unicode chars
                // to align properly with the character grid!
                const textBeforeCursor = seg.substring(0, entry.p - startOfSeg);
                cursorVisualCol = Array.from(textBeforeCursor).length;
            }
            
            visualLines.push(seg);
            charCount += seg.length;
        });
        charCount += 1; // For the \n we split on
    });

    const charSize = 32; 
    const lineHeight = charSize * 1.6;
    const blockWidth = 26 * charSize;
    const totalTextHeight = visualLines.length * lineHeight;
    
    let scale = 1.0; 
    let tx = 0, ty = 0;

    if (progress > 0.96) {
       // --- FINISH EFFECT: ZOOM OUT ---
       const t = (progress - 0.96) / 0.04; 
       const targetScale = Math.min((w * 0.85) / blockWidth, (h * 0.85) / Math.max(totalTextHeight, 1));
       const startScale = 1.0; 
       scale = startScale + (targetScale - startScale) * t;
       tx = (w / 2) - (blockWidth * scale / 2);
       ty = (h / 2) - (totalTextHeight * scale / 2);
    } else {
       // --- WRITING EFFECT: FOCUS ON CURSOR ---
       scale = 1.0; 
       const cursorY = cursorVisualLine * lineHeight + (lineHeight / 2);
       ty = (h / 2.5) - (cursorY * scale); // Position cursor slightly above center
       tx = (w / 2) - (blockWidth * scale / 2);
    }

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    ctx.font = `bold ${charSize}px "BIZ UDMincho Mono", "MS Mincho", monospace, serif`;
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
};

self.onmessage = async (e: MessageEvent<any>) => {
  try {
    const { processedLogData, totalDuration, playbackSpeed, title } = e.data;
    const processedLog: PlaybackEntry[] = JSON.parse(processedLogData);
    const FPS = 30;
    
    // HD resolution
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
      error: (e) => { console.error(e); self.postMessage({ type: 'error', error: e.message }); }
    });

    videoEncoder.configure({
      codec: 'avc1.420028',
      width: w,
      height: h,
      bitrate: 2_000_000, 
      framerate: FPS
    });

    const offscreen = new OffscreenCanvas(w, h);
    const ctx = offscreen.getContext('2d', { alpha: false, desynchronized: true }) as OffscreenCanvasRenderingContext2D;

    let exportVT = 0;
    let videoTime = 0;
    const VIDEO_FRAME_DUR = 1000 / FPS;
    const VT_STEP = VIDEO_FRAME_DUR * Math.max(0.1, playbackSpeed);
    let framesEncoded = 0;
    let loops = 0;
    
    let lastEntryIndex = -1;

    while (exportVT <= totalDuration) {
      const progress = totalDuration > 0 ? exportVT / totalDuration : 1;
      const entry = processedLog.find(e => e.t >= exportVT) || processedLog[processedLog.length - 1];
      const entryIndex = processedLog.indexOf(entry);
      
      const isVisualChange = progress > 0.96 || entryIndex !== lastEntryIndex;

      if (isVisualChange) {
          renderFrame(ctx, entry, progress, w, h);
          lastEntryIndex = entryIndex;
          
          const frame = new VideoFrame(offscreen, { timestamp: videoTime * 1000 });
          // Force keyframe every 60 encoded frames
          videoEncoder.encode(frame, { keyFrame: framesEncoded % 60 === 0 });
          frame.close();
          framesEncoded++;
      }

      exportVT += VT_STEP;
      videoTime += VIDEO_FRAME_DUR;
      loops++;

      if (loops % 30 === 0) {
         self.postMessage({ type: 'progress', progress: (exportVT / totalDuration) * 100 });
         await new Promise(r => setTimeout(r, 0));
      }
    }

    // Force one last frame at 100% just to be sure
    renderFrame(ctx, processedLog[processedLog.length - 1], 1, w, h);
    const finalFrame = new VideoFrame(offscreen, { timestamp: videoTime * 1000 });
    videoEncoder.encode(finalFrame, { keyFrame: true });
    finalFrame.close();

    await videoEncoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });
    
    const filename = `${title || 'timelapse'}_${new Date().getTime()}.mp4`;
    
    self.postMessage({ type: 'done', blob, filename, mimeType: 'video/mp4' });
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};
