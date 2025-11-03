import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

/**
 * ScarecrowWatcherActor - Rotates to face crops when clicked, then returns to original position
 * 
 * This actor handles the scarecrow's looking behavior:
 * - Rotates to face a crop when it's clicked (fast-to-slow curve)
 * - Holds the look for a duration
 * - Returns to original position after 5 seconds (slow-to-fast curve)
 */
@ENGINE.GameClass()
export class ScarecrowWatcherActor extends ENGINE.Actor {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
  } as const;

  private originalRotation: THREE.Euler = new THREE.Euler(0, 0, 0);
  private targetRotation: number | null = null; // Target Y rotation in radians
  private currentRotation: number = 0; // Current Y rotation in radians
  private isRotating: boolean = false;
  private isReturning: boolean = false;
  private rotationProgress: number = 0; // 0 to 1
  private rotationSpeed: number = 2.0; // How fast the rotation happens (progress per second)
  private returnTimer: any = null;
  private holdDuration: number = 5.0; // Seconds to hold the look before returning

  constructor(options: ENGINE.ActorOptions = {}) {
    super(options);
    
    this.editorData.displayName = 'ScarecrowWatcher';
    
    // Create root component with the stick model
    const stickMesh = new ENGINE.GLTFMeshComponent({
      modelUrl: '@project/assets/models/scareCrow/SM_ScareCrow_Stick.glb'
    });
    this.setRootComponent(stickMesh, true);
    
    // Add shirt as child
    const shirtMesh = new ENGINE.GLTFMeshComponent({
      modelUrl: '@project/assets/models/scareCrow/SM_ScareCrow_Tshirt.glb'
    });
    shirtMesh.position.set(0, 0.6, 0);
    stickMesh.add(shirtMesh);
    
    // Add head as child
    const headMesh = new ENGINE.GLTFMeshComponent({
      modelUrl: '@project/assets/models/scareCrow/SM_Scarecrow_Head.glb'
    });
    headMesh.position.set(0, 1.1, 0);
    stickMesh.add(headMesh);
    
    // Add hat as child
    const hatMesh = new ENGINE.GLTFMeshComponent({
      modelUrl: '@project/assets/models/scareCrow/SM_ScareCrow_Hat.glb'
    });
    hatMesh.position.set(0, 1.1, 0);
    stickMesh.add(hatMesh);
    
    console.log('[ScarecrowWatcher] 🎨 Loaded scarecrow meshes (stick, shirt, head, hat)');
    
    // Store original rotation on creation
    const rootComponent = this.getRootComponent();
    if (rootComponent) {
      this.originalRotation = rootComponent.rotation.clone();
      this.currentRotation = this.originalRotation.y;
    }
  }

  /**
   * Called when a crop is clicked - rotates to face the crop
   */
  public lookAtCrop(cropPosition: THREE.Vector3): void {
    console.log('[ScarecrowWatcher] 👀 Looking at crop position:', cropPosition);
    
    const myPos = this.getWorldPosition();
    
    // Calculate direction to crop
    const direction = new THREE.Vector2(
      cropPosition.x - myPos.x,
      cropPosition.z - myPos.z
    );
    
    // Calculate target angle (atan2 gives us the angle in radians)
    // We use atan2(x, z) because in Three.js, forward is -Z, and we want to rotate around Y
    this.targetRotation = Math.atan2(direction.x, direction.y);
    
    console.log(`[ScarecrowWatcher] 🎯 Current rotation: ${(this.currentRotation * 180 / Math.PI).toFixed(1)}°`);
    console.log(`[ScarecrowWatcher] 🎯 Target rotation: ${(this.targetRotation * 180 / Math.PI).toFixed(1)}°`);
    
    // Cancel return timer if we're already looking somewhere
    if (this.returnTimer) {
      const world = this.getWorld();
      if (world && world.timerSystem) {
        world.timerSystem.clearTimer(this.returnTimer);
        this.returnTimer = null;
      }
    }
    
    // Start rotation
    this.isRotating = true;
    this.isReturning = false;
    this.rotationProgress = 0;
    
    console.log(`[ScarecrowWatcher] ▶️ Starting rotation animation (fast-to-slow curve)`);
  }

  /**
   * Returns the scarecrow to its original rotation
   */
  private returnToOriginal(): void {
    console.log('[ScarecrowWatcher] 🔄 Returning to original rotation');
    
    this.targetRotation = this.originalRotation.y;
    this.isReturning = true;
    this.isRotating = true;
    this.rotationProgress = 0;
    
    console.log(`[ScarecrowWatcher] 🔄 Target: ${(this.targetRotation * 180 / Math.PI).toFixed(1)}° (original position)`);
  }

  /**
   * Ease-in-out cubic curve for smooth rotation
   * Fast at start/end, slow in middle
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Normalize angle to -PI to PI range
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /**
   * Calculate shortest rotation direction
   */
  private getShortestRotation(from: number, to: number): number {
    let delta = to - from;
    delta = this.normalizeAngle(delta);
    return delta;
  }

  public override tickPrePhysics(deltaTime: number): void {
    super.tickPrePhysics(deltaTime);
    
    if (!this.isRotating || this.targetRotation === null) return;
    
    // Update progress
    this.rotationProgress += deltaTime * this.rotationSpeed;
    
    if (this.rotationProgress >= 1.0) {
      // Rotation complete
      this.rotationProgress = 1.0;
      this.currentRotation = this.targetRotation;
      this.isRotating = false;
      
      const rootComponent = this.getRootComponent();
      if (rootComponent) {
        rootComponent.rotation.y = this.currentRotation;
      }
      
      console.log(`[ScarecrowWatcher] ✅ Rotation complete: ${(this.currentRotation * 180 / Math.PI).toFixed(1)}°`);
      
      // If we just finished looking at a crop (not returning), start the return timer
      if (!this.isReturning) {
        console.log(`[ScarecrowWatcher] ⏰ Starting ${this.holdDuration}s hold timer before returning`);
        
        const world = this.getWorld();
        if (world) {
          this.returnTimer = world.timerSystem.setTimeout(() => {
            this.returnToOriginal();
          }, this.holdDuration);
        }
      } else {
        console.log(`[ScarecrowWatcher] 🏠 Back to original position`);
        this.isReturning = false;
      }
      
      return;
    }
    
    // Apply easing curve
    const easedProgress = this.easeInOutCubic(this.rotationProgress);
    
    // Calculate shortest rotation path
    const startRotation = this.isReturning 
      ? this.currentRotation 
      : (this.getRootComponent()?.rotation.y || 0);
    
    const rotationDelta = this.getShortestRotation(startRotation, this.targetRotation);
    const newRotation = startRotation + rotationDelta * easedProgress;
    
    this.currentRotation = newRotation;
    
    // Apply to root component
    const rootComponent = this.getRootComponent();
    if (rootComponent) {
      rootComponent.rotation.y = this.currentRotation;
    }
    
    // Debug logging every 0.5 seconds of progress
    const logInterval = 0.25;
    const currentLogStep = Math.floor(this.rotationProgress / logInterval);
    const previousLogStep = Math.floor((this.rotationProgress - deltaTime * this.rotationSpeed) / logInterval);
    
    if (currentLogStep > previousLogStep) {
      const percentComplete = (this.rotationProgress * 100).toFixed(0);
      const currentDegrees = (this.currentRotation * 180 / Math.PI).toFixed(1);
      const action = this.isReturning ? '🔄 Returning' : '👀 Looking';
      console.log(`[ScarecrowWatcher] ${action}: ${percentComplete}% complete | Current: ${currentDegrees}°`);
    }
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    
    // Store original rotation when play begins
    const rootComponent = this.getRootComponent();
    if (rootComponent) {
      this.originalRotation = rootComponent.rotation.clone();
      this.currentRotation = this.originalRotation.y;
      
      console.log('[ScarecrowWatcher] 🎬 BeginPlay - Original rotation stored:', {
        x: (this.originalRotation.x * 180 / Math.PI).toFixed(1),
        y: (this.originalRotation.y * 180 / Math.PI).toFixed(1),
        z: (this.originalRotation.z * 180 / Math.PI).toFixed(1)
      });
    }
  }

  protected override doEndPlay(): void {
    super.doEndPlay();
    
    // Clear return timer
    if (this.returnTimer) {
      const world = this.getWorld();
      if (world && world.timerSystem) {
        world.timerSystem.clearTimer(this.returnTimer);
        this.returnTimer = null;
      }
    }
    
    console.log('[ScarecrowWatcher] 🛑 EndPlay - Cleanup complete');
  }
}

