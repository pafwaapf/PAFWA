# Contributing to PAFWA Inventory System

Thank you for your interest in contributing to the PAFWA Inventory System!

---

## How to Contribute

### Reporting Issues

1. **Search existing issues** before creating a new one
2. **Use issue templates** when available
3. **Include:**
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots (if applicable)
   - Browser/OS version

### Suggesting Features

1. Check the issue tracker for similar suggestions
2. Open a new issue with:
   - Feature description
   - Use case / motivation
   - Potential implementation approach (optional)
   - Mockups or examples (optional)

### Code Contributions

1. **Fork the repository**
2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Test thoroughly** in both online and offline modes
5. **Submit a pull request** with clear description

---

## Development Guidelines

### Code Style

- Use **vanilla JavaScript** (ES6+)
- Prefer `const` and `let` over `var`
- Use descriptive variable names
- Add comments only for complex logic
- Follow existing patterns in the codebase

### JavaScript Conventions

```javascript
// Use arrow functions for callbacks
const fetchItems = async () => { ... };

// Use template literals for strings
const message = `User ${name} logged in`;

// Destructure objects when possible
const { id, name, role } = user;

// Use async/await over raw promises
async function loadData() {
  const data = await fetchData();
  return data;
}
```

### HTML/CSS Conventions

- Use semantic HTML elements
- Follow BEM-style class naming (`.block__element--modifier`)
- Use CSS custom properties for theming
- Keep styles scoped to prevent conflicts

### Testing Checklist

Before submitting, verify:

- [ ] Login/logout works
- [ ] Inventory CRUD operations work
- [ ] POS transactions complete successfully
- [ ] Receipt generation works
- [ ] Excel import processes correctly
- [ ] Offline mode functions properly
- [ ] Sync works after offline period
- [ ] No console errors in browser

---

## Project Structure Overview

```
.
├── index.html      # Main app shell — add screens here
├── app.js          # Core logic — add handlers here
├── db.js           # Local database schema
├── schema.sql      # Supabase database schema
├── BUILD_GUIDE.md  # Build & deployment instructions
├── README.md       # Project overview
└── ARCHITECTURE.md # Technical architecture
```

---

## Adding New Features

### Adding a New Page

1. Add page container in `index.html`:
   ```html
   <div id="page-newname" class="pg"></div>
   ```

2. Add navigation button in sidebar:
   ```html
   <button class="ni" data-p="newname">🏷️ New Page</button>
   ```

3. Create loader function in `app.js`:
   ```javascript
   async function loadNewName() {
     const el = $('page-newname');
     el.innerHTML = '<h2>New Page Content</h2>';
   }
   ```

4. Register loader in `LOADERS` object:
   ```javascript
   const LOADERS = {
     // ... existing loaders
     newname: loadNewName
   };
   ```

### Adding a New Database Table

1. Add table to `schema.sql` with RLS policies
2. Add store to `db.js` for offline support
3. Add Data layer functions in `app.js`
4. Create CRUD operations in appropriate module

### Adding Permissions

1. Add permission key to admin UI in `app.js`
2. Update permission checks in `goTo()` function
3. Document new permission in `ARCHITECTURE.md`

---

## Pull Request Standards

### Title Format

```
[Type] Short description

Types: Feature, Fix, Refactor, Docs, Test, Chore
```

**Examples:**
- `[Feature] Add bulk item deletion`
- `[Fix] Correct receipt number generation`
- `[Docs] Update build guide for Electron 28`

### Description Template

```markdown
## Summary
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Screenshots (if applicable)
```

---

## Questions?

If you have questions or need guidance:
- Open an issue for discussion
- Contact the maintainer: FL Abbas Khan

---

## License

By contributing, you agree that your contributions will be licensed under the ISC License.