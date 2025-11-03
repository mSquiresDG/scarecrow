
import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

import { ThirdPersonPlayer } from './player.js';
import './auto-imports.js';

class ThirdPersonGame extends ENGINE.BaseGameLoop {
  private pawn: ThirdPersonPlayer | null = null;
  private controller: ENGINE.PlayerController | null = null;

  protected override createLoadingScreen(): ENGINE.ILoadingScreen | null {
    // enable the default loading screen
    return new ENGINE.DefaultLoadingScreen();
  }

  protected override async preStart(): Promise<void> {
    // default spawn location
    const position = new THREE.Vector3(0, ENGINE.CHARACTER_HEIGHT / 2, 0);

    // create the pawn
    this.pawn = new ThirdPersonPlayer({ position });

    // create the controller and possess the pawn
    this.controller = new ENGINE.PlayerController();
    this.controller.possess(this.pawn);

    // add both to the world
    this.world.addActors(this.pawn, this.controller);
  }
}

export function main(container: HTMLElement, gameId: string): ENGINE.IGameLoop {
  const game = new ThirdPersonGame(container, {
    ...ENGINE.BaseGameLoop.DEFAULT_OPTIONS,
    gameId
  });
  return game;
}
