export type GameType = 'phase10' | 'trash' | 'three-thirteen';

export type RootStackParamList = {
  Welcome: undefined;
  Settings: undefined;
  GamePick: undefined;
  Host: { gameType: GameType };
  Join: undefined;
  Recover: undefined;
  Table: { roomCode: string };
  HandOver: { roomCode: string };
  GameOver: { roomCode: string };
};
