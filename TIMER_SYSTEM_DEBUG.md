# Crow Timer & Wave Timeout System - Debug Guide

## 🆕 Features Implemented

### 1. **Crow Timer Pause/Resume System**
- Crows pause their 30s deadline timer if no valid crop is available when they spawn
- Timers resume when a crop becomes available (after player clicks another crow)
- Paused crows don't expire until they get a target

### 2. **Wave Timeout System**
- Each wave has a 2x duration timeout (60s wave = 120s timeout)
- If timeout is exceeded: destroy all crows, show "GAME OVER", return to main menu
- Timeout is cleared when wave completes successfully

### 3. **Crow 30-Second Deadline (Crop Eating)**
- **Each crow has a 30-second timer from SPAWN time (not landing time)**
- If crow is NOT clicked within 30 seconds → **Crop is DESTROYED ("eaten")**
- The crow also disappears after eating the crop
- This adds urgency - you must click crows quickly or lose crops!

### 4. **Smart Crow Targeting**
- Crows are tracked as "assigned" to a crop immediately when they spawn
- **No two crows will target the same crop** (prevents overcrowding)
- If no empty crops available → crow spawns but timer is **paused** until a crop becomes free

---

## 🔍 Debug Messages to Look For

### **When Crow Spawns WITHOUT Available Crop:**
```
🐦 SPAWNED BIRD "CrowActor_X" at spawner "CrowSpawner" (X:-1.91, Y:2.00, Z:-0.06) → ⏸️ PAUSED (no valid crops available)
⏸️ CrowActor_X deadline timer PAUSED (no valid crop available)
```

### **When Paused Crow Gets Assigned to Crop:**
```
🔄 Attempting to assign 3 paused crow(s) to available crops...
▶️ Assigned paused crow "CrowActor_X" to crop "Crop_2fee" at marker "CropMarker"
▶️ CrowActor_X deadline timer RESUMED (28.5s remaining)
```

### **Wave Timeout System:**

**At Wave Start:**
```
========== WAVE 1 START ==========
⏰ Wave timeout set to 120s (2x wave duration)
```

**When Wave Completes in Time:**
```
========== WAVE 1 COMPLETE ==========
⏰ Wave timeout timer cleared - wave completed in time!
```

**When Wave Takes Too Long (GAME OVER):**
```
⏰⏰⏰ WAVE TIMEOUT EXCEEDED! 120s elapsed - GAME OVER!
💀 GAME OVER - Wave took too long!
💀 Active crows: 5
💀 Paused crows: 2
💀 Destroying crow "CrowActor_3" due to timeout
💀 Destroying crow "CrowActor_5" due to timeout
...
⏰ TIME'S UP! GAME OVER ⏰ (displayed on screen)
🔄 Returning to main menu...
🔄 Game reset - ready to start again
```

### **Enhanced Cleanup Debug:**
```
🧹 CLEANUP: Removing "CrowActor_2" from all tracking systems
🧹 Removed from activeCrows list (9 remaining)
🧹 Removed from pausedCrows list (2 remaining)
🧹 Removed from crop "Crop_7f41" tracking
✅ CLEANUP COMPLETE for "CrowActor_2"
```

---

## 🧪 Test Scenarios

### **Test 1: Crow Pause/Resume**
1. Place only 2 `CropMarker` actors in scene
2. Set Wave 1 to spawn 10 crows
3. **Expected:** First 2 crows target crops, remaining 8 are PAUSED
4. Click 1st crow → One paused crow should RESUME and target the now-empty crop
5. **Debug:** Look for `⏸️ PAUSED` and `▶️ RESUMED` messages

### **Test 2: Wave Timeout (Quick Test)**
1. Set timeout to 10s for testing (change `waveDuration * 2` to `10` in `startNextWave`)
2. Start game and don't click any crows
3. Wait 10 seconds
4. **Expected:** "TIME'S UP! GAME OVER" message, return to main menu
5. **Debug:** Look for `⏰⏰⏰ WAVE TIMEOUT EXCEEDED!` message

### **Test 3: Normal Wave Completion**
1. Play game normally and complete a wave
2. **Expected:** Wave timeout timer is cleared
3. **Debug:** Look for `⏰ Wave timeout timer cleared - wave completed in time!`

---

## 🎯 Key Debug Search Terms

| What You're Testing | Search Console For |
|---------------------|-------------------|
| Crow pause system | `⏸️ PAUSED` |
| Crow resume system | `▶️ RESUMED` |
| Wave timeout start | `⏰ Wave timeout set` |
| Wave timeout trigger | `⏰⏰⏰ WAVE TIMEOUT` |
| Game over sequence | `💀 GAME OVER` |
| Cleanup tracking | `🧹 CLEANUP` |
| Timer cancellation | `🧹 Removed from pausedCrows` |

---

## 📊 Expected Flow

### Normal Flow (No Timeout):
```
Wave Start → Timeout Timer Starts (120s)
↓
Crows Spawn → Some paused if no crops
↓
Player Clicks Crows → Paused crows resume as crops become available
↓
All Crows Destroyed → Wave Complete
↓
Timeout Timer Cleared → Next Wave Starts
```

### Timeout Flow (Game Over):
```
Wave Start → Timeout Timer Starts (120s)
↓
120s Elapses → Timeout Triggers
↓
All Crows Destroyed → GAME OVER Message
↓
5.5s Later → Return to Main Menu
↓
Game Reset → Start Button Visible Again
```

---

## ⚙️ Configuration

**Current Settings:**
- Crow deadline: **30 seconds** (per crow from spawn)
- Wave timeout: **120 seconds** (2x 60s wave duration)
- Game over delay: **5.5 seconds** (after message)

**To Adjust for Testing:**
- Change timeout multiplier in `startNextWave()`: `const timeoutDuration = waveDuration * 2;`
- Change crow deadline in `CrowActor.doBeginPlay()`: `this.startDeadlineTimer(30.0);`

