// src/components/icons.ts

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BellOff,
  Check,  // <<< --- ADD THIS LINE --- <<<
  ChevronsUpDown,
  Circle,
  CircleDollarSign,
  Copy,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  HelpCircle,
  Home,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Menu,
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
  ShieldAlert,
  Sun,
  Tag,
  Trash,
  User,
  Users,
  X,
  Workflow,
  Image,
  Phone,
  Info,
  Key,
  Inbox,      // Was already here
  Bell,       // Was already here
  Bot,
  MapPin,
  LayoutGrid,
  Package,    // Added for packageSearch replacement
  AlertCircle,// Added
  DollarSign, // Added
  Receipt,    // Added
  Archive,    // Added as an alternative for listX if needed elsewhere
  // LucideIcon type can be imported if you want to type the Icons object explicitly
  // type LucideIcon as LucideIconType // example, if needed
} from "lucide-react";

// Re-export all icons for easier import
// If you want to type this object, you can do:
// export const Icons: { [key: string]: LucideIconType } = {
export const Icons = {
  alertTriangle: AlertTriangle,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  bellOff: BellOff,
  check: Check,
  chevronsUpDown: ChevronsUpDown,
  circle: Circle,
  circleDollarSign: CircleDollarSign,
  copy: Copy,
  edit: Edit,
  externalLink: ExternalLink,
  eye: Eye,
  eyeOff: EyeOff,
  file: File,
  helpCircle: HelpCircle,
  home: Home,
  loader2: Loader2,
  lock: Lock,
  logOut: LogOut,
  mail: Mail,
  menu: Menu,
  messageSquare: MessageSquare,
  moon: Moon,
  plus: Plus,
  plusCircle: PlusCircle,
  search: Search,
  send: Send,
  server: Server,
  settings: Settings,
  share2: Share2,
  shield: Shield,
  shieldAlert: ShieldAlert,
  sun: Sun,
  tag: Tag,
  trash: Trash,
  user: User,
  users: Users,
  x: X,
  workflow: Workflow,
  image: Image,
  phone: Phone,
  info: Info,
  key: Key,
  inbox: Inbox,
  bell: Bell,
  bot: Bot,
  mapPin: MapPin,
  layoutGrid: LayoutGrid,
  package: Package,
  alertCircle: AlertCircle,
  dollarSign: DollarSign,
  receipt: Receipt,
  archive: Archive,
  spinner: Loader2, // spinner is often an alias for Loader2
  // Ensure the key here matches how you use it in your components, e.g., Icons.CheckAll or Icons.checkAll
  // If you used Icons.CheckAll in NotificationsPage, then the key should be CheckAll: CheckAll
  // If you used Icons.checkAll, then the key should be checkAll: CheckAll
  // Lucide exports are typically camelCase like `checkAll`
  // To match your usage `Icons.CheckAll`, the key should be `CheckAll`

};