// src/components/icons.tsx

import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  Circle,
  Copy,
  Edit,
  ExternalLink,
  File,
  HelpCircle,
  Home,
  Loader2,
  Lock, // <-- Added import for Lock
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Plus,
  PlusCircle,
  Search,
  Send, // <-- Added import for Send
  Server,
  Settings,
  Share2,
  Shield,
  Sun,
  Trash,
  User,
  X,
  Workflow,
  Image,
  Phone,
  Info,
  Key,
  Inbox,
  Bell,
  Bot, // <-- Added import for Bot
  // Add any other Lucide icons you need here
} from "lucide-react";

const Icons = {
  // --- General Icons ---
  arrowRight: ArrowRight,
  check: Check,
  chevronDown: ChevronsUpDown, // Often used for dropdowns/selects
  circle: Circle,
  workflow: Workflow, // Also used for logo
  close: X,
  copy: Copy,
  edit: Edit,
  externalLink: ExternalLink,
  file: File,
  help: HelpCircle,
  home: Home,
  mail: Mail,
  messageSquare: MessageSquare,
  plus: Plus,
  plusCircle: PlusCircle,
  search: Search,
  server: Server,
  settings: Settings,
  share: Share2,
  shield: Shield,
  trash: Trash,
  user: User,
  image: Image,
  phone: Phone,
  info: Info,
  key: Key,
  lock: Lock, // <-- Added lock property
  send: Send, // <-- Added send property

  // --- Theme Icons ---
  dark: Moon,
  light: Sun,

  // --- Loading / Status ---
  loader: Loader2,
  spinner: Loader2, // Alias for loader often used

  // --- Navigation / UI Specific ---
  inbox: Inbox,
  bell: Bell,
  logOut: LogOut,
  bot: Bot, // <-- Added bot property

  // --- Branding ---
  logo: Workflow, // Using Workflow icon for the logo as defined before
};

// Export the Icons object for use in other components
export { Icons };

// Optional: If you need to pass props like size/color, you might export
// the icons directly or create wrapper components, but for basic usage,
// exporting the object is common.
