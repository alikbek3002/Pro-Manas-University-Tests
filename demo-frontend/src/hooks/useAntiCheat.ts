import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

type AntiCheatSource =
  | 'copy'
  | 'contextmenu'
  | 'visibilitychange'
  | 'blur'
  | 'fullscreen_exit'
  | 'navigation'
  | 'blocked_shortcut'
  | 'printscreen';

export interface AntiCheatViolation {
  reason: string;
  source: AntiCheatSource;
  triggered_at: string;
}

interface UseAntiCheatProps {
  isActive: boolean;
  onViolation: (violation: AntiCheatViolation) => void;
}

interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

function isFullscreenActive() {
  const fullscreenDocument = document as FullscreenDocument;
  return Boolean(document.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
}

function isBlockedShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const hasPrimaryModifier = event.ctrlKey || event.metaKey;
  const hasShift = event.shiftKey;

  if (event.key === 'F12' || event.key === 'PrintScreen') {
    return true;
  }

  if (hasPrimaryModifier && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(key)) {
    return true;
  }

  if (hasPrimaryModifier && hasShift && ['i', 'j', 'c'].includes(key)) {
    return true;
  }

  if (event.metaKey && hasShift && ['3', '4', '5'].includes(key)) {
    return true;
  }

  return false;
}

function buildShortcutViolation(event: KeyboardEvent): AntiCheatViolation {
  const key = event.key.toLowerCase();
  if (event.key === 'PrintScreen' || (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(key))) {
    return {
      reason: 'Обнаружена попытка сделать снимок экрана.',
      source: 'printscreen',
      triggered_at: new Date().toISOString(),
    };
  }

  return {
    reason: 'Обнаружено использование запрещенного сочетания клавиш.',
    source: 'blocked_shortcut',
    triggered_at: new Date().toISOString(),
  };
}

export function useAntiCheat({ isActive, onViolation }: UseAntiCheatProps) {
  const onViolationRef = useRef(onViolation);
  const violationTriggeredRef = useRef(false);

  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);

  useEffect(() => {
    if (!isActive) {
      violationTriggeredRef.current = false;
      return;
    }

    const triggerViolation = (violation: AntiCheatViolation) => {
      if (violationTriggeredRef.current) {
        return;
      }

      violationTriggeredRef.current = true;
      onViolationRef.current(violation);
    };

    const preventSelection = (event: Event) => {
      event.preventDefault();
    };

    const handleClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      triggerViolation({
        reason: 'Обнаружена попытка копирования или вставки во время теста.',
        source: 'copy',
        triggered_at: new Date().toISOString(),
      });
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      triggerViolation({
        reason: 'Обнаружена попытка открыть контекстное меню.',
        source: 'contextmenu',
        triggered_at: new Date().toISOString(),
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation({
          reason: 'Зафиксировано переключение на другую вкладку или скрытие окна.',
          source: 'visibilitychange',
          triggered_at: new Date().toISOString(),
        });
      }
    };

    const handleBlur = () => {
      triggerViolation({
        reason: 'Окно тестирования потеряло фокус.',
        source: 'blur',
        triggered_at: new Date().toISOString(),
      });
    };

    const handleFullscreenChange = () => {
      if (!isFullscreenActive()) {
        triggerViolation({
          reason: 'Полноэкранный режим был отключен во время теста.',
          source: 'fullscreen_exit',
          triggered_at: new Date().toISOString(),
        });
      }
    };

    const handlePopState = () => {
      window.history.pushState({ antiCheatGuard: true }, document.title, window.location.href);
      triggerViolation({
        reason: 'Зафиксирована попытка покинуть тест через навигацию браузера.',
        source: 'navigation',
        triggered_at: new Date().toISOString(),
      });
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isBlockedShortcut(event)) {
        return;
      }

      event.preventDefault();
      triggerViolation(buildShortcutViolation(event));
    };

    window.history.pushState({ antiCheatGuard: true }, document.title, window.location.href);

    document.addEventListener('copy', handleClipboard, true);
    document.addEventListener('cut', handleClipboard, true);
    document.addEventListener('paste', handleClipboard, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('selectionstart', preventSelection, true);
    document.addEventListener('dragstart', preventSelection, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    document.addEventListener('fullscreenchange', handleFullscreenChange, true);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleBlur, true);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('copy', handleClipboard, true);
      document.removeEventListener('cut', handleClipboard, true);
      document.removeEventListener('paste', handleClipboard, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('selectionstart', preventSelection, true);
      document.removeEventListener('dragstart', preventSelection, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      document.removeEventListener('fullscreenchange', handleFullscreenChange, true);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isActive]);

  const containerStyle = useMemo<CSSProperties>(
    () => ({
      userSelect: 'none',
      WebkitUserSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none',
      WebkitTouchCallout: 'none',
    }),
    [],
  );

  return {
    containerProps: {
      style: containerStyle,
      'data-anti-cheat': isActive ? 'active' : 'inactive',
    },
  };
}
