export const punishments = [
  "Do your best celebrity impression",
  "Speak in an accent for 2 minutes",
  "Let the group choose your next song",
  "Tell your most embarrassing harmless story",
  "Do 10 squats right now",
  "Reveal your most used emoji",
  "Send a funny selfie to the group chat",
  "Compliment everyone at the table",
  "Let someone choose your next text message opener",
  "Trade seats with someone",
  "Do your best dance move",
  "Let the group post one story on your social media",
  "Talk in third person for 3 minutes",
  "Give your phone to someone for 30 seconds",
  "Say something nice about the person to your left",
];

export const drinkMessages = [
  "You moved first. Take a sip.",
  "Tough break. Sip time.",
  "First touch loses. Drink up.",
  "Couldn't resist? Take a drink.",
  "Motion detected. Sip required.",
];

export function getRandomPunishment(): string {
  return punishments[Math.floor(Math.random() * punishments.length)];
}

export function getRandomDrinkMessage(): string {
  return drinkMessages[Math.floor(Math.random() * drinkMessages.length)];
}
