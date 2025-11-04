import * as ENGINE from 'genesys.js';
import * as THREE from 'three';
import { CropMarkerActor } from '../actors/CropMarkerActor.js';
import { CrowActor } from '../actors/CrowActor.js';
import { CrowSpawnerActor } from '../actors/CrowSpawnerActor.js';
import { ScarecrowWatcherActor } from '../actors/ScarecrowWatcherActor.js';

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
  private scarecrowWatcher: ScarecrowWatcherActor | null = null; // Reference to scarecrow for rotation
  private cropsWithCrows: Map<ENGINE.Actor, Set<CrowActor>> = new Map(); // Track which crops have crows
  private pausedCrows: CrowActor[] = []; // Crows waiting for crops to become available
  private waveStartTime: number = 0; // When current wave started
  private waveTimeoutTimer: any = null; // Timer for wave timeout (2x wave duration)
  private totalCrowsToSpawn: number = 0; // Total crows for current wave
  private crowsSpawnedThisWave: number = 0; // How many crows have been spawned so far
  private currentWaveSpeed: number = 1.0; // Current wave's speed multiplier
  private allCropsEatenTimer: any = null; // Timer for when all crops are eaten
  private uiContainer: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private messageOverlay: HTMLElement | null = null;
  private birdCounter: HTMLElement | null = null;
  private birdCounterText: HTMLElement | null = null;
  private destroyedBirdsCount: number = 0;
  private cropCounter: HTMLElement | null = null;
  private cropCounterText: HTMLElement | null = null;
  private totalCropsCount: number = 0;
  private remainingCropsCount: number = 0;
  private countersContainer: HTMLElement | null = null;
  private cropPulseIntervals: Map<ENGINE.Actor, any> = new Map(); // Track pulsing intervals for crops

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

  private async createUI(): Promise<void> {
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

    // Start button with image logo - responsive sizing
    this.startButton = document.createElement('button');
    
    // Detect if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    const buttonScale = isMobile ? 0.5 : 1.0; // 50% smaller on mobile
    
    const buttonHTML = `
      <img src="@project/assets/textures/T_Startbutton02.png" alt="Start Game" style="
        max-width: ${300 * buttonScale}px;
        max-height: ${200 * buttonScale}px;
        filter: drop-shadow(3px 3px 6px rgba(0,0,0,0.4));
      ">
    `;
    
    // Resolve asset paths in the HTML
    this.startButton.innerHTML = await ENGINE.resolveAssetPathsInText(buttonHTML);
    
    this.startButton.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: transparent;
      border: none;
      cursor: pointer;
      pointer-events: all;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      animation: pulse 2s ease-in-out infinite;
      margin: 0;
      padding: 0;
    `;
    
    // Add CSS animation for pulsing
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.1);
        }
      }
      
      @keyframes pulse-hover {
        0%, 100% {
          transform: translate(-50%, -50%) scale(1.15);
        }
        50% {
          transform: translate(-50%, -50%) scale(1.25);
        }
      }
    `;
    document.head.appendChild(style);
    
    this.startButton.onmouseenter = () => {
      if (this.startButton) {
        this.startButton.style.animation = 'pulse-hover 1s ease-in-out infinite';
      }
    };
    
    this.startButton.onmouseleave = () => {
      if (this.startButton) {
        this.startButton.style.animation = 'pulse 2s ease-in-out infinite';
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

    // Create a single container for both counters
    this.countersContainer = document.createElement('div');
    this.countersContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      z-index: 1001;
      pointer-events: none;
    `;

    // Create crop counter (left side)
    this.cropCounter = document.createElement('div');
    const cropCounterHTML = `
      <div id="crop-counter-container" style="
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 2px;
        padding: 4px;
        background: transparent;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 8px;
        box-shadow: 0 0.3vh 1vh rgba(0,0,0,0.3);
        height: 7.5vh;
        width: 5vw;
        min-width: 60px;
        min-height: 75px;
        max-width: 100px;
        max-height: 120px;
        box-sizing: border-box;
        transition: all 0.3s ease;
      ">
        <img src="@project/assets/textures/T_Cob_01.png" alt="Crop" style="
          width: 32px;
          height: 90px;
          object-fit: contain;
          flex-shrink: 0;
        ">
        <span id="crop-count-text" style="
          font-size: 20px;
          font-weight: bold;
          color: white;
          text-align: right;
          flex-shrink: 0;
          transform: scaleY(4.5);
          margin-right: 2px;
        ">00</span>
      </div>
    `;
    
    // Resolve asset paths in the HTML
    this.cropCounter.innerHTML = await ENGINE.resolveAssetPathsInText(cropCounterHTML);
    
    // Get reference to the crop counter text element
    this.cropCounterText = this.cropCounter.querySelector('#crop-count-text');

    // Create bird counter (right side)
    this.birdCounter = document.createElement('div');
    const birdCounterHTML = `
      <div style="
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 2px;
        padding: 4px;
        background: transparent;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 8px;
        box-shadow: 0 0.3vh 1vh rgba(0,0,0,0.3);
        height: 7.5vh;
        width: 5vw;
        min-width: 60px;
        min-height: 75px;
        max-width: 100px;
        max-height: 120px;
        box-sizing: border-box;
      ">
        <img src="@project/assets/textures/UI_CrowFacing_01.png" alt="Bird" style="
          width: 32px;
          height: 90px;
          object-fit: contain;
          flex-shrink: 0;
        ">
        <span id="bird-count-text" style="
          font-size: 20px;
          font-weight: bold;
          color: white;
          text-align: right;
          flex-shrink: 0;
          transform: scaleY(4.5);
          margin-right: 2px;
        ">00</span>
      </div>
    `;
    
    // Resolve asset paths in the HTML
    this.birdCounter.innerHTML = await ENGINE.resolveAssetPathsInText(birdCounterHTML);
    
    // Get reference to the bird counter text element
    this.birdCounterText = this.birdCounter.querySelector('#bird-count-text');

    // Add both counters to the container
    this.countersContainer.appendChild(this.cropCounter);
    this.countersContainer.appendChild(this.birdCounter);

    this.uiContainer.appendChild(this.startButton);
    this.uiContainer.appendChild(this.messageOverlay);
    this.uiContainer.appendChild(this.countersContainer);
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
    
    // Reset bird counter
    this.destroyedBirdsCount = 0;
    this.updateBirdCounterDisplay();
    
    // Reset crop counter (will be set when crops spawn)
    this.totalCropsCount = 0;
    this.remainingCropsCount = 0;
    this.updateCropCounterDisplay();
    
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
    this.currentWaveSpeed = wave.birdSpeed; // Store current wave speed
    
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
    
    // Stop all crop pulsing
    this.stopAllCropPulsing();
    
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
    const world = this.getWorld();
    if (world && world.timerSystem) {
      // Clear wave timeout timer
      if (this.waveTimeoutTimer) {
        world.timerSystem.clearTimer(this.waveTimeoutTimer);
        this.waveTimeoutTimer = null;
      }
      // Clear all crops eaten timer
      if (this.allCropsEatenTimer) {
        world.timerSystem.clearTimer(this.allCropsEatenTimer);
        this.allCropsEatenTimer = null;
      }
    }
    
    // Clear all crops
    for (const crop of this.spawnedCrops) {
      crop.destroy();
    }
    this.spawnedCrops = [];
    
    // Clear all tracking
    this.cropsWithCrows.clear();
    
    // Stop all crop pulsing
    this.stopAllCropPulsing();
    
    // Reset game state
    this.currentWaveIndex = 0;
    this.gameStarted = false;
    this.waveActive = false;
    this.currentWaveSpeed = 1.0;
    
    // Reset spawn tracking
    this.totalCrowsToSpawn = 0;
    this.crowsSpawnedThisWave = 0;
    
    // Reset bird counter
    this.destroyedBirdsCount = 0;
    this.updateBirdCounterDisplay();
    
    // Reset crop counter
    this.totalCropsCount = 0;
    this.remainingCropsCount = 0;
    this.updateCropCounterDisplay();
    
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

    // Shuffle the markers array to randomize selection for each wave
    const shuffledMarkers = [...this.cropMarkers].sort(() => Math.random() - 0.5);
    const markersToUse = shuffledMarkers.slice(0, Math.min(count, shuffledMarkers.length));
    
    console.log(`[GameplayManager] 🎲 Randomly selected ${markersToUse.length} markers from ${this.cropMarkers.length} available`);
    
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
    
    // Initialize crop counter
    this.totalCropsCount = this.spawnedCrops.length;
    this.remainingCropsCount = this.totalCropsCount;
    this.updateCropCounterDisplay();
    
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
    
    // Clear any existing listeners first to prevent duplicates
    triggerZone.onActorEntered.clear();
    triggerZone.onActorExited.clear();

    // When bird enters trigger zone - turn it red and track it
    triggerZone.onActorEntered.add((actor: ENGINE.Actor) => {
      const crow = actor as CrowActor;
      if (crow instanceof CrowActor) {
        // Add crow to this crop's set
        const crowSet = this.cropsWithCrows.get(crop);
        if (crowSet) {
          crowSet.add(crow);
          
          // Start pulsing if this is the first crow on this crop
          if (crowSet.size === 1) {
            this.startCropPulsing(crop);
          }
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
          
          // Stop pulsing if no more crows on this crop
          if (crowSet.size === 0) {
            this.stopCropPulsing(crop);
          }
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
    
    // Start deadline timer with adjusted time (10 seconds / speed multiplier)
    const baseDeadline = 10.0; // Base deadline in seconds
    const adjustedDeadline = baseDeadline / this.currentWaveSpeed; // Higher speed = shorter deadline
    crow.startDeadlineTimer(adjustedDeadline);
    console.log(`[GameplayManager] ⏰ Crow deadline set to ${adjustedDeadline.toFixed(1)}s (base ${baseDeadline}s / speed ${this.currentWaveSpeed}x)`);
    
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
    
    // 5. Increment destroyed birds counter and update UI
    this.destroyedBirdsCount++;
    this.updateBirdCounterDisplay();
    
    // 6. Destroy the actor (removes from world)
    crow.destroy();
    
    console.log(`[GameplayManager] ✅ CLEANUP COMPLETE for "${crow.name}" | Total birds destroyed: ${this.destroyedBirdsCount}`);
  }

  /**
   * Updates the bird counter display with the current count
   */
  private updateBirdCounterDisplay(): void {
    if (this.birdCounterText) {
      // Format count as two digits (00, 01, 02, etc.)
      const formattedCount = this.destroyedBirdsCount.toString().padStart(2, '0');
      this.birdCounterText.textContent = formattedCount;
    }
  }

  /**
   * Updates the crop counter display with the current count
   */
  private updateCropCounterDisplay(): void {
    if (this.cropCounterText) {
      // Format count as two digits (00, 01, 02, etc.)
      const formattedCount = this.remainingCropsCount.toString().padStart(2, '0');
      this.cropCounterText.textContent = formattedCount;
    }
  }

  /**
   * Makes the crop counter flash red when crops are being eaten
   */
  private flashCropCounterRed(): void {
    if (!this.cropCounter) return;
    
    const container = this.cropCounter.querySelector('#crop-counter-container') as HTMLElement;
    if (!container) return;
    
    // Add red flash effect
    container.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    container.style.borderColor = 'red';
    container.style.transform = 'scale(1.1)';
    
    // Remove effect after 500ms
    setTimeout(() => {
      if (container) {
        container.style.backgroundColor = 'transparent';
        container.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        container.style.transform = 'scale(1)';
      }
    }, 500);
  }

  /**
   * Starts progressive pulsing for a crop that's being eaten
   */
  private startCropPulsing(crop: ENGINE.Actor): void {
    // Don't start if already pulsing
    if (this.cropPulseIntervals.has(crop)) return;
    
    const world = this.getWorld();
    if (!world) return;
    
    const startTime = world.getGameTime();
    const maxDuration = 10.0 / this.currentWaveSpeed; // Adjusted eating time
    
    const pulseInterval = setInterval(() => {
      const currentTime = world.getGameTime();
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / maxDuration, 1.0); // 0 to 1
      
      if (progress >= 1.0 || !this.cropCounter) {
        // Stop pulsing when complete or counter is gone
        this.stopCropPulsing(crop);
        return;
      }
      
      // Calculate pulse intensity based on progress
      // Subtle at start (0.1-0.3), aggressive near end (0.8-1.0)
      const baseIntensity = 0.1 + (progress * 0.7); // 0.1 to 0.8
      const pulseIntensity = baseIntensity + (Math.sin(Date.now() * 0.01) * 0.2); // Add oscillation
      
      // Calculate pulse speed - faster as it gets more urgent
      const pulseSpeed = 0.005 + (progress * 0.015); // 0.005 to 0.02
      
      if (this.cropCounter) {
        const container = this.cropCounter.querySelector('#crop-counter-container') as HTMLElement;
        if (container) {
          const redValue = Math.floor(255 * pulseIntensity);
          const alpha = 0.3 + (pulseIntensity * 0.5); // 0.3 to 0.8
          
          container.style.backgroundColor = `rgba(${redValue}, 0, 0, ${alpha})`;
          container.style.borderColor = `rgba(255, ${255 - redValue}, ${255 - redValue}, 1)`;
          
          // Scale effect gets more pronounced
          const scaleAmount = 1 + (pulseIntensity * 0.15); // 1.0 to 1.15
          container.style.transform = `scale(${scaleAmount})`;
        }
      }
    }, 50); // Update every 50ms for smooth animation
    
    this.cropPulseIntervals.set(crop, pulseInterval);
    console.log(`[GameplayManager] 🔴 Started progressive pulsing for crop being eaten`);
  }

  /**
   * Stops pulsing for a crop
   */
  private stopCropPulsing(crop: ENGINE.Actor): void {
    const interval = this.cropPulseIntervals.get(crop);
    if (interval) {
      clearInterval(interval);
      this.cropPulseIntervals.delete(crop);
      
      // Reset crop counter appearance
      if (this.cropCounter) {
        const container = this.cropCounter.querySelector('#crop-counter-container') as HTMLElement;
        if (container) {
          container.style.backgroundColor = 'transparent';
          container.style.borderColor = 'rgba(255, 255, 255, 0.8)';
          container.style.transform = 'scale(1)';
        }
      }
      
      console.log(`[GameplayManager] ⚪ Stopped pulsing for crop`);
    }
  }

  /**
   * Stops all crop pulsing (for cleanup)
   */
  private stopAllCropPulsing(): void {
    for (const [crop, interval] of this.cropPulseIntervals) {
      clearInterval(interval);
    }
    this.cropPulseIntervals.clear();
    
    // Reset crop counter appearance
    if (this.cropCounter) {
      const container = this.cropCounter.querySelector('#crop-counter-container') as HTMLElement;
      if (container) {
        container.style.backgroundColor = 'transparent';
        container.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        container.style.transform = 'scale(1)';
      }
    }
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
        
        // Clear crops and stop all pulsing
        this.stopAllCropPulsing();
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

  protected override async doBeginPlay(): Promise<void> {
    super.doBeginPlay();
    await this.createUI();
    this.setupInputHandling();
    this.findScarecrow();
    this.hideMobileJoysticks();
  }

  /**
   * Hides the mobile virtual joysticks since this game is tap-based only
   */
  private hideMobileJoysticks(): void {
    const world = this.getWorld();
    if (!world) return;

    const gameContainer = world.gameContainer;
    
    console.log('[GameplayManager] 🔍 DEBUG: Starting thumbstick detection...');
    console.log('[GameplayManager] 🔍 DEBUG: Game container:', gameContainer);
    console.log('[GameplayManager] 🔍 DEBUG: Game container children count:', gameContainer.children.length);
    
    // Log all children of game container for debugging
    Array.from(gameContainer.children).forEach((child, index) => {
      const element = child as HTMLElement;
      console.log(`[GameplayManager] 🔍 DEBUG: Child ${index}:`, {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        style: element.style.cssText,
        innerHTML: element.innerHTML.substring(0, 100) + (element.innerHTML.length > 100 ? '...' : '')
      });
    });
    
    // Method 1: Find by position styling
    const joystickZones = gameContainer.querySelectorAll('[style*="position: absolute"][style*="bottom: 20px"]');
    console.log(`[GameplayManager] 🔍 DEBUG: Found ${joystickZones.length} elements with position absolute + bottom 20px`);
    
    joystickZones.forEach((zone, index) => {
      const element = zone as HTMLElement;
      console.log(`[GameplayManager] 🔍 DEBUG: Joystick zone ${index}:`, {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        style: element.style.cssText,
        left: element.style.left,
        right: element.style.right,
        bottom: element.style.bottom
      });
      
      // Check if it's positioned at left or right (nipplejs zones)
      if (element.style.left === '20px' || element.style.right === '20px') {
        element.style.display = 'none';
        console.log('[GameplayManager] 🎮 Hidden mobile joystick zone via position');
      }
    });

    // Method 2: Find by nipple classes
    const nippleElements = gameContainer.querySelectorAll('[class*="nipple"]');
    console.log(`[GameplayManager] 🔍 DEBUG: Found ${nippleElements.length} elements with 'nipple' in class name`);
    
    nippleElements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      console.log(`[GameplayManager] 🔍 DEBUG: Nipple element ${index}:`, {
        tagName: htmlElement.tagName,
        className: htmlElement.className,
        id: htmlElement.id,
        style: htmlElement.style.cssText
      });
      htmlElement.style.display = 'none';
      console.log('[GameplayManager] 🎮 Hidden nipple element via class name');
    });

    // Method 3: Find by common joystick/gamepad patterns
    const gamepadElements = gameContainer.querySelectorAll('[class*="gamepad"], [class*="joystick"], [class*="virtual"], [id*="joystick"], [id*="gamepad"]');
    console.log(`[GameplayManager] 🔍 DEBUG: Found ${gamepadElements.length} elements with gamepad/joystick patterns`);
    
    gamepadElements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      console.log(`[GameplayManager] 🔍 DEBUG: Gamepad element ${index}:`, {
        tagName: htmlElement.tagName,
        className: htmlElement.className,
        id: htmlElement.id,
        style: htmlElement.style.cssText
      });
      htmlElement.style.display = 'none';
      console.log('[GameplayManager] 🎮 Hidden gamepad element via pattern matching');
    });

    // Method 4: Find elements positioned at bottom corners (common for mobile controls)
    const bottomElements = gameContainer.querySelectorAll('[style*="bottom:"], [style*="bottom "]');
    console.log(`[GameplayManager] 🔍 DEBUG: Found ${bottomElements.length} elements with bottom positioning`);
    
    bottomElements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      const style = htmlElement.style.cssText.toLowerCase();
      
      // Check if it looks like a mobile control (positioned at bottom corners)
      if ((style.includes('left') || style.includes('right')) && 
          (style.includes('bottom') && !style.includes('border'))) {
        console.log(`[GameplayManager] 🔍 DEBUG: Bottom corner element ${index}:`, {
          tagName: htmlElement.tagName,
          className: htmlElement.className,
          id: htmlElement.id,
          style: htmlElement.style.cssText
        });
        
        // Don't hide our own UI elements
        if (!htmlElement.closest('#game-container > div') || 
            htmlElement.closest('[class*="crop"], [class*="bird"]')) {
          htmlElement.style.display = 'none';
          console.log('[GameplayManager] 🎮 Hidden bottom corner element (likely mobile control)');
        }
      }
    });

    console.log(`[GameplayManager] 🎮 Mobile joystick detection complete`);
    
    // Also check again after a delay in case controls are created later
    setTimeout(() => {
      console.log('[GameplayManager] 🔍 DEBUG: Running delayed thumbstick check...');
      this.hideMobileJoysticksDelayed();
    }, 2000);
    
    setTimeout(() => {
      console.log('[GameplayManager] 🔍 DEBUG: Running final thumbstick check...');
      this.hideMobileJoysticksDelayed();
    }, 5000);
    
    // Set up continuous monitoring every 3 seconds
    setInterval(() => {
      this.hideMobileJoysticksDelayed();
    }, 3000);
  }

  /**
   * Aggressive removal of mobile joysticks - completely destroys them
   */
  private hideMobileJoysticksDelayed(): void {
    const world = this.getWorld();
    if (!world) return;

    const gameContainer = world.gameContainer;
    
    // Check for any new elements that might be mobile controls
    const allElements = gameContainer.querySelectorAll('*');
    console.log(`[GameplayManager] 🔍 DEBUG: Delayed check - scanning ${allElements.length} total elements`);
    
    let removedCount = 0;
    const elementsToRemove: HTMLElement[] = [];
    
    allElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      const style = htmlElement.style.cssText.toLowerCase();
      const className = htmlElement.className.toLowerCase();
      const id = htmlElement.id.toLowerCase();
      
      // Specific patterns we found in the debug output
      const isNippleControl = 
        className.includes('nipple') ||
        className.includes('collection_') ||
        id.includes('nipple_') ||
        // Anonymous containers with joystick dimensions
        (style.includes('width: 180px') && style.includes('height: 180px') && 
         style.includes('bottom: 20px') && (style.includes('left: 20px') || style.includes('right: 20px'))) ||
        // General mobile control patterns
        className.includes('joystick') ||
        className.includes('gamepad') ||
        className.includes('virtual') ||
        id.includes('joystick') ||
        id.includes('gamepad');
      
      if (isNippleControl) {
        console.log(`[GameplayManager] 🔍 DEBUG: Found mobile control for removal:`, {
          tagName: htmlElement.tagName,
          className: htmlElement.className,
          id: htmlElement.id,
          style: htmlElement.style.cssText
        });
        elementsToRemove.push(htmlElement);
      }
    });
    
    // Remove elements completely from DOM
    elementsToRemove.forEach((element) => {
      try {
        // First hide it
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.opacity = '0';
        element.style.pointerEvents = 'none';
        
        // Then remove from DOM
        if (element.parentNode) {
          element.parentNode.removeChild(element);
          removedCount++;
          console.log('[GameplayManager] 🗑️ REMOVED mobile control from DOM');
        }
      } catch (error) {
        console.log('[GameplayManager] ⚠️ Could not remove element:', error);
        // Fallback to hiding
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.opacity = '0';
        element.style.pointerEvents = 'none';
        removedCount++;
        console.log('[GameplayManager] 🎮 Hidden mobile control (fallback)');
      }
    });
    
    console.log(`[GameplayManager] 🎮 Aggressive removal complete - removed/hidden ${removedCount} elements`);
  }

  /**
   * Finds or creates the ScarecrowWatcherActor in the scene
   */
  private findScarecrow(): void {
    const world = this.getWorld();
    if (!world) return;

    // First try to find existing scarecrow
    this.scarecrowWatcher = world.getFirstActor(ScarecrowWatcherActor);
    
    if (this.scarecrowWatcher) {
      const scarecrowPos = this.scarecrowWatcher.getWorldPosition();
      console.log(`[GameplayManager] 🌾 Found existing ScarecrowWatcher at position: (${scarecrowPos.x.toFixed(2)}, ${scarecrowPos.y.toFixed(2)}, ${scarecrowPos.z.toFixed(2)})`);
      return;
    }
    
    // If not found, check if there's a regular scarecrow prefab and replace it
    const existingScarecrows = world.getActorsByPredicate(
      (actor) => actor.editorData?.displayName === 'P_scareCrow' || actor.editorData?.displayName === 'Scarecrow'
    );
    
    if (existingScarecrows.length > 0) {
      const oldScarecrow = existingScarecrows[0];
      const position = oldScarecrow.getWorldPosition();
      const rotation = oldScarecrow.getRootComponent()?.rotation.clone() || new THREE.Euler(0, 0, 0);
      
      console.log(`[GameplayManager] 🔄 Replacing old scarecrow prefab with ScarecrowWatcher at position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
      
      // Destroy old scarecrow
      oldScarecrow.destroy();
      
      // Create new ScarecrowWatcher at the same position
      this.scarecrowWatcher = new ScarecrowWatcherActor({
        position: position
      });
      
      // Apply the same rotation
      const rootComp = this.scarecrowWatcher.getRootComponent();
      if (rootComp) {
        rootComp.rotation.copy(rotation);
      }
      
      world.addActor(this.scarecrowWatcher);
      
      console.log(`[GameplayManager] ✅ Created new ScarecrowWatcher actor`);
    } else {
      // No scarecrow found at all - create one at origin
      console.log(`[GameplayManager] 🆕 No scarecrow found - creating new ScarecrowWatcher at origin`);
      
      this.scarecrowWatcher = new ScarecrowWatcherActor({
        position: new THREE.Vector3(0, 0, 0)
      });
      
      world.addActor(this.scarecrowWatcher);
      
      console.log(`[GameplayManager] ✅ Created new ScarecrowWatcher at origin (0, 0, 0)`);
    }
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
      
      // Make scarecrow look at the crop
      if (this.scarecrowWatcher) {
        const cropPos = crop.getWorldPosition();
        console.log(`[GameplayManager] 🌾 Telling scarecrow to look at crop "${cropDisplayName}" at position: (${cropPos.x.toFixed(2)}, ${cropPos.y.toFixed(2)}, ${cropPos.z.toFixed(2)})`);
        this.scarecrowWatcher.lookAtCrop(cropPos);
      } else {
        console.warn(`[GameplayManager] ⚠️ Cannot rotate scarecrow - no ScarecrowWatcher reference!`);
      }
      
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
   * Handles when a crow's deadline expires - crop is eaten
   */
  private handleCrowDeadline(crow: CrowActor): void {
    console.log(`[GameplayManager] ⏰ DEADLINE EXPIRED for "${crow.name}" - crop eaten!`);
    
    // Find which crop this crow was targeting
    const targetCrop = crow.getTargetCrop();
    if (targetCrop) {
      const cropName = targetCrop.editorData.displayName || targetCrop.name;
      console.log(`[GameplayManager] 🌽 Crop "${cropName}" has been eaten!`);
      
      // Stop pulsing for this crop and flash red
      this.stopCropPulsing(targetCrop);
      this.flashCropCounterRed();
      
      // Destroy the crop
      targetCrop.destroy();
      
      // Remove crop from our tracking
      const index = this.spawnedCrops.indexOf(targetCrop);
      if (index !== -1) {
        this.spawnedCrops.splice(index, 1);
      }
      this.cropsWithCrows.delete(targetCrop);
      
      // Update crop counter
      this.remainingCropsCount = this.spawnedCrops.length;
      this.updateCropCounterDisplay();
      
      console.log(`[GameplayManager] 📊 Crops remaining: ${this.spawnedCrops.length}`);
      
      // Check if ALL crops are eaten
      if (this.spawnedCrops.length === 0) {
        console.log(`[GameplayManager] 🚨 ALL CROPS EATEN! Sending all crows to origin...`);
        this.handleAllCropsEaten();
        return; // Don't destroy the crow yet, it will be destroyed in handleAllCropsEaten
      }
    }
    
    // Destroy the crow
    this.destroyCrow(crow);
    
    // Check if wave is complete
    this.checkWaveComplete();
  }

  /**
   * Handles the scenario when all crops are eaten - sends all crows to origin then ends wave
   */
  private handleAllCropsEaten(): void {
    const world = this.getWorld();
    if (!world) return;
    
    // Clear any existing timer
    if (this.allCropsEatenTimer) {
      world.timerSystem.clearTimer(this.allCropsEatenTimer);
      this.allCropsEatenTimer = null;
    }
    
    console.log(`[GameplayManager] 🚨 ALL CROPS EATEN - Game Over scenario initiated`);
    console.log(`[GameplayManager] 📊 Active crows: ${this.activeCrows.length}`);
    console.log(`[GameplayManager] 📊 Paused crows: ${this.pausedCrows.length}`);
    
    // Get all crows (active + paused)
    const allCrows = [...this.activeCrows, ...this.pausedCrows];
    
    if (allCrows.length === 0) {
      console.log(`[GameplayManager] No crows to send to origin, ending immediately`);
      this.endWaveAfterAllCropsEaten();
      return;
    }
    
    // Create a dummy target actor at origin for crows to fly to
    const dummyTarget = new ENGINE.Actor({ position: new THREE.Vector3(0, 0, 0) });
    world.addActor(dummyTarget);
    
    // Send each crow to origin (0,0,0), 1 second apart
    allCrows.forEach((crow, index) => {
      const delay = index * 1.0; // 1 second spacing
      world.timerSystem.setTimeout(() => {
        console.log(`[GameplayManager] 🎯 Sending crow "${crow.name}" to origin (0,0,0)`);
        crow.cancelDeadlineTimer(); // Cancel deadline timer
        crow.setTargetCrop(dummyTarget, 'Origin'); // Set dummy target so crow flies there
      }, delay);
    });
    
    // Clean up dummy target after crows are sent
    world.timerSystem.setTimeout(() => {
      dummyTarget.destroy();
    }, allCrows.length * 1.0 + 1.0);
    
    // After 5 seconds from starting to send crows, end the wave
    const totalDelay = allCrows.length * 1.0 + 5.0;
    this.allCropsEatenTimer = world.timerSystem.setTimeout(() => {
      console.log(`[GameplayManager] ⏱️ ${totalDelay.toFixed(1)}s elapsed since all crops eaten - ending wave`);
      this.endWaveAfterAllCropsEaten();
    }, totalDelay);
  }

  /**
   * Ends the wave and resets to start screen after all crops are eaten
   */
  private endWaveAfterAllCropsEaten(): void {
    console.log(`[GameplayManager] 🔚 WAVE FAILED - All crops were eaten!`);
    
    // Destroy all remaining crows
    const allCrows = [...this.activeCrows, ...this.pausedCrows];
    for (const crow of allCrows) {
      console.log(`[GameplayManager] 💀 Destroying crow "${crow.name}"`);
      crow.cancelDeadlineTimer();
      crow.destroy();
    }
    
    this.activeCrows = [];
    this.pausedCrows = [];
    this.cropsWithCrows.clear();
    
    // Stop all crop pulsing
    this.stopAllCropPulsing();
    
    // Show game over message
    this.showMessage('💀 ALL CROPS EATEN! GAME OVER 💀', 5000);
    
    // Reset to main menu after message
    const world = this.getWorld();
    if (world) {
      world.timerSystem.setTimeout(() => {
        console.log(`[GameplayManager] 🔄 Returning to main menu...`);
        this.resetGame();
      }, 5.5);
    }
  }

  protected override doEndPlay(): void {
    super.doEndPlay();
    
    if (this.uiContainer && this.uiContainer.parentNode) {
      this.uiContainer.parentNode.removeChild(this.uiContainer);
    }
    
    // Ensure all timers are cleared on end play
    const world = this.getWorld();
    if (world && world.timerSystem) {
      if (this.waveTimeoutTimer) {
        world.timerSystem.clearTimer(this.waveTimeoutTimer);
        this.waveTimeoutTimer = null;
      }
      if (this.allCropsEatenTimer) {
        world.timerSystem.clearTimer(this.allCropsEatenTimer);
        this.allCropsEatenTimer = null;
      }
    }
    
    for (const crow of this.activeCrows) {
      crow.cancelDeadlineTimer();
    }
    for (const crow of this.pausedCrows) {
      crow.cancelDeadlineTimer();
    }
    
    // Stop all crop pulsing
    this.stopAllCropPulsing();
  }
}

