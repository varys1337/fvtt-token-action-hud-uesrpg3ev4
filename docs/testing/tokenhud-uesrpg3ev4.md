# Token Action HUD UESRPG 3ev4 Test Plan

This document outlines the test procedures for validating the Token Action HUD system module for UESRPG 3ev4.

## Prerequisites
- Foundry VTT v13.351 or later
- UESRPG 3ev4 system installed and active
- Token Action HUD Core module installed and active
- Token Action HUD UESRPG 3ev4 module installed and active
- Test world with at least one Player Character actor and tokens placed on a scene

---

## A) Feature Activation Tests

### A1: Activated Talent - Left Click
**Setup:**
1. Create or open a PC with an activated talent (e.g., Power Attack with activation enabled)
2. Select the PC's token
3. Open Token Action HUD

**Test Steps:**
1. Left-click the activated talent in the Features tab
2. Verify activation dialog appears (if costs are required)
3. Confirm activation
4. Verify chat card is posted showing activation
5. Verify costs are spent (AP, SP, MP, etc.)
6. Verify uses are consumed (if applicable)

**Expected Result:** Talent activates, spends costs/uses, and posts activation chat card without opening the item sheet.

---

### A2: Activated Power - Left Click
**Setup:**
1. Create or open a PC with an activated power (e.g., racial power with daily uses)
2. Select the PC's token
3. Open Token Action HUD

**Test Steps:**
1. Left-click the activated power in the Features tab
2. Verify activation executes
3. Verify chat card is posted
4. Verify uses are consumed

**Expected Result:** Power activates, consumes uses, and posts activation card without opening the item sheet.

---

### A3: Passive Talent/Trait - Left Click
**Setup:**
1. Create or open a PC with a passive talent/trait (no activation enabled)
2. Select the PC's token
3. Open Token Action HUD

**Test Steps:**
1. Left-click the passive talent in the Features tab
2. Verify description is posted to chat
3. Verify item macro runs (if present) - use a test talent with a simple console.log macro

**Expected Result:** Description posted to chat, macro executed best-effort, no sheet opened.

---

### A4: Passive Feature - Right Click (Setting = Chat)
**Setup:**
1. Ensure module setting "Passive feature right-click" is set to "Post description to chat"
2. Create or open a PC with a passive feature
3. Select the PC's token
4. Open Token Action HUD

**Test Steps:**
1. Right-click the passive feature in the Features tab
2. Verify description is posted to chat
3. Verify no sheet opens

**Expected Result:** Description posted to chat, no activation occurs, no sheet opens.

---

### A5: Passive Feature - Right Click (Setting = Sheet)
**Setup:**
1. Open module settings
2. Change "Passive feature right-click" to "Open item sheet"
3. Select a PC's token
4. Open Token Action HUD

**Test Steps:**
1. Right-click the passive feature in the Features tab
2. Verify item sheet opens
3. Verify no chat message is posted

**Expected Result:** Item sheet opens, no activation or chat posting occurs.

---

### A6: Shift+Right Click Always Opens Sheet
**Setup:**
1. Create or open a PC with any feature (activated or passive)
2. Select the PC's token
3. Open Token Action HUD

**Test Steps:**
1. Hold Shift and right-click any feature (activated or passive)
2. Verify item sheet opens
3. Verify no activation occurs
4. Verify no chat message is posted

**Expected Result:** Item sheet always opens when Shift+Right-click is used, regardless of feature type or settings.

---

### A7: Activated Feature - Right Click Opens Sheet
**Setup:**
1. Create or open a PC with an activated talent
2. Select the PC's token
3. Open Token Action HUD

**Test Steps:**
1. Right-click the activated talent
2. Verify item sheet opens
3. Verify no activation occurs

**Expected Result:** Sheet opens, no activation occurs (right-click never activates features).

---

## B) Rest Button Tests

### B1: Short Rest - Single Token
**Setup:**
1. Create or open a PC
2. Reduce Stamina and/or Magicka below max
3. Select the PC's token (single token only)
4. Open Token Action HUD

