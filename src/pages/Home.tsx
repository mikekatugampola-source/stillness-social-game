import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Home = () => {
  const navigate = useNavigate();

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <h1 className="text-display">Don't Touch</h1>
        <p className="text-caption text-lg tracking-wide">First to move loses.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-16 flex w-full max-w-xs flex-col gap-3"
      >
        <Button onClick={() => navigate("/create")} size="lg" className="w-full">
          Create Table
        </Button>
        <Button onClick={() => navigate("/join")} variant="secondary" size="lg" className="w-full">
          Join Table
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-8"
      >
        <Button variant="link" onClick={() => navigate("/how-it-works")} size="sm">
          How it works
        </Button>
      </motion.div>
    </div>
  );
};

export default Home;
