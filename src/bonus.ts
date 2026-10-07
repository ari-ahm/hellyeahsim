// Bonus content: masks, phone missions, the storm.
import { pick, rand } from './util';

export interface Mask {
  id: string;
  name: string;
  emoji: string;
  perk: string;
  color: string;
  quote: string;
}

export const MASKS: Mask[] = [
  { id: 'none', name: 'BARE FACE', emoji: '🙂', perk: 'no perks. just you and your choices.', color: '#ffffff', quote: 'you chose to be seen.' },
  { id: 'rooster', name: 'ROOSTER', emoji: '🐓', perk: '+25% hell yeah points', color: '#ff3b30', quote: 'the rooster asks no questions.' },
  { id: 'tiger', name: 'TIGER', emoji: '🐯', perk: 'crashes deal no damage. crash points x2', color: '#ff9f1a', quote: 'the tiger does not do insurance.' },
  { id: 'owl', name: 'OWL', emoji: '🦉', perk: 'time slows down when deer are near', color: '#a78bfa', quote: 'the owl sees the deer before the deer sees you.' },
  { id: 'horse', name: 'HORSE', emoji: '🐴', perk: 'cars you hit fly 3x further', color: '#c084fc', quote: 'the horse respects physics. physics does not respect the horse.' },
  { id: 'goat', name: 'GOAT KING', emoji: '🐐', perk: 'hell yeah meter fills 2x', color: '#ffd23a', quote: 'the king returns. hell yeah.' },
  { id: 'deer', name: 'DEER', emoji: '🦌', perk: 'deer worth 3x. cops come faster. the deer know.', color: '#a16207', quote: 'traitor.' },
];

export const CALLERS = ['UNKNOWN', 'MOM', 'THE DEER', 'YOUR EX', 'PIZZA GUY', '3:33', 'NO CALLER ID', 'THE MANAGEMENT', 'A GOAT'];

export const VOICEMAILS = [
  'hey. it is me. no reason. drive safe. in the game.',
  'this is the pizza place. we are out of pie. forever.',
  'we know about the deer.',
  'the forearm called. it wants to be bigger.',
  'you have reached the end of the road. just kidding. keep driving.',
  'mom here. your father and I are not mad. we are hell yeah.',
];

export interface MissionDef {
  id: string;
  goal: string;
  speech: string;
  dur: number;
  reward: number;
}

export const MISSIONS: MissionDef[] = [
  { id: 'deer', goal: 'HIT 2 DEER', speech: 'the deer have been talking. silence two of them. you have sixty seconds.', dur: 60, reward: 4000 },
  { id: 'speed', goal: 'REACH 120 MPH', speech: 'i need you going one hundred and twenty. no questions.', dur: 40, reward: 3000 },
  { id: 'beers', goal: 'DRINK 2 BEERS', speech: 'there is a cold one in the cupholder. there are two. drink both.', dur: 50, reward: 3000 },
  { id: 'nohands', goal: '6s OF NO HANDS', speech: 'let go of the wheel. let god drive. six seconds.', dur: 60, reward: 3500 },
  { id: 'near', goal: '4 NEAR MISSES', speech: 'get close to them. closer. four times. do not touch.', dur: 50, reward: 3500 },
  { id: 'flex', goal: 'FLEX 2 TIMES', speech: 'they need to see the forearm. flex. twice.', dur: 30, reward: 2000 },
  { id: 'burnout', goal: '4s BURNOUT', speech: 'stop the car. melt the tires. four seconds.', dur: 45, reward: 2500 },
  { id: 'storm', goal: 'SURVIVE THE STORM', speech: 'look up. the storm is coming for you. ride it out.', dur: 80, reward: 6000 },
];

export const pickMission = (exclude?: string) => pick(MISSIONS.filter((m) => m.id !== exclude));
export const pickCaller = () => pick(CALLERS);
export const nextCallDelay = () => rand(55, 95);

export function grade(points: number, maxCombo: number) {
  const s = points / 1000 + maxCombo * 2;
  return s > 60 ? 'S+' : s > 40 ? 'A+' : s > 28 ? 'A' : s > 18 ? 'B' : s > 10 ? 'C' : s > 4 ? 'D' : 'F';
}

export const KILLER_LINES = ['THE STORM IS HERE', 'KILLER MODE', 'BAD WEATHER. WORSE DRIVER.', 'IT IS RAINING. YOU ARE THE THUNDER.'];
