# Portfolio themes

The unlisted `/preview/` site has six theme styles. Visitors switch between them with the theme picker. The choice is saved in `localStorage` under `theme`, and Editorial is used when nothing is saved.

| Value | Name | Notes |
|---|---|---|
| `editorial` | Editorial | The default: a light editorial look with a serif headline. |
| `midnight` | Midnight | A dark theme. |
| `minimal` | Minimal | A plain, low-ornament light theme. |
| `gradient` | Gradient | Colour-gradient accents. |
| `glass` | Glass | Translucent, frosted-glass panels. |
| `contrast` | High contrast | Maximum contrast for readability. |

## Where they live

- `preview/styles.css` holds one `html[data-theme="<value>"]` block of CSS variables for each theme.
- `preview/theme.js` runs the picker. It applies the theme, saves the choice, loads web fonts for each theme, and keeps the browser's `theme-color` meta tag in sync.
- Theme work is tracked in one issue (#21), not one issue per theme.

To add a theme, add a `data-theme` block in `styles.css`, add the value to `allowed`, `themeColor` and `fonts` in `theme.js`, add a menu button with `data-theme-value` in `preview/index.html`, and list it here.
