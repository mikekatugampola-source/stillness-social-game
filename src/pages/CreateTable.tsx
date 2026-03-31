import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useGameRoomContext } from "@/context/GameRoomContext";

const CreateTable = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { createRoom } = useGameRoomContext();
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || loading) return;
    setLoading(true);
    await createRoom(name.trim());
    navigate("/waiting");
  };

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex w-full max-w-xs flex-col items-center gap-8"
      >
        <h1 className="text-title">Create Table</h1>

        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoFocus
          className="w-full rounded-2xl border border-border bg-secondary px-5 py-4 text-center text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />

        <Button
          onClick={handleCreate}
          disabled={!name.trim() || loading}
          size="lg"
          className="w-full"
        >
          {loading ? "Creating..." : "Create"}
        </Button>

        <Button variant="ghost" onClick={() => navigate("/")} size="sm">
          Back
        </Button>
      </motion.div>
    </div>
  );
};

export default CreateTable;
