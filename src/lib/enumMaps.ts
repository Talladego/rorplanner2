// Thin re-export wrapper to avoid duplicate definitions.
// The authoritative definitions live in `constants.ts`.
import constants, { statNames, careers, races, slotNames, typeNames, friendlyName } from './constants'

export { statNames, careers, races, slotNames, typeNames, friendlyName }

export default {
  statNames,
  careers,
  races,
  slotNames,
  typeNames,
}
