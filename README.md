# The Picture That Tastes of One

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![make.fun](https://img.shields.io/badge/make.fun-entry-green)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![make.fun](https://img.shields.io/badge/make.fun-ramen-orange)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)

A steaming bowl of ramen, drawn entirely in code — pure Node.js stdlib, no
image API, no network, no dependencies. Amber broth, golden wavy noodles, a
glossy ajitama egg, green onions, dark nori, wooden chopsticks and thin
rising steam, served in a blue-white ceramic bowl on a warm wooden table.

## Run

```bash
node main.ts
# writes entry.png (1024x1024 PNG, deterministic) to $MAKEFUN_OUTPUT_DIR (default /output)
```

Requires Node 22+. Output is byte-identical across runs (fixed-seed PRNG).

## License

MIT — see [LICENSE](LICENSE).
