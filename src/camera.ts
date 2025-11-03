import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

export interface StaticCameraActorOptions extends ENGINE.ActorOptions {
  /** Field of View in degrees (1-179) */
  fov?: number;
  /** Near clipping plane distance */
  near?: number;
  /** Far clipping plane distance */
  far?: number;
  /** Camera zoom factor (1 = normal) */
  zoom?: number;
}

/**
 * StaticCameraActor - A camera actor that can be positioned in the scene editor
 * 
 * This actor contains a camera that can be moved and rotated in the editor.
 * The game will automatically use this camera for rendering.
 */
@ENGINE.GameClass()
export class StaticCameraActor extends ENGINE.Actor<StaticCameraActorOptions> {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
    fov: { number: { min: 1, max: 179, step: 1, unit: '°' } },
    near: { number: { min: 0.01, max: 100, step: 0.01 } },
    far: { number: { min: 100, max: 10000, step: 100 } },
    zoom: { number: { min: 0.1, max: 10, step: 0.1 } },
  } as const;

  static override get DEFAULT_OPTIONS(): StaticCameraActorOptions {
    return {
      ...ENGINE.Actor.DEFAULT_OPTIONS,
      fov: ENGINE.CAMERA_FOV,
      near: ENGINE.CAMERA_NEAR,
      far: ENGINE.CAMERA_FAR,
      zoom: 1,
    };
  }

  private camera: THREE.PerspectiveCamera;

  constructor(options: StaticCameraActorOptions = {}) {
    // Merge with defaults
    const mergedOptions = {
      ...StaticCameraActor.DEFAULT_OPTIONS,
      ...options
    };

    // Create the camera before calling super
    const camera = new THREE.PerspectiveCamera(
      mergedOptions.fov!,
      1,
      mergedOptions.near!,
      mergedOptions.far!
    );
    
    camera.zoom = mergedOptions.zoom!;

    // Zero out camera's local transform - it will inherit from actor/parent
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);

    // Create a root component if not provided
    const rootComponent = mergedOptions.rootComponent || new ENGINE.SceneComponent({
      position: mergedOptions.position,
      rotation: mergedOptions.rotation,
      scale: mergedOptions.scale
    });

    super({
      ...mergedOptions,
      rootComponent
    });

    this.camera = camera;
    
    // Don't add camera to rootComponent here - will add in doBeginPlay
    // to avoid serialization issues
  }

  /**
   * Gets the camera component
   * @returns The camera
   */
  public override getCamera(): THREE.Camera {
    return this.camera;
  }

  /**
   * Updates the camera's field of view
   * @param newFov - The new FOV value in degrees
   */
  public setFOV(newFov: number): void {
    this.options.fov = newFov;
    this.camera.fov = newFov;
    this.camera.updateProjectionMatrix();
    console.log(`[Camera] FOV updated to ${newFov}°`);
  }

  /**
   * Updates the camera's near clipping plane
   * @param newNear - The new near value
   */
  public setNear(newNear: number): void {
    this.options.near = newNear;
    this.camera.near = newNear;
    this.camera.updateProjectionMatrix();
    console.log(`[Camera] Near plane updated to ${newNear}`);
  }

  /**
   * Updates the camera's far clipping plane
   * @param newFar - The new far value
   */
  public setFar(newFar: number): void {
    this.options.far = newFar;
    this.camera.far = newFar;
    this.camera.updateProjectionMatrix();
    console.log(`[Camera] Far plane updated to ${newFar}`);
  }

  /**
   * Updates the camera's zoom factor
   * @param newZoom - The new zoom value
   */
  public setZoom(newZoom: number): void {
    this.options.zoom = newZoom;
    this.camera.zoom = newZoom;
    this.camera.updateProjectionMatrix();
    console.log(`[Camera] Zoom updated to ${newZoom}`);
  }

  /**
   * Called when a property is changed in the editor
   */
  public override onEditorPropertyChanged(path: string, value: any, result: ENGINE.EditorPropertyChangedResult): void {
    super.onEditorPropertyChanged(path, value, result);
    
    if (path === 'fov') {
      this.setFOV(value);
    } else if (path === 'near') {
      this.setNear(value);
    } else if (path === 'far') {
      this.setFar(value);
    } else if (path === 'zoom') {
      this.setZoom(value);
    }
  }

  public override tickPostPhysics(deltaTime: number): void {
    super.tickPostPhysics(deltaTime);
    
    // Sync camera properties if they changed
    let needsUpdate = false;
    
    if (this.camera.fov !== this.options.fov) {
      this.camera.fov = this.options.fov!;
      needsUpdate = true;
    }
    if (this.camera.near !== this.options.near) {
      this.camera.near = this.options.near!;
      needsUpdate = true;
    }
    if (this.camera.far !== this.options.far) {
      this.camera.far = this.options.far!;
      needsUpdate = true;
    }
    if (this.camera.zoom !== this.options.zoom) {
      this.camera.zoom = this.options.zoom!;
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      this.camera.updateProjectionMatrix();
    }
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    
    // Add the camera to the root component at runtime (after deserialization)
    // This avoids "PerspectiveCamera is not serializable" errors
    if (!this.camera.parent) {
      this.rootComponent.add(this.camera);
    }
    
    // Apply initial camera properties from options
    this.setFOV(this.options.fov!);
    this.setNear(this.options.near!);
    this.setFar(this.options.far!);
    this.setZoom(this.options.zoom!);
    
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
      console.log('Camera FOV:', this.camera.fov, '°');
      console.log('Camera Near:', this.camera.near);
      console.log('Camera Far:', this.camera.far);
      console.log('Camera Zoom:', this.camera.zoom);
      console.log('Camera Options:', this.options);
      console.log('=========================');
    }
  }
}

