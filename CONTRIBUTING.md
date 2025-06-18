# Contributing to Meet Teams Bot

Thank you for your interest in contributing to Meet Teams Bot! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Project Structure](#project-structure)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Set up the development environment
4. Create a new branch for your feature or bug fix
5. Make your changes
6. Test your changes
7. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 14.16 or higher (recommended: 16.x)
- Chrome/Chromium browser
- FFmpeg installed on system
- Redis (for queue management)
- RabbitMQ (for message queuing)

### Installation

```bash
# Clone your fork
git clone https://github.com/yourusername/meet-teams-bot.git
cd meet-teams-bot

# Install dependencies
npm install

# Build the application
npm run build
```

### Environment Setup

Create environment variables for development:

```bash
export PROFILE=DEV
export ENVIRON=local
export DEBUG=true
export LOG_LEVEL=debug
```

## Making Changes

### Branch Naming

Use descriptive branch names:
- `feature/add-new-platform-support`
- `bugfix/fix-audio-recording-issue`
- `docs/update-api-documentation`
- `refactor/improve-state-machine`

### Commit Messages

Follow conventional commit format:
- `feat: add support for new meeting platform`
- `fix: resolve audio recording synchronization issue`
- `docs: update API documentation`
- `refactor: improve error handling in state machine`
- `test: add unit tests for speaker detection`

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Writing Tests

- Write unit tests for new features
- Ensure test coverage remains above 80%
- Use Jest for testing framework
- Mock external dependencies appropriately

### Manual Testing

For browser automation features:
1. Test with different meeting platforms (Google Meet, Teams, Zoom)
2. Verify recording quality and speaker detection
3. Test error handling and recovery scenarios

## Submitting Changes

### Pull Request Process

1. **Update Documentation**: Ensure README and other docs are updated
2. **Add Tests**: Include tests for new functionality
3. **Check Code Style**: Run `npm run format` to ensure consistent formatting
4. **Verify Build**: Ensure `npm run build` completes successfully
5. **Test Thoroughly**: Run the full test suite
6. **Write Clear Description**: Explain what your PR does and why

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Manual testing completed
- [ ] Integration tests pass

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Define proper interfaces and types
- Avoid `any` type when possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Code Style

- Use Prettier for code formatting
- Follow ESLint rules
- Use 4 spaces for indentation
- Maximum line length: 80 characters
- Use camelCase for variables and functions
- Use PascalCase for classes and interfaces

### Error Handling

- Use custom error classes when appropriate
- Provide meaningful error messages
- Log errors with appropriate context
- Handle async operations properly

### State Machine

When working with the state machine:
- Each state should have a single responsibility
- Use proper state transitions
- Handle error states gracefully
- Add logging for state changes

## Project Structure

```
├── src/
│   ├── api/               # API endpoints and methods
│   ├── browser/           # Browser automation
│   ├── meeting/           # Platform-specific implementations and integrated features
│   │   ├── meet/         # Google Meet implementation
│   │   ├── teams/        # Microsoft Teams implementation
│   │   ├── speakersObserver.ts  # Integrated speakers detection
│   │   └── htmlCleaner.ts       # Integrated HTML cleanup
│   ├── recording/         # Media recording and processing
│   ├── state-machine/     # Bot state management
│   ├── utils/             # Utility functions
│   ├── main.ts           # Application entry point
│   └── types.ts          # TypeScript definitions
├── tests/                 # Test files
└── docs/                  # Documentation
```

### Adding New Meeting Platforms

1. Create new file in `src/meeting/`
2. Implement the required interface
3. Add platform detection logic
4. Update state machine if needed
5. Add comprehensive tests
6. Update documentation

### Adding New Features

1. Design the feature interface
2. Update type definitions
3. Implement the feature
4. Add error handling
5. Write tests
6. Update documentation

## Getting Help

- Check existing issues and discussions
- Join our community chat (if available)
- Read the documentation thoroughly
- Ask questions in pull request comments

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes for significant contributions
- Project documentation

Thank you for contributing to Meet Teams Bot! 