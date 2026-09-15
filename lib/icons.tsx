"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import {
    MenuSquareIcon as MenuSquare01,
    Home03Icon,
    Wrench01Icon,
    Money04Icon,
    MoneyNotFound04Icon,
    ShoppingBasket03Icon,
    Megaphone03Icon,
    Store01Icon,
    Notification01Icon,
    DeliveryBox01Icon,
    ShoppingCart01Icon,
    Shield01Icon,
    Tag01Icon,
    User03Icon,
    UserMultiple02Icon,
    ColumnInsertIcon,
    Settings01Icon,
    FilterHorizontalIcon,
    Sun03Icon,
    Motorbike02Icon,
    ManagerIcon as ManagerIcon01,
    TextFirstlineRightIcon as TextFirstlineRightIcon01,
    PackageDeliveredIcon,
    PackageReceiveIcon as PackageReceiveIcon01,
    PackageRemoveIcon,
    DashboardSquare01Icon,
    RepeatIcon as RepeatIcon01,
    CrownIcon as CrownIcon01,
    Chart03Icon,
    ViewIcon,
    ViewOffSlashIcon,
    AnalyticsUpIcon,
    Mail01Icon,
    DiceFaces03Icon,
    StarAward01Icon,
    RankingIcon as RankingIcon01,
    WhatsappIcon as WhatsappIcon01,
    ComputerTerminal01Icon,
    DatabaseIcon as DatabaseIcon01,
    GlobeIcon as GlobeIcon01,
    ComputerIcon as ComputerIcon01,
    HelpCircleIcon as HelpCircle,
    ArrowLeftRightIcon as ArrowLeftRightIcon01,
    Archive03Icon,
    Location01Icon,
    CardExchange01Icon,
    InstagramIcon as InstagramIcon01,
    NewTwitterIcon,
    SubnodeAddIcon,
    MapsIcon as MapsIcon01,
    Menu01Icon,
    Moon02Icon,
    Flag01Icon,
    Search01Icon,
    BankIcon as BankIcon01,
    Cashier02Icon,
    Route01Icon,
    BitcoinWalletIcon as BitcoinWalletIcon01,
    FilterIcon as CoreFilterIcon,
    ParagraphBulletsPoint01Icon,
    PlusSignIcon,
    ArrowDown01Icon,
    ArrowUp01Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    ArrowRight02Icon,
    ArrowLeft02Icon,
    ArrowLeftDoubleIcon as ArrowLeftDoubleIcon01,
    ArrowRightDoubleIcon as ArrowRightDoubleIcon01,
    FloppyDiskIcon,
    ImageUploadIcon,
    ImageDelete02Icon,
    ImageNotFound01Icon,
    Image01Icon,
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
    FileVerifiedIcon as FileVerifiedIcon01,
    ArrowUpDownIcon as ArrowUpDown,
    MoreVerticalCircle01Icon,
    Copy01Icon,
    RouteBlockIcon as RouteBlockIcon01,
    PencilEdit02Icon,
    Share01Icon,
    InformationCircleIcon,
    SparklesIcon as CoreSparklesIcon,
    Cancel01Icon,
    FileBlockIcon as FileBlockIcon01,
    FileViewIcon as FileViewIcon01,
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
    HistoryIcon as HistoryIcon01,
    IdentityCardIcon as IdentityCard,
    TextBoldIcon,
    Download01Icon,
    TextItalicIcon,
    Link02Icon,
    PrinterIcon as Printer,
    TextUnderlineIcon,
    TextAlignLeftIcon,
    TextAlignCenterIcon,
    TextAlignRightIcon,
    TextAlignJustifyCenterIcon,
    GridTableIcon as GridTableIcon01,
    PaintBoardIcon,
    TextClearIcon,
    TextNumberSignIcon,
    TextFontIcon,
    MinusSignIcon,
    ReloadIcon as ReloadIcon01,
    CheckmarkCircle01Icon,
    Tick01Icon,
    ShoppingBag01Icon,
    PlusMinus01Icon,
    ArrowTurnBackwardIcon as ArrowTurnBackwardIcon01,
    DeliverySent01Icon,
    DeliveryTracking01Icon,
    SplitIcon,
    Target02Icon,
    PlayIcon as PlayIcon01,
    ThumbsUpIcon,
    Rocket01Icon,
    Briefcase01Icon,
    File02Icon as File02Icon01,
    Key01Icon,
    Xls01Icon,
    MoneyBag02Icon,
    Clock04Icon,
    ClockCheckIcon as ClockCheckIcon01,
    ClockArrowUpIcon as ClockArrowUpIcon01,
    Video01Icon,
    EnergyIcon as EnergyIcon01,
    CollectionsBookmarkIcon,
    PinIcon as PinIcon01,
    ArchiveArrowDownIcon,
    SettingsError01Icon
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
export const GridIcon = CreateIcon(DashboardSquare01Icon)
export const SettingsConfigIcon = CreateIcon(SettingsError01Icon)

