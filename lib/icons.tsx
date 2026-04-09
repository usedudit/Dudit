import { HugeiconsIcon } from "@hugeicons/react"
import {
  MenuSquareIcon as MenuSquare01,
  Home03Icon,
  Wrench01Icon,
  Money04Icon,
  ShoppingBasket03Icon,
  Megaphone03Icon,
  Store01Icon,
  Notification01Icon,
  DeliveryBox01Icon,
  ShoppingCart01Icon,
  Tag01Icon,
  User03Icon,
  UserMultiple02Icon,
  ColumnInsertIcon,
  Settings01Icon,
  FilterHorizontalIcon,
  PackageIcon,
  PackageDeliveredIcon,
  PackageReceiveIcon as PackageReceiveIcon01,
  PackageRemoveIcon,
  DashboardSquare01Icon,
  Chart03Icon,
  ViewIcon,
  Mail01Icon,
  WhatsappIcon as WhatsappIcon01,
  HelpCircleIcon as HelpCircle,
  Archive03Icon,
  Location01Icon,
  InstagramIcon as InstagramIcon01,
  NewTwitterIcon,
  SubnodeAddIcon,
  MapsIcon as MapsIcon01,
  Menu01Icon,
  Moon02Icon,
  Flag01Icon,
  Search01Icon,
  FilterIcon as CoreFilterIcon,
  ParagraphBulletsPoint01Icon,
  PlusSignIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowLeft02Icon,
  FloppyDiskIcon,
  ImageUploadIcon,
  ImageDelete02Icon,
  Calendar03Icon,
  Camera01Icon,
  Facebook02Icon,
  TelegramIcon as TelegramIcon01,
  Linkedin02Icon,
  Delete02Icon,
  AlertCircleIcon as AlertCircleIcon01,
  Alert02Icon,
  File02Icon,
  FileUploadIcon,
  FileVerifiedIcon as FileVerified01Icon,
  ArrowUpDownIcon as ArrowUpDown,
  MoreVerticalCircle01Icon,
  Copy01Icon,
  PencilEdit02Icon,
  Share01Icon,
  InformationCircleIcon,
  SparklesIcon as CoreSparklesIcon,
  Cancel01Icon,
  CancelCircleIcon as CancelCircle,
  UnfoldMoreIcon as UnfoldMore01Icon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  RotateCropIcon,
  QrCodeIcon as QrCodeIcon01,
  CreditCardIcon as CreditCard,
  ShippingTruck01Icon,
  StarIcon as StarIcon1,
  ResourcesAddIcon,
  StatusIcon as StatusIcon1,
  UnavailableIcon,
  Logout02Icon,
  LockPasswordIcon,
  SmartPhone01Icon,
  FavouriteIcon,
  Clock01Icon,
  IdentityCardIcon as IdentityCard,
  TextBoldIcon,
  Download01Icon,
  TextItalicIcon,
  Link02Icon,
  PrinterIcon as Printer,
  TextUnderlineIcon,
  MinusSignIcon,
  ReloadIcon as ReloadIcon01,
  CheckmarkCircle01Icon,
  ShoppingBag01Icon
} from "@hugeicons/core-free-icons"

interface IconProps {
  icon?: any
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  [key: string]: any
}

const CreateIcon = (defaultIcon: any) => (props?: IconProps) => (
  <HugeiconsIcon
    icon={props?.icon || defaultIcon}
    size={22}
    color={props?.color || "currentColor"}
    strokeWidth={2}
    {...props}
  />
)

// ============================
// NAVIGATION
// ============================

export const Menu = CreateIcon(Menu01Icon)
export const MenuSquareIcon = CreateIcon(MenuSquare01)
export const MenuIcon = CreateIcon(Menu01Icon)
export const HomeIcon = CreateIcon(Home03Icon)
export const DashboardIcon = CreateIcon(DashboardSquare01Icon)

