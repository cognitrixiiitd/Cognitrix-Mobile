import { ExternalLink, FileText, Play, Video, type LucideIcon } from 'lucide-react-native';

export const typeIcons: Record<string, LucideIcon> = {
  video: Video,
  youtube: Play,
  pdf: FileText,
  slides: FileText,
  notes: FileText,
  external_link: ExternalLink,
};
