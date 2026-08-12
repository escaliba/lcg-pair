# lcg-pair

connects your steam to [lcg](https://lcg.heroinhound.cc) so `esc → pairing → enable` in-game auto-adds the server to your dashboard. one-time setup.

it does NOT see your steam password. ever.

## flow

1. opens a chromium window in app mode pointing at a local page on 127.0.0.1
2. that page pops out facepunch's rust+ login (`companion-rust.facepunch.com`)
3. you sign in. during the openid step the popup's address bar shows `steamcommunity.com` — that's steam's own login page, not a fake
4. facepunch hands back a rust+ auth token. it's the same token the official mobile rust+ companion app uses to fetch your server list — it can NOT touch your inventory, buy games, change your password, read DMs, etc
5. tool registers a fake android device with google fcm + expo so we can receive pairing pushes for you
6. uploads `(rust+ auth token, fcm credentials)` to `lcg.heroinhound.cc/api/fcm/exchange` with your one-time pair code

after that, every in-game pair press shows up on your dashboard in a few seconds.

## download

[releases page](https://git.fable.bz/zyu/lcg-pair/releases) → pick the binary for your OS. `SHA256SUMS.txt` is in every release.

verify with `sha256sum -c SHA256SUMS.txt` (linux/mac) or `Get-FileHash` on windows.

## run from source if you don't trust the binary

```sh
bun install
bun run dev <pair-code>
```

source is what compiles into the binary. nothing hidden.

`LCG_BASE_URL` env var overrides the lcg endpoint if you're testing against a local api.

## prereqs

chromium-based browser installed (edge / brave / chrome / chromium). on windows edge is preinstalled so usually nothing to do.

## build it yourself

```sh
bun install
bun run build:all
```

produces four binaries in `dist/` — windows-x64, darwin-arm64, darwin-x64, linux-x64.

the published release assets run the same commands in CI: pushing a `v*` tag triggers
[`.forgejo/workflows/release.yml`](.forgejo/workflows/release.yml), which builds all four on a clean
runner from the frozen lockfile, generates `SHA256SUMS.txt` in the same run, and attaches everything
to the release. nothing is uploaded by hand.
