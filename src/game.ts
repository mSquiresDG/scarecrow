
import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

import { StaticCameraActor } from './camera.js';
import { GameplayManager } from './game/GameplayManager.js';
import './auto-imports.js';

class ScareCrowGame extends ENGINE.BaseGameLoop {
  protected override createLoadingScreen(): ENGINE.ILoadingScreen | null {
    // enable the default loading screen
    return new ENGINE.DefaultLoadingScreen();
  }

  protected override async preStart(): Promise<void> {
    // Check if a StaticCameraActor already exists in the scene
    let cameraActor = this.world.getFirstActor(StaticCameraActor);
    
    if (!cameraActor) {
      // Find the camera_placeholder actor in the scene
      const placeholderActors = this.world.getActorsByPredicate(
        (actor) => actor.editorData?.displayName === 'camera_placeholder'
      );
      
      const placeholderActor = placeholderActors[0];
      
      if (placeholderActor) {
        console.log('[Game] Found camera_placeholder actor, replacing with StaticCameraActor');
        const placeholderRoot = placeholderActor.getRootComponent();
        
        // Get the placeholder's transform
        const position = placeholderRoot.position.clone();
        const rotation = placeholderRoot.rotation.clone();
        
        console.log('[Game] Placeholder position:', position);
        console.log('[Game] Placeholder rotation:', rotation);
        
        // Create camera actor at the same position/rotation as placeholder
        cameraActor = new StaticCameraActor({
          position: position,
          rotation: rotation
        });
        
        // Copy display name for editor
        cameraActor.editorData.displayName = 'Camera';
        
        this.world.addActor(cameraActor);
        
        // Remove the old placeholder actor
        placeholderActor.destroy();
        
        console.log('[Game] Replaced placeholder with StaticCameraActor');
      } else {
        console.warn('[Game] camera_placeholder not found, creating camera at default position');
        
        // Fallback: create camera at default position
        cameraActor = new StaticCameraActor({
          position: new THREE.Vector3(10, 8, 10)
        });
        
        cameraActor.editorData.displayName = 'Camera';
        
        this.world.addActor(cameraActor);
        
        const camera = cameraActor.getCamera();
        if (camera) {
          camera.lookAt(0, 1, 0);
        }
      }
    } else {
      console.log('[Game] StaticCameraActor already exists in scene');
    }

    // Create GameplayManager if it doesn't exist
    let gameplayManager = this.world.getFirstActor(GameplayManager);
    if (!gameplayManager) {
      console.log('[Game] Creating GameplayManager');
      gameplayManager = new GameplayManager({
        // Vector3: X=Crop No, Y=Crow No, Z=Speed
        wave1: new THREE.Vector3(2, 2, 1),
        wave2: new THREE.Vector3(2.5, 2.5, 1),
        wave3: new THREE.Vector3(3, 3, 1),
      });
      this.world.addActor(gameplayManager);
    } else {
      console.log('[Game] GameplayManager already exists in scene');
    }
  }
}

export function main(container: HTMLElement, gameId: string): ENGINE.IGameLoop {
  const game = new ScareCrowGame(container, {
    ...ENGINE.BaseGameLoop.DEFAULT_OPTIONS,
    gameId
  });
  return game;
}
