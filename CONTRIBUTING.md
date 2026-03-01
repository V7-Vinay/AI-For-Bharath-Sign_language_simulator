# Contributing Guide

Thank you for your interest in contributing to the Accessibility AI System!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/accessibility-ai/system.git
   cd system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

## Development Workflow

### Making Changes

1. Create a feature branch
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our coding standards

3. Run tests
   ```bash
   npm test
   npm run lint
   npm run type-check
   ```

4. Commit your changes
   ```bash
   git commit -m "feat: add your feature description"
   ```

### Commit Message Format

We follow the Conventional Commits specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Pull Request Process

1. Push your branch to GitHub
2. Create a pull request with a clear description
3. Ensure all CI checks pass
4. Request review from maintainers
5. Address any feedback
6. Once approved, your PR will be merged

## Coding Standards

### TypeScript

- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Testing

- Write unit tests for all new functionality
- Write property-based tests for core logic
- Aim for 80%+ code coverage
- Test edge cases and error conditions

### Accessibility

- Follow WCAG 2.1 AA guidelines
- Test with screen readers
- Ensure keyboard navigation works
- Use semantic HTML elements

## Project Structure

```
accessibility-ai-system/
├── packages/          # Shared packages
│   └── types/        # TypeScript types
├── apps/             # Applications
│   ├── chrome-extension/
│   ├── android-app/
│   └── backend/
└── k8s/              # Kubernetes configs
```

## Questions?

Feel free to open an issue for any questions or concerns.
