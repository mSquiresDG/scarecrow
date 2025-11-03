
import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

import { StaticCameraActor } from './camera.js';
import './auto-imports.js';

class ScareCrowGame extends ENGINE.BaseGameLoop {
  protected override createLoadingScreen(): ENGINE.ILoadingScreen | null {
    // enable the default loading screen
    return new ENGINE.DefaultLoadingScreen();
  }

  protected override async preStart(): Promise<void> {
    // Check if a StaticCameraActor already exists in the scene
    const existingCamera = this.world.getFirstActor(StaticCameraActor);
    
    if (!existingCamera) {
      // If no camera actor exists, create one with a nice isometric view
      // Position it at an angle to see the center (0, 0, 0)
      const cameraActor = new StaticCameraActor({
        position: new THREE.Vector3(10, 8, 10)
      });
      
      this.world.addActor(cameraActor);
      
      // After adding to world, get the camera and make it look at center
      const camera = cameraActor.getCamera();
      if (camera) {
        console.log('[Game] Setting camera to look at (0, 1, 0)');
        console.log('[Game] Camera position before lookAt:', camera.position);
        camera.lookAt(0, 1, 0); // Look at slightly above ground level
        console.log('[Game] Camera rotation after lookAt:', camera.rotation);
      }
    }
    // If a camera actor exists in the scene, it will automatically
    // set itself as the world camera in its doBeginPlay method
  }
}

export function main(container: HTMLElement, gameId: string): ENGINE.IGameLoop {
  const game = new ScareCrowGame(container, {
    ...ENGINE.BaseGameLoop.DEFAULT_OPTIONS,
    gameId
  });
  return game;
}
