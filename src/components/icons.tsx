import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import {
  Add01Icon,
  Analytics01Icon,
  ArrowDown01Icon,
  ArrowDownRight01Icon,
  ArrowExpand01Icon,
  ArrowLeft02Icon,
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  ArrowUpRight01Icon,
  Cancel01Icon,
  CodeSquareIcon,
  ColorPickerIcon,
  CommandLineIcon,
  Copy01Icon,
  Cursor01Icon,
  File01Icon,
  FileUploadIcon,
  FilterHorizontalIcon,
  FingerPrintIcon,
  FlashIcon,
  Folder01Icon,
  GitBranchIcon,
  Globe02Icon,
  Home01Icon,
  InformationCircleIcon,
  Key01Icon,
  Link01Icon,
  Loading03Icon,
  LockIcon,
  Mail01Icon,
  Menu01Icon,
  Moon02Icon,
  PlayIcon,
  QuoteDownIcon,
  Rocket01Icon,
  Search01Icon,
  SecurityCheckIcon,
  SentIcon,
  Settings01Icon,
  ShapesIcon,
  Share08Icon,
  SourceCodeIcon,
  SparklesIcon,
  StarIcon,
  Sun03Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";

export type IconProps = Omit<HugeiconsIconProps, "icon" | "strokeWidth"> & {
  strokeWidth?: number | string;
};

function icon(glyph: HugeiconsIconProps["icon"], name: string) {
  function Icon({ strokeWidth = 1.75, ...props }: IconProps) {
    return <HugeiconsIcon icon={glyph} strokeWidth={Number(strokeWidth)} {...props} />;
  }
  Icon.displayName = name;
  return Icon;
}

export const ArrowDownRight = icon(ArrowDownRight01Icon, "ArrowDownRight");
export const ArrowLeft = icon(ArrowLeft02Icon, "ArrowLeft");
export const ArrowRight = icon(ArrowRight02Icon, "ArrowRight");
export const ArrowUp = icon(ArrowUp02Icon, "ArrowUp");
export const ArrowUpRight = icon(ArrowUpRight01Icon, "ArrowUpRight");
export const BarChart3 = icon(Analytics01Icon, "BarChart3");
export const Check = icon(Tick02Icon, "Check");
export const ChevronDown = icon(ArrowDown01Icon, "ChevronDown");
export const ChevronRight = icon(ArrowRight01Icon, "ChevronRight");
export const ChevronsUpDown = icon(UnfoldMoreIcon, "ChevronsUpDown");
export const Code2 = icon(SourceCodeIcon, "Code2");
export const Copy = icon(Copy01Icon, "Copy");
export const FileText = icon(File01Icon, "FileText");
export const FileUp = icon(FileUploadIcon, "FileUp");
export const Fingerprint = icon(FingerPrintIcon, "Fingerprint");
export const FolderKanban = icon(Folder01Icon, "FolderKanban");
export const GitBranch = icon(GitBranchIcon, "GitBranch");
export const Globe = icon(Globe02Icon, "Globe");
export const Home = icon(Home01Icon, "Home");
export const Info = icon(InformationCircleIcon, "Info");
export const KeyRound = icon(Key01Icon, "KeyRound");
export const Link = icon(Link01Icon, "Link");
export const Loader2 = icon(Loading03Icon, "Loader2");
export const Lock = icon(LockIcon, "Lock");
export const Mail = icon(Mail01Icon, "Mail");
export const Maximize2 = icon(ArrowExpand01Icon, "Maximize2");
export const Menu = icon(Menu01Icon, "Menu");
export const Moon = icon(Moon02Icon, "Moon");
export const MousePointer2 = icon(Cursor01Icon, "MousePointer2");
export const Pipette = icon(ColorPickerIcon, "Pipette");
export const Play = icon(PlayIcon, "Play");
export const Plus = icon(Add01Icon, "Plus");
export const Quote = icon(QuoteDownIcon, "Quote");
export const Rocket = icon(Rocket01Icon, "Rocket");
export const RotateCcw = icon(ArrowReloadHorizontalIcon, "RotateCcw");
export const Search = icon(Search01Icon, "Search");
export const Send = icon(SentIcon, "Send");
export const Settings = icon(Settings01Icon, "Settings");
export const Shapes = icon(ShapesIcon, "Shapes");
export const Share2 = icon(Share08Icon, "Share2");
export const ShieldCheck = icon(SecurityCheckIcon, "ShieldCheck");
export const SlidersHorizontal = icon(FilterHorizontalIcon, "SlidersHorizontal");
export const Sparkles = icon(SparklesIcon, "Sparkles");
export const SquareCode = icon(CodeSquareIcon, "SquareCode");
export const Star = icon(StarIcon, "Star");
export const Sun = icon(Sun03Icon, "Sun");
export const Terminal = icon(CommandLineIcon, "Terminal");
export const Users = icon(UserGroupIcon, "Users");
export const X = icon(Cancel01Icon, "X");
export const Zap = icon(FlashIcon, "Zap");
