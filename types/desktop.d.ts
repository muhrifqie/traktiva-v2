// Bridge exposed by electron/preload.js. Undefined in plain browser (web) mode.
type DesktopWindowState = { maximized: boolean; fullscreen: boolean; focused: boolean };
type DesktopUpdateProgress = { stage: "check" | "download" | "verify" | "install"; received?: number; total?: number };

interface Window {
  desktop?: {
    isDesktop: true;
    platform: string;
    /** Free this PC's license slot and ask for another key (packaged app). */
    changeLicense(): Promise<{ ok: boolean }>;
    refreshLicense(): Promise<{ ok: boolean; message?: string }>;
    /** In-app update (packaged app, newer builds only: check before calling). */
    update?: {
      install(): Promise<{ ok: boolean; message?: string }>;
      onProgress(cb: (p: DesktopUpdateProgress) => void): () => void;
    };
    window: {
      state(): Promise<DesktopWindowState>;
      minimize(): Promise<void>;
      toggleMaximize(): Promise<void>;
      toggleFullscreen(): Promise<void>;
      close(): Promise<void>;
      onState(cb: (s: DesktopWindowState) => void): () => void;
    };
  };
}
