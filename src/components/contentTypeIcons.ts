import {
  AudioLines,
  Bell,
  Flame,
  Headphones,
  Image,
  LucideIcon,
  Music2,
  Video,
} from "lucide-react-native";
import { ContentType } from "../domain/models";

// One icon per content type, shared by Home's shortcuts and Explore's tiles.
export const contentTypeIcons: Record<ContentType, LucideIcon> = {
  BHAJAN: Headphones,
  AARTI: Flame,
  MANTRA: AudioLines,
  CHALISA: Music2,
  WALLPAPER: Image,
  RINGTONE: Bell,
  STATUS: Video,
};
