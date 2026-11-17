# read-thumbnails

A Claude Code plugin that draws a small thumbnail under every image Claude reads with the Read tool, so you can see what Claude is looking at without leaving the terminal. Each thumbnail has an **Open full size** button that opens the original file in your default image viewer.

When several reads fold into one `Read N files` line, the thumbnails sit under that line. A Read shown on its own row (or unfolded with ctrl+o) gets its thumbnail under that row.

## Requirements

- A terminal where Claude Code can draw images: kitty or Ghostty (kitty graphics), or iTerm2 3.5+ (inline images). In **Konsole**, use [claude-konsole](https://github.com/tomarsnap/claude-konsole).
- [ImageMagick](https://imagemagick.org) 7 (`magick` on `PATH`), to turn JPEG/WebP/GIF/PNG reads into small PNG thumbnails.
- Linux: thumbnails are cached in `/dev/shm/claude-read-thumbs`, and the button uses `setsid` and `xdg-open`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install read-thumbnails --marketplace tomarsnap/claude-read-thumbnails
```

From a shell:

```
claude plugin install read-thumbnails --marketplace tomarsnap/claude-read-thumbnails
```

Answer `y` to add the marketplace, then pick a scope (user is the default).

## License

MIT
