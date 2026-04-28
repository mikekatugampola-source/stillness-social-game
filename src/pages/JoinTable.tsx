import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";

const JoinTable = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const { joinRoom } = useGameRoomContext();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleJoin = async () => {
    const roomCode = code.replace(/\s+/g, "").toUpperCase();
    const displayName = name.trim();
    if (!roomCode || !displayName || loading) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await joinRoom(roomCode, displayName);
      if (result?.ok) {
        navigate("/waiting");
      } else {
        setErrorMessage(result?.message ?? "Couldn't join. Try again.");
      }
    } catch (err) {
      console.warn("[join] unexpected", err);
      setErrorMessage("Couldn't join. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-xs flex-col items-center gap-6"
      >
        <h1 className="text-title">Join Table</h1>

        <input
          type="text"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s+/g, "").toUpperCase())}
          maxLength={4}
          autoFocus
          className="w-full rounded-2xl border border-border bg-secondary px-5 py-4 text-center text-2xl font-semibold tracking-[0.3em] text-foreground placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          className="w-full rounded-2xl border border-border bg-secondary px-5 py-4 text-center text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />

        {errorMessage && (
          <p className="text-center text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

        <Button onClick={handleJoin} disabled={!code.trim() || !name.trim() || loading} size="lg" className="w-full">
          {loading ? "Joining..." : "Join"}
        </Button>

        <Button variant="ghost" onClick={() => navigate("/")} size="sm">
          Back
        </Button>
      </motion.div>
    </div>
  );
};

export default JoinTable;
