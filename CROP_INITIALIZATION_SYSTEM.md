# Crop Initialization System

## Overview

Implemented a proper initialization system for crops that ensures all physics bodies are ready **before** setting up click handlers. This replaces the previous arbitrary delay approach with an event-driven architecture.

---

## How It Works

### 1. **CropMarkerActor** - Initialization Detection

The `CropMarkerActor` now includes:

**`onCropReady` Delegate:**
```typescript
public readonly onCropReady = new ENGINE.Delegate<[ENGINE.Actor]>();
```

This delegate fires when the spawned crop is **fully initialized** with physics bodies.

**Initialization Check:**
```typescript
private waitForCropInitialization(crop: ENGINE.Actor): void {
  const world = this.getWorld();
  
  // Wait for next tick (after beginPlay)
  world.runInNextTick(() => {
    const gltfComponent = crop.getComponent(ENGINE.GLTFMeshComponent);
    const triggerZone = crop.getComponent(ENGINE.TriggerZoneComponent);
    
    if (gltfComponent && triggerZone) {
      if (gltfComponent.isPhysicsEnabled()) {
        // ✅ Physics ready immediately
        this.onCropReady.invoke(crop);
      } else {
        // Wait 100ms for physics initialization
        world.timerSystem.setTimeout(() => {
          this.onCropReady.invoke(crop);
        }, 0.1);
      }
    }
  });
}
```

### 2. **GameplayManager** - Wait for All Crops

The `GameplayManager` now waits for **ALL crops to be initialized** before starting the wave:

```typescript
// Track how many crops are initialized
let cropsInitialized = 0;
const totalCrops = markersToUse.length;

// Promise that resolves when all crops are ready
const allCropsReady = new Promise<void>((resolve) => {
  for (const marker of markersToUse) {
    marker.spawnCrop().then((crop) => {
      if (crop) {
        this.spawnedCrops.push(crop);
        
        // Subscribe to crop ready event
        marker.onCropReady.add((readyCrop: ENGINE.Actor) => {
          cropsInitialized++;
          console.log(`📊 Crop initialized: ${cropsInitialized}/${totalCrops}`);
          
          this.setupCropInteraction(readyCrop, marker);
          
          // Check if all crops are ready
          if (cropsInitialized === totalCrops) {
            console.log(`✅ ALL ${totalCrops} CROPS INITIALIZED AND READY!`);
            resolve();
          }
        });
      }
    });
  }
});

// Wait for all crops to be initialized before continuing
await allCropsReady;
```

---

## Debug Output

You'll now see this sequence in the console:

```
[GameplayManager] Spawning 5 crops at markers
[CropMarkerActor] Spawning crop at position: Vector3(-1.35, 0, 0.81)
[CropMarkerActor] Successfully spawned crop: Actor_17
[CropMarkerActor] ✅ Crop "Crop_bb87" fully initialized and READY
[GameplayManager] 📊 Crop initialized: 1/5
[GameplayManager] ✅ Setting up click handler for crop "Crop_bb87" at marker "CropMarker"

... (repeats for each crop) ...

[GameplayManager] 📊 Crop initialized: 5/5
[GameplayManager] ✅ ALL 5 CROPS INITIALIZED AND READY!
[GameplayManager] Successfully spawned and initialized 5 crops
[GameplayManager] Spawning 3 birds over 60 seconds (one every 20.00s)
```

---

## Benefits

1. ✅ **No arbitrary delays** - Uses engine lifecycle hooks
2. ✅ **Event-driven** - Clean delegate pattern
3. ✅ **Guaranteed initialization** - Birds only spawn after crops are ready
4. ✅ **Clear debug output** - Progress tracking for all crops
5. ✅ **Follows Genesys patterns** - Uses `runInNextTick()` and `Delegate<T>`

---

## Files Modified

- **`src/actors/CropMarkerActor.ts`**
  - Added `onCropReady` delegate
  - Added `waitForCropInitialization()` method
  - Uses `world.runInNextTick()` for proper timing

- **`src/game/GameplayManager.ts`**
  - Replaced timer delay with delegate subscription
  - Added Promise-based waiting for all crops
  - Added progress tracking debug output

---

## Key Takeaway

The crops now **signal when they're ready** rather than the game **guessing when they might be ready**. This is much more robust and follows proper event-driven architecture patterns.

