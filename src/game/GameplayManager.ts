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
  private cropsWithCrows: Map<ENGINE.Actor, Set<CrowActor>> = new Map(); // Track which crops have crows
  private pausedCrows: CrowActor[] = []; // Crows waiting for crops to become available
  private waveStartTime: number = 0; // When current wave started
  private waveTimeoutTimer: any = null; // Timer for wave timeout (2x wave duration)
  private totalCrowsToSpawn: number = 0; // Total crows for current wave
  private crowsSpawnedThisWave: number = 0; // How many crows have been spawned so far
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
    
    // Record wave start time
    const world = this.getWorld();
    this.waveStartTime = world ? world.getGameTime() : 0;
    
    // Spawn crops at markers
    await this.spawnCropsAtMarkers(wave.cropCount);
    
    // Spawn birds over 1 minute
    const waveDuration = 60;
    this.spawnBirdsOverTime(wave.birdCount, wave.birdSpeed, waveDuration);
    
    // Start wave timeout timer (2x the wave duration)
    const timeoutDuration = waveDuration * 2;
    this.startWaveTimeout(timeoutDuration);
  }

  /**
   * Starts the wave timeout timer - if wave isn't complete within timeoutSeconds, game over
   */
  private startWaveTimeout(timeoutSeconds: number): void {
    const world = this.getWorld();
    if (!world) return;
    
    console.log(`[GameplayManager] ⏰ Wave timeout set to ${timeoutSeconds}s (2x wave duration)`);
    
    this.waveTimeoutTimer = world.timerSystem.setTimeout(() => {
      console.log(`[GameplayManager] ⏰⏰⏰ WAVE TIMEOUT EXCEEDED! ${timeoutSeconds}s elapsed - GAME OVER!`);
      this.handleWaveTimeout();
    }, timeoutSeconds);
  }

  /**
   * Handles wave timeout - destroys all crows and returns to main menu
   */
  private handleWaveTimeout(): void {
    console.log(`[GameplayManager] 💀 GAME OVER - Wave took too long!`);
    console.log(`[GameplayManager] 💀 Active crows: ${this.activeCrows.length}`);
    console.log(`[GameplayManager] 💀 Paused crows: ${this.pausedCrows.length}`);
    
    // Destroy all active crows
    const allCrows = [...this.activeCrows, ...this.pausedCrows];
    for (const crow of allCrows) {
      console.log(`[GameplayManager] 💀 Destroying crow "${crow.name}" due to timeout`);
      crow.destroy();
    }
    
    this.activeCrows = [];
    this.pausedCrows = [];
    
    // Show game over message
    this.showMessage('⏰ TIME\'S UP! GAME OVER ⏰', 5000);
    
    // Reset to main menu after message
    const world = this.getWorld();
    if (world) {
      world.timerSystem.setTimeout(() => {
        console.log(`[GameplayManager] 🔄 Returning to main menu...`);
        this.resetGame();
      }, 5.5);
    }
  }

  /**
   * Resets the game to initial state
   */
  private resetGame(): void {
    // Clear wave timeout timer
    if (this.waveTimeoutTimer) {
      const world = this.getWorld();
      if (world && world.timerSystem) {
        world.timerSystem.clearTimer(this.waveTimeoutTimer);
      }
      this.waveTimeoutTimer = null;
    }
    
    // Clear all crops
    for (const crop of this.spawnedCrops) {
      crop.destroy();
    }
    this.spawnedCrops = [];
    
    // Clear all tracking
    this.cropsWithCrows.clear();
    
    // Reset game state
    this.currentWaveIndex = 0;
    this.gameStarted = false;
    this.waveActive = false;
    
    // Reset spawn tracking
    this.totalCrowsToSpawn = 0;
    this.crowsSpawnedThisWave = 0;
    
    // Show start button again
    if (this.startButton) {
      this.startButton.style.display = 'block';
    }
    
    console.log(`[GameplayManager] 🔄 Game reset - ready to start again`);
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
    
    // Build list of available crop markers (only those with spawned crops)
    this.buildAvailableCropMarkersList();
  }

  /**
   * Builds a list of crop markers that have successfully spawned crops
   */
  private buildAvailableCropMarkersList(): void {
    const availableMarkers: CropMarkerActor[] = [];
    
    for (const marker of this.cropMarkers) {
      const spawnedCrop = marker.getSpawnedCrop();
      if (spawnedCrop) {
        availableMarkers.push(marker);
      }
    }
    
    console.log(`[GameplayManager] 📋 Available crop markers with spawned crops: ${availableMarkers.length}/${this.cropMarkers.length}`);
    
    // Log each available marker
    for (const marker of availableMarkers) {
      const crop = marker.getSpawnedCrop();
      const markerName = marker.editorData.displayName || marker.name;
      const cropName = crop?.editorData.displayName || crop?.name;
      console.log(`[GameplayManager]    ✅ ${markerName} → ${cropName}`);
    }
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

    // Initialize tracking set for this crop
    if (!this.cropsWithCrows.has(crop)) {
      this.cropsWithCrows.set(crop, new Set<CrowActor>());
    }

    // When bird enters trigger zone - turn it red and track it
    triggerZone.onActorEntered.add((actor: ENGINE.Actor) => {
      const crow = actor as CrowActor;
      if (crow instanceof CrowActor) {
        // Add crow to this crop's set
        const crowSet = this.cropsWithCrows.get(crop);
        if (crowSet) {
          crowSet.add(crow);
        }
        
        crow.setRedShader(true);
        console.log(`[GameplayManager] 🦅 Crow ENTERED TRIGGER of crop "${cropDisplayName}" (spawned at marker "${markerDisplayName}"): ${crow.name} | Crows on crop: ${crowSet?.size || 0}`);
      }
    });

    // When bird exits trigger zone - turn it back to normal and untrack it
    triggerZone.onActorExited.add((actor: ENGINE.Actor) => {
      const crow = actor as CrowActor;
      if (crow instanceof CrowActor) {
        // Remove crow from this crop's set
        const crowSet = this.cropsWithCrows.get(crop);
        if (crowSet) {
          crowSet.delete(crow);
        }
        
        crow.setRedShader(false);
        console.log(`[GameplayManager] 🦅 Crow EXITED TRIGGER of crop "${cropDisplayName}" (spawned at marker "${markerDisplayName}"): ${crow.name} | Crows on crop: ${crowSet?.size || 0}`);
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

    // Reset spawn tracking for this wave
    this.totalCrowsToSpawn = count;
    this.crowsSpawnedThisWave = 0;

    // Generate random spawn times within the duration
    const spawnTimes: number[] = [];
    
    // FIRST crow always spawns at exactly 5 seconds
    spawnTimes.push(5.0);
    
    // Rest spawn randomly within 30 seconds
    for (let i = 1; i < count; i++) {
      spawnTimes.push(Math.random() * 30);
    }
    
    // Sort spawn times so we can schedule them in order
    spawnTimes.sort((a, b) => a - b);
    
    console.log(`[GameplayManager] Random spawn times: ${spawnTimes.map(t => t.toFixed(2)).join(', ')}s`);
    console.log(`[GameplayManager] ⏱️  First crow spawns at exactly 5.00s`);
    
    // Schedule each bird spawn at its random time
    spawnTimes.forEach((time, index) => {
      world.timerSystem.setTimeout(() => {
        this.spawnBird(speed);
        this.crowsSpawnedThisWave++;
        console.log(`[GameplayManager] 📅 Bird ${index + 1}/${count} spawned at ${time.toFixed(2)}s | Total spawned: ${this.crowsSpawnedThisWave}/${this.totalCrowsToSpawn}`);
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
    
    // Subscribe to deadline expiration event
    crow.onDeadlineExpired.add((expiredCrow: CrowActor) => {
      this.handleCrowDeadline(expiredCrow);
    });
    
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
      
      // Track this crow as targeting this crop IMMEDIATELY (before it lands)
      if (!this.cropsWithCrows.has(randomCrop)) {
        this.cropsWithCrows.set(randomCrop, new Set<CrowActor>());
      }
      this.cropsWithCrows.get(randomCrop)!.add(crow);
      
      console.log(`[GameplayManager] 🐦 SPAWNED BIRD "${crow.name}" at spawner "${spawnerName}" (X:${spawnPos.x.toFixed(2)}, Y:${spawnPos.y.toFixed(2)}, Z:${spawnPos.z.toFixed(2)}) → targeting crop "${randomCropName}" at marker "${markerName}"`);
    } else {
      // No valid crop available - pause the crow's timer
      crow.pauseDeadlineTimer();
      this.pausedCrows.push(crow);
      console.log(`[GameplayManager] 🐦 SPAWNED BIRD "${crow.name}" at spawner "${spawnerName}" (X:${spawnPos.x.toFixed(2)}, Y:${spawnPos.y.toFixed(2)}, Z:${spawnPos.z.toFixed(2)}) → ⏸️ PAUSED (no valid crops available)`);
    }
    
    this.activeCrows.push(crow);
  }

  private findRandomCrop(): ENGINE.Actor | null {
    // Build list of currently valid crops (from markers that currently have crops spawned)
    const cropsFromValidMarkers: ENGINE.Actor[] = [];
    
    for (const marker of this.cropMarkers) {
      const spawnedCrop = marker.getSpawnedCrop();
      if (spawnedCrop && spawnedCrop.isPlaying()) {
        cropsFromValidMarkers.push(spawnedCrop);
      }
    }
    
    if (cropsFromValidMarkers.length === 0) {
      console.warn('[GameplayManager] ⚠️ No valid crops from markers available!');
      return null;
    }
    
    // Filter out crops that already have crows
    const emptyCrops = cropsFromValidMarkers.filter(crop => {
      const crowSet = this.cropsWithCrows.get(crop);
      return !crowSet || crowSet.size === 0;
    });
    
    // If no empty crops available, return null (crow will be paused)
    if (emptyCrops.length === 0) {
      console.warn('[GameplayManager] ⚠️ All crops are occupied - no empty crops available!');
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * emptyCrops.length);
    return emptyCrops[randomIndex];
  }

  private destroyCrow(crow: CrowActor): void {
    console.log(`[GameplayManager] 🧹 CLEANUP: Removing "${crow.name}" from all tracking systems`);
    
    // 1. Cancel any active timers on the crow
    crow.cancelDeadlineTimer();
    
    // 2. Remove from active crows list
    const index = this.activeCrows.indexOf(crow);
    if (index !== -1) {
      this.activeCrows.splice(index, 1);
      console.log(`[GameplayManager] 🧹 Removed from activeCrows list (${this.activeCrows.length} remaining)`);
    }
    
    // 3. Remove from paused crows list
    const pausedIndex = this.pausedCrows.indexOf(crow);
    if (pausedIndex !== -1) {
      this.pausedCrows.splice(pausedIndex, 1);
      console.log(`[GameplayManager] 🧹 Removed from pausedCrows list (${this.pausedCrows.length} remaining)`);
    }
    
    // 4. Remove from ALL crop tracking sets
    let removedFromCrops = 0;
    for (const [crop, crowSet] of this.cropsWithCrows) {
      if (crowSet.has(crow)) {
        crowSet.delete(crow);
        removedFromCrops++;
        console.log(`[GameplayManager] 🧹 Removed from crop "${crop.editorData.displayName || crop.name}" tracking`);
      }
    }
    
    if (removedFromCrops === 0) {
      console.log(`[GameplayManager] 🧹 Crow was not in any crop tracking sets`);
    }
    
    // 5. Destroy the actor (removes from world)
    crow.destroy();
    
    console.log(`[GameplayManager] ✅ CLEANUP COMPLETE for "${crow.name}"`);
  }

  private checkWaveComplete(): void {
    // Wave is complete when:
    // 1. All crows have been spawned (crowsSpawnedThisWave === totalCrowsToSpawn)
    // 2. All crows have been destroyed (activeCrows.length === 0 AND pausedCrows.length === 0)
    const allCrowsSpawned = this.crowsSpawnedThisWave >= this.totalCrowsToSpawn;
    const allCrowsDestroyed = this.activeCrows.length === 0 && this.pausedCrows.length === 0;
    
    if (allCrowsSpawned && allCrowsDestroyed && this.waveActive) {
      this.waveActive = false;
      this.currentWaveIndex++;
      
      // Clear wave timeout timer since wave is complete
      if (this.waveTimeoutTimer) {
        const world = this.getWorld();
        if (world && world.timerSystem) {
          world.timerSystem.clearTimer(this.waveTimeoutTimer);
        }
        this.waveTimeoutTimer = null;
        console.log(`[GameplayManager] ⏰ Wave timeout timer cleared - wave completed in time!`);
      }
      
      console.log(`[GameplayManager] ========== WAVE ${this.currentWaveIndex} COMPLETE ==========`);
      console.log(`[GameplayManager] 📊 Final stats: ${this.crowsSpawnedThisWave}/${this.totalCrowsToSpawn} crows spawned, all destroyed`);
      
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
    
    // Get crows currently on THIS specific crop (from our tracking map)
    const crowsOnThisCrop = this.cropsWithCrows.get(crop);
    const crowCount = crowsOnThisCrop ? crowsOnThisCrop.size : 0;

    console.log(`[GameplayManager] 🖱️ CLICK DETECTED on crop "${cropDisplayName}" (marker "${markerName}")`);
    console.log(`[GameplayManager] 📊 Crows on this crop: ${crowCount}`);

    if (crowsOnThisCrop && crowsOnThisCrop.size > 0) {
      console.log(`[GameplayManager] ✅ VALID CLICK - destroying ${crowsOnThisCrop.size} crow(s) on this crop`);
      
      // Destroy only the crows on THIS crop (make a copy of the set to avoid modification during iteration)
      const crowsToDestroy = Array.from(crowsOnThisCrop);
      for (const crow of crowsToDestroy) {
        console.log(`[GameplayManager] 💥 DESTROYING crow "${crow.name}"`);
        this.destroyCrow(crow); // Handles all cleanup including timer cancellation
      }
      
      // Try to assign paused crows to available crops
      this.tryAssignPausedCrows();
      
      this.checkWaveComplete();
    } else {
      console.log(`[GameplayManager] ❌ INVALID CLICK - No crows on this crop`);
    }
  }

  /**
   * Attempts to assign paused crows to newly available crops
   */
  private tryAssignPausedCrows(): void {
    if (this.pausedCrows.length === 0) return;

    const availableCropsCount = this.findRandomCrop() ? 1 : 0;
    if (availableCropsCount === 0) return;

    console.log(`[GameplayManager] 🔄 Attempting to assign ${this.pausedCrows.length} paused crow(s) to available crops...`);

    const crowsToAssign = [...this.pausedCrows];
    for (const crow of crowsToAssign) {
      const randomCrop = this.findRandomCrop();
      if (randomCrop) {
        // Find which marker spawned this crop
        let markerName = 'Unknown';
        for (const marker of this.cropMarkers) {
          const spawnedCrop = marker.getSpawnedCrop();
          if (spawnedCrop === randomCrop) {
            markerName = marker.editorData.displayName || marker.name;
            break;
          }
        }

        crow.setTargetCrop(randomCrop, markerName);
        crow.resumeDeadlineTimer();
        
        // Track this crow as targeting this crop IMMEDIATELY
        if (!this.cropsWithCrows.has(randomCrop)) {
          this.cropsWithCrows.set(randomCrop, new Set<CrowActor>());
        }
        this.cropsWithCrows.get(randomCrop)!.add(crow);
        
        // Remove from paused list
        const index = this.pausedCrows.indexOf(crow);
        if (index !== -1) {
          this.pausedCrows.splice(index, 1);
        }

        console.log(`[GameplayManager] ▶️ Assigned paused crow "${crow.name}" to crop "${randomCrop.editorData.displayName || randomCrop.name}" at marker "${markerName}"`);
      } else {
        // No more available crops
        break;
      }
    }
  }

  /**
   * Handles when a crow's 30-second deadline expires
   */
  private handleCrowDeadline(crow: CrowActor): void {
    console.log(`[GameplayManager] ⏰ DEADLINE EXPIRED for "${crow.name}" - crop eaten!`);
    
    // Find which crop this crow was targeting
    const targetCrop = crow.getTargetCrop();
    if (targetCrop) {
      const cropName = targetCrop.editorData.displayName || targetCrop.name;
      console.log(`[GameplayManager] 🌽 Crop "${cropName}" has been eaten!`);
      
      // Destroy the crop
      targetCrop.destroy();
      
      // Remove crop from our tracking
      const index = this.spawnedCrops.indexOf(targetCrop);
      if (index !== -1) {
        this.spawnedCrops.splice(index, 1);
      }
      this.cropsWithCrows.delete(targetCrop);
    }
    
    // Destroy the crow
    this.destroyCrow(crow);
    
    // Check if wave is complete
    this.checkWaveComplete();
  }

  protected override doEndPlay(): void {
    super.doEndPlay();
    
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
  }
}

