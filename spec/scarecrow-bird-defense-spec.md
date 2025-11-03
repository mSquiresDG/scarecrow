# Scarecrow Bird Defense - Implementation Specification

## Overview
A mobile-friendly tap-based defense game where players control a scarecrow to protect crops from birds. The scarecrow rotates to face tapped positions, birds fly down to attack crops, and players tap crops with birds on them to scare the birds away.

## Game Mechanics

### Core Gameplay Loop
1. Birds spawn in waves above the play area
2. Birds descend toward the nearest crop
3. Player taps the scarecrow to rotate it toward threats
4. Player taps crops that have birds on them to scare birds away
5. Process repeats with increasing difficulty (future enhancement)

### Input System
- **Platform**: Mobile and desktop support
- **Mobile**: Touch tap events
- **Desktop**: Mouse click events
- **Target Detection**: Raycasting from screen coordinates to 3D world

## Technical Architecture

### Actor Classes

#### 1. ScarecrowActor
**File**: `src/actors/ScarecrowActor.ts`

**Purpose**: Central defensive unit that rotates to face threats

**Features**:
- Loads existing scarecrow prefab (`@project/assets/prefab/P_scareCrow.prefab.json`)
- Smooth Y-axis rotation toward target positions
- Rotation speed: 10 rad/s (~0.3s for 180° turn)
- Uses quaternion interpolation for smooth animation

**Key Properties**:
- `rotationSpeed: number` - Speed in radians per second (default: 10)
- `targetRotation: number | null` - Target angle for rotation
- `isRotating: boolean` - Whether currently rotating

**Key Methods**:
- `rotateTo(targetPosition: Vector3)` - Initiates rotation toward position
- `tickPrePhysics(deltaTime)` - Updates rotation each frame

**Rotation Logic**:
- Calculates angle using `Math.atan2(dir.x, dir.z)` (scarecrow faces Z+)
- Handles angle wrapping for shortest rotation path
- Snaps to target when within 0.01 radians

---

#### 2. BirdActor
**File**: `src/actors/BirdActor.ts`

**Purpose**: Enemy that descends from sky to attack crops

**Features**:
- Loads crow model (`@project/assets/models/SM_Crow_01.glb`)
- Descends vertically until landing (Y ≤ 0.05)
- Plays flight animation while descending
- Targets nearest crop on spawn
- Self-destructs when removed

**Key Properties**:
- `targetCrop: CropActor | null` - Assigned crop target
- `isLanded: boolean` - True when reached ground
- `descendSpeed: number` - Downward movement speed (default: 2 units/s)

**Key Methods**:
- `setTargetCrop(crop: CropActor)` - Assigns target and moves toward it
- `tickPrePhysics(deltaTime)` - Handles descent and landing
- `destroy()` - Cleanup on removal

**Movement Logic**:
- Spawns at random X/Z within 4x4m area centered at (0,0,0)
- Spawns at Y = 2m height
- Moves toward target crop's X/Z position
- Descends at constant speed
- Stops animation and sets `isLanded = true` when Y ≤ 0.05

---

#### 3. CropActor
**File**: `src/actors/CropActor.ts`

**Purpose**: Defendable target with bird detection and tap handling

**Features**:
- Extends `ENGINE.GLTFMeshActor` for visual model
- Includes `TriggerZoneComponent` (2x2x2 box) for bird detection
- Tracks overlapping birds in a Set
- Tap detection for bird removal
- Notifies scarecrow to rotate when tapped

**Key Properties**:
- `modelUrl: string` - Path to crop model asset
- `overlappingBirds: Set<BirdActor>` - Birds currently on this crop
- `triggerZone: TriggerZoneComponent` - Collision detection

**Key Methods**:
- `handleTap()` - Removes all overlapping birds, rotates scarecrow
- `onBirdEntered(bird: BirdActor)` - Adds bird to tracking set
- `onBirdExited(bird: BirdActor)` - Removes bird from tracking set

**Trigger Zone Setup**:
- Size: 2x2x2 meters (configurable)
- Filter: Custom filter for `BirdActor` only
- Events: `onActorEntered`, `onActorExited`
- Collision Profile: `Trigger` (no blocking, events only)

---

#### 4. CropPlacementActor
**File**: `src/actors/CropPlacementActor.ts`

**Purpose**: Editor-only visual marker for crop spawn positions

**Features**:
- Simple box mesh with green material
- Visible only in editor
- No gameplay logic
- Used by game mode to spawn crops at runtime

**Properties**:
- Size: 0.5x0.5x0.5m green box
- `editorOnly: boolean` - Not serialized in builds

---

### Component Classes

#### TapInputComponent
**File**: `src/components/TapInputComponent.ts`

**Purpose**: Reusable input handler for tap/click detection with raycasting

**Features**:
- Registers with world's InputManager
- Handles mouse click and touch events
- Performs raycasting to convert 2D screen coordinates to 3D world positions
- Emits events for world taps and actor taps
- Works on desktop (mouse) and mobile (touch)

**Key Properties**:
- `onWorldTapped: Delegate<[Vector3], void>` - Fires with 3D world position
- `onActorTapped: Delegate<[Actor, Intersection], void>` - Fires when actor hit

**Key Methods**:
- `handleMouseClick(button, event)` - Processes click/tap events
- `performRaycast(screenX, screenY)` - Converts screen coords to world position

**Raycast Implementation**:
```typescript
// Convert screen coordinates to NDC
const rect = rendererElement.getBoundingClientRect();
const mouse = new THREE.Vector2(
  ((screenX - rect.left) / rect.width) * 2 - 1,
  -((screenY - rect.top) / rect.height) * 2 + 1
);

// Raycast from camera
raycaster.setFromCamera(mouse, camera);
const intersects = raycaster.intersectObjects(scene.children, true);
```

