import { CustomPlayerAppearance, PlayerProfile, PlayerRole, TeamConfig } from '../core/types';

function makePlayer(
  id: string,
  name: string,
  number: number,
  role: PlayerRole,
  speedBoost: number,
  skinTone: string,
  hairStyle: CustomPlayerAppearance['hairStyle'],
  hairColor: string,
  bootsColor: string,
): PlayerProfile {
  const isGK = role === 'GK';
  const isFwd = role === 'ST' || role === 'LW' || role === 'RW' || role === 'CAM';
  const isMid = role === 'CM' || role === 'CDM';

  return {
    id,
    name,
    number,
    role,
    attributes: {
      speed: isGK ? 6.1 : (isFwd ? 7.8 : isMid ? 7.3 : 7.1) + speedBoost,
      acceleration: isGK ? 14 : 18 + speedBoost * 2,
      staminaMax: 100,
      shotPower: isFwd ? 28 : isMid ? 25 : 22,
      passing: isMid ? 88 : isFwd ? 80 : 76,
      dribbling: isFwd ? 86 : isMid ? 82 : 72,
    },
    appearance: {
      skinTone,
      hairStyle,
      hairColor,
      bootsColor,
    },
  };
}

const SKIN_TONES = ['#f1c7a6', '#d99e78', '#b97a52', '#7d4d32', '#f4d3b8'];
const HAIR_COLORS = ['#1d1815', '#3b281c', '#7a4b22', '#c89b44', '#111216'];
const HAIR_STYLES: CustomPlayerAppearance['hairStyle'][] = ['short', 'fade', 'curly', 'buzz'];

function buildSquad(
  prefix: string,
  names: string[],
  bootsPrimary: string,
  bootsAlt: string,
  ratingOffset: number,
): PlayerProfile[] {
  const roles: PlayerRole[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CM', 'LW', 'ST', 'RW'];
  const numbers = [1, 3, 4, 5, 2, 6, 8, 10, 11, 9, 7];

  return names.map((name, idx) =>
    makePlayer(
      `${prefix}_${idx}`,
      name,
      numbers[idx],
      roles[idx],
      ratingOffset + ((idx % 3) - 1) * 0.14,
      SKIN_TONES[(idx * 2 + prefix.length) % SKIN_TONES.length],
      HAIR_STYLES[(idx + prefix.length) % HAIR_STYLES.length],
      HAIR_COLORS[(idx * 3 + prefix.length) % HAIR_COLORS.length],
      idx >= 8 ? bootsAlt : bootsPrimary,
    ),
  );
}

export const TEAMS: TeamConfig[] = [
  {
    id: 'aurelia',
    name: 'Aurelia FC',
    shortName: 'AUR',
    city: 'Solano',
    kit: {
      primary: '#0f62fe',
      secondary: '#f5f8ff',
      shorts: '#0a2558',
      socks: '#0f62fe',
      gkPrimary: '#f59e0b',
      gkSecondary: '#1f2937',
    },
    rating: { attack: 84, midfield: 82, defense: 80 },
    roster: buildSquad(
      'aur',
      [
        'M. Sorensen',
        'L. Costa',
        'D. Kalinic',
        'R. Belmont',
        'K. Okafor',
        'T. Vermeer',
        'E. Moretti',
        'N. Lindqvist',
        'A. Diallo',
        'J. Navarro',
        'Y. Takahashi',
      ],
      '#f97316',
      '#38bdf8',
      0.15,
    ),
  },
  {
    id: 'nordic',
    name: 'Nordic United',
    shortName: 'NRD',
    city: 'Bergheim',
    kit: {
      primary: '#dc2626',
      secondary: '#ffffff',
      shorts: '#1e293b',
      socks: '#dc2626',
      gkPrimary: '#10b981',
      gkSecondary: '#064e3b',
    },
    rating: { attack: 82, midfield: 81, defense: 83 },
    roster: buildSquad(
      'nrd',
      [
        'H. Solberg',
        'P. Kowalski',
        'B. Alencar',
        'S. Lindholm',
        'C. Boateng',
        'M. Petrov',
        'F. Delacroix',
        'O. Vester',
        'R. Mendoza',
        'K. Vance',
        'D. Adebayo',
      ],
      '#eab308',
      '#f8fafc',
      0.08,
    ),
  },
  {
    id: 'valoria',
    name: 'Valoria Athletic',
    shortName: 'VAL',
    city: 'Miramar',
    kit: {
      primary: '#14b8a6',
      secondary: '#0f172a',
      shorts: '#0f172a',
      socks: '#14b8a6',
      gkPrimary: '#e11d48',
      gkSecondary: '#111827',
    },
    rating: { attack: 80, midfield: 84, defense: 79 },
    roster: buildSquad(
      'val',
      [
        'I. Alvarez',
        'G. Romero',
        'A. Mensah',
        'V. Novak',
        'L. Salgado',
        'J. Ferreira',
        'C. Darzi',
        'T. Watanabe',
        'S. Benali',
        'E. Delgado',
        'M. Camara',
      ],
      '#a855f7',
      '#22c55e',
      0.05,
    ),
  },
  {
    id: 'metro',
    name: 'Metro Rovers',
    shortName: 'MTR',
    city: 'Harbor City',
    kit: {
      primary: '#f59e0b',
      secondary: '#111827',
      shorts: '#111827',
      socks: '#f59e0b',
      gkPrimary: '#6366f1',
      gkSecondary: '#1e1b4b',
    },
    rating: { attack: 79, midfield: 79, defense: 81 },
    roster: buildSquad(
      'mtr',
      [
        'K. Gallagher',
        'J. Tanaka',
        'E. Traore',
        'N. Rossi',
        'B. Almeida',
        'H. Demir',
        'R. MacLeod',
        'P. Silva',
        'W. Mensah',
        'L. Ortega',
        'F. Nkosi',
      ],
      '#ef4444',
      '#06b6d4',
      0.0,
    ),
  },
];

export function getTeamById(id: string): TeamConfig {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}
