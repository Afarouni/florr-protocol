# florr menu

A small Tampermonkey userscript: a florr.io petal and mob database browser, styled to look like the
game's own UI. It's an example of what the client-side data this repo documents lets you build, not
the main point of the repo. It's pretty bare right now (just the browser), I might add more to it.

Everything it shows comes from the client that's already running on your machine: the `_Util_*`
exports for the petal/mob data and icons, and the bundled localization for the real names and
descriptions. It only reads. Nothing gets sent anywhere, no packets, no network.

## what it does

- browse every petal (118) and mob (73) with the real in-game name, description, and icon
- per-rarity stats (health, damage, reload, ...) with a rarity picker
- search and sort
- mob pages show their drop table; petal pages show what drops them

## install

1. install [Tampermonkey](https://www.tampermonkey.net/)
2. open [florr-menu.user.js](https://raw.githubusercontent.com/Afarouni/florr-protocol/main/mod-menu/florr-menu.user.js) — Tampermonkey will pop up and offer to add it
3. open florr.io and click the logo button in the bottom-right, or press the `` ` `` key

## version check

florr ships a build hash (`window.versionHash`) that changes on every update. The script pins the
build it was last checked on, and if florr has moved past it the script stops and warns you before
doing anything, with the option to not run at all. Heap offsets and data layout shift between builds,
so this is a heads-up that something might read wrong. To accept a new build, either hit "run anyway"
once (it remembers that build) or set `KNOWN_VERSION` near the top of the script to the new hash.
