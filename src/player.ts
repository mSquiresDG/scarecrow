import * as ENGINE from 'genesys.js';
import * as THREE from 'three';


/**
 * A third person player class.
 *
 * Key points:
 * - No need to provide movementComponent and camera, they are created internally
 * - The pawn is set to be transient so it's never saved in the level
 * - The directional light follows the player for consistent shadows
 *
 */
@ENGINE.GameClass()
export class ThirdPersonPlayer extends ENGINE.ThirdPersonCharacterPawn {
  // Omit all the options that are created internally
  constructor(options: Omit<ENGINE.ThirdPersonCharacterPawnOptions,
    'rootComponent' | 'movementComponent' | 'camera' | 'modelUrl' | 'configUrl' | 'meshPosition' | 'meshRotation' | 'meshScale'>) {
    // simple camera component - contains a perspective camera by default
    const camera = new THREE.PerspectiveCamera(ENGINE.CAMERA_FOV, 1, 0.1, 1000);
    // set camera position for third person view
    camera.position.set(0, ENGINE.CHARACTER_HEIGHT * 1.3, ENGINE.CHARACTER_HEIGHT * 2);
    camera.lookAt(0, 0, 0);

    // use capsule root component for collision
    const rootComponent = new ENGINE.MeshComponent({
      geometry: ENGINE.GameBuilder.createDefaultPawnCapsuleGeometry(),
      material: new THREE.MeshStandardMaterial({ color: ENGINE.Color.YELLOW, visible: false, transparent: true, opacity: 0.5 }),
      physicsOptions: {
        enabled: true,
        // KinematicVelocityBased is required to use the physics character controller
        motionType: ENGINE.PhysicsMotionType.KinematicVelocityBased,
        collisionProfile: ENGINE.DefaultCollisionProfile.Character,
      },
    });

    // use third person movement mechanics
    const movementComponent = new ENGINE.CharacterMovementComponent({
      ...ENGINE.CharacterMovementComponent.DEFAULT_OPTIONS,
      movementType: ENGINE.CharacterMovementType.ThirdPerson,
    });

    // construct the pawn
    super({
      ...options,
      rootComponent,
      movementComponent,
      camera,
      // make sure the directional light follows the player for consistent shadows
      enableDirectionalLightFollowing: true,
      modelUrl: '@engine/assets/character/mannequinG.glb',
      configUrl: '@engine/assets/character/config/mannequin-anim.json',
      meshPosition: new THREE.Vector3(0, -ENGINE.CHARACTER_HEIGHT / 2, 0),
      meshRotation: new THREE.Euler(0, Math.PI, 0),
      meshScale: new THREE.Vector3(1, 1, 1),
    });

    // set the pawn to be transient so it's never saved in the level
    this.setTransient(true);
  }
}
