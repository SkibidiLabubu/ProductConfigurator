import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

const sourceDir = resolve('renders');
const targetDir = resolve('public', 'renders');
const preserveFiles = ['README.md', '.gitkeep'];
const sampleRelativePath = join('base_01', 'shade_01', 'CAM_01', 'on', 'beauty_fg.webp');
const minFileThreshold = 20;

async function logDirectoryListing(dir) {
  try {
    const { stdout, stderr } = await exec(`ls -la ${dir}`);
    console.log(`[verify-renders] ls -la ${dir}:\n${stdout}${stderr}`.trimEnd());
  } catch (error) {
    console.warn(`[verify-renders] Unable to list ${dir}: ${error.message}`);
  }
}

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

async function ensureMinimumFiles(report, label, dirPath) {
  if (!report.exists) {
    throw new Error(`[verify-renders] Missing ${label} directory at ${dirPath}`);
  }
  if (report.fileCount < minFileThreshold) {
    throw new Error(
      `[verify-renders] Expected at least ${minFileThreshold} files in ${label} (found ${report.fileCount})`
    );
  }
}

async function assertSampleExists(dir, label) {
  const samplePath = join(dir, sampleRelativePath);
  try {
    await stat(samplePath);
    console.log(`[verify-renders] ✅ Found sample asset in ${label}: ${samplePath}`);
  } catch {
    throw new Error(`[verify-renders] Missing sample asset in ${label}: ${samplePath}`);
  }
}

async function syncDirectories() {
  const preserved = await Promise.all(
    preserveFiles.map(async (file) => {
      const targetPath = join(targetDir, file);
      const contents = await readFile(targetPath).catch(() => null);
      return { file, contents };
    })
  );

  await rm(targetDir, { recursive: true, force: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    filter: (src) => !preserveFiles.includes(basename(src))
  });
  await mkdir(targetDir, { recursive: true });

  const filesToRestore = preserved.filter((item) => item.contents !== null);
  await Promise.all(
    filesToRestore.map((item) => writeFile(join(targetDir, item.file), item.contents))
  );

  console.log(`[sync-renders] Synced render assets to ${targetDir}`);
}

async function main() {
  console.log(`[verify-renders] cwd: ${process.cwd()}`);

  await logDirectoryListing(sourceDir);
  await logDirectoryListing(targetDir);

  const sourceReport = await getDirectoryReport(sourceDir);
  console.log(
    `[verify-renders] Source renders: files=${sourceReport.fileCount}, bytes=${sourceReport.byteCount}`
  );
  await ensureMinimumFiles(sourceReport, 'source renders', sourceDir);
  await assertSampleExists(sourceDir, 'source renders');

  await syncDirectories();

  await logDirectoryListing(targetDir);
  const targetReport = await getDirectoryReport(targetDir);
  console.log(
    `[verify-renders] Public renders: files=${targetReport.fileCount}, bytes=${targetReport.byteCount}`
  );
  await ensureMinimumFiles(targetReport, 'public renders', targetDir);
  await assertSampleExists(targetDir, 'public renders');
}

main().catch((error) => {
  console.error('[verify-renders] Failed to verify and sync render assets:', error);
  process.exit(1);
});
