import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

/**
 * CropMarkerActor - Visual marker that indicates where crops will spawn at runtime
 * 
 * This actor serves as a placement guide in the editor and spawns the actual crop
 * prefab when the game starts. The marker itself is hidden during gameplay.
 */
@ENGINE.GameClass()
export class CropMarkerActor extends ENGINE.Actor {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
  } as const;

  private markerMesh: THREE.Mesh | null = null;
  private spawnedCrop: ENGINE.Actor | null = null;
  
  // Delegate that fires when crop is fully initialized and ready for interaction
  public readonly onCropReady = new ENGINE.Delegate<[ENGINE.Actor]>();

  constructor(options: ENGINE.ActorOptions = {}) {
    super(options);
    
    // Create a simple green box as a visual marker (50% smaller: 0.25m cube)
    const geometry = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00, 
      emissive: 0x00ff00,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.7
    });
    
    this.markerMesh = new THREE.Mesh(geometry, material);
    this.markerMesh.position.y = 0.125; // Offset so it sits on the ground (half of height)
    this.markerMesh.setTransient(true); // Don't serialize the mesh
    this.getRootComponent().add(this.markerMesh);
    
    // Set display name for editor
    this.editorData.displayName = 'CropMarker';
  }

  /**
   * Spawns the crop prefab at this marker's position
   */
  public async spawnCrop(): Promise<ENGINE.Actor | null> {
    if (this.spawnedCrop) {
      console.warn('[CropMarkerActor] Crop already spawned at this marker');
      return this.spawnedCrop;
    }

    const world = this.getWorld();
    if (!world) {
      console.error('[CropMarkerActor] Cannot spawn crop: no world');
      return null;
    }

    try {
      const position = this.getWorldPosition().clone();
      
      console.log(`[CropMarkerActor] Spawning crop at position:`, position);
      
      // Spawn the crop prefab using WorldCommands
      const cropActors = await ENGINE.WorldCommands.placePrefabs({
        world: world,
        prefabs: [
          {
            path: '@project/assets/prefab/crops/P_CropCorn_01.prefab.json',
            transform: {
              position: position,
              rotation: new THREE.Euler(0, 0, 0)
            }
          }
        ]
      });

      if (cropActors.length > 0) {
        this.spawnedCrop = cropActors[0];
        this.spawnedCrop.editorData.displayName = `Crop_${this.uuid.substring(0, 4)}`;
        
        console.log(`[CropMarkerActor] Successfully spawned crop: ${this.spawnedCrop.name}`);
        
        // Hide the marker mesh during gameplay
        if (this.markerMesh) {
          this.markerMesh.visible = false;
        }
        
        // Wait for the crop to be fully initialized (physics body created)
        // This happens during the actor's beginPlay phase
        this.waitForCropInitialization(this.spawnedCrop);
        
        return this.spawnedCrop;
      } else {
        console.error('[CropMarkerActor] Failed to spawn crop - no actors returned');
        return null;
      }
    } catch (error) {
      console.error('[CropMarkerActor] Error spawning crop:', error);
      return null;
    }
  }

  /**
   * Gets the spawned crop actor
   */
  public getSpawnedCrop(): ENGINE.Actor | null {
    return this.spawnedCrop;
  }

  /**
   * Waits for the crop to be fully initialized and fires the onCropReady delegate
   */
  private waitForCropInitialization(crop: ENGINE.Actor): void {
    const world = this.getWorld();
    if (!world) return;
    
    // Wait for next tick to ensure physics bodies are created during beginPlay
    world.runInNextTick(() => {
      const gltfComponent = crop.getComponent(ENGINE.GLTFMeshComponent);
      const triggerZone = crop.getComponent(ENGINE.TriggerZoneComponent);
      
      if (gltfComponent && triggerZone) {
        // Check if physics is enabled (means body was created)
        if (gltfComponent.isPhysicsEnabled()) {
          // Physics body is ready!
          console.log(`[CropMarkerActor] ✅ Crop "${crop.editorData.displayName || crop.name}" fully initialized and READY`);
          this.onCropReady.invoke(crop);
        } else {
          // Wait a bit longer for physics to initialize
          world.timerSystem.setTimeout(() => {
            console.log(`[CropMarkerActor] ✅ Crop "${crop.editorData.displayName || crop.name}" fully initialized and READY (delayed)`);
            this.onCropReady.invoke(crop);
          }, 0.1);
        }
      } else {
        console.warn(`[CropMarkerActor] Crop missing components - firing ready anyway`);
        this.onCropReady.invoke(crop);
      }
    });
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    // Marker is visible in editor, hidden in game until needed
    if (this.markerMesh) {
      this.markerMesh.visible = false;
    }
  }
}

