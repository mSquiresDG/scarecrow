import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

/**
 * StaticCameraActor - A camera actor that can be positioned in the scene editor
 * 
 * This actor contains a camera that can be moved and rotated in the editor.
 * The game will automatically use this camera for rendering.
 */
@ENGINE.GameClass()
export class StaticCameraActor extends ENGINE.Actor {
  private camera: THREE.PerspectiveCamera;

  constructor(options: ENGINE.ActorOptions = {}) {
    // Create the camera before calling super
    const camera = new THREE.PerspectiveCamera(
      ENGINE.CAMERA_FOV,
      1,
      ENGINE.CAMERA_NEAR,
      ENGINE.CAMERA_FAR
    );

    // Create a root component if not provided
    const rootComponent = options.rootComponent || new ENGINE.SceneComponent({
      position: options.position,
      rotation: options.rotation,
      scale: options.scale
    });

    super({
      ...options,
      rootComponent
    });

    this.camera = camera;
    
    // Add the camera to the root component so it moves with the actor
    this.rootComponent.add(this.camera);
  }

  /**
   * Gets the camera component
   * @returns The camera
   */
  public override getCamera(): THREE.Camera {
    return this.camera;
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    
    // Set this camera as the world's override camera
    const world = this.getWorld();
    if (world) {
      world.setOverrideCamera(this.camera);
      console.log('=== Static Camera Debug ===');
      console.log('Camera Actor Position:', this.rootComponent.position);
      console.log('Camera Actor Rotation:', this.rootComponent.rotation);
      console.log('Camera Object Position:', this.camera.position);
      console.log('Camera Object Rotation:', this.camera.rotation);
      console.log('Camera World Position:', this.camera.getWorldPosition(new THREE.Vector3()));
      console.log('Camera World Rotation:', this.camera.getWorldQuaternion(new THREE.Quaternion()));
      console.log('=========================');
    }
  }
}