**Test Steps:**
1. Navigate to Utility tab
2. Verify "Short Rest" button is visible
3. Left-click "Short Rest"
4. Verify chat card is posted showing rest results
5. Verify actor resources are updated (SP/MP regenerated as per system rules)
6. If actor sheet is open, verify it re-renders to show updated values

**Expected Result:** Short Rest applies resource regeneration, posts chat summary, and updates actor sheet if open.

---

### B2: Long Rest - Single Token
**Setup:**
1. Create or open a PC
2. Reduce HP, Stamina, and/or Magicka below max
3. Set fatigue if applicable
4. Select the PC's token (single token only)
5. Open Token Action HUD

**Test Steps:**
1. Navigate to Utility tab
2. Verify "Long Rest" button is visible
3. Left-click "Long Rest"
4. Verify chat card is posted showing rest results
5. Verify actor resources are updated (HP/SP/MP regenerated, fatigue cleared as per system rules)
6. If actor sheet is open, verify it re-renders

**Expected Result:** Long Rest applies full resource regeneration and status recovery, posts chat summary.

---

### B3: Rest Buttons - Multi-Token Selection
**Setup:**
1. Select multiple tokens on the scene
2. Open Token Action HUD

**Test Steps:**
1. Navigate to Utility tab
2. Verify "Short Rest" and "Long Rest" buttons are **not visible**

**Expected Result:** Rest buttons do not appear when multiple tokens are selected (prevents accidental mass rests).

---

### B4: Rest Buttons - Permissions
**Setup:**
1. As a non-GM user, select a token for an actor you do not own
2. Open Token Action HUD

**Test Steps:**
1. Navigate to Utility tab
2. If rest buttons are visible, click "Short Rest"
3. Verify permission warning appears

**Expected Result:** Permission check prevents non-owners from resting actors they don't own.

---

## C) Settings Migration Tests

### C1: Old Setting Key Compatibility
**Setup:**
1. If possible, manually set the old `passiveFeatureLeftClick` setting in the browser console (or from a prior install):
   ```js
   game.settings.set("token-action-hud-uesrpg3ev4", "passiveFeatureLeftClick", "sheet")
   ```
2. Reload Foundry

**Test Steps:**
1. Open module settings
2. Verify new setting `passiveFeatureRightClick` exists
3. Test passive feature right-click behavior matches expected result (if migrated correctly)

**Expected Result:** Old setting key doesn't cause errors, new setting is used.

**Note:** Hard migration of old setting to new is not implemented; manual re-configuration may be required. Verify no console errors occur.

---

## D) Debug Settings Tests

### D1: Unified Debug Toggle
**Setup:**
1. Open module settings
2. Verify only **one** debug setting exists: "Debug logging"
3. Verify no separate "diagnostics" setting is present

**Test Steps:**
1. Enable "Debug logging"
2. Perform a HUD action (e.g., left-click a feature)
3. Open browser console
4. Verify debug logs are present with `[token-action-hud-uesrpg3ev4]` prefix
5. Verify diagnostic logs (prefixed with `[diag]`) are also present

**Expected Result:** Single debug toggle enables both debug and diagnostic logging. No errors occur.

---

### D2: Debug Toggle State - Disabled
**Setup:**
1. Ensure "Debug logging" is disabled
2. Reload Foundry

**Test Steps:**
1. Perform HUD actions (attacks, feature activation, rest)
2. Open browser console
3. Verify no `[token-action-hud-uesrpg3ev4]` debug logs are present

**Expected Result:** Debug logs do not appear when setting is disabled.

---

## E) Integration Tests

### E1: Feature Activation - Multi-Token
**Setup:**
1. Select multiple tokens of the same actor type
2. Ensure multi-token item execution mode is set to "intersection" or "union"
3. Open Token Action HUD

**Test Steps:**
1. Navigate to Features tab
2. If multi-token talent actions are shown, click one
3. Verify confirmation dialog appears
4. Confirm execution
5. Verify activation occurs for each selected token

**Expected Result:** Multi-token feature execution works as expected (confirmation, per-token activation).

---

### E2: System Entrypoint Validation
**Setup:**
1. Create a PC with various features
2. Select token and open HUD

