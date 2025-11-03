import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

/**
 * CrowActor - Bird that descends from the sky and lands on crops
 * 
 * The crow flies down from a starting height, moves toward a target crop,
 * and changes to a red shader when overlapping the crop's trigger zone.
 */
@ENGINE.GameClass()
export class CrowActor extends ENGINE.Actor {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
  } as const;

  private targetCrop: ENGINE.Actor | null = null;
  private targetCropMarker: string = ''; // Store the marker name for debug
  private isLanded: boolean = false;
  private isRed: boolean = false;
  private descendSpeed: number = 2.0; // units per second
  private originalMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();
  private redMaterial: THREE.MeshStandardMaterial;
  private gltfComponent: ENGINE.GLTFMeshComponent | null = null;
  private animComponent: ENGINE.AnimationComponent | null = null;
  private spawnTime: number = 0; // Track when bird spawned
  private deadlineTimer: any = null; // Timer handle for 30-second deadline
  private deadlineTimerPaused: boolean = false; // Whether the deadline timer is paused
  private deadlineRemainingTime: number = 0; // Remaining time on paused timer
  public readonly onDeadlineExpired = new ENGINE.Delegate<[CrowActor]>(); // Callback when time runs out

  constructor(options: ENGINE.ActorOptions = {}) {
    super(options);
    
    // Create the red material for when overlapping
    this.redMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.3
    });
    
    // Load the crow model with physics enabled for trigger detection
    const gltfMesh = new ENGINE.GLTFMeshComponent({
      modelUrl: '@project/assets/models/SM_Crow_01.glb',
      physicsOptions: {
        enabled: true,
        motionType: ENGINE.PhysicsMotionType.KinematicPositionBased, // Kinematic so we can move it manually
        collisionMeshType: ENGINE.CollisionMeshType.BoundingBox,
        collisionProfile: ENGINE.DefaultCollisionProfile.Pawn, // Use Pawn profile so it can trigger with crops
        generateCollisionEvents: true // Enable collision events for trigger detection
      }
    });
    this.setRootComponent(gltfMesh, true);
    this.gltfComponent = gltfMesh;
    
    // Add animation component as child of GLTF mesh (same as prefab structure)
    const animComponent = new ENGINE.AnimationComponent({
      autoPlay: true,
      loopMode: 'LoopRepeat' // Loops the flight animation continuously
    });
    gltfMesh.add(animComponent);
    this.animComponent = animComponent;
    
    this.editorData.displayName = 'Crow';
  }

  /**
   * Sets the target crop this crow should fly towards
   */
  public setTargetCrop(crop: ENGINE.Actor, markerName: string = ''): void {
    this.targetCrop = crop;
    this.targetCropMarker = markerName;
    if (crop) {
      const crowPos = this.getWorldPosition();
      const targetPos = crop.getWorldPosition();
      const horizontalDistance = Math.sqrt(
        Math.pow(targetPos.x - crowPos.x, 2) + 
        Math.pow(targetPos.z - crowPos.z, 2)
      );
      const totalDistance = crowPos.distanceTo(targetPos);
      
      console.log(`[CrowActor] 🎯 ${this.name} targeting crop: ${crop.name} at marker: ${markerName}`);
      console.log(`[CrowActor]    📍 Crow start:   (${crowPos.x.toFixed(4)}, ${crowPos.y.toFixed(4)}, ${crowPos.z.toFixed(4)})`);
      console.log(`[CrowActor]    🎯 Target pivot:  (${targetPos.x.toFixed(4)}, ${targetPos.y.toFixed(4)}, ${targetPos.z.toFixed(4)})`);
      console.log(`[CrowActor]    📏 Horizontal distance: ${horizontalDistance.toFixed(2)}m | Total 3D distance: ${totalDistance.toFixed(2)}m`);
    }
  }

  /**
   * Gets the target crop
   */
  public getTargetCrop(): ENGINE.Actor | null {
    return this.targetCrop;
  }

  /**
   * Gets the target crop marker name
   */
  public getTargetCropMarker(): string {
    return this.targetCropMarker;
  }

  public getIsLanded(): boolean {
    return this.isLanded;
  }

  public getIsRedShader(): boolean {
    return this.isRed;
  }

  /**
   * Checks if the crow has landed
   */
  public hasLanded(): boolean {
    return this.isLanded;
  }

  /**
   * Sets the crow's shader to red (when overlapping crop)
   */
  public setRedShader(enabled: boolean): void {
    if (this.isRed === enabled) return;
    
    this.isRed = enabled;
    
    if (!this.gltfComponent) return;
    
    const meshes = this.gltfComponent.getAllMeshes();
    
    if (enabled) {
      // Store original materials and apply red
      for (const mesh of meshes) {
        if (!this.originalMaterials.has(mesh)) {
          this.originalMaterials.set(mesh, mesh.material);
        }
        mesh.material = this.redMaterial;
      }
      console.log(`[CrowActor] ${this.name} shader changed to RED`);
    } else {
      // Restore original materials
      for (const mesh of meshes) {
        const original = this.originalMaterials.get(mesh);
        if (original) {
          mesh.material = original;
        }
      }
      console.log(`[CrowActor] ${this.name} shader restored to ORIGINAL`);
    }
  }

  /**
   * Gets whether the crow has red shader active
   */
  public isRedShaderActive(): boolean {
    return this.isRed;
  }

  /**
   * Sets the descend speed
   */
  public setDescendSpeed(speed: number): void {
    this.descendSpeed = speed;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    
    if (this.isLanded || !this.targetCrop) return;
    
    const currentPos = this.getWorldPosition();
    const targetPos = this.targetCrop.getWorldPosition(); // Crop's root pivot position
    
    // Calculate direct 3D direction from current position to target
    const direction = new THREE.Vector3().subVectors(targetPos, currentPos);
    const distance = direction.length();
    
    // Threshold for arrival - very small for precision
    const arrivalThreshold = 0.05; // 5cm precision
    
    // Check if we've arrived
    if (distance <= arrivalThreshold) {
      this.isLanded = true;
      
      // Snap crow's root pivot EXACTLY to crop's root pivot
      const finalPos = targetPos.clone();
      this.setWorldPosition(finalPos);
      
      // Stop animation when landed
      if (this.animComponent) {
        this.animComponent.stopAnimation();
        console.log(`[CrowActor] ⏸️ Stopped flight animation for ${this.name}`);
      }
      
      // Calculate time taken and position accuracy
      const world = this.getWorld();
      const currentTime = world ? world.getGameTime() : 0;
      const timeTaken = currentTime - this.spawnTime;
      
      // Measure final position accuracy
      const finalCrowPos = this.getWorldPosition();
      const distanceError = finalCrowPos.distanceTo(targetPos);
      
      console.log(`[CrowActor] 🦅 ${this.name} LANDED at crop "${this.targetCrop.name}" (marker "${this.targetCropMarker}")`);
      console.log(`[CrowActor]    ⏱️  Time taken: ${timeTaken.toFixed(2)}s`);
      console.log(`[CrowActor]    🎯 Target pivot: (${targetPos.x.toFixed(4)}, ${targetPos.y.toFixed(4)}, ${targetPos.z.toFixed(4)})`);
      console.log(`[CrowActor]    📍 Crow pivot:   (${finalCrowPos.x.toFixed(4)}, ${finalCrowPos.y.toFixed(4)}, ${finalCrowPos.z.toFixed(4)})`);
      console.log(`[CrowActor]    📏 Position error: ${(distanceError * 100).toFixed(2)}cm`);
    } else {
      // Move in a straight line towards target (linear interpolation)
      direction.normalize();
      const moveDistance = this.descendSpeed * deltaTime;
      
      // Don't overshoot - clamp movement to remaining distance
      const actualMoveDistance = Math.min(moveDistance, distance);
      
      // Calculate new position by moving along the direction vector
      const newPos = currentPos.clone().add(direction.multiplyScalar(actualMoveDistance));
      this.setWorldPosition(newPos);
    }
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    
    // Record spawn time
    const world = this.getWorld();
    this.spawnTime = world ? world.getGameTime() : 0;
    
    // AnimationComponent is set to autoPlay in constructor, so animation starts automatically
    // Note: Deadline timer is now started by GameplayManager with adjusted time
  }

  /**
   * Starts a deadline timer - if crow not clicked within timeSeconds, callback fires
   */
  public startDeadlineTimer(timeSeconds: number): void {
    const world = this.getWorld();
    if (!world) return;
    
    this.deadlineRemainingTime = timeSeconds;
    this.deadlineTimerPaused = false;
    
    this.deadlineTimer = world.timerSystem.setTimeout(() => {
      console.log(`[CrowActor] ⏰ ${this.name} DEADLINE EXPIRED after ${timeSeconds}s - crop eaten!`);
      this.onDeadlineExpired.invoke(this);
    }, timeSeconds);
  }

  /**
   * Pauses the deadline timer (called when no valid crop is available)
   */
  public pauseDeadlineTimer(): void {
    if (this.deadlineTimer && !this.deadlineTimerPaused) {
      const world = this.getWorld();
      if (world && world.timerSystem) {
        // Cancel current timer
        world.timerSystem.clearTimer(this.deadlineTimer);
        this.deadlineTimer = null;
        this.deadlineTimerPaused = true;
        console.log(`[CrowActor] ⏸️ ${this.name} deadline timer PAUSED (no valid crop available)`);
      }
    }
  }

  /**
   * Resumes the deadline timer (called when a valid crop becomes available)
   */
  public resumeDeadlineTimer(): void {
    if (this.deadlineTimerPaused && this.deadlineRemainingTime > 0) {
      const world = this.getWorld();
      if (!world) return;
      
      this.deadlineTimerPaused = false;
      this.deadlineTimer = world.timerSystem.setTimeout(() => {
        console.log(`[CrowActor] ⏰ ${this.name} DEADLINE EXPIRED after resume - crop eaten!`);
        this.onDeadlineExpired.invoke(this);
      }, this.deadlineRemainingTime);
      
      console.log(`[CrowActor] ▶️ ${this.name} deadline timer RESUMED (${this.deadlineRemainingTime.toFixed(1)}s remaining)`);
    }
  }

  /**
   * Cancels the deadline timer (called when crow is clicked)
   */
  public cancelDeadlineTimer(): void {
    if (this.deadlineTimer) {
      const world = this.getWorld();
      if (world && world.timerSystem) {
        world.timerSystem.clearTimer(this.deadlineTimer);
      }
      this.deadlineTimer = null;
    }
    this.deadlineTimerPaused = false;
    this.deadlineRemainingTime = 0;
  }

  protected override doEndPlay(): void {
    super.doEndPlay();
    this.cancelDeadlineTimer();
  }
}

