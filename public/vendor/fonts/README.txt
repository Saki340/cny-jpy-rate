Self-hosted font files (subsets downloaded from Google Fonts).

google-sans-flex-ascii.woff2    Google Sans Flex (variable: wght 300-800,   SIL Open Font License 1.1
                                ROND 0-100; ASCII + · − ± ⇄ only)
material-symbols-rounded.woff2  Material Symbols Rounded (variable: opsz    Apache License 2.0
                                20-48, wght 400-700, FILL 0-1, GRAD 0),
                                only the icons the page uses

Chinese and Japanese text use the visitor's system fonts.

The files are cached for a week (public/_headers) and loaded as
<file>.woff2?v=N: after replacing a file, bump N in style.css and in the
preload links in index.html.

To add an icon, request a new subset with every icon name (comma-separated,
in alphabetical order) and save the woff2 linked from the returned CSS. Send
a desktop Chrome User-Agent, or the CSS will not point to a woff2 file:

  https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400..700,0..1,0&display=block&icon_names=add,add_to_home_screen,arrow_downward,arrow_upward,brightness_auto,check,cloud_off,code,content_copy,dark_mode,edit,info,keyboard,light_mode,more_vert,open_in_new,remove,share,swap_horiz,sync_alt,translate

https://fonts.google.com/specimen/Google+Sans+Flex
https://fonts.google.com/icons
