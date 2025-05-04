// src/components/icons.tsx

import {
  AlertTriangle,
  ArrowRight,
  BellOff,
  Check,
  ChevronsUpDown,
  Circle,
  CircleDollarSign,
  Copy,
  Edit,
  ExternalLink,
  Eye,        // Added
  EyeOff,     // Added
  File,
  HelpCircle,
  Home,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Plus,
  PlusCircle,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Shield,
  Sun,
  Tag,
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
  Bot,
} from "lucide-react";

const Icons = {
  // --- General Icons ---
  alertTriangle: AlertTriangle,
  arrowRight: ArrowRight,
  bellOff: BellOff,
  check: Check,
  chevronDown: ChevronsUpDown,
  circle: Circle,
  circleDollarSign: CircleDollarSign,
  workflow: Workflow,
  close: X,
  copy: Copy,
  edit: Edit,
  externalLink: ExternalLink,
  eye: Eye,          // Added
  eyeOff: EyeOff,    // Added
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
  tag: Tag,
  trash: Trash,
  user: User,
  image: Image,
  phone: Phone,
  info: Info,
  key: Key,
  lock: Lock,
  send: Send,

  // --- Theme Icons ---
  dark: Moon,
  light: Sun,

  // --- Loading / Status ---
  loader: Loader2,
  spinner: Loader2,

  // --- Navigation / UI Specific ---
  inbox: Inbox,
  bell: Bell,
  logOut: LogOut,
  bot: Bot,

  // --- Branding ---
  logo: Workflow,
};

export { Icons };
