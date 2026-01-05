import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';

const distDir = resolve('dist');
const distRendersDir = join(distDir, 'renders');
const sampleRelativePath = join('base_01', 'shade_01', 'CAM_01', 'off', 'beauty_fg.webp');
const minFileThreshold = 20;

async function getDirectoryReport(dir) {
  const stats = await stat(dir).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    return { exists: false, fileCount: 0, byteCount: 0 };
  }

  let fileCount = 0;
  let byteCount = 0;
  const stack = [dir];

  while (stack.length) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        fileCount += 1;
        const fileStat = await stat(entryPath);
        byteCount += fileStat.size;
      }
    }
  }

  return { exists: true, fileCount, byteCount };
}

async function assertDistReadiness() {
  const report = await getDirectoryReport(distRendersDir);
  if (!report.exists) {
    throw new Error(`[verify-dist-renders] dist renders directory missing: ${distRendersDir}`);
  }
  if (report.fileCount < minFileThreshold) {
    throw new Error(
      `[verify-dist-renders] Expected at least ${minFileThreshold} files in dist renders (found ${report.fileCount})`
    );
  }

  const samplePath = join(distRendersDir, sampleRelativePath);
  try {
    await stat(samplePath);
    console.log(`[verify-dist-renders] ✅ Sample asset exists in dist: ${samplePath}`);
  } catch {
    throw new Error(`[verify-dist-renders] Sample asset missing in dist: ${samplePath}`);
  }

  console.log(
    `[verify-dist-renders] dist/renders ready: files=${report.fileCount}, bytes=${report.byteCount}`
  );
}

assertDistReadiness().catch((error) => {
  console.error('[verify-dist-renders] Verification failed:', error);
  process.exit(1);
});
