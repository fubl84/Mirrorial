const fs = require('fs');
const path = require('path');

// Real atomic file replacement.
//
// The previous helper used fs-extra's move({ overwrite: true }), which DELETES the destination first and then
// renames: for a moment the file does not exist. A reader (the display app, the next request) that looks at
// that moment sees "no file" or a half-written one. rename(2) on the same filesystem replaces the target in one
// step, so readers see either the complete old file or the complete new one, never nothing.
//
// Order: write temp file in the SAME directory -> fsync -> rename over target -> fsync directory (best effort).

const tempNameFor = (targetPath) => path.join(
  path.dirname(targetPath),
  `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`,
);

const fsyncPath = async (filePath, flags) => {
  let handle;
  try {
    handle = await fs.promises.open(filePath, flags);
    await handle.sync();
  } catch (error) {
    // Directories cannot be opened/synced on every platform; durability is best effort there.
  } finally {
    await handle?.close().catch(() => {});
  }
};

const writeFileAtomic = async (targetPath, data, { mode } = {}) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = tempNameFor(targetPath);
  let handle;
  try {
    handle = await fs.promises.open(tempPath, 'w', mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    if (mode !== undefined) {
      await fs.promises.chmod(tempPath, mode).catch(() => {});
    }
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.promises.unlink(tempPath).catch(() => {});
    throw error;
  }
  await fsyncPath(path.dirname(targetPath), 'r');
};

// async on purpose: a payload that cannot be serialised must reject the returned promise like every other
// failure, not throw synchronously past a caller's .catch().
const writeJsonFileAtomic = async (targetPath, payload, { spaces = 2, mode } = {}) => {
  const text = `${JSON.stringify(payload, null, spaces)}\n`;
  await writeFileAtomic(targetPath, text, { mode });
};

module.exports = {
  writeFileAtomic,
  writeJsonFileAtomic,
};
