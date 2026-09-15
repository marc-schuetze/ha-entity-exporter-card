# Manual test harness

Runs the card in a plain browser tab against a fake `hass` object, so the rendering,
the domain discovery and the entity-registry path can be checked without a Home
Assistant instance.

```sh
python3 -m http.server 8000
# open http://127.0.0.1:8000/dev/
```

The fixture in `fake-hass.js` builds 1,625 enabled entities across 40 domains plus 177
disabled registry rows. The `event` domain exists **only** among the disabled entities,
so ticking "Include disabled" must make a 41st domain appear, already selected.

`makeHass({ failRegistry: true })` makes the registry call reject, which is what a
non-admin user sees.

Useful handles on `window`: `card`, `COUNTS`, `remakeHass(opts)`, `__wsCalls`.

The entity ids read like a real install (`light.living_room_ceiling`) rather than
`fake_light_0`, because the README screenshots are taken from this harness — screenshotting
a real Home Assistant would put someone's actual home in a public image.

Toggling the light theme is `document.body.classList.add("light")`.

For the pure grouping and selection logic there is a faster check that needs no browser:

```sh
node test_domains.mjs
```
