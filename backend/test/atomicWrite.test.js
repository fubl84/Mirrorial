const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeFileAtomic, writeJsonFileAtomic } = require('../src/runtime/atomicWrite');

const makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mirrorial-atomic-'));

test('writes JSON with a trailing newline and creates missing directories', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'a', 'b', 'config.json');
  await writeJsonFileAtomic(target, { hello: 'world' });
  assert.equal(fs.readFileSync(target, 'utf8'), '{\n  "hello": "world"\n}\n');
  fs.rmSync(dir, { recursive: true });
});

test('replaces an existing file and leaves no temp files behind', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'config.json');
  await writeJsonFileAtomic(target, { v: 1 });
  await writeJsonFileAtomic(target, { v: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { v: 2 });
  assert.deepEqual(fs.readdirSync(dir), ['config.json']);
  fs.rmSync(dir, { recursive: true });
});

test('applies the requested file mode', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'secrets.json');
  await writeJsonFileAtomic(target, { k: 1 }, { mode: 0o600 });
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  await writeJsonFileAtomic(target, { k: 2 }, { mode: 0o600 });
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true });
});

test('the target is never missing while it is being replaced (the old move+overwrite helper failed this)', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'config.json');
  await writeJsonFileAtomic(target, { v: 0 });

  let writing = true;
  let missing = 0;
  let torn = 0;
  let reads = 0;
  const reader = (async () => {
    while (writing) {
      reads += 1;
      try {
        JSON.parse(fs.readFileSync(target, 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') {
          missing += 1;
        } else {
          torn += 1;
        }
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  })();

  for (let version = 1; version <= 150; version += 1) {
    await writeJsonFileAtomic(target, { v: version, padding: 'x'.repeat(20000) });
  }
  writing = false;
  await reader;

  assert.ok(reads > 20, `the reader must have run (${reads} reads)`);
  assert.equal(missing, 0, 'file was missing at some point');
  assert.equal(torn, 0, 'a half-written file was visible');
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).v, 150);
  fs.rmSync(dir, { recursive: true });
});

test('a failed write keeps the old file and cleans up its temp file', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'config.json');
  await writeJsonFileAtomic(target, { v: 1 });

  const circular = {};
  circular.self = circular;
  await assert.rejects(writeJsonFileAtomic(target, circular), /circular|Converting/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { v: 1 });

  fs.mkdirSync(path.join(dir, 'blocker'));
  await assert.rejects(writeFileAtomic(path.join(dir, 'blocker'), 'x'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['blocker', 'config.json']);
  fs.rmSync(dir, { recursive: true });
});

test('concurrent writers never corrupt the file', async () => {
  const dir = makeDir();
  const target = path.join(dir, 'context.json');
  await Promise.all(Array.from({ length: 30 }, (_, index) => writeJsonFileAtomic(target, { writer: index, data: 'y'.repeat(5000) })));
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.ok(parsed.writer >= 0 && parsed.writer < 30);
  assert.deepEqual(fs.readdirSync(dir), ['context.json']);
  fs.rmSync(dir, { recursive: true });
});
