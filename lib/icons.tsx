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
  ShoppingBag01Icon,
  Tag01Icon,
  User03Icon,
  UserMultiple02Icon,
  ColumnInsertIcon,
  Settings01Icon,
  FilterHorizontalIcon,
  CheckmarkCircle01Icon,
  PackageIcon,
  PackageDeliveredIcon,
  PackageReceiveIcon,
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
  QrCodeIcon,
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
  MinusSignIcon
} from "@hugeicons/core-free-icons"

interface IconProps {
  icon?: any
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  [key: string]: any
}

const createIcon = (defaultIcon: any) => (props?: IconProps) => (
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

export const Menu = createIcon(Menu01Icon)
export const MenuSquareIcon = createIcon(MenuSquare01)
export const MenuIcon = createIcon(Menu01Icon)
export const HomeIcon = createIcon(Home03Icon)
export const DashboardIcon = createIcon(DashboardSquare01Icon)

export const ChevronDownIcon = createIcon(ArrowDown01Icon)
export const ChevronUpIcon = createIcon(ArrowUp01Icon)
export const ChevronLeftIcon = createIcon(ArrowLeft01Icon)
export const ChevronRightIcon = createIcon(ArrowRight01Icon)

export const ArrowDownIcon = createIcon(ArrowDown01Icon)
export const ArrowUpIcon = createIcon(ArrowUp01Icon)
export const ArrowLeftIcon = createIcon(ArrowLeft02Icon)
export const ArrowRightIcon = createIcon(ArrowRight02Icon)
export const ArrowUpDownIcon = createIcon(ArrowUpDown)

export const UnfoldMoreIcon = createIcon(UnfoldMore01Icon)
export const ChevronsUpDown = createIcon(MenuSquare01)


// ============================
// ACTIONS
// ============================

export const PlusIcon = createIcon(PlusSignIcon)
export const EditIcon = createIcon(PencilEdit02Icon)
export const TrashIcon = createIcon(Delete02Icon)

export const CopyIcon = createIcon(Copy01Icon)
export const DuplicateIcon = createIcon(Copy01Icon)

export const ShareIcon = createIcon(Share01Icon)
export const SaveIcon = createIcon(FloppyDiskIcon)

export const UploadIcon = createIcon(ImageUploadIcon)
export const ExportFileIcon = createIcon(FileUploadIcon)


// ============================
// STATUS / FEEDBACK
// ============================

export const Check = createIcon(MenuSquare01)
export const CheckIcon = createIcon(MenuSquare01)
export const CheckCircle = createIcon(MenuSquare01)
export const CheckCircleIcon = createIcon(CheckmarkCircle01Icon)
export const CheckCircle2 = createIcon(CheckmarkCircle01Icon)

export const AlertCircleIcon = createIcon(AlertCircleIcon01)
export const AlertTriangleIcon = createIcon(Alert02Icon)

export const Info = createIcon(InformationCircleIcon)
export const InfoIcon = createIcon(InformationCircleIcon)
export const HelpCircleIcon = createIcon(HelpCircle)

export const CancelIcon = createIcon(Cancel01Icon)
export const CancelCircleIcon = createIcon(CancelCircle)
export const CloseIcon = createIcon(Cancel01Icon)
export const CloseSmallIcon = createIcon(Cancel01Icon)
export const X = createIcon(Cancel01Icon)
export const XIcon = createIcon(Cancel01Icon)
export const XCircle = createIcon(MenuSquare01)


// ============================
// FILES / MEDIA
// ============================

export const FileIcon = createIcon(File02Icon)
export const FileVerifiedIcon = createIcon(FileVerified01Icon)

export const UploadImageIcon = createIcon(ImageUploadIcon)
export const RemoveImageIcon = createIcon(ImageDelete02Icon)
export const CameraIcon = createIcon(Camera01Icon)

export const ZoomInIcon = createIcon(ZoomInAreaIcon)
export const ZoomOutIcon = createIcon(ZoomOutAreaIcon)
export const RotateIcon = createIcon(RotateCropIcon)


// ============================
// SEARCH / FILTER
// ============================

export const Search = createIcon(Search01Icon)
export const SearchIcon = createIcon(Search01Icon)

export const FilterIcon = createIcon(CoreFilterIcon)
export const Settings2Icon = createIcon(FilterHorizontalIcon)


// ============================
// USERS / AUTH
// ============================

export const UserIcon = createIcon(User03Icon)
export const Users = createIcon(UserMultiple02Icon)
export const IdentityCardIcon = createIcon(IdentityCard)

export const LockIcon = createIcon(LockPasswordIcon)
export const LogoutIcon = createIcon(Logout02Icon)


// ============================
// COMMERCE
// ============================

export const Store = createIcon(Store01Icon)
export const StoreIcon = createIcon(Store01Icon)
export const MarketplaceIcon = createIcon(Store01Icon)

export const ShoppingCart = createIcon(ShoppingCart01Icon)
export const ShoppingBag = createIcon(ShoppingBag01Icon)
export const ShoppingBagIcon = createIcon(ShoppingCart01Icon)

export const Package = createIcon(DeliveryBox01Icon)
export const BoxIcon = createIcon(DeliveryBox01Icon)

export const AllProductsIcon = createIcon(PackageIcon)
export const NormalProductsIcon = createIcon(PackageDeliveredIcon)
export const LowProductsIcon = createIcon(PackageReceiveIcon)
export const OutProductsIcon = createIcon(PackageRemoveIcon)

export const CreditCardIcon = createIcon(CreditCard)
export const TruckIcon = createIcon(ShippingTruck01Icon)


// ============================
// UI / LAYOUT
// ============================

export const ColumnsIcon = createIcon(ColumnInsertIcon)
export const ListIcon = createIcon(ParagraphBulletsPoint01Icon)

export const Square = createIcon(MenuSquare01)
export const Circle = createIcon(MenuSquare01)
export const MinusIcon = createIcon(MinusSignIcon)

export const MoreHorizontal = createIcon(MoreVerticalCircle01Icon)
export const MoreHorizontalIcon = createIcon(MoreVerticalCircle01Icon)
export const ThreeDotsIcon = createIcon(MoreVerticalCircle01Icon)
export const ChartIcon = createIcon(Chart03Icon)

export const BoldIcon = createIcon(TextBoldIcon)
export const ItalicIcon = createIcon(TextItalicIcon)
export const LinkIcon = createIcon(Link02Icon)
export const DownloadIcon = createIcon(Download01Icon)
export const EyeIcon = createIcon(ViewIcon)
export const MailIcon = createIcon(Mail01Icon)
export const PrinterIcon = createIcon(Printer)
export const UnderlineIcon = createIcon(TextUnderlineIcon)


// ============================
// SYSTEM / MISC
// ============================

export const Settings = createIcon(Settings01Icon)
export const SettingsIcon = createIcon(Settings01Icon)

export const Moon = createIcon(Moon02Icon)
export const MoonIcon = createIcon(Moon02Icon)

export const ClockIcon = createIcon(Clock01Icon)
export const MapPin = createIcon(Location01Icon)

export const QRCodeIcon = createIcon(QrCodeIcon)

export const SparklesIcon = createIcon(CoreSparklesIcon)
export const WandIcon = createIcon(CoreSparklesIcon)

export const HeartIcon = createIcon(FavouriteIcon)
export const StarIcon = createIcon(StarIcon1)

export const WhatsappIcon = createIcon(WhatsappIcon01)
export const FlagIcon = createIcon(Flag01Icon)
export const FacebookIcon = createIcon(Facebook02Icon)
export const TelegramIcon = createIcon(TelegramIcon01)
export const LinkedinIcon = createIcon(Linkedin02Icon)

export const WrenchIcon = createIcon(Wrench01Icon)

// ============================
// BUSINESS / APP
// ============================

export const ServiceIcon = createIcon(Wrench01Icon)
export const MoneyIcon = createIcon(Money04Icon)
export const SalesIcon = createIcon(ShoppingBasket03Icon)

export const MegaphoneIcon = createIcon(Megaphone03Icon)
export const NotificationIcon = createIcon(Notification01Icon)

export const TagIcon = createIcon(Tag01Icon)
export const ArchiveIcon = createIcon(Archive03Icon)

export const StatusIcon = createIcon(StatusIcon1)
export const BlockedIcon = createIcon(UnavailableIcon)

export const PhoneIcon = createIcon(SmartPhone01Icon)

export const InstagramIcon = createIcon(InstagramIcon01)
export const TwitterIcon = createIcon(NewTwitterIcon)

export const CadastrosIcon = createIcon(ResourcesAddIcon)