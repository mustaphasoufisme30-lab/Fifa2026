export const PITCH_LENGTH = 105; // meters along X (-52.5 to +52.5)
export const PITCH_WIDTH = 68; // meters along Z (-34 to +34)
export const HALF_LENGTH = PITCH_LENGTH / 2; // 52.5
export const HALF_WIDTH = PITCH_WIDTH / 2; // 34

export const GOAL_WIDTH = 7.32;
export const GOAL_HALF_WIDTH = GOAL_WIDTH / 2; // 3.66
export const GOAL_HEIGHT = 2.44;
export const GOAL_DEPTH = 2.2;
export const GOAL_POST_RADIUS = 0.065;

export const PENALTY_AREA_LENGTH = 16.5;
export const PENALTY_AREA_WIDTH = 40.32;
export const GOAL_AREA_LENGTH = 5.5;
export const GOAL_AREA_WIDTH = 18.32;
export const PENALTY_SPOT_DIST = 11;
export const CENTER_CIRCLE_RADIUS = 9.15;

export const BALL_RADIUS = 0.22; // Slightly scaled for crisp mobile visibility (regulation 0.11m, 0.22m reads far cleaner on mobile)
export const PLAYER_RADIUS = 0.45;

export const GRAVITY = 19.6; // Snappy arcade-sim gravity for crisp passes & shots
export const BALL_BOUNCE_RESTITUTION = 0.58;
export const BALL_TURF_FRICTION = 0.985; // Per-60Hz damping when rolling
export const BALL_AIR_DRAG = 0.996;
export const BALL_STOP_SPEED = 0.12;

export const DRIBBLE_CONTROL_RADIUS = 1.15;
export const DRIBBLE_OFFSET_DIST = 0.72;
export const TACKLE_REACH = 1.65;

export const DEFAULT_HALF_REAL_SECONDS = 120; // 2 minutes real time per 45-min half
