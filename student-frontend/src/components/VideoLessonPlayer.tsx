import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Hls from 'hls.js';
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { resolveApiMediaUrl, type VideoLesson } from '../lib/api';

interface VideoLessonPlayerProps {
  lesson: VideoLesson | null;
  autoplayLessonId?: string | null;
  autoplayRequestKey?: number;
  watermarkText?: string;
  isRefreshingSource?: boolean;
  onPlaybackIssue?: (reason: string) => void | Promise<void>;
}

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenCapableDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element;
}

function getPlayableSources(lesson: VideoLesson | null): string[] {
  if (!lesson) return [];

  const candidates = [
    resolveApiMediaUrl(lesson.mp4Url),
    resolveApiMediaUrl(lesson.playbackUrl),
    resolveApiMediaUrl(lesson.hlsUrl),
    resolveApiMediaUrl(lesson.previewUrl),
  ].filter((item): item is string => Boolean(item));

  return candidates.filter((source, index) => candidates.indexOf(source) === index);
}

function formatTime(totalSeconds: number) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function getBufferedEnd(video: HTMLVideoElement) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0 || video.buffered.length === 0) {
    return 0;
  }

  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);
    if (current >= start && current <= end) {
      return end;
    }
  }

  return video.buffered.end(video.buffered.length - 1);
}

