"use client";

/**
 * Icon component — Material Symbols (font-based ligatures) → lucide-react (SVG)
 *
 * Why: the previous Material Symbols Outlined approach loaded a 500KB variable
 * font from Google Fonts. On hard refresh / cold cache it caused a Flash Of
 * Unstyled Text where ligature names ("inbox", "calendar_today", …) appeared
 * as plain text before the font arrived. lucide-react ships SVGs that are
 * tree-shaken and inlined into the JS bundle — zero network round-trip for
 * icons, zero FOUT, ever.
 *
 * The component preserves the existing call-sites: <Icon name="inbox" /> maps
 * to <Inbox /> from lucide. Unknown names log a dev-mode warning and fall
 * back to a help-circle so the UI never breaks even if a new ligature name
 * is added without updating this map.
 */
import type { ComponentType, SVGProps } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  Ban,
  Bell,
  BellOff,
  Bolt,
  Briefcase,
  Building2,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  Check,
  CheckCheck,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Cloud,
  CloudOff,
  Code2,
  Cog,
  Crown,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileEdit,
  FileText,
  Filter,
  Globe,
  GraduationCap,
  Hash,
  Heart,
  HelpCircle,
  History,
  Home,
  HourglassIcon,
  Inbox,
  Info,
  Key,
  Keyboard,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Mailbox,
  MailOpen,
  MailWarning,
  MailX,
  Megaphone,
  Menu,
  MessageSquare,
  MessagesSquare,
  Moon,
  MoreHorizontal,
  Network,
  Newspaper,
  Paperclip,
  Pencil,
  Plus,
  Receipt,
  Reply,
  RotateCcw,
  RefreshCw,
  Rocket,
  Save,
  School,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Star,
  Sun,
  Tag,
  Telescope,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  UsersRound,
  Verified,
  Video,
  Webhook,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Map Material Symbols ligature names → lucide icon components.
const ICON_MAP: Record<string, LucideIcon | ComponentType<SVGProps<SVGSVGElement>>> = {
  // Navigation
  inbox: Inbox,
  calendar_today: Calendar,
  calendar_month: CalendarDays,
  account_tree: Network,
  account_circle: User,
  group: Users,
  groups: UsersRound,
  shield_person: Shield,
  admin_panel_settings: ShieldCheck,
  supervised_user_circle: Users,
  api: Code2,
  // Header / utility
  notifications: Bell,
  notifications_active: Bell,
  notifications_none: BellOff,
  light_mode: Sun,
  dark_mode: Moon,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  expand_more: ChevronDown,
  close: X,
  menu: Menu,
  more_horiz: MoreHorizontal,
  refresh: RefreshCw,
  search: Search,
  filter_list: Filter,
  // Email
  mail: Mail,
  mark_email_read: MailOpen,
  mark_email_unread: Mail,
  all_inbox: Mailbox,
  send: Send,
  reply: Reply,
  forward: Share2,
  archive: Layers,
  delete: Trash2,
  restore_from_trash: RotateCcw,
  draft: FileEdit,
  attach_file: Paperclip,
  label: Tag,
  local_offer: Tag,
  forum: MessagesSquare,
  campaign: Megaphone,
  newspaper: Newspaper,
  checklist: ListChecks,
  // Calendar
  event_available: CalendarCheck,
  event_busy: CalendarX,
  edit_calendar: CalendarPlus,
  draw: Edit3,
  edit_note: FileEdit,
  schedule: HourglassIcon,
  videocam: Video,
  today: Calendar,
  // Profile / activity
  history: History,
  toggle_on: CheckSquare,
  toggle_off: Circle,
  request_quote: Receipt,
  task_alt: CheckCheck,
  person: User,
  person_off: UserX,
  manage_accounts: UserCog,
  supervisor_account: UserCheck,
  people: Users,
  timeline: TrendingUp,
  visibility: Eye,
  visibility_off: EyeOff,
  verified_user: ShieldCheck,
  verified: Verified,
  // Actions
  add: Plus,
  remove: X,
  edit: Pencil,
  save: Save,
  download: Download,
  open_in_new: ExternalLink,
  sync: RefreshCw,
  add_link: Link2,
  link: Link2,
  // Status
  check_circle: CheckCircle2,
  check: Check,
  cancel: XCircle,
  error: AlertCircle,
  warning: AlertCircle,
  info: Info,
  cloud: Cloud,
  // Quick replies + misc
  do_not_disturb_on: Ban,
  help_outline: HelpCircle,
  favorite: Heart,
  cloud_off: CloudOff,
  hourglass: HourglassIcon,
  progress_activity: Loader2,
  // Auth / login
  lock: Lock,
  lock_open: ShieldOff,
  login: LogIn,
  logout: LogOut,
  key: Key,
  keyboard: Keyboard,
  // AI / sparkle
  auto_awesome: Sparkles,
  smart_toy: Sparkles,
  bolt: Zap,
  // Pricing / marketing
  rocket_launch: Rocket,
  school: School,
  domain: Building2,
  star: Star,
  // List / view modes
  view_list: ListChecks,
  calendar_view_month: CalendarDays,
  // Arrows
  arrow_forward: ArrowRight,
  arrow_downward: ArrowDown,
  // Misc
  webhook: Webhook,
  hub: Hash,
  database: Database,
  settings: Settings,
  cog: Cog,
  crown: Crown,
  briefcase: Briefcase,
  globe: Globe,
  home: Home,
  message: MessageSquare,
  graduation: GraduationCap,
  telescope: Telescope,
  file: FileText,
  edit3: Edit3,
  receipt: Receipt,
  user_plus: UserPlus,
  user_minus: UserMinus,
  mail_warning: MailWarning,
  mail_x: MailX,
  shield_off: ShieldOff,
  circle_dot: CircleDot,
};

const FALLBACK = Info;

// Track names already warned about so the dev console isn't spammed by
// hundreds of identical messages from re-renders.
const warned = new Set<string>();

export interface IconProps {
  name: string;
  className?: string;
  size?: number | string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  style?: React.CSSProperties;
}

/**
 * Drop-in replacement for `<span className="material-symbols-outlined">name</span>`.
 * Use as: <Icon name="inbox" className="text-primary" />
 *
 * Default size 20px (matches the Material Symbols default in src/styles/index.css).
 * Spinner-style icons (`progress_activity`) animate via the consumer adding
 * `className="animate-spin"`.
 */
export function Icon({
  name,
  className,
  size = 20,
  strokeWidth = 1.75,
  ...rest
}: IconProps) {
  const Cmp = ICON_MAP[name] ?? FALLBACK;
  if (!ICON_MAP[name] && process.env.NODE_ENV === "development") {
    // One-time warning per name — avoids hundreds of identical messages on
    // every render. Helps catch new ligature names that need mapping.
    if (!warned.has(name)) {
      warned.add(name);
      // eslint-disable-next-line no-console
      console.warn(`[Icon] no lucide mapping for "${name}" — using fallback`);
    }
  }
  return (
    <Cmp
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={rest["aria-label"] ? undefined : true}
      style={{ display: "inline-block", verticalAlign: "middle", ...rest.style }}
      {...rest}
    />
  );
}

// Some lucide icons don't ship with the names we used above. Re-export the
// kebab/aliased ones so dev-time tree-shaking still works.
export { Bolt };
