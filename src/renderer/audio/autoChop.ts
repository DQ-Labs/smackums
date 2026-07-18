export interface Chop {
  startSec: number
  endSec: number
}

const WINDOW = 1024
const HOP = 512
/** Two hits closer than this are one hit (fast finger-drum rolls excepted — this is auto-chop, not transcription). */
const MIN_ONSET_SPACING_SEC = 0.25
/** Chops run to the next onset, but never longer than this. */
const MAX_CHOP_SEC = 2
/** Start slightly before the detected onset so attacks aren't clipped. */
const PRE_ROLL_SEC = 0.01

/**
 * Find up to `maxChops` transient onsets in mono PCM and slice between them.
 * Energy-flux onset detection: RMS per hop, positive-difference flux, local
 * maxima above an adaptive threshold, ranked by strength. Falls back to equal
 * divisions when the audio is too steady to segment (pads should always fill).
 */
export function detectChops(buffer: Float32Array, sampleRate: number, maxChops = 8): Chop[] {
  const durationSec = buffer.length / sampleRate
  if (buffer.length < WINDOW * 4) return []

  const frameCount = Math.floor((buffer.length - WINDOW) / HOP)
  const energy = new Float32Array(frameCount)
  for (let f = 0; f < frameCount; f++) {
    const start = f * HOP
    let sum = 0
    for (let i = start; i < start + WINDOW; i++) sum += buffer[i] * buffer[i]
    energy[f] = Math.sqrt(sum / WINDOW)
  }

  const flux = new Float32Array(frameCount)
  for (let f = 1; f < frameCount; f++) flux[f] = Math.max(0, energy[f] - energy[f - 1])

  let mean = 0
  for (let f = 0; f < frameCount; f++) mean += flux[f]
  mean /= frameCount
  let variance = 0
  for (let f = 0; f < frameCount; f++) variance += (flux[f] - mean) ** 2
  const threshold = mean + Math.sqrt(variance / frameCount)

  interface Onset {
    sec: number
    strength: number
  }
  const minSpacingFrames = Math.round((MIN_ONSET_SPACING_SEC * sampleRate) / HOP)
  const candidates: Onset[] = []
  for (let f = 1; f < frameCount - 1; f++) {
    if (flux[f] <= threshold) continue
    if (flux[f] < flux[f - 1] || flux[f] < flux[f + 1]) continue
    const prev = candidates[candidates.length - 1]
    const frameSec = (f * HOP) / sampleRate
    if (prev && frameSec - prev.sec < (minSpacingFrames * HOP) / sampleRate) {
      if (flux[f] > prev.strength) {
        prev.sec = frameSec
        prev.strength = flux[f]
      }
      continue
    }
    candidates.push({ sec: frameSec, strength: flux[f] })
  }

  if (candidates.length < 2) {
    // Steady/quiet audio: equal divisions still make playable pads.
    const sliceSec = durationSec / maxChops
    return Array.from({ length: maxChops }, (_, i) => ({
      startSec: i * sliceSec,
      endSec: Math.min((i + 1) * sliceSec, i * sliceSec + MAX_CHOP_SEC)
    }))
  }

  const strongest = [...candidates]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxChops)
    .sort((a, b) => a.sec - b.sec)

  return strongest.map((onset, i) => {
    const startSec = Math.max(0, onset.sec - PRE_ROLL_SEC)
    const nextSec = i + 1 < strongest.length ? strongest[i + 1].sec : durationSec
    return { startSec, endSec: Math.min(nextSec, startSec + MAX_CHOP_SEC, durationSec) }
  })
}