export default function VideoLessonPlayer({
  lesson,
  autoplayLessonId = null,
  autoplayRequestKey = 0,
  watermarkText,
  isRefreshingSource = false,
  onPlaybackIssue,
}: VideoLessonPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const recoveryRequestedRef = useRef(false);
  const pendingAutoplayRequestRef = useRef<number | null>(null);
  const completedAutoplayRequestRef = useRef(0);

  const playableSources = useMemo(() => getPlayableSources(lesson), [lesson]);
  const sourcesSignature = useMemo(() => playableSources.join('|'), [playableSources]);
  const [sourceAttemptIndex, setSourceAttemptIndex] = useState(0);
  const playableSource = playableSources[sourceAttemptIndex] || null;
  const resolvedHlsSource = resolveApiMediaUrl(lesson?.hlsUrl);
  const resolvedPosterUrl = resolveApiMediaUrl(lesson?.posterUrl);
  const isHls = Boolean(playableSource && resolvedHlsSource && playableSource === resolvedHlsSource);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTargetTime, setSeekTargetTime] = useState<number | null>(null);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const displayedTime = seekTargetTime ?? currentTime;

  const progressPercent = useMemo(
    () => (duration > 0 ? Math.min(100, Math.max(0, (displayedTime / duration) * 100)) : 0),
    [displayedTime, duration],
  );

  const volumePercent = useMemo(
    () => Math.min(100, Math.max(0, (isMuted ? 0 : volume) * 100)),
    [isMuted, volume],
  );

  const clearHideControlsTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const clearPendingAutoplay = useCallback(() => {
    const requestKey = pendingAutoplayRequestRef.current;
    if (!requestKey) return;

    completedAutoplayRequestRef.current = requestKey;
    pendingAutoplayRequestRef.current = null;
  }, []);

  const tryAutoplay = useCallback(async (video: HTMLVideoElement) => {
    const requestKey = pendingAutoplayRequestRef.current;
    if (!requestKey) return;

    if (!video.paused && !video.ended) {
      clearPendingAutoplay();
      return;
    }

    try {
      await video.play();
    } catch (error) {
      if (pendingAutoplayRequestRef.current !== requestKey) {
        return;
      }

      const errorName = error instanceof DOMException ? error.name : '';
      if (errorName === 'AbortError') {
        return;
      }

      clearPendingAutoplay();
      setIsBuffering(false);
    }
  }, [clearPendingAutoplay]);

  const requestPlaybackRecovery = useCallback((reason: string) => {
    if (sourceAttemptIndex + 1 < playableSources.length) {
      setSourceAttemptIndex((prev) => Math.min(prev + 1, playableSources.length - 1));
      setShowControls(true);
      setIsBuffering(true);
      return;
    }

    if (recoveryRequestedRef.current) return;
    recoveryRequestedRef.current = true;
    clearPendingAutoplay();
    setShowControls(true);
    setIsBuffering(false);
    void onPlaybackIssue?.(reason);
  }, [clearPendingAutoplay, onPlaybackIssue, playableSources.length, sourceAttemptIndex]);

  useEffect(() => {
    setSourceAttemptIndex(0);
  }, [lesson?.id, sourcesSignature]);

  useEffect(() => {
    if (!playableSource || typeof document === 'undefined') return;

    let origin = '';
    try {
      origin = new URL(playableSource, window.location.href).origin;
    } catch {
      return;
    }

    const rels = ['preconnect', 'dns-prefetch'];
    for (const rel of rels) {
      const existing = document.head.querySelector(`link[rel="${rel}"][href="${origin}"]`);
      if (existing) continue;

      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') {
        link.crossOrigin = 'anonymous';
      }
      document.head.appendChild(link);
    }
  }, [playableSource]);

  const scheduleHideControls = useCallback(() => {
    clearHideControlsTimer();
    if (!isPlaying) return;

    controlsHideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2400);
  }, [clearHideControlsTimer, isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  const syncBufferedPercent = useCallback((video: HTMLVideoElement) => {
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const bufferedEnd = getBufferedEnd(video);
    setBufferedPercent(nextDuration > 0 ? Math.min(100, Math.max(0, (bufferedEnd / nextDuration) * 100)) : 0);
  }, []);

  const syncPausedUi = useCallback(() => {
    clearPendingAutoplay();
    setSeekTargetTime(null);
    setIsPlaying(false);
    setIsBuffering(false);
    setShowControls(true);
    clearHideControlsTimer();
  }, [clearHideControlsTimer, clearPendingAutoplay]);

  const pausePlayback = useCallback((video: HTMLVideoElement) => {
    syncPausedUi();
    video.pause();
  }, [syncPausedUi]);

  const startPlayback = useCallback(async (video: HTMLVideoElement) => {
    if (video.ended) {
      video.currentTime = 0;
      setCurrentTime(0);
    }

    setShowControls(true);
    setIsBuffering(true);

    try {
      await video.play();
    } catch {
      setIsBuffering(false);
      setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      await startPlayback(video);
      return;
    }

    pausePlayback(video);
  }, [pausePlayback, startPlayback]);

  const seekToTime = useCallback((nextTime: number) => {
    const video = videoRef.current;
    const safeTime = Math.max(0, Math.min(Number.isFinite(duration) ? duration : 0, nextTime));

    setSeekTargetTime(safeTime);
    setCurrentTime(safeTime);
    setIsBuffering(true);

    if (!video) return;

    if ('fastSeek' in video && typeof video.fastSeek === 'function') {
      video.fastSeek(safeTime);
      return;
    }

    video.currentTime = safeTime;
  }, [duration]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (!next && volume <= 0) {
        setVolume(0.6);
      }
      return next;
    });
  }, [volume]);

  const cyclePlaybackRate = useCallback(() => {
    const rates = [1, 1.25, 1.5, 1.75, 2];
    const currentIndex = rates.findIndex((rate) => rate === playbackRate);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % rates.length : 0;
    setPlaybackRate(rates[nextIndex]);
  }, [playbackRate]);

  const toggleFullscreen = useCallback(async () => {
    const root = containerRef.current as FullscreenCapableElement | null;
    const doc = document as FullscreenCapableDocument;

    if (!root) return;

    try {
      const activeFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement;
      if (activeFullscreen) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
        return;
      }

      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen may fail on unsupported devices.
    }
  }, []);

  useEffect(() => {
    const doc = document as FullscreenCapableDocument;

    const syncFullscreenState = () => {
      const root = containerRef.current;
      const activeFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement;
      setIsFullscreen(Boolean(root && activeFullscreen === root));
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);
    };
  }, []);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!playableSource) {
      clearPendingAutoplay();
      return;
    }

    recoveryRequestedRef.current = false;
    video.pause();
    video.removeAttribute('src');
    video.load();
    setCurrentTime(0);
    setSeekTargetTime(null);
    setBufferedPercent(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(true);
    setShowControls(true);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: 0,
        capLevelToPlayerSize: true,
        testBandwidth: true,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        backBufferLength: 30,
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          requestPlaybackRecovery(`hls-${data.type || 'fatal'}`);
        }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void tryAutoplay(video);
      });

      hls.loadSource(playableSource);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    }

    video.src = playableSource;
    video.load();
    void tryAutoplay(video);
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [clearPendingAutoplay, isHls, playableSource, requestPlaybackRecovery, tryAutoplay]);

  useLayoutEffect(() => {
    if (!lesson?.id || autoplayLessonId !== lesson.id) {
      return;
    }

    if (!autoplayRequestKey || autoplayRequestKey === completedAutoplayRequestRef.current) {
      return;
    }

    pendingAutoplayRequestRef.current = autoplayRequestKey;

    const video = videoRef.current;
    if (!video || !playableSource) {
      clearPendingAutoplay();
      return;
    }

    void tryAutoplay(video);
  }, [autoplayLessonId, autoplayRequestKey, clearPendingAutoplay, lesson?.id, playableSource, tryAutoplay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      syncBufferedPercent(video);
      setIsBuffering(false);
    };
    const handleDurationChange = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      syncBufferedPercent(video);
    };
    const handleTimeUpdate = () => {
      syncBufferedPercent(video);
      if (seekTargetTime !== null || video.seeking) {
        return;
      }
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    };
    const handlePlay = () => {
      clearPendingAutoplay();
      setIsPlaying(true);
      setIsBuffering(false);
      scheduleHideControls();
    };
    const handlePause = () => {
      syncPausedUi();
    };
    const handleWaiting = () => {
      if (!video.paused) setIsBuffering(true);
    };
    const handleSeeking = () => {
      syncBufferedPercent(video);
      setIsBuffering(true);
    };
    const handleSeeked = () => {
      setSeekTargetTime(null);
      setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
      syncBufferedPercent(video);
      setIsBuffering(false);
    };
    const handlePlaying = () => {
      syncBufferedPercent(video);
      setIsBuffering(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
      clearHideControlsTimer();
    };
    const handleProgress = () => {
      syncBufferedPercent(video);
    };
    const handleError = () => {
      requestPlaybackRecovery('media-error');
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [clearHideControlsTimer, playableSource, requestPlaybackRecovery, scheduleHideControls, seekTargetTime, syncBufferedPercent, syncPausedUi]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.volume = Math.min(1, Math.max(0, volume));
    video.muted = isMuted || volume <= 0;
  }, [isMuted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      clearHideControlsTimer();
      return;
    }

    scheduleHideControls();
    return clearHideControlsTimer;
  }, [clearHideControlsTimer, isPlaying, scheduleHideControls]);

  useEffect(() => () => {
    clearHideControlsTimer();
  }, [clearHideControlsTimer]);

  if (!lesson) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-gradient-to-br from-stone-100 to-stone-50 text-sm text-stone-500">
        Выберите урок, чтобы начать просмотр
      </div>
    );
  }

  if (!playableSource) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-6 text-center text-sm text-amber-800">
        <p className="font-semibold">Урок уже в каталоге, но еще не опубликован в CDN/HLS.</p>
        <p>Для production добавьте `HLS` или публичный `MP4` URL в видеокаталог.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-black shadow-[0_24px_80px_-30px_rgba(0,0,0,0.8)]"
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
      onTouchStart={revealControls}
      onContextMenu={(event) => event.preventDefault()}
    >
      <motion.div
        key={`${lesson.id}:${sourceAttemptIndex}`}
        className="relative aspect-video w-full"
        initial={{ opacity: 0.88 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
      >
        <video
          ref={videoRef}
          className="h-full w-full bg-black"
          preload="auto"
          playsInline
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          poster={resolvedPosterUrl || undefined}
          onClick={(event) => {
            event.stopPropagation();
            void togglePlay();
          }}
          onContextMenu={(event) => event.preventDefault()}
        />
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 via-black/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

      {watermarkText ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-between p-3 text-[10px] font-semibold uppercase tracking-wide text-white/70">
          <span className="rounded bg-black/45 px-2 py-1 backdrop-blur-sm">{watermarkText}</span>
          <span className="rounded bg-black/45 px-2 py-1 backdrop-blur-sm">{watermarkText}</span>
        </div>
      ) : null}

      <AnimatePresence>
        {(showControls || !isPlaying) && (
          <motion.button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void togglePlay();
            }}
            className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white backdrop-blur-md transition-transform hover:scale-105"
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 6 }}
            transition={{ duration: 0.22 }}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isBuffering || isRefreshingSource) && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="rounded-full border border-white/25 bg-black/45 p-3 backdrop-blur-md">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRefreshingSource && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            Обновляем защищенную ссылку...
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute inset-x-0 bottom-0 z-30 p-3 sm:p-4"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.25 }}
          >
            <div className="rounded-2xl border border-white/20 bg-black/45 p-3 text-white backdrop-blur-xl">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={displayedTime}
                step={0.1}
                onInput={(event) => {
                  seekToTime(Number(event.currentTarget.value));
                  revealControls();
                }}
                onChange={(event) => {
                  seekToTime(Number(event.target.value));
                  revealControls();
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  revealControls();
                }}
                onTouchStart={(event) => {
                  event.stopPropagation();
                  revealControls();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                className="video-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20"
                style={{
                  background: `linear-gradient(90deg, rgba(34,197,94,0.95) 0%, rgba(34,197,94,0.95) ${progressPercent}%, rgba(255,255,255,0.4) ${progressPercent}%, rgba(255,255,255,0.4) ${Math.max(progressPercent, bufferedPercent)}%, rgba(255,255,255,0.22) ${Math.max(progressPercent, bufferedPercent)}%, rgba(255,255,255,0.22) 100%)`,
                }}
                aria-label="Video progress"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void togglePlay();
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 transition-colors hover:bg-white/20"
                    aria-label={isPlaying ? 'Pause video' : 'Play video'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleMute();
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 transition-colors hover:bg-white/20"
                    aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                  >
                    {isMuted || volume <= 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(event) => {
                      const nextVolume = Number(event.target.value);
                      setVolume(nextVolume);
                      if (nextVolume > 0 && isMuted) {
                        setIsMuted(false);
                      }
                      if (nextVolume <= 0 && !isMuted) {
                        setIsMuted(true);
                      }
                      revealControls();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    className="video-slider hidden h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-white/20 sm:block"
                    style={{
                      background: `linear-gradient(90deg, rgba(34,197,94,0.95) ${volumePercent}%, rgba(255,255,255,0.22) ${volumePercent}%)`,
                    }}
                    aria-label="Video volume"
                  />

                  <div className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white/85">
                    {formatTime(displayedTime)} / {formatTime(duration)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      cyclePlaybackRate();
                    }}
                    className="min-w-[3.25rem] rounded-xl border border-white/25 bg-white/10 px-2 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                    aria-label="Change playback speed"
                  >
                    {playbackRate}x
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleFullscreen();
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/10 transition-colors hover:bg-white/20"
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
