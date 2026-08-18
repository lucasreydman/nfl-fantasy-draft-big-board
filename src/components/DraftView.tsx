import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player } from '../types'
import { POS_COLOR, fmtAdp, matchesPos, pickLabel } from '../lib/format'
import { PosTabs } from './PosTabs'
import { fillLineup, picksForSlot, slotForPick } from '../lib/draft'
import { PLAYER_BY_ID, selectBoard, useStore } from '../store/useStore'
import { Avatar } from './Avatar'

export function DraftView() {
  const {
    items, teams, rounds, mySlot, picks, autoPick, speed, query, posFilter, cpuSource,
    setTeams, setRounds, setMySlot, setAutoPick, setSpeed, setQuery, setPosFilter, setCpuSource,
    draftPlayer, runCpuPick, undoPick, resetDraft, setView,
  } = useStore()

  const [rosterSlot, setRosterSlot] = useState(mySlot)
  const boardRef = useRef<HTMLDivElement>(null)

  const totalPicks = teams * rounds
  const current = picks.length + 1
  const done = current > totalPicks
  const onClock = done ? null : slotForPick(current, teams)
  const myTurn = onClock === mySlot

  const { ranked, posRank } = useMemo(() => selectBoard(items), [items])
  const takenIds = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks])

  const available = useMemo(
    () => ranked.filter((r) => !takenIds.has(r.player.id)),
    [ranked, takenIds],
  )

  const q = query.trim().toLowerCase()
  const shown = useMemo(
    () =>
      available.filter(({ player: p }) => {
        if (!matchesPos(posFilter, p.pos)) return false
        if (q && !`${p.name} ${p.team ?? ''} ${p.pos}`.toLowerCase().includes(q)) return false
        return true
      }),
    [available, posFilter, q],
  )

  // CPU teams pick on a timer whenever it isn't your turn.
  useEffect(() => {
    if (!autoPick || done || myTurn) return
    const t = setTimeout(runCpuPick, speed)
    return () => clearTimeout(t)
  }, [autoPick, done, myTurn, speed, picks.length, runCpuPick])

  useEffect(() => setRosterSlot(mySlot), [mySlot])

  // Keep the newest pick in view on the draft grid.
  useEffect(() => {
    boardRef.current?.querySelector('.cell-current')?.scrollIntoView({
      block: 'nearest', inline: 'center', behavior: 'smooth',
    })
  }, [picks.length])

  const simToMyPick = () => {
    for (let guard = 0; guard < totalPicks; guard++) {
      const s = useStore.getState()
      const next = s.picks.length + 1
      if (next > totalPicks || slotForPick(next, s.teams) === s.mySlot) break
      s.runCpuPick()
    }
  }

  const byPick = useMemo(() => new Map(picks.map((p) => [p.overall, p])), [picks])

  const rosterFor = (slot: number) =>
    picks
      .filter((p) => p.slot === slot)
      .map((p) => PLAYER_BY_ID.get(p.playerId))
      .filter((p): p is Player => Boolean(p))

  const roster = rosterFor(rosterSlot)
  const { lineup, bench } = fillLineup(roster)
  const myUpcoming = picksForSlot(mySlot, teams, rounds).filter((n) => n >= current).slice(0, 3)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && myTurn && shown[0]) draftPlayer(shown[0].player.id)
  }

  return (
    <div className="draft-layout" onKeyDown={onKeyDown}>
      <div className="draft-settings">
        <label>
          Teams
          <select value={teams} onChange={(e) => setTeams(Number(e.target.value))}>
            {[8, 10, 12, 14].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Rounds
          <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            {[10, 12, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Your slot
          <select value={mySlot} onChange={(e) => setMySlot(Number(e.target.value))}>
            {Array.from({ length: teams }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={autoPick} onChange={(e) => setAutoPick(e.target.checked)} />
          Auto-pick CPUs
        </label>

        {/* Who the room agrees with. Your own board is the stress test: nobody lets a guy slide. */}
        <label className="check cpu-source">
          CPUs value
          <div className="segmented">
            <button className={cpuSource === 'adp' ? 'on' : ''} onClick={() => setCpuSource('adp')}>
              Consensus
            </button>
            <button
              className={cpuSource === 'board' ? 'on' : ''}
              onClick={() => setCpuSource('board')}
              title="Every CPU drafts strictly off your board — the worst case for you"
            >
              My board
            </button>
          </div>
        </label>
        <label className="speed">
          Speed
          <input
            type="range" min={100} max={1600} step={100}
            value={1700 - speed}
            onChange={(e) => setSpeed(1700 - Number(e.target.value))}
          />
        </label>
        <span className="spacer" />
        <button className="btn" onClick={simToMyPick} disabled={done || myTurn}>Sim to my pick</button>
        <button className="btn" onClick={undoPick} disabled={!picks.length}>Undo</button>
        <button
          className="btn danger"
          onClick={() => picks.length && confirm('Reset this mock draft?') && resetDraft()}
        >
          Reset draft
        </button>
      </div>

      <div className={`clock ${myTurn ? 'mine' : ''} ${done ? 'over' : ''}`}>
        {done ? (
          <><strong>Draft complete</strong><span>{totalPicks} picks · {rounds} rounds</span></>
        ) : (
          <>
            <span className="clock-pick">{pickLabel(current, teams)}</span>
            <strong>{myTurn ? "You're on the clock" : `Team ${onClock} is picking`}</strong>
            <span className="dim">Pick {current} of {totalPicks}</span>
            {myUpcoming.length > 0 && (
              <span className="clock-next">
                Your picks: {myUpcoming.map((n) => pickLabel(n, teams)).join(' · ')}
              </span>
            )}
          </>
        )}
      </div>

      <div className="draft-grid-wrap" ref={boardRef}>
        <div className="draft-grid" style={{ gridTemplateColumns: `44px repeat(${teams}, minmax(104px, 1fr))` }}>
          <div className="cell head corner" />
          {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => (
            <div key={slot} className={`cell head ${slot === mySlot ? 'mine' : ''}`}>
              {slot === mySlot ? 'YOU' : `Team ${slot}`}
            </div>
          ))}

          {Array.from({ length: rounds }, (_, r) => r + 1).map((round) => (
            <RoundRow
              key={round}
              round={round}
              teams={teams}
              mySlot={mySlot}
              current={current}
              byPick={byPick}
            />
          ))}
        </div>
      </div>

      <div className="draft-bottom">
        <section className="available">
          <header className="panel-head">
            <h3>Best available <span className="dim">· your board</span></h3>
            <input
              className="search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <PosTabs value={posFilter} onChange={setPosFilter} />
            <button className="btn ghost" onClick={() => setView('board')}>Edit board</button>
          </header>

          <div className="avail-list">
            {shown.slice(0, 120).map(({ player, rank }) => (
              <div
                key={player.id}
                className="avail-row"
                style={{ ['--pos-color' as string]: POS_COLOR[player.pos] }}
              >
                <span className="avail-rank">{rank}</span>
                <Avatar player={player} size={32} />
                <div className="avail-main">
                  <div className="avail-name">{player.name}</div>
                </div>
                <span><span className="pos-chip">{player.pos}{posRank.get(player.id)}</span></span>
                <span className="avail-team">{player.team ?? 'FA'}</span>
                <span className="avail-num dim">{player.bye ?? '—'}</span>
                <span className="avail-num">{fmtAdp(player.adp)}</span>
                <button
                  className="btn primary sm"
                  disabled={done}
                  onClick={() => draftPlayer(player.id)}
                  title={myTurn ? 'Draft to your team' : `Draft for Team ${onClock}`}
                >
                  Draft
                </button>
              </div>
            ))}
            {!shown.length && <p className="empty">Nobody left matching that filter.</p>}
          </div>
        </section>

        <section className="roster">
          <header className="panel-head">
            <h3>Roster</h3>
            <select value={rosterSlot} onChange={(e) => setRosterSlot(Number(e.target.value))}>
              {Array.from({ length: teams }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === mySlot ? 'Your team' : `Team ${n}`}</option>
              ))}
            </select>
          </header>

          <div className="lineup">
            {lineup.map(({ slot, player }, i) => (
              <div
                key={`${slot}-${i}`}
                className={`lineup-row ${player ? '' : 'lineup-empty'}`}
                style={player ? { ['--pos-color' as string]: POS_COLOR[player.pos] } : undefined}
              >
                <span className="lineup-slot">{slot}</span>
                {player ? (
                  <>
                    <Avatar player={player} size={26} />
                    <span className="lineup-name">{player.name}</span>
                    <span className="dim">{player.team}{player.bye ? ` · ${player.bye}` : ''}</span>
                  </>
                ) : (
                  <span className="dim">Empty</span>
                )}
              </div>
            ))}
            {bench.length > 0 && <div className="lineup-divider">Bench</div>}
            {bench.map((player) => (
              <div
                key={player.id}
                className="lineup-row"
                style={{ ['--pos-color' as string]: POS_COLOR[player.pos] }}
              >
                <span className="lineup-slot">BN</span>
                <Avatar player={player} size={26} />
                <span className="lineup-name">{player.name}</span>
                <span className="dim">{player.team}{player.bye ? ` · ${player.bye}` : ''}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function RoundRow({
  round, teams, mySlot, current, byPick,
}: {
  round: number
  teams: number
  mySlot: number
  current: number
  byPick: Map<number, { overall: number; playerId: string; auto: boolean }>
}) {
  return (
    <>
      <div className="cell round-label">
        {round}
        <span className="snake-arrow">{round % 2 === 1 ? '→' : '←'}</span>
      </div>
      {Array.from({ length: teams }, (_, i) => i + 1).map((slot) => {
        const inRound = round % 2 === 1 ? slot : teams - slot + 1
        const overall = (round - 1) * teams + inRound
        const pick = byPick.get(overall)
        const player = pick ? PLAYER_BY_ID.get(pick.playerId) : null
        return (
          <div
            key={slot}
            className={[
              'cell',
              slot === mySlot && 'col-mine',
              overall === current && 'cell-current',
              player && 'cell-filled',
            ].filter(Boolean).join(' ')}
            style={player ? { ['--pos-color' as string]: POS_COLOR[player.pos] } : undefined}
          >
            <span className="cell-pick">{pickLabel(overall, teams)}</span>
            {player ? (
              <>
                <span className="cell-name">{player.lastName ?? player.name}</span>
                <span className="cell-meta">{player.pos} · {player.team}</span>
              </>
            ) : overall === current ? (
              <span className="cell-oc">On the clock</span>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

