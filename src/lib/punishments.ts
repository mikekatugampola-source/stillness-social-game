export const dares = [
  "Do 20 pushups",
  "Text someone something bold",
  "Sing loudly for 10 seconds",
  "Let someone pick your next Instagram post",
  "Do your best impression of someone in the room",
  "Do your best celebrity impression",
  "Speak in an accent for 2 minutes",
  "Let the group choose your next song",
  "Tell your most embarrassing harmless story",
  "Do 10 squats right now",
  "Reveal your most used emoji",
  "Compliment everyone at the table",
  "Do your best dance move",
  "Talk in third person for 3 minutes",
  "Say something nice about the person to your left",
];

/** @deprecated Use dares instead */
export const punishments = dares;

export function getRandomDare(): string {
  return dares[Math.floor(Math.random() * dares.length)];
}

/** @deprecated Use getRandomDare instead */
export const getRandomPunishment = getRandomDare;
