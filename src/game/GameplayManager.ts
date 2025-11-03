import * as ENGINE from 'genesys.js';
import * as THREE from 'three';
import { CropMarkerActor } from '../actors/CropMarkerActor.js';
import { CrowActor } from '../actors/CrowActor.js';
import { CrowSpawnerActor } from '../actors/CrowSpawnerActor.js';

/**
 * Wave configuration for the gameplay
 */
export interface WaveConfig {
  cropCount: number;
  birdCount: number;
  birdSpeed: number;
}

export interface GameplayManagerOptions extends ENGINE.ActorOptions {
  wave1?: THREE.Vector3; // X=CropNo, Y=CrowNo, Z=Speed
  wave2?: THREE.Vector3; // X=CropNo, Y=CrowNo, Z=Speed
  wave3?: THREE.Vector3; // X=CropNo, Y=CrowNo, Z=Speed
}

/**
 * GameplayManager - Main coordinator for the bird defense game
 * 
 * Manages waves, spawning crops at markers, spawning birds, and game flow.
 */
@ENGINE.GameClass()
export class GameplayManager extends ENGINE.Actor<GameplayManagerOptions> {
  static override readonly EDITOR_CLASS_META: ENGINE.EditorClassMeta = {
    ...ENGINE.Actor.EDITOR_CLASS_META,
    // Each wave is a Vector3: X=Crop No, Y=Crow No, Z=Speed
    wave1: {},
    wave2: {},
    wave3: {},
  } as const;

  static override get DEFAULT_OPTIONS(): GameplayManagerOptions {
    return {
      ...ENGINE.Actor.DEFAULT_OPTIONS,
      // Vector3: X=Crop No, Y=Crow No, Z=Speed
      wave1: new THREE.Vector3(2, 2, 1),
      wave2: new THREE.Vector3(2.5, 2.5, 1),
      wave3: new THREE.Vector3(3, 3, 1),
    };
  }

  private waves: WaveConfig[] = [];
  private currentWaveIndex: number = 0;
  private gameStarted: boolean = false;
  private waveActive: boolean = false;
  private cropMarkers: CropMarkerActor[] = [];
  private spawnedCrops: ENGINE.Actor[] = [];
  private activeCrows: CrowActor[] = [];
  private crowSpawners: CrowSpawnerActor[] = [];
  private uiContainer: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private messageOverlay: HTMLElement | null = null;

  constructor(options: GameplayManagerOptions = {}) {
    const mergedOptions = { ...GameplayManager.DEFAULT_OPTIONS, ...options };
    super(mergedOptions);
    
    // Build waves from Vector3 options (X=Crop No, Y=Crow No, Z=Speed)
    this.waves = [
      {
        cropCount: Math.round(mergedOptions.wave1!.x),
        birdCount: Math.round(mergedOptions.wave1!.y),
        birdSpeed: mergedOptions.wave1!.z,
      },
      {
        cropCount: Math.round(mergedOptions.wave2!.x),
        birdCount: Math.round(mergedOptions.wave2!.y),
        birdSpeed: mergedOptions.wave2!.z,
      },
      {
        cropCount: Math.round(mergedOptions.wave3!.x),
        birdCount: Math.round(mergedOptions.wave3!.y),
        birdSpeed: mergedOptions.wave3!.z,
      },
    ];
    
    this.editorData.displayName = 'GameplayManager';
  }

