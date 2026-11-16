import { useId, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { airportLabel, airportSuggestions, resolveAirport, type Airport } from '../services/airports'

export default function AirportMultiSelect({ id, label, value, codes, airports, ready, error, onChange }: {
  id: string
  label: string
  value: string
  codes: readonly string[]
  airports: readonly Airport[]
  ready: boolean
  error?: string
  onChange: (query: string, codes: string[]) => void
}) {
  const dialogId = useId()
  const fieldRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const noun = id === 'origin' ? 'departure' : 'arrival'
  const selected = codes.map((code) => code.trim().toUpperCase())
  const choices = value.trim() ? airportSuggestions(airports, value)
    : selected.flatMap((code) => { const airport = resolveAirport(airports, code); return airport ? [airport] : [] })

  useLayoutEffect(() => {
    function fitSuggestions() {
      const popup = popupRef.current
      const field = fieldRef.current?.getBoundingClientRect()
      if (!popup || !field) return
      const viewport = window.visualViewport
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0)
      const below = bottom - field.bottom - 8
      const above = field.top - (viewport?.offsetTop ?? 0) - 8
      const upward = below < 360 && above > below
      popup.style.top = upward ? 'auto' : '100%'
      popup.style.bottom = upward ? '100%' : 'auto'
      popup.style.maxHeight = `${Math.max(0, Math.min(360, upward ? above : below))}px`
    }
    fitSuggestions()
    window.addEventListener('resize', fitSuggestions)
    window.addEventListener('scroll', fitSuggestions, true)
    window.visualViewport?.addEventListener('resize', fitSuggestions)
    return () => {
      window.removeEventListener('resize', fitSuggestions)
      window.removeEventListener('scroll', fitSuggestions, true)
      window.visualViewport?.removeEventListener('resize', fitSuggestions)
    }
  }, [open, ready, value, codes.length])

  function close(clearQuery = false) {
    searchRef.current?.focus()
    setOpen(false)
    if (clearQuery) onChange('', [...selected])
  }

  function update(next: string[], query = value) {
    if (next.length > 6) {
      setNotice('Choose up to 6 airports. Remove an airport before adding more.')
      return false
    }
    setNotice('')
    onChange(query, next)
    return true
  }

  function toggle(code: string) {
    const removing = selected.includes(code)
    if (!value.trim()) searchRef.current?.focus()
    const changed = update(removing ? selected.filter((item) => item !== code) : [...selected, code], removing ? value : '')
    if (changed && !removing) searchRef.current?.focus()
  }

  return <div className="trip-field" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={(event) => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault()
      return
    }
    if (event.key === 'Escape' && open) { event.preventDefault(); close() }
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault()
      if (event.target !== searchRef.current) return
      const airport = ready && resolveAirport(airports, value)
      if (airport) update(selected.includes(airport.code) ? [...selected] : [...selected, airport.code], '')
      else setNotice('Choose an airport checkbox or enter an exact airport code.')
    }
  }}>
    <Label htmlFor={id}>{label}</Label>
    <div className="airport-input" ref={fieldRef}>
      <div className="airport-selection-input" data-invalid={!!error} onClick={(event) => {
        if (event.target === event.currentTarget) { searchRef.current?.focus(); setOpen(true) }
      }}>
        <ul className="airport-chips" aria-label={`Selected ${noun} airports`}>
          {selected.map((code) => {
            const airport = resolveAirport(airports, code)
            return <li key={code} title={airport ? airportLabel(airport) : code}>
              <span>{code}</span>
              <button type="button" aria-label={`Remove ${code} from ${noun} airports`} onClick={() => {
                searchRef.current?.focus()
                update(selected.filter((item) => item !== code))
              }}><X aria-hidden="true" /></button>
            </li>
          })}
        </ul>
        <Input ref={searchRef} id={id} role="combobox" autoComplete="off" value={value}
          placeholder={codes.length ? 'Add airport…' : 'City or airport…'}
          aria-haspopup="dialog" aria-expanded={open && ready} aria-controls={open && ready ? dialogId : undefined}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-limit`}
          onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
          onCompositionStart={() => { composing.current = true }}
          onCompositionEnd={() => { composing.current = false }}
          onChange={(event) => { onChange(event.target.value, [...selected]); setNotice(''); setOpen(true) }} />
      </div>
      {open && ready && <div ref={popupRef} id={dialogId} role="dialog" aria-label={`${label} airport selection`}
        className="airport-suggestions airport-multiple-popup">
        <div className="airport-picker-toolbar">
          <span>{codes.length}/6 selected</span>
          <button type="button" onClick={() => close(true)}>Done</button>
        </div>
        <div className="airport-multiple-options">
          {choices.map((airport) => <label key={airport.code} className="airport-choice airport-row"
            // Keep the popup mounted until the label activates its checkbox.
            onMouseDown={(event) => event.preventDefault()}>
            <input type="checkbox" checked={selected.includes(airport.code)}
              aria-label={`${airport.name}, ${airport.code}, ${airport.city || airport.country}`}
              onChange={() => toggle(airport.code)} />
            <div><strong>{airport.name}</strong><span>{airport.city ? `${airport.city} · ${airport.country}` : airport.country}</span></div>
            <span className="airport-code">{airport.code}</span>
          </label>)}
          <p role="status">{notice || (choices.length
            ? `${choices.length} matching airports shown. Choose individual airports.`
            : value.trim() ? 'No matching airports.' : 'Search by city, name or airport code.')}</p>
        </div>
      </div>}
    </div>
    <span id={`${id}-limit`} className="airport-limit">Choose up to 6 airports.</span>
    {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
  </div>
}
