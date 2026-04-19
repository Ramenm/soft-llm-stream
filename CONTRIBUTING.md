# Contributing

## Local loop

```bash
npm install
npm run typecheck
npm test
npm run lab:protocol
npm run lab:full
npm run examples:smoke
npm run size:check
```

## When touching reveal pacing

Also run:

```bash
npm run lab:stress
npm run lab:idle
npm run lab:client
```

## Ground rules

- keep the public package core-only unless there is a strong reason not to
- keep `text` vs `replace` semantics honest in adapters and examples
- prefer tiny, composable additions over broad API surface growth
- if you touch lean-package logic, keep the checked-in fallback artifact in sync
