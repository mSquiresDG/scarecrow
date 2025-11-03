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
  private spawnTime: number = 0; // Track when bird spawned

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
    
    this.editorData.displayName = 'Crow';
  }

  /**
   * Sets the target crop this crow should fly towards
   */
  public setTargetCrop(crop: ENGINE.Actor, markerName: string = ''): void {
    this.targetCrop = crop;
    this.targetCropMarker = markerName;
    if (crop) {
      console.log(`[CrowActor] ${this.name} targeting crop: ${crop.name} at marker: ${markerName}`);
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
    const targetPos = this.targetCrop.getWorldPosition();
    
    // Calculate horizontal distance to target
    const horizontalDirection = new THREE.Vector3(
      targetPos.x - currentPos.x,
      0,
      targetPos.z - currentPos.z
    );
    const horizontalDistance = horizontalDirection.length();
    
    // Move toward target horizontally (fly there first)
    if (horizontalDistance > 0.3) {
      // Still flying to the crop - move horizontally only
      horizontalDirection.normalize();
      const newPos = currentPos.clone();
      newPos.x += horizontalDirection.x * this.descendSpeed * deltaTime;
      newPos.z += horizontalDirection.z * this.descendSpeed * deltaTime;
      // Keep same height while flying
      
      this.setWorldPosition(newPos);
    } else {
      // Above target crop - now descend straight down
      const newPos = currentPos.clone();
      newPos.y -= this.descendSpeed * deltaTime;
      this.setWorldPosition(newPos);
      
      // Check if landed (y <= 0.05)
      if (newPos.y <= 0.05) {
        this.isLanded = true;
        // Snap to ground
        newPos.y = 0.05;
        this.setWorldPosition(newPos);
        
        // Calculate time taken
        const world = this.getWorld();
        const currentTime = world ? world.getGameTime() : 0;
        const timeTaken = currentTime - this.spawnTime;
        
        console.log(`[CrowActor] 🦅 ${this.name} LANDED at crop "${this.targetCrop.name}" (marker "${this.targetCropMarker}") - Time taken: ${timeTaken.toFixed(2)}s`);
      }
    }
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    
    // Record spawn time
    const world = this.getWorld();
    this.spawnTime = world ? world.getGameTime() : 0;
    
    // GLTF component is already set in constructor
    if (!this.gltfComponent) {
      console.error('[CrowActor] No GLTFMeshComponent found!');
    }
  }
}

