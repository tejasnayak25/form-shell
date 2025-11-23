const fs = require('fs');
const path = require('path');

// Copies minimal face_mesh assets from node_modules to public/mediapipe
// Run: node scripts/copy_mediapipe_assets.js

const pkgRoot = path.resolve(__dirname, '..');
const src = path.join(pkgRoot, 'node_modules', '@mediapipe', 'face_mesh');
const dest = path.join(pkgRoot, 'public', 'mediapipe');

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.error('Source directory not found:', srcDir);
    process.exit(1);
  }
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const ent of entries) {
    const srcPath = path.join(srcDir, ent.name);
    const destPath = path.join(destDir, ent.name);
    if (ent.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      // Only copy the files most likely needed
      if (/face_mesh|wasm|packed_assets|loader|solution/.test(ent.name)) {
        try {
          fs.copyFileSync(srcPath, destPath);
          console.log('Copied', srcPath, '->', destPath);
        } catch (e) {
          console.warn('Failed copying', srcPath, e.message);
        }
      }
    }
  }
}

copyRecursive(src, dest);

// Additionally try to copy camera_utils package (separate @mediapipe package)
const cameraUtilsSrc = path.join(pkgRoot, 'node_modules', '@mediapipe', 'camera_utils', 'camera_utils.js');
const cameraUtilsDest = path.join(dest, 'camera_utils.js');
if (fs.existsSync(cameraUtilsSrc)) {
  try {
    fs.copyFileSync(cameraUtilsSrc, cameraUtilsDest);
    console.log('Copied', cameraUtilsSrc, '->', cameraUtilsDest);
  } catch (e) {
    console.warn('Failed copying', cameraUtilsSrc, e.message);
  }
} else {
  console.warn('camera_utils.js not found at', cameraUtilsSrc, '- skipping');
}

console.log('Done copying MediaPipe face_mesh assets to public/mediapipe');
