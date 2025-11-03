# Debug Improvements & Bug Fixes

## 🐛 Bugs Fixed

### 1. **Serialization Error Fixed**
**Issue:** `World_0.CropMarkerActor_1.SceneComponent.Mesh is not serializable`

**Fix:** Marked the marker mesh as transient in `CropMarkerActor.ts`:
```typescript
this.markerMesh.setTransient(true); // Don't serialize the mesh
```

### 2. **Birds Not Spawning**
**Issue:** Birds weren't spawning after clicking START GAME

**Root Cause:** Using `setInterval()` incorrectly - the timer system requires `setTimeout()` for delayed execution.

**Fix:** Changed from `setInterval` to recursive `setTimeout` in `GameplayManager.ts`:
```typescript
const spawnNext = (remaining: number) => {
  if (remaining <= 0) return;
  
  this.spawnBird(speed);
  
  if (remaining > 1) {
    world.timerSystem.setTimeout(() => {
      spawnNext(remaining - 1);
    }, interval);
  }
};

spawnNext(count);
```

### 3. **Crow Not Visible (No GLTF Component)**
**Issue:** Error "No GLTFMeshComponent found!" and crows were invisible

**Root Cause:** Trying to spawn a prefab and then convert it to CrowActor, but the prefab was already a GLTFMeshActor.

**Fix:** Create CrowActor directly with its own GLTFMeshComponent in the constructor:
```typescript
// Load the crow model
const gltfMesh = new ENGINE.GLTFMeshComponent({
  modelUrl: '@project/assets/models/SM_Crow_01.glb',
  physicsOptions: {
    collisionMeshType: ENGINE.CollisionMeshType.BoundingBox,
    collisionProfile: ENGINE.DefaultCollisionProfile.NoCollision
  }
});
this.setRootComponent(gltfMesh, true);
this.gltfComponent = gltfMesh;
```

## 🎯 Enhanced Debug Logging

### Bird Spawn Event
**Before:**
```
[GameplayManager] SPAWNED bird at (1.20, 2.00, -0.50) targeting Crop_abc1
```

**After:**
```
[GameplayManager] 🐦 SPAWNED BIRD "CrowActor_5" at position (X:1.20, Y:2.00, Z:-0.50) → targeting crop "Crop_abc1" at marker "CropMarker_1"
```

**Shows:**
- 🐦 Bird emoji for visibility
- Full bird actor name
- Spawn position with labeled X/Y/Z coordinates
- Target crop name
- **Which marker spawned that crop**

### Trigger Entry Event
**Before:**
```
[GameplayManager] Crow ENTERED crop Crop_abc1: Crow_123
```

**After:**
```
[GameplayManager] 🦅 Crow ENTERED TRIGGER of crop "Crop_abc1" (spawned at marker "CropMarker_1"): CrowActor_5
```

**Shows:**
- 🦅 Crow emoji for visibility
- Crop name that was entered
- **Which marker spawned that crop**
- Crow name

### Trigger Exit Event
```
[GameplayManager] 🦅 Crow EXITED TRIGGER of crop "Crop_abc1" (spawned at marker "CropMarker_1"): CrowActor_5
```

### Click Event
**Before:**
```
[GameplayManager] CLICK on crop Crop_abc1 with 2 crows
[GameplayManager] Destroying crow: Crow_123 on crop: Crop_abc1
```

**After:**
```
[GameplayManager] 🖱️ CLICK on crop "Crop_abc1" (marker "CropMarker_1") with 2 crows
[GameplayManager] 💥 DESTROYING crow "CrowActor_5" on crop "Crop_abc1" (marker "CropMarker_1")
```

**Shows:**
- 🖱️ Click emoji
- Crop name
- **Which marker spawned the clicked crop**
- Count of crows being destroyed
- 💥 Destruction emoji with crow and crop names

## 📊 Complete Debug Flow Example

```
[GameplayManager] ========== GAME STARTED ==========
[GameplayManager] ========== WAVE 1 START ==========
[GameplayManager] Wave 1 Config: 5 crops, 3 birds, 2 speed
[GameplayManager] Spawning 5 crops at markers
[CropMarkerActor] Spawning crop at position: Vector3(-1.35, 0, 0.81)
[CropMarkerActor] Successfully spawned crop: Actor_20
[GameplayManager] Successfully spawned 5 crops
[GameplayManager] Spawning 3 birds over 60 seconds (one every 20.00s)

[GameplayManager] 🐦 SPAWNED BIRD "CrowActor_23" at position (X:1.45, Y:2.00, Z:-0.82) → targeting crop "Crop_001" at marker "CropMarker_1"
[CrowActor] CrowActor_23 targeting crop: Crop_001 at marker: CropMarker_1
... (bird descends)
[CrowActor] 🦅 CrowActor_23 LANDED at crop "Crop_001" (marker "CropMarker_1") - Time taken: 1.25s
[GameplayManager] 🦅 Crow ENTERED TRIGGER of crop "Crop_001" (spawned at marker "CropMarker_1"): CrowActor_23
[CrowActor] CrowActor_23 shader changed to RED

... (20 seconds later, next bird spawns)
[GameplayManager] 🐦 SPAWNED BIRD "CrowActor_24" at position (X:-0.33, Y:2.00, Z:1.12) → targeting crop "Crop_002" at marker "CropMarker_2"

... (player clicks crop)
[GameplayManager] 🖱️ CLICK on crop "Crop_001" (marker "CropMarker_1") with 1 crows
[GameplayManager] 💥 DESTROYING crow "CrowActor_23" on crop "Crop_001" (marker "CropMarker_1")
```

## 🎮 Testing Notes

1. **Place Multiple CropMarkers**: The game only spawned 1 crop because there was only 1 CropMarker in the scene. Add more markers to test properly.

2. **Bird Spawning Timing**: Birds now spawn correctly at intervals (default: 60 seconds / bird count)

3. **Marker Identification**: Each crop now tracks which marker spawned it, making debugging much easier

## 📈 New Features

### **Time Tracking**
The crow now tracks how long it takes from spawn to landing:
```
[CrowActor] 🦅 CrowActor_23 LANDED at crop "Crop_001" (marker "CropMarker_1") - Time taken: 1.25s
```

This shows:
- Crow name
- Target crop
- Which marker spawned the crop
- **Exact time in seconds** from spawn to trigger entry

## ✅ Status

- ✅ Serialization error fixed
- ✅ Bird spawning works
- ✅ Birds now visible (GLTF component fixed)
- ✅ Enhanced debug output with emojis
- ✅ Marker tracking in all events
- ✅ Time tracking from spawn to landing
- ✅ Compiled successfully

