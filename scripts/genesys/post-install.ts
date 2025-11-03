import fs from 'fs';
import path from 'path';

import { getProjectRoot } from './common.js';


async function main() {
  const engineInstallFolder = path.join(getProjectRoot(), 'node_modules/genesys.js');
  if (!fs.existsSync(engineInstallFolder)) {
    return;
  }
  const copiedEngineFolder = path.join(getProjectRoot(), '.engine');
  if (fs.existsSync(copiedEngineFolder)) {
    fs.rmdirSync(copiedEngineFolder, { recursive: true });
  }
  fs.mkdirSync(copiedEngineFolder, { recursive: true });

  const foldersToCopy: string[] = [
    'games/examples',
    'src',
    'docs',
  ];
  for (const folder of foldersToCopy) {
    const engineFolderPath = path.join(engineInstallFolder, folder);
    const localFolderPath = path.join(copiedEngineFolder, folder);
    fs.cpSync(engineFolderPath, localFolderPath, { recursive: true });
  }
}

main();
