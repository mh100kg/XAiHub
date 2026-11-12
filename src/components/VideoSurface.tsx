import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from "react";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import { captureSubtitleFrame } from "../subtitleFrame";
import { isLocalMedia, platform, playlist } from "../api";
import { mediaErrorMessage } from "../mediaErrors";
import { mediaHost, mediaResource, observeHls, usePlayerDiagnostics } from "../playbackDiagnostics";
import { usePlaybackActivity } from "../usePlaybackActivity";

export type VideoHandle = {
  el: () => HTMLVideoElement | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number, source?: string) => void;
  trace: (event: string, data?: Record<string, unknown>) => void;
  rate: (r: number) => void;
  mute: (m: boolean) => void;
  volume: (v: number) => void;
};

type Props = {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  active?: boolean;
  vietnamese?: boolean;
  diagnosticContext?: Record<string, unknown>;
  muted?: boolean;
  loop?: boolean;
  fit?: "contain" | "cover";
  /** 换源后重新套用，避免切集时音量/倍速被浏览器重置 */
  volume?: number;
  rate?: number;
  onTime?: (t: number) => void;
  onDuration?: (d: number) => void;
  onSize?: (w: number, h: number) => void;
  onPlaying?: () => void;
  onPause?: () => void;
  onWaiting?: () => void;
  onEnded?: () => void;
  onError?: (msg: string) => void;
  onClick?: () => void;
  className?: string;
};

