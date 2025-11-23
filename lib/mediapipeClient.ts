/* Lightweight MediaPipe FaceMesh client helper
  - Dynamically imports MediaPipe packages in the browser
  - Starts camera feed and sends frames to FaceMesh
  - Emits simple callbacks for frames and multi-person counts
*/
export type CheatCallbacks = {
  onMultiPerson?: (count: number) => void;
  onFrame?: (results: any) => void;
};

export async function createFaceMeshDetector(
  videoEl: HTMLVideoElement,
  callbacks: CheatCallbacks = {},
  options?: { maxNumFaces?: number }
) {
  // Dynamic imports so this module can be imported server-side safely
  const faceMeshModule = await import('@mediapipe/face_mesh');
  const camModule = await import('@mediapipe/camera_utils');

  // Use mutable references so we can opt to use local script constructors
  let FaceMeshCtor: any = (faceMeshModule as any).FaceMesh;
  let CameraCtor: any = (camModule as any).Camera;

  // Use the exact package version when pointing to CDN to avoid mismatched
  // asset resolution. If you update the dependency, update this constant.
  const MEDIAPIPE_FACE_MESH_VERSION = '0.4.1633559619';

  // Try jsDelivr first, fall back to unpkg if assets fail to load.
  const baseJsDelivr = `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh`;
  const baseUnpkg = `https://unpkg.com/@mediapipe/face_mesh@${MEDIAPIPE_FACE_MESH_VERSION}`;

  // Local public path (prefer serving from local origin to avoid CDN/WASM/CORS issues)
  const baseLocal = '/mediapipe';

  // Helper: try to fetch a small known asset to determine if local assets exist
  async function localAssetsExist() {
    try {
      const testUrl = `${baseLocal}/face_mesh_solution_packed_assets.data`;
      const res = await fetch(testUrl, { method: 'HEAD' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  const useLocal = await localAssetsExist();
  const initialBase = useLocal ? baseLocal : baseJsDelivr;

  // If local assets are available, load the local scripts and ensure the
  // loader uses '/mediapipe' as the base for asset requests. We inject the
  // script tags synchronously and then obtain the constructors from the
  // global scope that the scripts expose.
  if (useLocal) {
    // Ensure Module.locateFile points to the local mediapipe folder so the
    // packed assets loader requests the right URLs.
    try {
      (window as any).Module = (window as any).Module || {};
      (window as any).Module.locateFile = (file: string) => `/mediapipe/${file}`;
    } catch (e) {
      // ignore in non-browser environments
    }

    // Helper to inject a script and await its load
    const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        // already present; assume it's loaded
        return resolve();
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = (ev) => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });

    // Load local copies (these were copied to public/mediapipe)
    await loadScript('/mediapipe/face_mesh.js');
    await loadScript('/mediapipe/camera_utils.js');

    // The local scripts attach constructors to the global scope
    const globalAny = window as any;
    const LocalFaceMesh = globalAny.FaceMesh || globalAny.MediapipeFaceMesh || globalAny.face_mesh?.FaceMesh;
    const LocalCamera = globalAny.Camera || globalAny.CameraUtils || globalAny.camera_utils?.Camera;
    if (!LocalFaceMesh || !LocalCamera) {
      // Fall back to package import below
      console.warn('Local MediaPipe scripts loaded but constructors not found; falling back to package import.');
      // proceed to create via imported FaceMesh/Camera
      let faceMesh = new FaceMeshCtor({
        locateFile: (file: string) => `${initialBase}/${file}`,
      });
    } else {
      // Use the local constructors
      FaceMeshCtor = LocalFaceMesh;
      CameraCtor = LocalCamera;
      let faceMesh = new FaceMeshCtor({
        locateFile: (file: string) => `/mediapipe/${file}`,
      });
      // continue with faceMesh instance below
    }
  }
  // If not using local, fall back to constructing with imported FaceMesh
  let faceMesh = new FaceMeshCtor({
    locateFile: (file: string) => `${initialBase}/${file}`,
  });

  // Guard: if the module fails to fetch WASM assets (common when CDN path
  // mismatches or browser blocks), attempt to recreate using the unpkg base.
  // We wrap start/setup in try/catch below to surface clearer errors.

  try {
    faceMesh.setOptions({
    maxNumFaces: options?.maxNumFaces ?? 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  } catch (err) {
    // Attempt fallback to unpkg if jsDelivr failed to load required assets
    try {
      const fallback = new FaceMeshCtor({
        locateFile: (file: string) => `${baseUnpkg}/${file}`,
      });
      fallback.setOptions({
        maxNumFaces: options?.maxNumFaces ?? 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      // replace faceMesh reference
      // @ts-ignore - overwrite internal const for fallback usage
      // (we will use fallback from here)
      (faceMesh as any) = fallback;
    } catch (err2) {
      console.error('MediaPipe FaceMesh failed to initialize with CDN assets.', err, err2);
      throw new Error('MediaPipe FaceMesh initialization failed. Check CDN access and browser WASM support.');
    }
  }

  let latestResults: any = null;

  faceMesh.onResults((results: any) => {
    latestResults = results;
    try {
      console.log('[MediaPipe] onResults fired, results present:', Boolean(results && results.multiFaceLandmarks));
    } catch (e) {}
    callbacks.onFrame?.(results);
    const faces = results.multiFaceLandmarks ?? [];
    try {
      callbacks.onMultiPerson?.(faces.length);
    } catch (e) {}
  });

  const camera = new CameraCtor(videoEl, {
    onFrame: async () => {
      await faceMesh.send({ image: videoEl });
    },
    width: 1280,
    height: 720,
  });

  await camera.start();
  try {
    console.log('[MediaPipe] camera.start() resolved, camera running');
  } catch (e) {}

  return {
    stop: async () => {
      try {
        camera.stop();
      } catch (e) {
        // ignore
      }
      try {
        faceMesh.close();
      } catch (e) {
        // ignore
      }
    },
    getLatestResults: () => latestResults,
    faceMesh,
    camera,
  };
}

export default createFaceMeshDetector;