  private createUI(): void {
    const world = this.getWorld();
    if (!world) return;

    this.uiContainer = document.createElement('div');
    this.uiContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      font-family: Arial, sans-serif;
    `;

    // Start button
    this.startButton = document.createElement('button');
    this.startButton.textContent = 'START GAME';
    this.startButton.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 20px 40px;
      font-size: 24px;
      font-weight: bold;
      background: #00ff00;
      color: #000;
      border: 4px solid #000;
      border-radius: 10px;
      cursor: pointer;
      pointer-events: all;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      transition: all 0.2s;
    `;
    
    this.startButton.onmouseenter = () => {
      if (this.startButton) {
        this.startButton.style.background = '#00cc00';
        this.startButton.style.transform = 'translate(-50%, -50%) scale(1.05)';
      }
    };
    
    this.startButton.onmouseleave = () => {
      if (this.startButton) {
        this.startButton.style.background = '#00ff00';
        this.startButton.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    };
    
    this.startButton.onclick = () => this.startGame();
    this.startButton.ontouchstart = (e) => {
      e.preventDefault();
      this.startGame();
    };

    // Message overlay
    this.messageOverlay = document.createElement('div');
    this.messageOverlay.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 30px 60px;
      font-size: 32px;
      font-weight: bold;
      background: rgba(0, 0, 0, 0.9);
      color: #ffff00;
      border: 4px solid #ffff00;
      border-radius: 15px;
      text-align: center;
      display: none;
      pointer-events: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.8);
    `;

    this.uiContainer.appendChild(this.startButton);
    this.uiContainer.appendChild(this.messageOverlay);
    world.gameContainer.appendChild(this.uiContainer);
  }

  private showMessage(text: string, duration: number = 3000): void {
    if (!this.messageOverlay) return;
    
    this.messageOverlay.textContent = text;
    this.messageOverlay.style.display = 'block';
    
    setTimeout(() => {
      if (this.messageOverlay) {
        this.messageOverlay.style.display = 'none';
      }
    }, duration);
  }

  private startGame(): void {
    if (this.gameStarted) return;
    
    console.log('[GameplayManager] ========== GAME STARTED ==========');
    this.gameStarted = true;
    
    // Find all crow spawners in the scene
    const world = this.getWorld();
    if (world) {
      this.crowSpawners = world.getActors(CrowSpawnerActor);
      console.log(`[GameplayManager] Found ${this.crowSpawners.length} crow spawners in scene`);
      
      if (this.crowSpawners.length === 0) {
        console.warn('[GameplayManager] ⚠️ No CrowSpawnerActor found in scene! Please place some in the editor.');
      }
    }
    
    if (this.startButton) {
      this.startButton.style.display = 'none';
    }
    
    this.startNextWave();
  }

  private async startNextWave(): Promise<void> {
    if (this.currentWaveIndex >= this.waves.length) {
      console.log('[GameplayManager] ========== ALL WAVES COMPLETED! ==========');
      this.showMessage('🎉 YOU WIN! 🎉', 5000);
      return;
    }

    const wave = this.waves[this.currentWaveIndex];
    this.waveActive = true;
    
    console.log(`[GameplayManager] ========== WAVE ${this.currentWaveIndex + 1} START ==========`);
    console.log(`[GameplayManager] Wave ${this.currentWaveIndex + 1} Config: ${wave.cropCount} crops, ${wave.birdCount} birds, ${wave.birdSpeed} speed`);
    
    // Spawn crops at markers
    await this.spawnCropsAtMarkers(wave.cropCount);
    
    // Spawn birds over 1 minute
    this.spawnBirdsOverTime(wave.birdCount, wave.birdSpeed, 60);
  }

  private async spawnCropsAtMarkers(count: number): Promise<void> {
    const world = this.getWorld();
    if (!world) return;

    // Find all crop markers in the scene
    this.cropMarkers = world.getActors(CropMarkerActor);
    
    if (this.cropMarkers.length === 0) {
      console.error('[GameplayManager] No CropMarker actors found in scene!');
      return;
    }

    const markersToUse = this.cropMarkers.slice(0, Math.min(count, this.cropMarkers.length));
    
    console.log(`[GameplayManager] Spawning ${markersToUse.length} crops at markers`);
    
    // Track how many crops are initialized
    let cropsInitialized = 0;
    const totalCrops = markersToUse.length;
    
    // Promise that resolves when all crops are ready
    const allCropsReady = new Promise<void>((resolve) => {
      for (const marker of markersToUse) {
        marker.spawnCrop().then((crop) => {
          if (crop) {
            this.spawnedCrops.push(crop);
            
            // Subscribe to the crop ready event - fires when physics body is initialized
            marker.onCropReady.add((readyCrop: ENGINE.Actor) => {
              cropsInitialized++;
              console.log(`[GameplayManager] 📊 Crop initialized: ${cropsInitialized}/${totalCrops}`);
              
              this.setupCropInteraction(readyCrop, marker);
              
              // Check if all crops are ready
              if (cropsInitialized === totalCrops) {
                console.log(`[GameplayManager] ✅ ALL ${totalCrops} CROPS INITIALIZED AND READY!`);
                resolve();
              }
            });
          }
        });
      }
    });
    
    // Wait for all crops to be initialized before continuing
    await allCropsReady;
    
    console.log(`[GameplayManager] Successfully spawned and initialized ${this.spawnedCrops.length} crops`);
  }

  private setupCropInteraction(crop: ENGINE.Actor, marker: CropMarkerActor): void {
    const triggerZone = crop.getComponent(ENGINE.TriggerZoneComponent);
    
    if (!triggerZone) {
      console.warn(`[GameplayManager] Crop has no TriggerZoneComponent: ${crop.name}`);
      return;
    }

    const markerDisplayName = marker.editorData.displayName || marker.name;
    const cropDisplayName = crop.editorData.displayName || crop.name;
    
    console.log(`[GameplayManager] ✅ Setting up interaction for crop "${cropDisplayName}" at marker "${markerDisplayName}"`);

    // When bird enters trigger zone - turn it red
    triggerZone.onActorEntered.add((actor: ENGINE.Actor) => {
      const crow = actor as CrowActor;
      if (crow instanceof CrowActor) {
        crow.setRedShader(true);
        console.log(`[GameplayManager] 🦅 Crow ENTERED TRIGGER of crop "${cropDisplayName}" (spawned at marker "${markerDisplayName}"): ${crow.name}`);
      }
    });

    // When bird exits trigger zone - turn it back to normal
    triggerZone.onActorExited.add((actor: ENGINE.Actor) => {
      const crow = actor as CrowActor;
      if (crow instanceof CrowActor) {
        crow.setRedShader(false);
        console.log(`[GameplayManager] 🦅 Crow EXITED TRIGGER of crop "${cropDisplayName}" (spawned at marker "${markerDisplayName}"): ${crow.name}`);
      }
    });

    // Note: onClicked only works in editor, not in play mode
    // We handle clicks manually in setupInputHandling()
  }

  private spawnBirdsOverTime(count: number, speed: number, durationSeconds: number): void {
    // Speed affects spawn rate: higher speed = faster spawning
    const adjustedDuration = durationSeconds / speed;
    
    console.log(`[GameplayManager] Spawning ${count} birds randomly over ${adjustedDuration.toFixed(1)} seconds (speed multiplier: ${speed}x)`);
    
    const world = this.getWorld();
    if (!world) return;

    // Generate random spawn times within the duration
    const spawnTimes: number[] = [];
    for (let i = 0; i < count; i++) {
      spawnTimes.push(Math.random() * adjustedDuration);
    }
    
    // Sort spawn times so we can schedule them in order
    spawnTimes.sort((a, b) => a - b);
    
    console.log(`[GameplayManager] Random spawn times: ${spawnTimes.map(t => t.toFixed(2)).join(', ')}s`);
    
    // Schedule each bird spawn at its random time
    spawnTimes.forEach((time, index) => {
      world.timerSystem.setTimeout(() => {
        this.spawnBird(speed);
        console.log(`[GameplayManager] 📅 Bird ${index + 1}/${count} spawned at ${time.toFixed(2)}s`);
      }, time);
    });
  }

  private async spawnBird(speed: number): Promise<void> {
    const world = this.getWorld();
    if (!world) return;

    // Check if we have any spawners
    if (this.crowSpawners.length === 0) {
      console.warn('[GameplayManager] ⚠️ Cannot spawn crow - no CrowSpawnerActor in scene!');
      return;
    }

    // Pick a random spawner
    const randomSpawner = this.crowSpawners[Math.floor(Math.random() * this.crowSpawners.length)];
    const spawnPos = randomSpawner.getSpawnPosition();
    const spawnerName = randomSpawner.editorData.displayName || randomSpawner.name;
    
    // Create CrowActor at spawner position
    const crow = new CrowActor({
      position: spawnPos
    });
    
    world.addActor(crow);
    crow.setDescendSpeed(speed);
    
    // Assign RANDOM crop to target
    const randomCrop = this.findRandomCrop();
    const randomCropName = randomCrop?.editorData.displayName || randomCrop?.name;
    
    // Find which marker spawned this crop
    let markerName = 'Unknown';
    for (const marker of this.cropMarkers) {
      const spawnedCrop = marker.getSpawnedCrop();
      if (spawnedCrop === randomCrop) {
        markerName = marker.editorData.displayName || marker.name;
        break;
      }
    }
    
    if (randomCrop) {
      crow.setTargetCrop(randomCrop, markerName);
    }
    
    this.activeCrows.push(crow);
    
    console.log(`[GameplayManager] 🐦 SPAWNED BIRD "${crow.name}" at spawner "${spawnerName}" (X:${spawnPos.x.toFixed(2)}, Y:${spawnPos.y.toFixed(2)}, Z:${spawnPos.z.toFixed(2)}) → targeting crop "${randomCropName}" at marker "${markerName}"`);
  }

  private findRandomCrop(): ENGINE.Actor | null {
    if (this.spawnedCrops.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * this.spawnedCrops.length);
    return this.spawnedCrops[randomIndex];
  }

  private destroyCrow(crow: CrowActor): void {
    const index = this.activeCrows.indexOf(crow);
    if (index !== -1) {
      this.activeCrows.splice(index, 1);
    }
    crow.destroy();
  }

  private checkWaveComplete(): void {
    if (this.activeCrows.length === 0 && this.waveActive) {
      this.waveActive = false;
      this.currentWaveIndex++;
      
      console.log(`[GameplayManager] ========== WAVE ${this.currentWaveIndex} COMPLETE ==========`);
      
      if (this.currentWaveIndex < this.waves.length) {
        this.showMessage('WELL DONE! But More are coming!!', 3000);
        
        // Clear crops
        for (const crop of this.spawnedCrops) {
          crop.destroy();
        }
        this.spawnedCrops = [];
        
        // Start next wave after message
        setTimeout(() => this.startNextWave(), 3500);
      } else {
        this.showMessage('🎉 YOU WIN! 🎉', 5000);
      }
    }
  }

  protected override doBeginPlay(): void {
    super.doBeginPlay();
    this.createUI();
    this.setupInputHandling();
  }

  private setupInputHandling(): void {
    const world = this.getWorld();
    if (!world) return;

    // Listen for clicks/taps on the game container
    const container = world.gameContainer;
    if (!container) return;

    const handleClick = (event: MouseEvent | TouchEvent) => {
      if (!this.gameStarted || !this.waveActive) return;

      // Get click position
      let clientX: number, clientY: number;
      if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else {
        if (event.touches.length === 0) return;
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
      }

      // Raycast from camera through click position
      const camera = world.getActiveCamera();
      if (!camera) return;

      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      // Check each crop's trigger zone to see if we hit it
      for (const crop of this.spawnedCrops) {
        const triggerZone = crop.getComponent(ENGINE.TriggerZoneComponent);
        if (!triggerZone) continue;

        // Get the trigger zone's world position and size
        const worldPos = triggerZone.getWorldPosition();
        const size = triggerZone.getSize();
        
        // Create bounding box from world position and size
        const halfSize = size.clone().multiplyScalar(0.5);
        const box = new THREE.Box3(
          worldPos.clone().sub(halfSize),
          worldPos.clone().add(halfSize)
        );

        // Check if ray intersects the box
        const intersection = new THREE.Vector3();
        if (raycaster.ray.intersectBox(box, intersection)) {
          this.handleCropClick(crop);
          break; // Only handle first crop hit
        }
      }
    };

    container.addEventListener('click', handleClick);
    container.addEventListener('touchstart', handleClick);

    console.log('[GameplayManager] 🖱️ Input handling set up - clicks on trigger zones enabled');
  }

  private handleCropClick(crop: ENGINE.Actor): void {
    // Find which marker spawned this crop
    let markerName = 'Unknown';
    for (const marker of this.cropMarkers) {
      if (marker.getSpawnedCrop() === crop) {
        markerName = marker.editorData.displayName || marker.name;
        break;
      }
    }

    const cropDisplayName = crop.editorData.displayName || crop.name;
    
    // Find red crows (crows with red shader active = in trigger zone)
    const redCrows: CrowActor[] = [];
    for (const crow of this.activeCrows) {
      if (crow.getIsRedShader()) {
        redCrows.push(crow);
      }
    }

    console.log(`[GameplayManager] 🖱️ CLICK DETECTED on crop "${cropDisplayName}" (marker "${markerName}")`);
    console.log(`[GameplayManager] 📊 Red crows in game: ${redCrows.length}`);

    if (redCrows.length > 0) {
      console.log(`[GameplayManager] ✅ VALID CLICK - destroying ${redCrows.length} red crows`);
      
      for (const crow of redCrows) {
        console.log(`[GameplayManager] 💥 DESTROYING crow "${crow.name}"`);
        this.destroyCrow(crow);
      }
      
      this.checkWaveComplete();
    } else {
      console.log(`[GameplayManager] ❌ INVALID CLICK - No red crows anywhere`);
    }
  }

  protected override doEndPlay(): void {
    super.doEndPlay();
    
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
  }
}