export const ChevronDownIcon = CreateIcon(ArrowDown01Icon)
export const ChevronUpIcon = CreateIcon(ArrowUp01Icon)
export const ChevronLeftIcon = CreateIcon(ArrowLeft01Icon)
export const ChevronRightIcon = CreateIcon(ArrowRight01Icon)

export const ArrowDownIcon = CreateIcon(ArrowDown01Icon)
export const ArrowUpIcon = CreateIcon(ArrowUp01Icon)
export const ArrowLeftIcon = CreateIcon(ArrowLeft02Icon)
export const ArrowRightIcon = CreateIcon(ArrowRight02Icon)
export const ArrowUpDownIcon = CreateIcon(ArrowUpDown)

export const UnfoldMoreIcon = CreateIcon(UnfoldMore01Icon)
export const ChevronsUpDown = CreateIcon(MenuSquare01)


// ============================
// ACTIONS
// ============================

export const PlusIcon = CreateIcon(PlusSignIcon)
export const EditIcon = CreateIcon(PencilEdit02Icon)
export const TrashIcon = CreateIcon(Delete02Icon)

export const CopyIcon = CreateIcon(Copy01Icon)
export const DuplicateIcon = CreateIcon(Copy01Icon)

export const ShareIcon = CreateIcon(Share01Icon)
export const SaveIcon = CreateIcon(FloppyDiskIcon)

export const UploadIcon = CreateIcon(ImageUploadIcon)
export const ExportFileIcon = CreateIcon(FileUploadIcon)


// ============================
// STATUS / FEEDBACK
// ============================

export const Check = CreateIcon(MenuSquare01)
export const CheckIcon = CreateIcon(MenuSquare01)
export const CheckCircleIcon = CreateIcon(CheckmarkCircle01Icon)

export const AlertCircleIcon = CreateIcon(AlertCircleIcon01)
export const AlertTriangleIcon = CreateIcon(Alert02Icon)

export const Info = CreateIcon(InformationCircleIcon)
export const InfoIcon = CreateIcon(InformationCircleIcon)
export const HelpCircleIcon = CreateIcon(HelpCircle)

export const CancelIcon = CreateIcon(Cancel01Icon)
export const CancelCircleIcon = CreateIcon(CancelCircle)
export const XIcon = CreateIcon(Cancel01Icon)


// ============================
// FILES / MEDIA
// ============================

export const FileIcon = CreateIcon(File02Icon)
export const FileVerifiedIcon = CreateIcon(FileVerified01Icon)

export const UploadImageIcon = CreateIcon(ImageUploadIcon)
export const RemoveImageIcon = CreateIcon(ImageDelete02Icon)
export const CameraIcon = CreateIcon(Camera01Icon)

export const ZoomInIcon = CreateIcon(ZoomInAreaIcon)
export const ZoomOutIcon = CreateIcon(ZoomOutAreaIcon)
export const RotateIcon = CreateIcon(RotateCropIcon)
export const ReloadIcon = CreateIcon(ReloadIcon01)
export const MapsIcon = CreateIcon(MapsIcon01)
export const SubcategoryIcon = CreateIcon(SubnodeAddIcon)

// ============================
// SEARCH / FILTER
// ============================

export const Search = CreateIcon(Search01Icon)
export const SearchIcon = CreateIcon(Search01Icon)

export const FilterIcon = CreateIcon(CoreFilterIcon)
export const Settings2Icon = CreateIcon(FilterHorizontalIcon)


// ============================
// USERS / AUTH
// ============================

export const UserIcon = CreateIcon(User03Icon)
export const Users = CreateIcon(UserMultiple02Icon)
export const IdentityCardIcon = CreateIcon(IdentityCard)

export const LockIcon = CreateIcon(LockPasswordIcon)
export const LogoutIcon = CreateIcon(Logout02Icon)


// ============================
// COMMERCE
// ============================

export const Store = CreateIcon(Store01Icon)
export const StoreIcon = CreateIcon(Store01Icon)
export const MarketplaceIcon = CreateIcon(Store01Icon)

