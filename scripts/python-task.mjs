import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
if (!existsSync(python)) {
  console.error('Create .venv and install requirements-dev.txt first. See docs/SETUP.md.');
  process.exit(1);
}
const config = resolve('.tools/ultralytics');
mkdirSync(resolve(config, 'Ultralytics'), { recursive: true });
const result = spawnSync(python, ['-m', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, YOLO_CONFIG_DIR: process.env.YOLO_CONFIG_DIR || config },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
