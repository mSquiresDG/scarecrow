import * as ENGINE from 'genesys.js';
import * as THREE from 'three';

/**
 * CrowSpawnerActor - Editor-placed actor that defines spawn points for crows
 * Place these in the scene to control where crows spawn from
 */
@ENGINE.GameClass()
export class CrowSpawnerActor extends ENGINE.Actor {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
  } as const;

  private markerMesh: THREE.Mesh | null = null;

  constructor(options: ENGINE.ActorOptions = {}) {
    super(options);

    // Create a visual marker for the editor (blue sphere at Y=2 to show crow spawn height)
    const geometry = new THREE.SphereGeometry(0.15, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0000ff, // Blue
      emissive: 0x0000ff,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7
    });
    
    this.markerMesh = new THREE.Mesh(geometry, material);
    this.markerMesh.position.y = 2.0; // Position at crow spawn height
    this.markerMesh.setTransient(true); // Don't save this mesh
    this.getRootComponent().add(this.markerMesh);

    this.editorData.displayName = 'CrowSpawner';
  }

  /**
   * Get the spawn position for a crow (at Y=2)
   */
  public getSpawnPosition(): THREE.Vector3 {
    const worldPos = this.getWorldPosition();
    // Crows always spawn at Y=2
    return new THREE.Vector3(worldPos.x, 2.0, worldPos.z);
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    // Hide the marker mesh during gameplay
    if (this.markerMesh) {
      this.markerMesh.visible = false;
    }
  }
}

