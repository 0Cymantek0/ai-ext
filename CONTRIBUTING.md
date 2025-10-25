# Contributing to AI Pocket

Thank you for your interest in contributing to AI Pocket! This document outlines the development workflow, coding standards, and resources to help you get started.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Chrome/Chromium browser (version 120+ for Gemini Nano support)
- Git

### Setup

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/0Cymantek0/ai-extension.git
   cd ai-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Load the extension in Chrome:
   - Open chrome://extensions/
   - Enable "Developer mode"
   - Click "Load unpacked" and select `ai-extension/dist`

## Development Workflow

- Use feature branches for changes
- Write tests for new features and bug fixes
- Run tests before submitting pull requests:
  ```bash
  npm run lint
  npm test
  ```
- Follow existing code conventions (TypeScript + React)

## Coding Standards

- Use TypeScript types and interfaces
- Follow existing file and component structure
- Use shadcn UI + Tailwind for styling
- Keep components modular and accessible
- Document complex modules with inline comments (when necessary)

## Testing

- Vitest is used for unit and integration tests
- Use Testing Library for React components
- Refer to [ai-extension/tests/README-VECTOR-INDEXING.md](ai-extension/tests/README-VECTOR-INDEXING.md) for guidance on vector indexing tests

## Debugging & Diagnostics

- Use Chrome DevTools and the service worker console
- Inspect IndexedDB and chrome.storage via DevTools
- Monitor network requests and AI API responses

### Debug Recorder

For complex issues (performance bottlenecks, AI failures, storage limits), use the **Debug Recorder**:

- See [dev-tools/debug-recorder/README.md](dev-tools/debug-recorder/README.md) for instructions
- Captures runtime state, AI performance, quota usage, and more
- Provides diagnostic reports for sharing with the team

## Submitting Changes

1. Update documentation if your changes affect workflows or APIs
2. Ensure all tests pass
3. Submit a pull request with:
   - Summary of changes
   - Testing steps
   - Screenshots or logs if applicable

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include detailed information, reproduction steps, and relevant logs

## Community Guidelines

- Be respectful and inclusive
- Collaborate openly and constructively
- Maintain user privacy and data security

## License

This project is licensed under the ISC License. See [LICENSE](LICENSE) for details.

## Contact

- GitHub Discussions: https://github.com/0Cymantek0/ai-extension/discussions
- Email (for sensitive issues): contact@aipocket.dev