export const ShoppingCartIcon = CreateIcon(ShoppingCart01Icon)
export const ShoppingBagIcon = CreateIcon(ShoppingBag01Icon)

export const Package = CreateIcon(DeliveryBox01Icon)
export const BoxIcon = CreateIcon(DeliveryBox01Icon)

export const AllProductsIcon = CreateIcon(PackageIcon)
export const NormalProductsIcon = CreateIcon(PackageDeliveredIcon)
export const LowProductsIcon = CreateIcon(PackageReceiveIcon01)
export const OutProductsIcon = CreateIcon(PackageRemoveIcon)
export const PackageReceiveIcon = CreateIcon(PackageReceiveIcon01)

export const CreditCardIcon = CreateIcon(CreditCard)
export const TruckIcon = CreateIcon(ShippingTruck01Icon)


// ============================
// UI / LAYOUT
// ============================

export const ColumnsIcon = CreateIcon(ColumnInsertIcon)
export const ListIcon = CreateIcon(ParagraphBulletsPoint01Icon)

export const Square = CreateIcon(MenuSquare01)
export const Circle = CreateIcon(MenuSquare01)
export const MinusIcon = CreateIcon(MinusSignIcon)

export const MoreHorizontal = CreateIcon(MoreVerticalCircle01Icon)
export const MoreHorizontalIcon = CreateIcon(MoreVerticalCircle01Icon)
export const ThreeDotsIcon = CreateIcon(MoreVerticalCircle01Icon)
export const ChartIcon = CreateIcon(Chart03Icon)

export const BoldIcon = CreateIcon(TextBoldIcon)
export const ItalicIcon = CreateIcon(TextItalicIcon)
export const LinkIcon = CreateIcon(Link02Icon)
export const DownloadIcon = CreateIcon(Download01Icon)
export const EyeIcon = CreateIcon(ViewIcon)
export const MailIcon = CreateIcon(Mail01Icon)
export const PrinterIcon = CreateIcon(Printer)
export const UnderlineIcon = CreateIcon(TextUnderlineIcon)


// ============================
// SYSTEM / MISC
// ============================

export const SettingsIcon = CreateIcon(Settings01Icon)

export const MoonIcon = CreateIcon(Moon02Icon)

export const ClockIcon = CreateIcon(Clock01Icon)
export const MapPinIcon = CreateIcon(Location01Icon)

export const QRCodeIcon = CreateIcon(QrCodeIcon01)

export const SparklesIcon = CreateIcon(CoreSparklesIcon)

export const HeartIcon = CreateIcon(FavouriteIcon)
export const StarIcon = CreateIcon(StarIcon1)

export const WhatsappIcon = CreateIcon(WhatsappIcon01)
export const FlagIcon = CreateIcon(Flag01Icon)
export const FacebookIcon = CreateIcon(Facebook02Icon)
export const TelegramIcon = CreateIcon(TelegramIcon01)
export const LinkedinIcon = CreateIcon(Linkedin02Icon)

export const WrenchIcon = CreateIcon(Wrench01Icon)
export const CalendarIcon = CreateIcon(Calendar03Icon)

// ============================
// BUSINESS / APP
// ============================

export const ServiceIcon = CreateIcon(Wrench01Icon)
export const MoneyIcon = CreateIcon(Money04Icon)
export const SalesIcon = CreateIcon(ShoppingBasket03Icon)

export const MegaphoneIcon = CreateIcon(Megaphone03Icon)
export const NotificationIcon = CreateIcon(Notification01Icon)

export const TagIcon = CreateIcon(Tag01Icon)
export const ArchiveIcon = CreateIcon(Archive03Icon)

export const StatusIcon = CreateIcon(StatusIcon1)
export const BlockedIcon = CreateIcon(UnavailableIcon)

export const PhoneIcon = CreateIcon(SmartPhone01Icon)

export const InstagramIcon = CreateIcon(InstagramIcon01)
export const TwitterIcon = CreateIcon(NewTwitterIcon)

export const CadastrosIcon = CreateIcon(ResourcesAddIcon)