**Test Steps:**
1. Activate a talent → verify system activation executor is called
2. Use Short Rest → verify system rest workflow is called
3. Use Long Rest → verify system rest workflow is called
4. Check browser console for import errors

**Expected Result:** All system entrypoints are successfully imported and executed without errors.

---

### E3: Cache Invalidation
**Setup:**
1. Select a PC token
2. Open Token Action HUD
3. Keep HUD open

**Test Steps:**
1. Update actor (e.g., change HP via actor sheet)
2. Verify HUD refreshes and shows updated values
3. Add/remove an item from actor
4. Verify HUD rebuilds and shows updated inventory

**Expected Result:** HUD cache invalidates correctly on actor/item updates.

---

## F) Error Handling Tests

### F1: Missing System Module
**Setup:**
1. Use browser console to simulate missing system module (simulate import failure)

**Test Steps:**
1. Attempt to activate a feature
2. Verify error is caught gracefully
3. Verify user-friendly error notification appears

**Expected Result:** Module handles missing system imports gracefully without crashing.

---

### F2: Invalid Token/Actor State
**Setup:**
1. Select a token with no associated actor (or unsupported actor type)
2. Open Token Action HUD

**Test Steps:**
1. Verify HUD either doesn't build or shows appropriate warning
2. Verify no console errors occur

**Expected Result:** Graceful handling of invalid/unsupported actor types.

---

## G) Regression Tests

### G1: Combat Actions Still Work
**Test Steps:**
1. Select a PC token
2. Open Token Action HUD
3. Navigate to Combat Actions tab
4. Click "Attack (Melee)" or "Attack (Ranged)"
5. Verify system opposed combat workflow launches
6. Verify attack executes correctly

**Expected Result:** Combat actions remain fully functional.

---

### G2: Skills Still Work
**Test Steps:**
1. Select a PC token
2. Open Token Action HUD
3. Navigate to Skills tab
4. Click a skill
5. Verify skill roll dialog appears
6. Execute roll
7. Verify roll result is posted to chat

**Expected Result:** Skill rolls remain fully functional.

---

### G3: Spells Still Work
**Test Steps:**
1. Select a PC token with spells
2. Open Token Action HUD
3. Navigate to Spells tab
4. Left-click a spell
5. Verify cast magic workflow launches
6. Cast spell
7. Verify spell effect is applied and chat card posted

**Expected Result:** Spell casting workflow remains fully functional.

---

## H) Visual/UI Tests

### H1: Tooltips Display Correctly
**Test Steps:**
1. Hover over feature actions in HUD
2. Verify tooltips show:
   - Feature type (Activated/Passive)
   - Activation costs (if activated)
   - Uses remaining (if applicable)
   - Description preview

**Expected Result:** Tooltips are informative and readable in both light/dark themes.

---

### H2: Badge Display
**Test Steps:**
1. Select token and open HUD
2. Navigate to Features tab
3. For activated features, verify badges display:
   - Action type (Free, Reaction, Secondary, Action)
   - Costs (AP, SP, MP, etc.)
   - Uses (X/Y format)

**Expected Result:** Badges are clear, concise, and correctly formatted.

---

### H3: Resource Badges
**Test Steps:**
1. Select a PC token
2. Open Token Action HUD
3. Navigate to Utility tab
4. Verify resource badges show current/max values:
   - Health (with temp HP if present)
   - Magicka
   - Stamina
   - Luck

**Expected Result:** Resource badges are accurate and update when values change.

---

## Summary Checklist

- [ ] All feature activation tests pass (A1-A7)
- [ ] Rest button tests pass (B1-B4)
- [ ] Settings migration tests pass (C1)
- [ ] Debug toggle tests pass (D1-D2)
- [ ] Integration tests pass (E1-E3)
- [ ] Error handling tests pass (F1-F2)
- [ ] Regression tests pass (G1-G3)
- [ ] UI/Visual tests pass (H1-H3)
- [ ] No console errors during testing
- [ ] Module settings are correctly labeled and functional

---

## Test Environment Details
- **Foundry Version:** _______
- **System Version:** _______
- **Module Version:** _______
- **Date Tested:** _______
- **Tested By:** _______

---

## Known Issues / Notes
_(Document any issues found during testing here)_