/** 只负责「播」：hls.js + video 元素，控制条由外层渲染。 */
const VideoSurface = forwardRef<VideoHandle, Props>(function VideoSurface(
  { src, poster, autoPlay = true, active = true, vietnamese = false, diagnosticContext = {}, muted = false, loop = false, fit = "contain",
    scale = 1, panX = 0, panY = 0, isGesturing = false,
    volume = 1, rate = 1,
    onTime, onDuration, onSize, onPlaying, onPause, onWaiting, onEnded, onError, onClick, className = "" },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const recoverCountRef = useRef(0);
  const recoverTimerRef = useRef<number | null>(null);
  const nearEndFiredRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const translations = useRef(new Map<string, string>());

  useEffect(() => {
    setSubtitle("");
    setSubtitleError("");
    if (platform !== "ios" || !active || !vietnamese) return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    let disposed = false;
    let busy = false;
    let blocked = false;
    let revision = 0;
    let previous = "";
    const reset = () => {
      revision++;
      previous = "";
      setSubtitle("");
    };
    const sample = async () => {
      if (busy || blocked || video.paused) return;
      busy = true;
      const token = revision;
      const current = () => !disposed && token === revision;
      try {
        const frame = captureSubtitleFrame(video, canvas);
        if (!frame) return;
        const text = (await invoke<string>("read_subtitle", { jpeg: frame.jpeg.split(",")[1] })).trim();
        if (!current() || text === previous) return;
        previous = text;
        setSubtitle("");
        if (!text) return;
        let translated = translations.current.get(text);
        if (!translated) {
          translated = await invoke<string>("translate_subtitle", { text });
          if (translations.current.size >= 200) translations.current.clear();
          translations.current.set(text, translated);
        }
        if (current()) setSubtitle(translated);
      } catch (error) {
        if (current()) {
          blocked = true;
          setSubtitleError(error instanceof Error ? error.message : String(error));
        }
      } finally { busy = false; }
    };
    video.addEventListener("seeking", reset);
    const timer = window.setInterval(() => { void sample(); }, 500);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      video.removeEventListener("seeking", reset);
    };
  }, [src, active, vietnamese]);
  const { trace, requestSeek } = usePlayerDiagnostics(videoRef, hlsRef, { ...diagnosticContext, active, resource: mediaResource(src) });
  const activity = usePlaybackActivity(videoRef, hlsRef, { active, autoPlay, src, trace });

  const reportSize = (v: HTMLVideoElement | null) => {
    if (!v) return;
    const w = v.videoWidth || 0;
    const h = v.videoHeight || 0;
    if (w > 0 && h > 0) onSize?.(w, h);
  };

  useImperativeHandle(ref, () => ({
    el: () => videoRef.current,
    play: () => activity.play("handle"),
    pause: () => activity.pause(),
    toggle: () => {
      const v = videoRef.current;
      if (!v) return;
      trace("toggle.request");
      if (v.paused) activity.play("toggle"); else activity.pause("toggle");
    },
    seek: (t: number, source = "handle") => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(t)) return;
      // iOS 上直接赋到 duration 会卡在 ended 态，夹到结尾前 0.15s
      const dur = v.duration && Number.isFinite(v.duration) ? v.duration : 0;
      const target = dur > 0 ? Math.max(0, Math.min(dur - 0.15, t)) : Math.max(0, t);
      requestSeek(target, source);
      if (hlsRef.current) { try { hlsRef.current.startLoad(target); } catch { /* ignore */ } }
      const resume = !v.paused;
      try { v.currentTime = target; trace("seek.assigned", { target, source }); }
      catch (e) { trace("seek.rejected", { error_name: (e as Error).name }); throw e; }
      if (resume) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    },
    trace,
    rate: (r: number) => { const v = videoRef.current; if (v) v.playbackRate = r; },
    mute: (m: boolean) => { const v = videoRef.current; if (v) v.muted = m; },
    volume: (vol: number) => { const v = videoRef.current; if (v) v.volume = vol; },
  }), []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setReady(false);
    nearEndFiredRef.current = false;
    recoverCountRef.current = 0;
    const onVideoResize = () => reportSize(video);
    video.addEventListener("resize", onVideoResize);
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const proxied = isLocalMedia(src);
    const url = proxied ? src : playlist(src);
    const useHls = !url.includes("/seg?u=");
    trace("source.load", { engine: useHls && Hls.isSupported() ? "hls.js" : "native", auto_play: autoPlay, resource: mediaResource(src), host: mediaHost(src) });

    /* 换源时先把音量/倍速套回去：hls 重新 attach 后浏览器会把它们重置成默认值 */
    const applySettings = () => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = volume;
      v.muted = muted;
      v.playbackRate = rate;
    };
    applySettings();

    if (useHls && Hls.isSupported()) {
      const hls = new Hls({
        // 禁用从插播/内容引导 JSON 派生直连 URL 的可选功能。
        interstitialsController: undefined,
        contentSteeringController: undefined,
        enableInterstitialPlayback: false,
        // WKWebView 里 hls.js 的 worker 不稳，iOS 关掉
        enableWorker: platform !== "ios",
        // Prefer standard MSE on macOS; hls.js handles MMS-only fallback and seek recovery.
        preferManagedMediaSource: false,
        autoStartLoad: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        maxBufferHole: 0.5,
        nudgeOffset: 0.25,
        nudgeMaxRetry: 6,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 400,
      });
      hlsRef.current = hls;
      observeHls(hls, trace);
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (activity.isActive()) hls.startLoad();
        if (autoPlay) activity.play("manifest_autoplay", true);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => { recoverCountRef.current = 0; });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) {
          if (
            data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR
          ) {
            try { hls.startLoad(video.currentTime || -1); } catch { /* ignore */ }
          }
          return;
        }
        if (!activity.isActive()) return;
        const retry = () => {
          recoverCountRef.current += 1;
          const delay = 250 * recoverCountRef.current;
          if (recoverTimerRef.current) window.clearTimeout(recoverTimerRef.current);
          recoverTimerRef.current = window.setTimeout(() => {
            try {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad(video.currentTime || -1);
              else hls.recoverMediaError();
            } catch { /* ignore */ }
          }, delay);
        };
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoverCountRef.current < 4) { retry(); return; }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoverCountRef.current < 4) { retry(); return; }
        onError?.(`${data.type}/${data.details}`);
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else { hls.destroy(); hlsRef.current = null; }
      });
    } else {
      video.src = url;
      if (autoPlay) activity.play("native_autoplay", true);
    }

    return () => {
      video.removeEventListener("resize", onVideoResize);
      if (recoverTimerRef.current) { window.clearTimeout(recoverTimerRef.current); recoverTimerRef.current = null; }
      trace("source.cleanup");
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // iOS 内联播放：部分 WKWebView 只认 HTML 属性
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.setAttribute("webkit-playsinline", "true");
  }, []);

  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = rate; }, [rate]);

  const reapply = (v: HTMLVideoElement) => {
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;
  };

  const handleVideoError = () => {
    if (hlsRef.current) return;
    onError?.(mediaErrorMessage(videoRef.current?.error ?? null));
  };

  return (
    <div className={`relative w-full h-full bg-black overflow-hidden ${className}`}>
      {!ready && poster && (
        <img
          src={poster}
          alt=""
          className={`absolute inset-0 w-full h-full pointer-events-none ${fit === "cover" ? "object-cover" : "object-contain"}`}
        />
      )}
      <video
        ref={videoRef}
        playsInline
        webkit-playsinline="true"
        preload="auto"
        muted={muted}
        loop={loop}
        onClick={onClick}
        className={`w-full h-full bg-black ${fit === "cover" ? "object-cover" : "object-contain"}`}
        style={{
          opacity: ready ? 1 : 0,
          transform: hasTransform ? `translate3d(${panX}px, ${panY}px, 0) scale(${scale})` : "translateZ(0)",
          transformOrigin: "center center",
          transition: isGesturing ? "opacity .25s" : "opacity .25s, transform .2s cubic-bezier(.2,0,0,1)",
        }}
        onLoadedData={(e) => {
          const v = e.target as HTMLVideoElement;
          setReady(true);
          reapply(v);
          reportSizeAndDuration(v);
        }}
        onCanPlay={(e) => {
          const v = e.target as HTMLVideoElement;
          setReady(true);
          reportSizeAndDuration(v);
        }}
        onTimeUpdate={(e) => {
          const v = e.target as HTMLVideoElement;
          onTime?.(v.currentTime);
          if (lastSizeRef.current.w === 0 && v.videoWidth > 0) {
            reportSizeAndDuration(v);
          }
          // 借鉴 stclock1988/hghub-ios：部分 HLS 流容器标称时长比最后一个分片略长 0.5~1.2s，
          // 接近片尾时提前复位准备，若卡在片尾则自动触发连播
          if (!loop && !nearEndFiredRef.current && activity.isActive() && v.duration > 5 && v.currentTime >= v.duration - 0.35) {
            nearEndFiredRef.current = true;
            onEnded?.();
          }
        }}
        onLoadedMetadata={(e) => {
          const v = e.target as HTMLVideoElement;
          reapply(v);
          reportSizeAndDuration(v);
        }}
        onPlay={() => { if (activity.isActive()) onPlaying?.(); }}
        onPause={() => onPause?.()}
        onWaiting={(e) => {
          const v = e.target as HTMLVideoElement;
          if (!loop && !nearEndFiredRef.current && activity.isActive() && v.duration > 5 && v.currentTime >= v.duration - 1.5) {
            nearEndFiredRef.current = true;
            onEnded?.();
            return;
          }
          onWaiting?.();
        }}
        onPlaying={(e) => {
          setReady(true);
          recoverCountRef.current = 0;
          reportSizeAndDuration(e.target as HTMLVideoElement);
          if (activity.isActive()) onPlaying?.();
        }}
        onSeeking={() => onWaiting?.()}
        onSeeked={() => {
          const v = videoRef.current;
          if (v && !v.paused && activity.isActive()) onPlaying?.();
        }}
        onEnded={() => {
          if (!nearEndFiredRef.current && activity.isActive()) {
            nearEndFiredRef.current = true;
            onEnded?.();
          }
        }}
      />
      {platform === "ios" && active && vietnamese && (subtitle || subtitleError) && (
        <div className="pointer-events-none absolute inset-x-8 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 text-center text-sm text-white">
          <span className="bg-black/85 px-2 py-1">{subtitleError || subtitle}</span>
        </div>
      )}
    </div>
  );
});

export default VideoSurface;
