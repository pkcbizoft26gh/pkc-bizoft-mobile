// What a technician must confirm before a job can be marked completed.
// Installations are the strictest: every item ticked, before and after photos,
// and the modem serial number saved on the account. Repairs need the checklist
// and an after photo.

export type JobKind = 'installation' | 'repair'

export type ChecklistRule = {
  items: string[]
  needsBeforePhoto: boolean
  needsAfterPhoto: boolean
  needsSerial: boolean
}

const RULES: Record<JobKind, ChecklistRule> = {
  installation: {
    items: [
      'Fiber line connected, signal is good (no red LOS light)',
      'Modem is on and the Internet light is steady',
      'Wi-Fi name and password set and given to the customer',
      'Speed test done at the customer\'s home',
      'Showed the customer how to restart the modem',
      'Cables secured and the area tidied up',
    ],
    needsBeforePhoto: true,
    needsAfterPhoto: true,
    needsSerial: true,
  },
  repair: {
    items: [
      'Found and fixed the cause of the problem',
      'Tested the connection after the fix',
      'Customer confirmed the internet works',
      'Area tidied up',
    ],
    needsBeforePhoto: false,
    needsAfterPhoto: true,
    needsSerial: false,
  },
}

export function kindOf(jobType: string | null | undefined): JobKind {
  return jobType === 'installation' ? 'installation' : 'repair'
}

export function ruleFor(jobType: string | null | undefined): ChecklistRule {
  return RULES[kindOf(jobType)]
}

export type CompletionState = {
  ticked: boolean[]
  hasBeforePhoto: boolean
  hasAfterPhoto: boolean
  serialSaved: boolean
}

/** Plain-language list of what is still missing; empty means the job can be completed. */
export function completionBlockers(jobType: string | null | undefined, state: CompletionState): string[] {
  const rule = ruleFor(jobType)
  const missing: string[] = []

  const left = rule.items.filter((_, index) => !state.ticked[index]).length
  if (left > 0) missing.push(`Tick the ${left} remaining checklist item${left === 1 ? '' : 's'}`)
  if (rule.needsBeforePhoto && !state.hasBeforePhoto) missing.push('Take the Before photo')
  if (rule.needsAfterPhoto && !state.hasAfterPhoto) missing.push('Take the After photo')
  if (rule.needsSerial && !state.serialSaved) missing.push('Save the modem serial number')

  return missing
}

/** The record stored on the job so the office can see what was confirmed. */
export function checklistRecord(jobType: string | null | undefined, ticked: boolean[]) {
  const rule = ruleFor(jobType)
  return {
    kind: kindOf(jobType),
    items: rule.items,
    done: rule.items.map((_, index) => !!ticked[index]),
    at: new Date().toISOString(),
  }
}
