# Ask Chrysty embed — device gate

Block sibling prod rollout until all checked on **real devices** (not simulators only).

## Required checks

- [ ] iPhone Safari — iframe mic permission, speak, hear response, End
- [ ] iPad Safari / installed PWA — same
- [ ] Android Chrome — same
- [ ] Desktop Chrome — same
- [ ] Desktop Edge — same
- [ ] Background tab 30s → return → reconnect or clear error
- [ ] Close host overlay → mic released (no stuck indicator)
- [ ] Side-by-side: standalone `chrysty.chrysty.dev` vs `/embed/live` — same connect/speak/hear behavior

## Functional (Learning pilot)

- [ ] Targeted `#mission-content` capture (not full navbar)
- [ ] Selected text included when user highlights formula
- [ ] Live guide circles appear on host mission card
- [ ] Same user on Learn + Astra → same companion profile
- [ ] French + English voice on one session

## If iframe mic fails on a platform

Do **not** ship `mode: 'direct'` as workaround without a fix in embed-only files. Fix `/embed/live` or host overlay; never patch frozen Live files.
