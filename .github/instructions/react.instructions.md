---
applyTo: "**/*.ts, **/*.tsx"
---

# REACT CODE STANDARDS

## Named Functions ONLY

Arrow function components are **BANNED**.

```tsx
// ❌ WRONG - DO NOT DO THIS
const MyComponent = () => {
  return <div>Hello World</div>;
};

// ✅ CORRECT - ALWAYS DO THIS
function MyComponent() {
  return <div>Hello World</div>;
}
```

---

## Desktop-First: USE THE SPACE

This is a DESKTOP application. You have screen real estate—USE IT.

- Dense, information-rich layouts
- Grids and flexbox that EXPAND on larger screens
- No mobile-first timidity

---

## Component Architecture: EXTRACT & REUSE

- If it's not page-specific, BREAK IT OUT into a reusable component
- **BEFORE** creating ANY new component: CHECK if one already exists
- Duplicate components are technical debt. Don't create them.

---

## Props Types: TOP OF FILE

Props interface/type goes DIRECTLY ABOVE the component. No hunting.

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
}

function Button({ label, onClick }: ButtonProps) {
  // ...
}
```

---

## CSS Variables: MANDATORY

- Colors, spacing, design tokens → CSS VARIABLES. Always.
- Check `index.css` FIRST—the variable might already exist
- New variable? Add it with a DESCRIPTIVE name and comment explaining usage

---

# DESIGN PHILOSOPHY

## Think BEFORE You Code

Answer these questions or DON'T START:

- **Purpose**: What problem does this solve? Who's the user?
- **Tone**: Pick a BOLD direction—brutally minimal, maximalist, retro-futuristic, industrial/utilitarian, editorial, brutalist. COMMIT TO IT.
- **Constraints**: Framework limits, performance budgets, accessibility requirements
- **Differentiation**: What makes this MEMORABLE? One thing.

**EXECUTE WITH PRECISION.** Intentionality matters more than intensity.

Every UI must be:

- Production-grade and FUNCTIONAL
- Visually striking
- Aesthetically COHESIVE
- Refined in EVERY detail

---

# FRONTEND AESTHETICS: HARD RULES

## Typography

- **REJECT** generic fonts: Arial, Inter, Roboto, system defaults
- Choose DISTINCTIVE, characterful typefaces
- Pair a display font with a complementary body font

## Color & Theme

- COMMIT to a cohesive palette
- CSS variables for EVERYTHING
- Dominant colors + sharp accents > timid even distribution

## Motion & Animation

- CSS-first for simple interactions
- Motion library for complex React animations
- ONE well-orchestrated page load > scattered micro-interactions
- Surprise users with hover states and scroll triggers

## Layout & Composition

- Unexpected layouts. Asymmetry. Overlap.
- Grid-breaking elements where appropriate
- Generous whitespace OR controlled density—PICK ONE

## Visual Depth

- Solid color backgrounds are LAZY defaults
- Add atmosphere: subtle textures, layered transparencies, purposeful shadows
- Match visual treatment to the overall aesthetic

---

# BANNED: Generic AI Aesthetics

**DO NOT** produce:

- Purple gradients on white backgrounds
- Glassmorphism, neumorphism, or gradient-heavy designs
- Predictable layouts and cookie-cutter components
- Overused fonts (Inter, Space Grotesk, etc.)

This app uses a **FLAT, UTILITARIAN** style. Functional. Dense. Professional.

---

# CREATIVE EXCELLENCE

You are capable of extraordinary work. PROVE IT.

Think outside the box. Commit fully. Make it unforgettable.
