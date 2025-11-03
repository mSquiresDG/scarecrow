import fs from 'fs';
import path from 'path';

import { mockBrowserEnvironment } from '../common.js';
import { SCENE_EXTENSION } from '../const.js';
import { loadWorld } from '../mcp/utils.js';

// Mock browser environment as required by the engine
mockBrowserEnvironment();

async function findGenesysSceneFiles(dir: string): Promise<string[]> {
  const sceneFiles: string[] = [];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findGenesysSceneFiles(fullPath);
        sceneFiles.push(...subFiles);
      } else if (item.isFile() && item.name.endsWith(SCENE_EXTENSION)) {
        sceneFiles.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return sceneFiles;
}

async function updateSceneFile(sceneFilePath: string): Promise<void> {
  console.log(`Processing: ${sceneFilePath}`);

  try {
    // Use the loadWorld utility with proper disposal using 'using' keyword
    using worldResource = await loadWorld(sceneFilePath, {
      readonly: false, // Allow saving changes
      skipLoadingGLTF: true // Skip GLTF loading for faster processing
    });

    console.log(`✓ Successfully updated: ${sceneFilePath}`);
  } catch (error) {
    console.error(`✗ Failed to update ${sceneFilePath}:`, error);
  }
}

async function main() {
  console.log('Searching for .genesys-scene files in src folder...');

  const srcDir = path.join(process.cwd(), 'src');

  if (!fs.existsSync(srcDir)) {
    console.error('src directory not found');
    return;
  }

  const sceneFiles = await findGenesysSceneFiles(srcDir);

  if (sceneFiles.length === 0) {
    console.log('No .genesys-scene files found in src folder');
    return;
  }

  console.log(`Found ${sceneFiles.length} .genesys-scene files:`);
  sceneFiles.forEach(file => console.log(`  - ${path.relative(process.cwd(), file)}`));

  console.log('\nUpdating scene files...');

  // Process each scene file
  for (const sceneFile of sceneFiles) {
    await updateSceneFile(sceneFile);
  }

  console.log('\nScene update process completed!');
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
