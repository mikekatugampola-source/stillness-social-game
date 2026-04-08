import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const steps = [
  { number: "1", text: "Create or join a room" },
  { number: "2", text: "Place your phones face up" },
  { number: "3", text: "First person to move loses" },
  { number: "4", text: "Loser completes a dare!" },
];

const HowItWorks = () => {
  const navigate = useNavigate();

  return (
    <div className="screen-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-12"
      >
        <h1 className="text-title">How it works</h1>

        <div className="flex flex-col gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.4 }}
              className="flex items-center gap-5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-foreground">
                {step.number}
              </span>
              <span className="text-body text-foreground/80">{step.text}</span>
            </motion.div>
          ))}
        </div>

        <Button variant="secondary" onClick={() => navigate("/")} className="mt-4">
          Back
        </Button>
      </motion.div>
    </div>
  );
};

export default HowItWorks;
