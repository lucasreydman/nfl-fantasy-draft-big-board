import { useState } from 'react'
import type { Player } from '../types'
import { POS_COLOR, headshot, initials, teamLogo } from '../lib/format'

interface Props {
  player: Player
  size?: number
  full?: boolean
}

/**
 * Sleeper-style headshot: the team logo sits behind the cutout, and we fall
 * back to initials when the CDN has no image for that player.
 */
export function Avatar({ player, size = 40, full = false }: Props) {
  const [failed, setFailed] = useState(false)
  const src = headshot(player.sleeperId, !full)
  const logo = teamLogo(player.team)

  return (
    <div
      className="avatar"
      style={{ width: size, height: size, ['--pos-color' as string]: POS_COLOR[player.pos] }}
    >
      {logo && <img className="avatar-logo" src={logo} alt="" aria-hidden />}
      {!src || failed ? (
        <span className="avatar-initials">{initials(player.name)}</span>
      ) : (
        <img
          className="avatar-face"
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
