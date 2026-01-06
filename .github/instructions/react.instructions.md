---
applyTo: "**/*.ts, **/*.tsx"
---

Use named function over arrow functions

```tsx
// bad
const MyComponent = () => {
  return <div>Hello World</div>;
};

// good
function MyComponent() {
  return <div>Hello World</div>;
}
```

---

This is a desktop first application. so make sure to use the real estate available on larger screens wisely. make the UI dense. Use grids and flexbox to create layouts that adapt to larger screens.

---

When ever a component is not directly related to a page, break it out into a smaller reusable component. This will make it easier to test and reuse in other parts of the application.

In addition, always see if there are existing components that can be reused before creating a new one.
