import { useState, memo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RulePickerProps {
  label: string;
  presets: string[];
  selected: string | null;
  isHost: boolean;
  showCustomInput?: boolean;
  onSelect: (text: string) => void;
}

const CustomPunishmentInput = memo(({ onSubmit }: { onSubmit: (text: string) => void }) => {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue("");
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a custom punishment…"
        className="flex-1"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <Button size="sm" variant="secondary" onClick={handleSubmit} disabled={!value.trim()}>
        Set
      </Button>
    </div>
  );
});
CustomPunishmentInput.displayName = "CustomPunishmentInput";

const RulePicker = memo(({ label, presets, selected, isHost, showCustomInput, onSelect }: RulePickerProps) => (
  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="w-full">
    {isHost ? (
      <div className="flex flex-col gap-3">
        <p className="text-caption uppercase tracking-widest">{label}</p>
        {showCustomInput && <CustomPunishmentInput onSubmit={onSelect} />}
        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => onSelect(p)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                selected === p
                  ? "border-foreground bg-foreground/10 text-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {selected && (
          <div className="rounded-lg border border-foreground/20 bg-foreground/5 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Selected</p>
            <p className="text-xs font-medium text-foreground">{selected}</p>
          </div>
        )}
      </div>
    ) : (
      <div className="glass-card w-full text-center">
        <p className="text-caption text-[10px] uppercase tracking-widest mb-1">{label.replace("Choose ", "")}</p>
        <p className="text-sm font-medium text-foreground">{selected || "Host is choosing…"}</p>
      </div>
    )}
  </motion.div>
));
RulePicker.displayName = "RulePicker";

export default RulePicker;
