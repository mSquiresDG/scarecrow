# Spawn System Update - Random Timing & Speed Multiplier

## Overview

Updated the crow spawning system to:
1. **Spawn crows at RANDOM times** (not evenly spaced)
2. **Speed multiplier affects BOTH movement and spawn rate**
3. Clearer documentation of what each parameter does

---

## Parameter Meanings

### **Crop No** (`wave1CropCount`, etc.)
- Number of crops to spawn randomly on available crop markers
- If there are 10 markers but Crop No = 5, only 5 random markers will spawn crops

### **Crow No** (`wave1BirdCount`, etc.)
- Number of crows to spawn during the wave
- Each crow spawns at a random time within the wave duration

### **Speed** (`wave1BirdSpeed`, etc.)
- **Multiplier** that affects:
  1. **Crow movement speed** towards crops (higher = faster flight)
  2. **Spawn rate** (higher = birds spawn in less time)

---

## How Speed Works

**Base spawn duration:** 60 seconds

**Adjusted duration:** `60 / speed`

### Examples:

| Speed | Duration | Crow Movement |
|-------|----------|---------------|
| 1.0   | 60s      | Normal        |
| 2.0   | 30s      | 2x faster     |
| 3.0   | 20s      | 3x faster     |
| 0.5   | 120s     | Half speed    |

---

## Random Spawn Timing

**Before (Evenly Spaced):**
```
3 birds, 60 seconds → spawn at: 0s, 20s, 40s
```

**After (Random):**
```
3 birds, 60 seconds → spawn at: 5.2s, 18.7s, 43.9s
```

### Implementation:

```typescript
// Generate random spawn times
const spawnTimes: number[] = [];
for (let i = 0; i < count; i++) {
  spawnTimes.push(Math.random() * adjustedDuration);
}

// Sort so we can schedule in order
spawnTimes.sort((a, b) => a - b);

// Schedule each bird at its random time
spawnTimes.forEach((time, index) => {
  world.timerSystem.setTimeout(() => {
    this.spawnBird(speed);
  }, time);
});
```

---

## Debug Output

You'll now see:

```
[GameplayManager] Spawning 3 birds randomly over 30.0 seconds (speed multiplier: 2.0x)
[GameplayManager] Random spawn times: 2.34, 15.67, 28.91s

[GameplayManager] 📅 Bird 1/3 spawned at 2.34s
[GameplayManager] 📅 Bird 2/3 spawned at 15.67s
[GameplayManager] 📅 Bird 3/3 spawned at 28.91s
```

---

## Benefits

1. ✅ **More challenging** - Unpredictable spawn timing
2. ✅ **Speed feels impactful** - Affects both movement and spawn rate
3. ✅ **Clearer parameters** - Crop No, Crow No, Speed are self-explanatory
4. ✅ **Better pacing** - Random spawns feel more organic

---

## Files Modified

- **`src/game/GameplayManager.ts`**
  - Updated `spawnBirdsOverTime()` to use random timing
  - Speed now divides spawn duration (`adjustedDuration = duration / speed`)
  - Added debug output showing random spawn times
  - Updated comments to clarify what each parameter does

