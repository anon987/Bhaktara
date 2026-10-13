import { Localized } from "../i18n/strings";

// Today's darshan on Home: each weekday is traditionally dedicated to a deity
// (Sunday Surya, Monday Shiva, Tuesday Hanuman, Wednesday Ganesha, Thursday
// Vishnu, Friday Devi, Saturday Shani).
export type DarshanKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
export type Darshan = {
  key: DarshanKey;
  weekday: Localized;
  deity: Localized;
};
export const darshanDays: Darshan[] = [
  {
    key: "sun",
    weekday: { en: "Sunday", hi: "रविवार" },
    deity: { en: "Surya Dev", hi: "सूर्य देव" },
  },
  {
    key: "mon",
    weekday: { en: "Monday", hi: "सोमवार" },
    deity: { en: "Lord Shiva", hi: "भगवान शिव" },
  },
  {
    key: "tue",
    weekday: { en: "Tuesday", hi: "मंगलवार" },
    deity: { en: "Hanuman Ji", hi: "हनुमान जी" },
  },
  {
    key: "wed",
    weekday: { en: "Wednesday", hi: "बुधवार" },
    deity: { en: "Ganesh Ji", hi: "गणेश जी" },
  },
  {
    key: "thu",
    weekday: { en: "Thursday", hi: "गुरुवार" },
    deity: { en: "Lord Vishnu", hi: "भगवान विष्णु" },
  },
  {
    key: "fri",
    weekday: { en: "Friday", hi: "शुक्रवार" },
    deity: { en: "Maa Durga", hi: "माँ दुर्गा" },
  },
  {
    key: "sat",
    weekday: { en: "Saturday", hi: "शनिवार" },
    deity: { en: "Shani Dev", hi: "शनि देव" },
  },
];
export const darshanFor = (date: Date): Darshan => darshanDays[date.getDay()];

// The greeting by the hour: morning from 4, afternoon from 12, evening from
// 17, night from 21.
export type GreetingKey =
  "greetMorning" | "greetAfternoon" | "greetEvening" | "greetNight";
export function greetingFor(date: Date): GreetingKey {
  const hour = date.getHours();
  if (hour >= 4 && hour < 12) return "greetMorning";
  if (hour >= 12 && hour < 17) return "greetAfternoon";
  if (hour >= 17 && hour < 21) return "greetEvening";
  return "greetNight";
}
