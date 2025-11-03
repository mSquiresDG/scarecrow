import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { mockBrowserEnvironment as engineMock } from 'genesys.js';
import { JSDOM } from 'jsdom';
import { z } from 'zod';

export const isDev = process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'dev' ||
  process.argv.includes('--dev');

export function mockBrowserEnvironment() {
  engineMock(JSDOM);
}


export function mockEsModule() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  (global as any).__filename = __filename;
  (global as any).__dirname = __dirname;
}

mockEsModule();

export function getProjectRoot() {
  let currentDir = __dirname;
  while (true) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error('Project root not found');
    }
    currentDir = parentDir;
  }
}

export const TransformSchema = z.object({
  position: z.array(z.number()).length(3).optional().describe('Position as [x, y, z]'),
  rotation: z.array(z.number()).length(3).optional().describe('Rotation in radians as [x, y, z]'),
  scale: z.array(z.number()).length(3).optional().describe('Scale as [x, y, z], use this to scale the actor up or down'),
});

export type Transform = z.infer<typeof TransformSchema>;

export const ActorInfoSchema = z.object({
  displayName: z.string().describe('Display name of the actor'),
  description: z.string().optional().describe('Description of the actor, including its purpose, how to use it, etc.'),
});

