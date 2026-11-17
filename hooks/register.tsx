import type { Hook, Register } from 'claude-code'

type Dollar = Parameters<Hook<'ui.render'>>[0]
type RenderEvent = Parameters<Hook<'ui.render'>>[1]

// Thumbnails live in memory-backed /dev/shm; they vanish on reboot.
const CACHE = '/dev/shm/claude-read-thumbs'
// A terminal cell is roughly twice as tall as it is wide.
const CELL_ASPECT = 0.5
const MAX_COLUMNS = 28
const MAX_ROWS = 10

type Thumb = { png: string; width: number; height: number }

type Call = { tool_use_id?: string; tool: string; input: unknown; output?: unknown; isErrored: boolean }

function imagePath(call: Call): string | undefined {
  if (call.tool !== 'Read' || call.isErrored || call.tool_use_id === undefined) {
    return undefined
  }
  const out = call.output as { type?: unknown } | undefined
  const path = (call.input as { file_path?: unknown } | undefined)?.file_path
  return out?.type === 'image' && typeof path === 'string' ? path : undefined
}

function fitCells(width: number, height: number) {
  let columns = Math.max(1, Math.min(MAX_COLUMNS, Math.ceil(width / 10)))
  let rows = Math.round(columns * (height / width) * CELL_ASPECT)
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.max(1, Math.round(rows / ((height / width) * CELL_ASPECT)))
  }
  return { columns, rows: Math.max(1, rows) }
}

// Thumbnails by tool_use_id, so redraws don't re-read or re-convert.
// Module-level: resets on reload, which is fine (the PNGs stay in /dev/shm).
const thumbs = new Map<string, Thumb | null>()

async function thumbFor($: Dollar, id: string, path: string): Promise<Thumb | null> {
  const cached = thumbs.get(id)
  if (cached !== undefined) {
    return cached
  }
  const png = `${CACHE}/${id}.png`
  let thumb: Thumb | null = null
  try {
    if (!(await $.fs.exists(png))) {
      await $.process.run(['mkdir', '-p', CACHE])
      const convert = await $.process.run(
        ['magick', `${path}[0]`, '-auto-orient', '-thumbnail', '320x320>', '-strip', `png:${png}`],
        { timeoutMs: 30_000 },
      )
      if (convert.exitCode !== 0) {
        throw new Error(convert.stderr)
      }
    }
    const size = await $.process.run(['magick', 'identify', '-format', '%w %h', png])
    const [width, height] = size.stdout.trim().split(' ').map(Number)
    if (width && height) {
      thumb = { png: (await $.fs.read(png, { as: 'bytes' })).base64, width, height }
    }
  } catch {
    thumb = null
  }
  thumbs.set(id, thumb)
  return thumb
}

async function drawThumbs($: Dollar, e: RenderEvent, calls: readonly Call[]) {
  if (e.surface !== 'terminal') return undefined
  const { Box, Button, Image } = $.ui.resolve(e)
  const shown: { id: string; path: string; thumb: Thumb }[] = []
  for (const call of calls) {
    const path = imagePath(call)
    if (path === undefined) continue
    const thumb = await thumbFor($, call.tool_use_id!, path)
    if (thumb !== null) shown.push({ id: call.tool_use_id!, path, thumb })
  }
  if (shown.length === 0) return undefined
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1} paddingLeft={2}>
      {shown.map(({ id, path, thumb }) => {
        const { columns, rows } = fitCells(thumb.width, thumb.height)
        return (
          <Box key={id} flexDirection="column">
            <Image key={id} source={{ png: thumb.png }} columns={columns} rows={rows} alt={`[image: ${path}]`} />
            <Button
              key={`open-${id}`}
              label="Open full size"
              dimColor
              onPress={() => {
                // setsid -f: detach so a viewer that stays open doesn't hold anything.
                // The original file; the thumbnail if the original is gone.
                void $.fs.exists(path).then(isThere =>
                  $.process.run(['setsid', '-f', 'xdg-open', isThere ? path : `${CACHE}/${id}.png`]),
                )
              }}
            />
          </Box>
        )
      })}
    </Box>
  )
}

export const register: Register = on => {
  // A run of Reads folds into one "Read N files" line: thumbnails go under it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) {
      return next(e)
    }
    const extra = await drawThumbs($, e, e.props.calls as readonly Call[])
    if (extra === undefined) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {extra}
      </Box>
    )
  })

  // A standalone Read row, or one unfolded from a group (ctrl+o, --verbose).
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.tool !== 'Read') {
      return next(e)
    }
    const extra = await drawThumbs($, e, [e.props as Call])
    if (extra === undefined) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {extra}
      </Box>
    )
  })
}