export const ChevronDownIcon = CreateIcon(ArrowDown01Icon)
export const ChevronUpIcon = CreateIcon(ArrowUp01Icon)
export const ChevronLeftIcon = CreateIcon(ArrowLeft01Icon)
export const ChevronRightIcon = CreateIcon(ArrowRight01Icon)

export const ArrowDownIcon = CreateIcon(ArrowDown01Icon)
export const ArrowUpIcon = CreateIcon(ArrowUp01Icon)
export const ArrowLeftIcon = CreateIcon(ArrowLeft02Icon)
export const ArrowRightIcon = CreateIcon(ArrowRight02Icon)
export const ArrowUpDownIcon = CreateIcon(ArrowUpDown)
export const ArrowLeftDoubleIcon = CreateIcon(ArrowLeftDoubleIcon01)
export const ArrowRightDoubleIcon = CreateIcon(ArrowRightDoubleIcon01)
export const ArrowLeftRightIcon = CreateIcon(ArrowLeftRightIcon01)
export const ChevronsUpDown = CreateIcon(UnfoldMore01Icon)

export const AdjustIcon = CreateIcon(PlusMinus01Icon)
export const ReturnIcon = CreateIcon(ArrowTurnBackwardIcon01)
export const AnalyticsIcon = CreateIcon(AnalyticsUpIcon)
export const CollectionsIcon = CreateIcon(CollectionsBookmarkIcon)
export const PinIcon = CreateIcon(PinIcon01)

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
export const ImageIcon = CreateIcon(Image01Icon)

export const UploadIcon = CreateIcon(ImageUploadIcon)
export const ExportFileIcon = CreateIcon(FileUploadIcon)
export const UploadSheetIcon = CreateIcon(Xls01Icon)
export const TrendingUpIcon = CreateIcon(AnalyticsUpIcon)
export const ShieldIcon = CreateIcon(Shield01Icon)
export const VideoIcon = CreateIcon(Video01Icon)
export const BellIcon = CreateIcon(Notification01Icon)

// ============================
// STATUS / FEEDBACK
// ============================

export const Check = CreateIcon(Tick01Icon)
export const CheckIcon = CreateIcon(Tick01Icon)
export const CheckCircleIcon = CreateIcon(CheckmarkCircle01Icon)
export const LikeIcon = CreateIcon(ThumbsUpIcon)
export const PlayIcon = CreateIcon(PlayIcon01)

export const AlertCircleIcon = CreateIcon(AlertCircleIcon01)
export const AlertTriangleIcon = CreateIcon(Alert02Icon)

export const Info = CreateIcon(InformationCircleIcon)
export const InfoIcon = CreateIcon(InformationCircleIcon)
export const HelpCircleIcon = CreateIcon(HelpCircle)

export const CancelIcon = CreateIcon(Cancel01Icon)
export const CancelCircleIcon = CreateIcon(CancelCircle)
export const XIcon = CreateIcon(Cancel01Icon)
export const FileBlockIcon = CreateIcon(FileBlockIcon01)
export const FileViewIcon = CreateIcon(FileViewIcon01)

// ============================
// FILES / MEDIA
// ============================

export const FileIcon = CreateIcon(File02Icon)
export const FileVerifiedIcon = CreateIcon(FileVerifiedIcon01)

export const UploadImageIcon = CreateIcon(ImageUploadIcon)
export const RemoveImageIcon = CreateIcon(ImageDelete02Icon)
export const ImageOffIcon = CreateIcon(ImageNotFound01Icon)
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
export const MotorbikeIcon = CreateIcon(Motorbike02Icon)
export const CrownIcon = CreateIcon(CrownIcon01)

// ============================
// COMMERCE
// ============================

export const Store = CreateIcon(Store01Icon)
export const StoreIcon = CreateIcon(Store01Icon)
export const MarketplaceIcon = CreateIcon(Store01Icon)

export const ShoppingCartIcon = CreateIcon(ShoppingCart01Icon)
export const ShoppingBagIcon = CreateIcon(ShoppingBag01Icon)
export const MoneyBagIcon = CreateIcon(MoneyBag02Icon)

export const Package = CreateIcon(DeliveryBox01Icon)
export const BoxIcon = CreateIcon(DeliveryBox01Icon)

export const PackageIcon = CreateIcon(DeliveryBox01Icon)
export const NormalProductsIcon = CreateIcon(PackageDeliveredIcon)
export const LowProductsIcon = CreateIcon(PackageReceiveIcon01)
export const OutProductsIcon = CreateIcon(PackageRemoveIcon)
export const PackageReceiveIcon = CreateIcon(PackageReceiveIcon01)

