import { SlotKey } from './buildContext'

const ICONS: Record<string, string> = {
  'mainhand': 'https://armory.returnofreckoning.com/icon/6',
  'offhand': 'https://armory.returnofreckoning.com/icon/7',
  'ranged': 'https://armory.returnofreckoning.com/icon/8',
  'body': 'https://armory.returnofreckoning.com/icon/9',
  'gloves': 'https://armory.returnofreckoning.com/icon/10',
  'boots': 'https://armory.returnofreckoning.com/icon/11',
  'helm': 'https://armory.returnofreckoning.com/icon/12',
  'shoulders': 'https://armory.returnofreckoning.com/icon/13',
  'back': 'https://armory.returnofreckoning.com/icon/16', // cloak/back
  'belt': 'https://armory.returnofreckoning.com/icon/17',
  'jewel1': 'https://armory.returnofreckoning.com/icon/20',
  'jewel2': 'https://armory.returnofreckoning.com/icon/20',
  'jewel3': 'https://armory.returnofreckoning.com/icon/20',
  'jewel4': 'https://armory.returnofreckoning.com/icon/20',
  'event': 'https://armory.returnofreckoning.com/icon/20',
  'pocket1': 'https://armory.returnofreckoning.com/icon/36',
  'pocket2': 'https://armory.returnofreckoning.com/icon/36',
}

export function getDefaultIcon(slot: SlotKey | string): string | undefined {
  return ICONS[slot] ?? ICONS[slot.toLowerCase()]
}
