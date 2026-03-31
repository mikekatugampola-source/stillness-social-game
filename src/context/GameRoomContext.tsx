import { createContext, useContext, ReactNode } from "react";
import { useGameRoom } from "@/hooks/useGameRoom";

type GameRoomContextType = ReturnType<typeof useGameRoom>;

const GameRoomContext = createContext<GameRoomContextType | null>(null);

export function GameRoomProvider({ children }: { children: ReactNode }) {
  const gameRoom = useGameRoom();
  return (
    <GameRoomContext.Provider value={gameRoom}>
      {children}
    </GameRoomContext.Provider>
  );
}

export function useGameRoomContext(): GameRoomContextType {
  const ctx = useContext(GameRoomContext);
  if (!ctx) throw new Error("useGameRoomContext must be used within GameRoomProvider");
  return ctx;
}