export const CreditCardIcon = CreateIcon(CreditCard)
export const MultiplePaymentsIcon = CreateIcon(CardExchange01Icon)
export const TruckIcon = CreateIcon(ShippingTruck01Icon)
export const DeliverySentIcon = CreateIcon(DeliverySent01Icon)
export const DeliveryPickupIcon = CreateIcon(DeliveryTracking01Icon)
export const DeliveryFailedIcon = CreateIcon(RouteBlockIcon01)
export const AwardIcon = CreateIcon(StarAward01Icon)
export const RankingIcon = CreateIcon(RankingIcon01)


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
export const TargetIcon = CreateIcon(Target02Icon)

export const BoldIcon = CreateIcon(TextBoldIcon)
export const ItalicIcon = CreateIcon(TextItalicIcon)
export const LinkIcon = CreateIcon(Link02Icon)
export const DownloadIcon = CreateIcon(Download01Icon)
export const EyeIcon = CreateIcon(ViewIcon)
export const EyeOffIcon = CreateIcon(ViewOffSlashIcon)
export const MailIcon = CreateIcon(Mail01Icon)
export const PrinterIcon = CreateIcon(Printer)
export const UnderlineIcon = CreateIcon(TextUnderlineIcon)
export const AlignLeftIcon = CreateIcon(TextAlignLeftIcon)
export const AlignCenterIcon = CreateIcon(TextAlignCenterIcon)
export const AlignRightIcon = CreateIcon(TextAlignRightIcon)
export const AlignJustifyIcon = CreateIcon(TextAlignJustifyCenterIcon)
export const TableIcon = CreateIcon(GridTableIcon01)
export const ColorIcon = CreateIcon(PaintBoardIcon)
export const ClearFormatIcon = CreateIcon(TextClearIcon)
export const OrderedListIcon = CreateIcon(TextNumberSignIcon)
export const FontSizeIcon = CreateIcon(TextFontIcon)
export const MonitorIcon = CreateIcon(ComputerIcon01)
export const TerminalIcon = CreateIcon(ComputerTerminal01Icon)
export const DatabaseIcon = CreateIcon(DatabaseIcon01)
export const GlobeIcon = CreateIcon(GlobeIcon01)
export const FileTextIcon = CreateIcon(File02Icon01)
export const RocketIcon = CreateIcon(Rocket01Icon)
export const BriefcaseIcon = CreateIcon(Briefcase01Icon)
export const KeyIcon = CreateIcon(Key01Icon)
export const EnergyIcon = CreateIcon(EnergyIcon01)

// ============================
// SYSTEM / MISC
// ============================

export const SettingsIcon = CreateIcon(Settings01Icon)

export const MoonIcon = CreateIcon(Moon02Icon)
export const SunIcon = CreateIcon(Sun03Icon)
export const TextFirstlineRightIcon = CreateIcon(TextFirstlineRightIcon01)

export const ClockIcon = CreateIcon(Clock01Icon)
export const HistoryIcon = CreateIcon(HistoryIcon01)
export const ClockCheckIcon = CreateIcon(ClockCheckIcon01)
export const ClockArrowUpIcon = CreateIcon(ClockArrowUpIcon01)
export const EstimateTimeIcon = CreateIcon(Clock04Icon)
export const MapPinIcon = CreateIcon(Location01Icon)
export const RouteIcon = CreateIcon(Route01Icon)

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

export const BankIcon = CreateIcon(BankIcon01)
export const CashierIcon = CreateIcon(Cashier02Icon)
export const DigitalWalletIcon = CreateIcon(BitcoinWalletIcon01)
export const DiceIcon = CreateIcon(DiceFaces03Icon)

// ============================
// BUSINESS / APP
// ============================

export const ServiceIcon = CreateIcon(Wrench01Icon)
export const MoneyIcon = CreateIcon(Money04Icon)
export const PartiallyPaidIcon = CreateIcon(MoneyNotFound04Icon)
export const SalesIcon = CreateIcon(ShoppingBasket03Icon)

export const MegaphoneIcon = CreateIcon(Megaphone03Icon)
export const NotificationIcon = CreateIcon(Notification01Icon)

export const TagIcon = CreateIcon(Tag01Icon)
export const ArchiveIcon = CreateIcon(ArchiveArrowDownIcon)

export const StatusIcon = CreateIcon(StatusIcon1)
export const BlockedIcon = CreateIcon(UnavailableIcon)

export const PhoneIcon = CreateIcon(SmartPhone01Icon)

export const InstagramIcon = CreateIcon(InstagramIcon01)
export const TwitterIcon = CreateIcon(NewTwitterIcon)

export const CadastrosIcon = CreateIcon(ResourcesAddIcon)

export const InstallmentIcon = CreateIcon(SplitIcon)
export const RepeatIcon = CreateIcon(RepeatIcon01)
export const ManagerIcon = CreateIcon(ManagerIcon01)