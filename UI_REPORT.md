# UI Usability Report - Commons Uploader

**Date:** January 6, 2026  
**Tester:** Automated UI Testing (Playwright)  
**App URL:** <http://localhost:5173/commons-uploader/>

## Overview

This report documents usability issues found during testing of the Commons Uploader application. The testing focused on the complete file upload flow without completing an actual upload to Wikimedia Commons.

---

## Issues Found

---

### Issue #2: Debug Console.error Left in Production Code

**Severity:** 🟡 Medium  
**Location:** ReviewTab.tsx, line 155  
**Description:** A `console.error(uploadErrors)` statement logs an empty object `{}` to the console on every render when there are no errors. This appears to be debug code that should be removed or converted to conditional logging.

**Steps to Reproduce:**

1. Navigate to the Review tab
2. Open browser Developer Tools → Console
3. Observe `{}` logged as an error

**Expected:** No spurious console errors  
**Actual:** Empty object logged as error on every render

---

### Issue #3: No Confirmation Dialog for Image Removal

**Severity:** 🟡 Medium  
**Location:** Upload Tab  
**Description:** Clicking "Remove" on an uploaded image immediately removes it without any confirmation. Users could accidentally lose all their work (filled-out fields, reviewed status) for that image with no way to undo.

**Steps to Reproduce:**

1. Upload an image
2. Go through Variables → Fill Out tabs to add metadata
3. Return to Upload tab
4. Click "Remove" button - image is immediately deleted

**Expected:** Confirmation dialog: "Are you sure you want to remove this image? This will delete all associated metadata."  
**Actual:** Immediate removal without confirmation

---

### Issue #4: Description Template Displays on Single Line

**Severity:** 🟢 Low  
**Location:** Variables Tab  
**Description:** The Description Template textarea shows the template content on a single line, making it hard to read and edit multi-line wiki markup templates. The placeholder shows proper formatting with line breaks, but the actual content appears condensed.

**Steps to Reproduce:**

1. Navigate to Variables tab
2. Observe the Description Template textarea
3. The wiki markup is displayed as one continuous line

**Expected:** Multi-line display with preserved formatting  
**Actual:** Single-line display that's hard to read/edit

---

### Issue #5: No Visual Distinction Between "Use Global" States

**Severity:** 🟢 Low  
**Location:** Fill Out Tab  
**Description:** After clicking "+ Use global" button, the button remains visually the same. There's no clear indication that the field is now using a global variable reference vs. a custom value, other than examining the field content.

**Steps to Reproduce:**

1. Go to Fill Out tab
2. Click "+ Use global" next to any field
3. Observe the button looks the same before and after

**Expected:** Button text could change to "Using global ✓" or show a different visual state  
**Actual:** Button appearance unchanged

---

### Issue #6: Tab Badge Inconsistency

**Severity:** 🟢 Low  
**Location:** Tab Navigation  
**Description:** The "Upload" tab badge shows just a number (e.g., "1"), while the "Review" tab shows a fraction (e.g., "1/1"). This is helpful but the inconsistent presentation might confuse users about what the numbers mean.

**Steps to Reproduce:**

1. Upload images
2. Observe "1. Upload 2" vs "4. Review 1/2"

**Suggestion:** Consider consistent formatting or add tooltips explaining what each badge represents.

---

## Positive Observations ✅

### What Works Well

1. **Clear Step-by-Step Flow:** The 4-tab workflow (Upload → Variables → Fill Out → Review) is intuitive and guides users through the process.

2. **"Copy from Previous" Feature:** Excellent feature for batch uploads with similar metadata. Very efficient.

3. **Progress Indicators:** The "5/5" field completion counter and checkmarks on thumbnails provide good feedback.

4. **"+ Use Global" Interaction:** The insert mode that activates when clicking this button is clever - it allows users to also insert EXIF data or other global variables.

5. **Responsive Navigation:** "Next →" buttons and "← Back" links make it easy to move between steps.

6. **Real-time Badge Updates:** Navigation badges update immediately as users add images or mark them ready.

7. **"Mark All Ready" / "Unmark All" Buttons:** Good batch operations for the review step.

8. **EXIF Data Panel:** Showing available EXIF data that can be inserted into fields is helpful.

---

## Testing Log

### Tab 1: Upload

- **Status:** ✅ Working
- Drag-and-drop area clearly visible
- "Browse files" button opens file picker
- Multiple file upload works
- Thumbnails display correctly
- Remove button works (see Issue #3 for UX concern)
- "Next: Set up templates →" link works

### Tab 2: Variables

- **Status:** ✅ Working (see Issue #4)
- Title template input works
- Description template input works
- Global variables section displays correctly
- Detected variables section shows extracted variables
- Navigation links work

### Tab 3: Fill Out

- **Status:** ✅ Working
- Image navigation (Prev/Next) works correctly
- Thumbnail gallery with click-to-select works
- Per-image form fields work
- "+ Use global" button works
- "Copy from previous" button works efficiently
- Global Variables panel works
- EXIF Data panel shows image metadata
- Progress indicator (X/Y) updates correctly

### Tab 4: Review

- **Status:** ✅ Working (see Issues #1, #2)
- Shows all images with their resolved titles and descriptions
- Checkbox to mark as ready works
- "Mark all ready" / "Unmark all" batch buttons work
- Upload button shows correct count
- Upload button correctly disabled when no images are ready

---

## Recommendations Summary

| Priority | Issue                  | Recommendation                                    |
| -------- | ---------------------- | ------------------------------------------------- |
| High     | Duplicate filenames    | Add duplicate filename detection with warning     |
| Medium   | Console.error          | Remove or conditionalize debug logging            |
| Medium   | No remove confirmation | Add confirmation dialog                           |
| Low      | Template display       | Use proper textarea with multi-line display       |
| Low      | Use global states      | Add visual distinction for global variable fields |
| Low      | Badge inconsistency    | Standardize or add tooltips                       |

---

## Test Environment

- **Browser:** Playwright-controlled Chromium
- **Screen Size:** Default viewport
- **User State:** Logged in
- **Test Date:** January 6, 2026
