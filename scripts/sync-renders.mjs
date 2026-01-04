import { cp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';

const sourceDir = resolve('renders');
const targetDir = resolve('public', 'renders');
const preserveFiles = ['README.md', '.gitkeep'];

async function syncRenders() {
  const sourceStat = await stat(sourceDir).catch(() => null);
  if (!sourceStat || !sourceStat.isDirectory()) {
    console.warn(`[sync-renders] No render directory at ${sourceDir}; skipping copy.`);
    return;
  }

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
  const filesToRestore = preserved.filter((item) => Boolean(item.contents));
  await Promise.all(filesToRestore.map((item) => writeFile(join(targetDir, item.file), item.contents)));

  console.log(`[sync-renders] Synced render assets to ${targetDir}`);
}

syncRenders().catch((error) => {
  console.error('[sync-renders] Failed to copy render assets:', error);
  process.exit(1);
});
