# Contributing

Thanks for helping improve AI Context Reader.

## Before you start

- For a small bug or documentation fix, open a pull request directly.
- For a larger feature or behavior change, open an issue first so the scope can be agreed.
- Do not include API keys, private documents, or personal reading data in issues, logs, screenshots, or commits.
- Security-sensitive reports should follow [SECURITY.md](SECURITY.md), not a public issue.

## Development setup

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

Requirements:

- Node.js 20.3+
- npm
- Chromium or Edge 120+ for manual testing

The built extension is in `.output/chrome-mv3`.

## Pull requests

Please keep a PR focused:

- explain the user-visible problem and the chosen behavior;
- include tests for bug fixes and non-trivial logic;
- update the relevant documentation;
- do not include generated build output or an API key;
- keep existing privacy boundaries intact.

Before opening a PR:

```bash
npm test
npm run typecheck
npm run build
```

## Code style

- TypeScript, React, WXT.
- Prefer small, typed functions over broad refactors.
- Keep network access in the background service worker; content scripts should not receive API keys.
- Keep user data local unless the user explicitly triggers a model request.
- Do not add analytics, telemetry, or a backend without prior discussion.

## Commit messages

Short imperative messages are preferred, for example:

```text
fix: preserve notes when saving a context
feat: add article vocabulary drawer
docs: clarify provider setup
```

## License

By contributing, you agree that your contribution is licensed under the project's MIT license.
