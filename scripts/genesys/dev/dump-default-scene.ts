import * as ENGINE from 'genesys.js';

import { defaultWorldOptions } from '../mcp/utils.js';

function main() {
  const world = new ENGINE.World(defaultWorldOptions);
  ENGINE.GameBuilder.createDefaultEditorScene(world);
  console.log(JSON.stringify(world.asExportedObject(), null, 2));
}

main();