---

### Game Management

#### ScarecrowGameMode
**File**: `src/game/ScarecrowGameMode.ts`

**Purpose**: Central game manager coordinating actors and spawning

**Features**:
- Extends `ENGINE.GameMode`
- Manages bird spawning waves
- Tracks all crops and birds in scene
- Coordinates scarecrow rotation from tap input
- Handles bird lifecycle (spawn, target assignment, destruction)

**Key Properties**:
- `scarecrow: ScarecrowActor | null` - Reference to scarecrow
- `crops: CropActor[]` - All crops in scene
- `activeBirds: BirdActor[]` - Currently active birds
- `spawnTimer: number` - Timer for wave spawning

**Key Methods**:
- `spawnBirdWave(count: number)` - Spawns birds at random positions
- `findNearestCrop(position: Vector3)` - Returns closest crop to position
- `handleWorldTap(position: Vector3)` - Rotates scarecrow to position
- `handleCropTap(crop: CropActor)` - Removes birds from crop

**Spawn Logic**:
- Random X: [-2, 2] meters from origin
- Random Z: [-2, 2] meters from origin
- Fixed Y: 2 meters height
- Each bird assigned nearest available crop
- Waves triggered by timer (future: level-based progression)

---

## Asset References

### Models
- **Scarecrow**: `@project/assets/prefab/P_scareCrow.prefab.json`
- **Crow**: `@project/assets/models/SM_Crow_01.glb`
- **Crops**: `@project/assets/models/crops/SM_Crop_01.glb` (and 02, 03, 04)

### Prefabs
- **Scarecrow Prefab**: Contains stick, shirt, head, hat components
- **Crop Prefab**: `@project/assets/prefab/props/P_PropCrop_01.prefab.json`

## Implementation Flow

### 1. Initialization (game.ts)
```typescript
// In ScareCrowGame.preStart()
- Create ScarecrowGameMode
- Spawn scarecrow at origin
- Find/spawn initial crops
- Setup input handling
- Start game mode
```

### 2. Game Loop
```
Every frame:
  - Update scarecrow rotation toward target
  - Update bird descent
  - Check bird landing status
  - Update animations
  
On timer interval:
  - Spawn new bird wave
  - Assign birds to crops
  
On tap:
  - Raycast to world
  - If hit ground: rotate scarecrow
  - If hit crop: remove overlapping birds
```

### 3. Bird Lifecycle
```
Spawn → Descend → Land → Wait → (Tapped) → Destroy
                              ↓
                        (Not tapped: damage crop - future)
```

## Code Organization

```
src/
├── actors/
│   ├── ScarecrowActor.ts       ✓ Rotation + prefab loading
│   ├── BirdActor.ts            ✓ Descent + animation
│   ├── CropActor.ts            ✓ Trigger + tap handling
│   └── CropPlacementActor.ts   ✓ Editor marker
├── components/
│   └── TapInputComponent.ts    ✓ Input handling + raycasting
├── game/
│   └── ScarecrowGameMode.ts    ✓ Game coordination
├── camera.ts                   (existing)
├── game.ts                     ✓ Modified for game mode
└── auto-imports.ts             (auto-generated)
```

## Key Engine Features Used

### Input System
- `InputManager` - Event handling
- `IInputHandler` interface - Custom input handlers
- Mouse and touch event processing

### Physics & Collision
- `TriggerZoneComponent` - Overlap detection
- `CollisionShapeComponent` - Trigger volumes
- `TriggerFilter.Custom` - Selective collision filtering
- Rapier physics engine (backend)

### Components
- `GLTFMeshComponent` - 3D model loading
- `AnimationComponent` - Animation playback
- `SceneComponent` - Transform hierarchy

### Actor System
- `Actor` base class - Lifecycle management
- `@ENGINE.GameClass()` decorator - Class registration
- `tickPrePhysics(deltaTime)` - Frame updates
- Prefab loading via `WorldSerializer`

### Utilities
- `THREE.Raycaster` - Screen to world casting
- `Quaternion.slerp()` - Smooth rotation
- `world.timerSystem` - Interval timers
- `Delegate<T>` - Event system

## Mobile Optimization

### Touch Handling
- Single tap detection (no multi-touch needed)
- Unified mouse/touch event handling
- Normalized device coordinates (NDC) for raycasting

### Performance
- Minimal actors in scene (1 scarecrow, ~10 birds, ~20 crops)
- Simple collision detection (triggers only)
- No complex physics (kinematic movement)
- Efficient animation playback (single loop)

## Future Enhancements (Not Implemented Yet)

### Game Progression
- Level system with increasing difficulty
- Wave configurations (bird count, speed)
- Score tracking and combo system
- Crop health and damage

### Visual Polish
- Particle effects on bird removal
- Sound effects (flap, scare, success)
- UI overlay (score, wave counter)
- Crop damage states

### Gameplay Mechanics
- Power-ups and special abilities
- Multiple scarecrow types
- Bird varieties with different behaviors
- Weather effects affecting gameplay

## Testing Strategy

### Build Verification
```bash
npm run build   # Verify TypeScript compilation
npm run lint    # Check for linting issues
```

### Manual Testing (in engine editor)
1. Place crop actors in scene
2. Start play mode
3. Verify scarecrow rotation on ground tap
4. Verify birds spawn and descend
5. Verify bird animations play during descent
6. Verify birds land on crops
7. Verify tapping crops removes birds
8. Test on mobile device (touch events)

## Implementation Status

- [ ] ScarecrowActor (in progress)
- [ ] BirdActor
- [ ] CropActor
- [ ] CropPlacementActor
- [ ] TapInputComponent
- [ ] ScarecrowGameMode
- [ ] Update game.ts
- [ ] Build and test

