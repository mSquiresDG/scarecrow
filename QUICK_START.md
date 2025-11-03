# Quick Start Guide - ScareCrow Bird Defense

## 🚀 Setup in 3 Steps

### Step 1: Place Crop Markers
1. Open your scene in Genesys editor
2. Add `CropMarkerActor` instances where you want crops to spawn
3. Recommended: Place 10-15 markers in a grid pattern
4. Markers appear as **green boxes** (0.5m) in editor

### Step 2: Configure GameplayManager (Optional)
The `GameplayManager` is auto-created when you start the game, but you can customize it:

**In Editor:**
- Add `GameplayManager` actor to scene
- Edit properties panel:
  - **Wave 1:** 5 crops, 3 birds, 2.0 speed (default)
  - **Wave 2:** 7 crops, 5 birds, 2.5 speed (default)
  - **Wave 3:** 10 crops, 8 birds, 3.0 speed (default)

**Or in Code** (`src/game.ts`):
```typescript
gameplayManager = new GameplayManager({
  wave1CropCount: 5,
  wave1BirdCount: 3,
  wave1BirdSpeed: 2.0,
  // ... etc
});
```

### Step 3: Run the Game
```bash
npm run dev
```

## 🎮 How to Play

1. Click **"START GAME"** button
2. Birds spawn from sky (Y=2) over 1 minute
3. Birds descend toward crops
4. **When bird lands on crop → it turns RED**
5. **Click the crop** to destroy all red birds on it
6. Destroy all birds to complete wave
7. Complete 3 waves to win!

## 🎯 Game Objects

### CropMarkerActor
- **What:** Spawn point for crops
- **Visible:** Only in editor (green box)
- **Purpose:** Marks where crops appear at runtime

### Crop (from prefab)
- **Prefab:** `@project/assets/prefab/crops/P_CropCorn_01.prefab.json`
- **Components:** GLTF mesh + TriggerZone (2x2x2)
- **Clickable:** Only when birds are on it

### Crow (from prefab)
- **Prefab:** `@project/assets/prefab/P_Crow_01.prefab.json`
- **Spawns:** Random 4x4m area, Y=2
- **Behavior:** Descends to nearest crop
- **Shader:** Changes RED when overlapping crop trigger

## 📋 Editor Properties

Open `GameplayManager` in editor to see:

| Property | Type | Description |
|----------|------|-------------|
| wave1CropCount | Integer (1-50) | How many crops in wave 1 |
| wave1BirdCount | Integer (1-100) | How many birds in wave 1 |
| wave1BirdSpeed | Number (0.5-10) | Bird descent speed wave 1 |
| wave2CropCount | Integer (1-50) | How many crops in wave 2 |
| wave2BirdCount | Integer (1-100) | How many birds in wave 2 |
| wave2BirdSpeed | Number (0.5-10) | Bird descent speed wave 2 |
| wave3CropCount | Integer (1-50) | How many crops in wave 3 |
| wave3BirdCount | Integer (1-100) | How many birds in wave 3 |
| wave3BirdSpeed | Number (0.5-10) | Bird descent speed wave 3 |

## 🐛 Debug Console

Watch the console for detailed logs:
```
[GameplayManager] ========== GAME STARTED ==========
[GameplayManager] ========== WAVE 1 START ==========
[GameplayManager] Wave 1 Config: 5 crops, 3 birds, 2 speed
[CropMarkerActor] Spawning crop at position: Vector3(0, 0, 0)
[GameplayManager] SPAWNED bird at (1.2, 2.0, -0.5) targeting Crop_abc1
[CrowActor] Crow_123 targeting crop: Crop_abc1
[GameplayManager] Crow ENTERED crop Crop_abc1: Crow_123
[CrowActor] Crow_123 shader changed to RED
[GameplayManager] CLICK on crop Crop_abc1 with 1 crows
[GameplayManager] Destroying crow: Crow_123 on crop: Crop_abc1
```

## ⚡ Tips

1. **More Challenge?** Increase bird count and speed
2. **Easier?** Decrease bird count, add more crops
3. **Longer Waves?** Birds spawn over 60 seconds - this is hardcoded but easy to change in `GameplayManager.spawnBirdsOverTime()`
4. **Custom Waves?** Edit the wave properties in constructor or add more waves

## 🎨 Customization

### Add More Waves
Edit `src/game/GameplayManager.ts`:
```typescript
export interface GameplayManagerOptions extends ENGINE.ActorOptions {
  // ... existing waves ...
  wave4CropCount?: number;
  wave4BirdCount?: number;
  wave4BirdSpeed?: number;
}

// Add to EDITOR_CLASS_META
wave4CropCount: { integer: { min: 1, max: 50 } },
// ... etc

// Add to waves array in constructor
this.waves = [
  // ... existing waves ...
  {
    cropCount: mergedOptions.wave4CropCount!,
    birdCount: mergedOptions.wave4BirdCount!,
    birdSpeed: mergedOptions.wave4BirdSpeed!,
  },
];
```

### Change Bird Spawn Duration
In `GameplayManager.startNextWave()`:
```typescript
// Change from 60 to your desired seconds
this.spawnBirdsOverTime(wave.birdCount, wave.birdSpeed, 120); // 2 minutes
```

---

## 🎉 That's It!

Your bird defense game is ready to play. Have fun! 🦅🌽

